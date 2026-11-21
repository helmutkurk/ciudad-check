import 'dart:convert';

import 'package:aldia_app/data/api_client.dart';
import 'package:aldia_app/data/cluster_query.dart';
import 'package:aldia_app/data/clusters_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';

const _southWest = LatLng(14.5, -90.6);
const _northEast = LatLng(14.7, -90.4);

void main() {
  for (final (zoom, encoded) in [(-2.0, '0'), (13.6, '14'), (25.0, '20')]) {
    test(
      'both cluster clients encode bbox and zoom $zoom identically',
      () async {
        final requests = <Uri>[];
        final client = MockClient((request) async {
          requests.add(request.url);
          return http.Response(
            jsonEncode({
              'clusters': [
                {
                  'lat': 14.6,
                  'lon': -90.5,
                  'count': 1,
                  'ids': ['synthetic-id'],
                },
              ],
            }),
            200,
          );
        });
        addTearDown(client.close);
        final api = ApiClient(client: client, baseUrl: 'http://api.test/api/');
        final map = HttpClustersApi(
          client: client,
          baseUrl: 'http://api.test/api/',
        );
        final reports = await api.clusters(
          southWest: _southWest,
          northEast: _northEast,
          zoom: zoom,
        );
        final pins = await map.clusters(
          southWest: _southWest,
          northEast: _northEast,
          zoom: zoom,
        );
        expect(requests.first, requests.last);
        expect(requests, hasLength(2));
        expect(requests.first.path, '/api/reports/clusters');
        expect(requests.first.queryParameters, {
          'bbox': '-90.6,14.5,-90.4,14.7',
          'zoom': encoded,
        });
        expect(reports.single.ids, ['synthetic-id']);
        expect(pins.single.position, reports.single.position);
        expect(pins.single.count, reports.single.count);
      },
    );
  }

  test('shared encoding preserves each transport HTTP error policy', () async {
    final client = MockClient(
      (_) async => http.Response('{"error":{"message":"Unavailable"}}', 503),
    );
    addTearDown(client.close);
    await expectLater(
      ApiClient(client: client)
          .clusters(southWest: _southWest, northEast: _northEast, zoom: 10),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'status', 503)
            .having((error) => error.message, 'message', 'Unavailable'),
      ),
    );
    await expectLater(
      HttpClustersApi(client: client)
          .clusters(southWest: _southWest, northEast: _northEast, zoom: 10),
      throwsA(
        isA<http.ClientException>().having(
          (error) => error.message,
          'message',
          'HTTP 503',
        ),
      ),
    );
  });

  group('cluster grid', () {
    test('asks for clusters 3 zoom levels out, within the API range', () {
      expect(clusterRequestZoom(12), 9);
      expect(clusterRequestZoom(12.6), 10);
      expect(clusterRequestZoom(2), 0);
      expect(clusterRequestZoom(30), 20);
    });

    test('a cell is 360 / 2^(zoom+4) degrees, anchored at -180/-90', () {
      const point = LatLng(14.6349, -90.5069);
      final cell = clusterCell(point, 9);
      final size = 360 / 8192;

      expect(
        cell.northEast.longitude - cell.southWest.longitude,
        closeTo(size, 1e-9),
      );
      expect(
        cell.northEast.latitude - cell.southWest.latitude,
        closeTo(size, 1e-9),
      );
      expect(((cell.southWest.longitude + 180) / size) % 1, closeTo(0, 1e-6));
      expect(((cell.southWest.latitude + 90) / size) % 1, closeTo(0, 1e-6));
      expect(
        point.longitude,
        inInclusiveRange(cell.southWest.longitude, cell.northEast.longitude),
      );
      expect(
        point.latitude,
        inInclusiveRange(cell.southWest.latitude, cell.northEast.latitude),
      );
    });

    test('points in neighbouring cells get different cells', () {
      final a = clusterCell(const LatLng(14.6, -90.5), 9);
      final b = clusterCell(LatLng(14.6, a.northEast.longitude + 1e-6), 9);
      expect(b.southWest.longitude, closeTo(a.northEast.longitude, 1e-9));
    });

    test('cells at low zoom stay inside the world', () {
      final cell = clusterCell(const LatLng(80, 170), 0);
      expect(cell.northEast.latitude, lessThanOrEqualTo(90));
      expect(cell.northEast.longitude, lessThanOrEqualTo(180));
    });
  });
}
