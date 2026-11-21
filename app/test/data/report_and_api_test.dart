import 'dart:convert';
import 'dart:typed_data';

import 'package:aldia_app/data/api_client.dart';
import 'package:aldia_app/data/report.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';

import '../support/fakes.dart';

void main() {
  test('Report.fromJson parses the contract object', () {
    final report = Report.fromJson(reportJson());
    expect(report.category, 'pothole');
    expect(report.position.latitude, closeTo(14.6349, 1e-6));
    expect(report.resolution, 'open');
    expect(report.verification!.isStub, isTrue);
    expect(report.verification!.checks.single.name, 'freshness');
  });

  test('Report.fromJson accepts a pending report without verification', () {
    final report = Report.fromJson(
      reportJson(status: 'pending', withVerification: false),
    );
    expect(report.status, 'pending');
    expect(report.verification, isNull);
  });

  test('listReports sends bbox and limit and parses items', () async {
    late Uri seen;
    final client = MockClient((request) async {
      seen = request.url;
      return http.Response(
        jsonEncode({
          'items': [reportJson()],
          'total': 1,
        }),
        200,
      );
    });
    final api = ApiClient(client: client, baseUrl: 'http://api.test/api/');
    final page = await api.listReports(
      southWest: const LatLng(14.5, -90.6),
      northEast: const LatLng(14.7, -90.4),
      limit: 50,
    );
    expect(page.items, hasLength(1));
    expect(page.total, 1);
    expect(seen.queryParameters.containsKey('offset'), isFalse);
    expect(seen.path, '/api/reports');
    expect(seen.queryParameters['bbox'], '-90.6,14.5,-90.4,14.7');
    expect(seen.queryParameters['limit'], '50');
  });

  test('createReport sends multipart fields and maps API errors', () async {
    late http.BaseRequest seen;
    final client = MockClient((request) async {
      seen = request;
      return http.Response(
        jsonEncode({
          'error': {
            'code': 'validation_error',
            'message': 'category is invalid',
          },
        }),
        422,
      );
    });
    final api = ApiClient(client: client, baseUrl: 'http://api.test/api');
    await expectLater(
      api.createReport(
        photoBytes: Uint8List.fromList([1, 2, 3]),
        filename: 'p.jpg',
        category: 'nope',
        position: const LatLng(14.6, -90.5),
        capturedAt: DateTime.utc(2026, 11, 19),
      ),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'status', 422)
            .having((e) => e.message, 'message', 'category is invalid'),
      ),
    );
    expect(seen.method, 'POST');
    expect(seen.headers['content-type'], startsWith('multipart/form-data'));
  });

  test('photoUrl keeps the host and replaces the path', () {
    final api = ApiClient(
      client: MockClient((_) async => http.Response('', 200)),
      baseUrl: 'http://api.test:8000/api',
    );
    expect(
      api.photoUrl('/api/reports/x/photo'),
      'http://api.test:8000/api/reports/x/photo',
    );
  });
}
