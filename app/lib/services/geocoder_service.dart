import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

class AddressResult {
  const AddressResult({required this.label, required this.position});
  final String label;
  final LatLng position;
}

abstract interface class GeocoderService {
  Future<List<AddressResult>> search(String query);

  /// Short street address for a point ("6a. Avenida 12, Zona 1, Guatemala"),
  /// or null when none is known.
  Future<String?> reverse(LatLng position);
}

/// "Road number, area, city" from a Nominatim `address` object; null when it
/// names no road or area.
String? shortAddress(Map<String, Object?> address) {
  String? first(List<String> keys) {
    for (final key in keys) {
      final value = address[key];
      if (value is String && value.trim().isNotEmpty) return value.trim();
    }
    return null;
  }

  final road = first(['road', 'pedestrian', 'footway', 'path']);
  final number = first(['house_number']);
  final area = first(['suburb', 'neighbourhood', 'quarter', 'city_district']);
  final city = first(['city', 'town', 'village', 'municipality']);
  final street = road == null ? null : [road, ?number].join(' ');
  final parts = [?street, ?area, ?city];
  if (street == null && area == null) return null;
  return parts.toSet().join(', ');
}

/// Demo-only explicit searches, never autocomplete. Shared by all wizard runs.
/// Public Nominatim allows at most one request/second for the entire demo.
class NominatimGeocoder implements GeocoderService {
  NominatimGeocoder({
    required this._client,
    Uri? endpoint,
    Uri? reverseEndpoint,
  }) : _endpoint =
           endpoint ?? Uri.parse('https://nominatim.openstreetmap.org/search'),
       _reverseEndpoint =
           reverseEndpoint ??
           Uri.parse('https://nominatim.openstreetmap.org/reverse');

  final http.Client _client;
  final Uri _endpoint;
  final Uri _reverseEndpoint;
  final _cache = <String, List<AddressResult>>{};

  /// Keyed by the point rounded to about 10 m; null = no address there.
  final _reverseCache = <String, String?>{};
  final _reverseInFlight = <String, Future<String?>>{};
  Future<void> _queue = Future.value();
  DateTime? _lastRequest;

  static const _headers = {'User-Agent': 'Aldia/0.1 (citizen reporting demo)'};

  /// Waits so requests leave at most once per second (Nominatim policy).
  Future<void> _throttle() async {
    final last = _lastRequest;
    if (last != null) {
      final remaining =
          const Duration(seconds: 1) - DateTime.now().difference(last);
      if (remaining > Duration.zero) await Future<void>.delayed(remaining);
    }
    _lastRequest = DateTime.now();
  }

  @override
  Future<String?> reverse(LatLng position) {
    final key =
        '${position.latitude.toStringAsFixed(4)},${position.longitude.toStringAsFixed(4)}';
    if (_reverseCache.containsKey(key)) {
      return Future.value(_reverseCache[key]);
    }
    if (_reverseInFlight[key] case final pending?) return pending;
    final result = Completer<String?>();
    _reverseInFlight[key] = result.future;
    _queue = _queue.then((_) async {
      try {
        await _throttle();
        final response = await _client
            .get(
              _reverseEndpoint.replace(
                queryParameters: {
                  'lat': '${position.latitude}',
                  'lon': '${position.longitude}',
                  'format': 'jsonv2',
                  'zoom': '18',
                  'accept-language': 'es',
                },
              ),
              headers: _headers,
            )
            .timeout(const Duration(seconds: 8));
        if (response.statusCode != 200) {
          throw http.ClientException('Geocoding unavailable');
        }
        final body =
            jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, Object?>;
        final address = body['address'];
        final label = address is Map<String, Object?>
            ? shortAddress(address)
            : null;
        if (_reverseCache.length >= 200) {
          _reverseCache.remove(_reverseCache.keys.first);
        }
        _reverseCache[key] = label;
        result.complete(label);
      } catch (error, stack) {
        // Not cached: a later build may try again.
        result.completeError(error, stack);
      } finally {
        _reverseInFlight.remove(key)?.ignore();
      }
    });
    return result.future;
  }

  @override
  Future<List<AddressResult>> search(String query) {
    final key = query.trim();
    if (key.length < 3) return Future.value(const []);
    final result = Completer<List<AddressResult>>();
    _queue = _queue.then((_) async {
      try {
        if (_cache[key] case final cached?) {
          result.complete(cached);
          return;
        }
        await _throttle();
        final response = await _client
            .get(
              _endpoint.replace(
                queryParameters: {
                  'q': key,
                  'format': 'jsonv2',
                  'limit': '5',
                  'countrycodes': 'gt,co,mx',
                  'accept-language': 'es',
                },
              ),
              headers: _headers,
            )
            .timeout(const Duration(seconds: 8));
        if (response.statusCode != 200) {
          throw http.ClientException('Geocoding unavailable');
        }
        final rows =
            jsonDecode(utf8.decode(response.bodyBytes)) as List<Object?>;
        final addresses = rows
            .map((item) {
              final row = item as Map<String, Object?>;
              return AddressResult(
                label: row['display_name'] as String,
                position: LatLng(
                  double.parse(row['lat'] as String),
                  double.parse(row['lon'] as String),
                ),
              );
            })
            .toList(growable: false);
        // Bounded in-memory cache; addresses are not written to disk.
        if (_cache.length >= 50) _cache.remove(_cache.keys.first);
        _cache[key] = addresses;
        result.complete(addresses);
      } catch (error, stack) {
        result.completeError(error, stack);
      }
    });
    return result.future;
  }
}
