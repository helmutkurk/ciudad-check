import 'dart:convert';

import 'package:aldia_app/services/test_account.dart';
import 'package:aldia_app/core/theme.dart';
import 'package:aldia_app/data/api_client.dart';
import 'package:aldia_app/data/clusters_api.dart';
import 'package:aldia_app/data/report.dart';
import 'package:aldia_app/data/report_repository.dart';
import 'package:aldia_app/features/drafts/draft_store.dart';
import 'package:aldia_app/features/outbox/outbox_service.dart';
import 'package:aldia_app/services/connectivity_service.dart';
import 'package:aldia_app/services/location_service.dart';
import 'package:aldia_app/services/geocoder_service.dart';
import 'package:aldia_app/services/photo_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../support/fakes.dart';

import 'package:aldia_app/services/identity_services.dart';

import '../support/offline_tiles.dart';

const detailId = '22222222-2222-4222-8222-222222222222';
const mainId = '33333333-3333-4333-8333-333333333333';

Map<String, dynamic> stateJson(
  String state, {
  String id = detailId,
  Map<String, dynamic> extra = const {},
}) => {...reportJson(id: id), 'state': state, ...extra};

/// Repository over a mock server: [list] answers `/reports`, [byId] answers
/// `/reports/{id}`, [nearby] answers `/reports/nearby`.
ReportRepository repositoryWith({
  List<Map<String, dynamic>> list = const [],
  Map<String, Map<String, dynamic>> byId = const {},
  List<Map<String, dynamic>> nearby = const [],
  List<Uri>? requests,
  List<http.Request>? posts,
  AuthService auth = const NoopAuthService(),
  bool requireCitizenLogin = false,
  TestAccountSession? testAccount,
  VoidCallback? onPost,
}) {
  final client = MockClient((request) async {
    requests?.add(request.url);
    final path = request.url.path;
    if (path.endsWith('/categories')) {
      return http.Response(jsonEncode(categoryJson()), 200);
    }
    if (path.endsWith('/stats')) {
      final fixed = list
          .where((report) => report['state'] == 'resuelto')
          .length;
      return http.Response(
        jsonEncode({
          'total': list.length,
          'by_category': {},
          'by_status': {},
          'by_resolution': {'fixed': fixed},
        }),
        200,
      );
    }
    if (request.method == 'POST') {
      posts?.add(request);
      onPost?.call();
      return http.Response(jsonEncode(stateJson('nuevo')), 201);
    }
    if (path.endsWith('/reports/nearby')) {
      return http.Response(jsonEncode({'items': nearby}), 200);
    }
    if (path.endsWith('/reports')) {
      final offset =
          int.tryParse(request.url.queryParameters['offset'] ?? '') ?? 0;
      final limit =
          int.tryParse(request.url.queryParameters['limit'] ?? '') ?? 100;
      return http.Response(
        jsonEncode({
          'items': list.skip(offset).take(limit).toList(),
          'total': list.length,
        }),
        200,
      );
    }
    final json = byId[path.split('/').last];
    return json == null
        ? http.Response(
            jsonEncode({
              'error': {'message': 'no'},
            }),
            404,
          )
        : http.Response(jsonEncode(json), 200);
  });
  return ReportRepository(
    api: ApiClient(client: client, baseUrl: 'http://api.test/api', auth: auth),
    requireCitizenLogin: requireCitizenLogin,
    testAccount: testAccount,
    store: MemoryStore()..saved.addAll(byId.keys),
  );
}

class FakeClusters implements ClustersApi {
  FakeClusters(this.result, {this.fail = false});
  final List<ReportCluster> result;
  final bool fail;
  int calls = 0;
  double? lastZoom;

  @override
  Future<List<ReportCluster>> clusters({
    required LatLng southWest,
    required LatLng northEast,
    required double zoom,
  }) async {
    calls++;
    lastZoom = zoom;
    if (fail) throw http.ClientException('offline');
    return result;
  }
}

class FakeOutbox extends ChangeNotifier implements OutboxService {
  FakeOutbox(this._entries);
  List<OutboxEntry> _entries;
  int retries = 0;
  final removed = <String>[];

  @override
  List<OutboxEntry> get entries => _entries;
  @override
  Object? get persistenceError => null;
  @override
  Future<void> initialize() async {}
  @override
  Future<Report?> enqueue(draft) async => null;
  @override
  Future<void> retry() async => retries++;
  @override
  Future<void> remove(String id) async {
    removed.add(id);
    _entries = _entries.where((e) => e.draft.id != id).toList();
    notifyListeners();
  }
}

/// Providers the screens read, around a plain [MaterialApp].
Widget harness({
  required Widget home,
  required ReportRepository repository,
  DraftStore? drafts,
  OutboxService? outbox,
  ClustersApi? clusters,
}) => MultiProvider(
  providers: [
    Provider<ReportRepository>.value(value: repository),
    Provider<LocationService>.value(value: FakeLocation(null)),
    Provider<PhotoService>.value(value: FakePhotos()),
    Provider<GeocoderService?>.value(value: FakeGeocoder()),
    Provider<DraftStore?>.value(value: drafts),
    InheritedProvider<OutboxService?>.value(value: outbox),
    Provider<ConnectivityService?>.value(value: null),
    Provider<ClustersApi?>.value(value: clusters),
    Provider<TileProvider>.value(value: OfflineTileProvider()),
  ],
  child: MaterialApp(theme: buildTheme(), home: home),
);
