import 'dart:convert';

import 'package:aldia_app/services/geocoder_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';

void main() {
  test('Nominatim restricts countries, identifies Aldia, caches and serializes at 1/s', () async {
    final requests = <http.Request>[];
    final times = <DateTime>[];
    final service = NominatimGeocoder(
      client: MockClient((request) async {
        requests.add(request);
        times.add(DateTime.now());
        return http.Response(
          jsonEncode([
            {
              'display_name': 'Zona 1, Guatemala',
              'lat': '14.64',
              'lon': '-90.51',
            },
          ]),
          200,
        );
      }),
    );
    final first = await service.search('Zona 1');
    expect(first.single.position.latitude, 14.64);
    await service.search('Zona 1');
    await service.search('Zona 2');
    expect(requests, hasLength(2));
    expect(requests.first.url.queryParameters['countrycodes'], 'gt,co,mx');
    expect(requests.first.headers['User-Agent'], contains('Aldia'));
    expect(
      times.last.difference(times.first).inMilliseconds,
      greaterThanOrEqualTo(990),
    );
  });
  test('shortAddress keeps road, number, area and city only', () {
    expect(
      shortAddress({
        'road': '6a. Avenida',
        'house_number': '12',
        'suburb': 'Zona 1',
        'city': 'Guatemala',
        'country': 'Guatemala',
        'postcode': '01001',
      }),
      '6a. Avenida 12, Zona 1, Guatemala',
    );
    expect(shortAddress({'country': 'Guatemala'}), isNull);
  });

  test('reverse lookups are cached per point and identify Aldia', () async {
    final requests = <http.Request>[];
    final service = NominatimGeocoder(
      client: MockClient((request) async {
        requests.add(request);
        return http.Response(
          jsonEncode({
            'address': {'road': 'Calle 12', 'suburb': 'Zona 1'},
          }),
          200,
        );
      }),
    );
    const point = LatLng(14.64231, -90.51322);
    expect(await service.reverse(point), 'Calle 12, Zona 1');
    expect(await service.reverse(point), 'Calle 12, Zona 1');
    expect(requests, hasLength(1));
    expect(requests.single.url.path, '/reverse');
    expect(requests.single.headers['User-Agent'], contains('Aldia'));
  });
}
