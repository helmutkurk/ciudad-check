import 'dart:async';
import 'dart:convert';

import 'package:aldia_app/data/api_client.dart';
import 'package:aldia_app/data/report.dart';
import 'package:aldia_app/data/report_repository.dart';
import 'package:aldia_app/features/home/explore_query.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';

import '../../support/fakes.dart';
import '../../widgets/harness.dart';

const _cluster = ReportCluster(position: LatLng(14.63, -90.5), count: 7);
const MapArea _area = (
  southWest: LatLng(14.5, -90.6),
  northEast: LatLng(14.7, -90.4),
  zoom: 13,
);
const MapArea _moved = (
  southWest: LatLng(14.6, -90.6),
  northEast: LatLng(14.8, -90.4),
  zoom: 13,
);

String _id(int i) => '00000000-0000-4000-8000-${i.toString().padLeft(12, '0')}';

Map<String, dynamic> _report(
  int i, {
  String state = 'nuevo',
  String category = 'pothole',
  String? note,
}) => {...stateJson(state, id: _id(i)), 'category': category, 'note': note};

/// Repository whose `/reports` answers wait for [answer] to be called, so a
/// test decides the order in which answers arrive.
({ReportRepository repository, List<Completer<http.Response>> pending})
_gated() {
  final pending = <Completer<http.Response>>[];
  final client = MockClient((request) {
    final answer = Completer<http.Response>();
    pending.add(answer);
    return answer.future;
  });
  return (
    repository: ReportRepository(
      api: ApiClient(client: client, baseUrl: 'http://api.test/api'),
      store: MemoryStore(),
    ),
    pending: pending,
  );
}

http.Response _page(List<Map<String, dynamic>> items) =>
    http.Response(jsonEncode({'items': items, 'total': items.length}), 200);

/// Lets the debounce timer and the fake HTTP answers run.
Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  late List<Uri> requests;

  setUp(() => requests = []);

  ExploreQuery query({
    List<Map<String, dynamic>> list = const [],
    FakeClusters? clusters,
    bool withClusters = true,
  }) => ExploreQuery(
    repository: repositoryWith(list: list, requests: requests),
    clusters: withClusters ? (clusters ?? FakeClusters([_cluster])) : null,
    debounce: const Duration(milliseconds: 5),
  );

  Iterable<Uri> listCalls() =>
      requests.where((u) => u.path.endsWith('/reports'));

  test('starts loading and waits for the map area', () async {
    final q = query();
    expect(q.state.loading, isTrue);
    await _settle();
    expect(listCalls(), isEmpty);
  });

  test('falls back to pins when clusters fail', () async {
    final q = query(
      list: [_report(1)],
      clusters: FakeClusters(const [], fail: true),
    )..setArea(_area);
    await _settle();

    expect(q.state.clustersUnavailable, isTrue);
    expect(q.state.showsClusters, isFalse);
    expect(q.state.pins, hasLength(1));
    expect(q.state.failed, isFalse);
  });

  test('without a clusters endpoint the map shows pins', () async {
    final q = query(list: [_report(1)], withClusters: false)..setArea(_area);
    await _settle();

    expect(q.state.pins, hasLength(1));
    expect(q.state.clustersUnavailable, isFalse);
  });

  test('a filter skips clusters and sends state group and category', () async {
    final clusters = FakeClusters([_cluster]);
    final q = query(list: [_report(1)], clusters: clusters)..setArea(_area);
    await _settle();
    final before = clusters.calls;

    q.setFilters((group: 'resolved', category: 'pothole', query: ''));
    await _settle();

    expect(clusters.calls, before);
    expect(q.filterCount, 2);
    expect(q.state.showsClusters, isFalse);
    expect(q.state.pins, hasLength(1));
    final sent = listCalls().last.queryParameters;
    expect(sent['state_group'], 'resolved');
    expect(sent['category'], 'pothole');
  });

  test('search filters the map pins and the list the same way', () async {
    final q = query(
      list: [
        _report(1, category: 'pothole'),
        _report(2, category: 'trash', note: 'Bache grande frente a la escuela'),
        _report(3, category: 'trash', state: 'resuelto'),
      ],
    )..setArea(_area);
    await _settle();

    q.setFilters((group: null, category: null, query: '  BACHE '));
    await _settle();

    expect(q.filters.query, 'BACHE');
    expect(q.filterCount, 1);
    expect(q.state.showsClusters, isFalse);
    expect(q.state.pins.map((r) => r.id), [_id(1), _id(2)]);
    expect(q.state.reports.map((r) => r.id), [_id(1), _id(2)]);

    q.setFilters((group: null, category: null, query: 'resuelto'));
    await _settle();
    expect(q.state.reports.map((r) => r.id), [_id(3)]);
  });

  test('clearing the filters returns to clusters', () async {
    final q = query(list: [_report(1)])..setArea(_area);
    q.setFilters((group: 'open', category: null, query: ''));
    await _settle();

    q.setFilters(noFilters);
    await _settle();

    expect(q.filterCount, 0);
    expect(q.state.showsClusters, isTrue);
    expect(q.state.pins, isEmpty);
  });

  test('map moves wait until the map is still, then load once', () async {
    final clusters = FakeClusters([_cluster]);
    final q = ExploreQuery(
      repository: repositoryWith(requests: requests),
      clusters: clusters,
      debounce: const Duration(milliseconds: 60),
    )..setArea(_area);
    await _settle();
    expect(clusters.calls, 1, reason: 'the first area loads at once');

    q
      ..setArea(_moved)
      ..setArea(_area)
      ..setArea(_moved);
    await _settle();
    expect(clusters.calls, 1, reason: 'still inside the debounce time');

    await Future<void>.delayed(const Duration(milliseconds: 80));
    expect(clusters.calls, 2);
  });

  test('an answer for an older request is ignored', () async {
    final gated = _gated();
    final q = ExploreQuery(
      repository: gated.repository,
      debounce: const Duration(milliseconds: 5),
    )..setArea(_area);
    await _settle();
    q.setFilters((group: 'closed', category: null, query: ''));
    await _settle();
    q.setFilters((group: 'open', category: null, query: ''));
    await _settle();
    expect(gated.pending, hasLength(3));

    // The newest answer arrives first; the older ones must not replace it.
    gated.pending[2].complete(_page([_report(1)]));
    await _settle();
    gated.pending[1].complete(_page([_report(2), _report(3)]));
    gated.pending[0].complete(_page(const []));
    await _settle();

    expect(q.state.pins.map((r) => r.id), [_id(1)]);
    expect(q.state.loading, isFalse);
  });

  test('a failed list load reports failure and retry recovers', () async {
    final gated = _gated();
    final q = ExploreQuery(
      repository: gated.repository,
      debounce: const Duration(milliseconds: 5),
    )..setArea(_area);
    await _settle();
    gated.pending.single.complete(http.Response('down', 503));
    await _settle();
    expect(q.state.failed, isTrue);
    expect(q.state.loading, isFalse);

    final retry = q.retry();
    await _settle();
    expect(q.state.loading, isTrue);
    gated.pending.last.complete(_page([_report(1)]));
    await retry;
    expect(q.state.failed, isFalse);
    expect(q.state.pins, hasLength(1));
  });

  test(
    'more than one page: hasMore, then loadMore appends the next page',
    () async {
      final q = query(
        list: [for (var i = 0; i < 130; i++) _report(i)],
        withClusters: false,
      )..setArea(_area);
      await _settle();

      expect(q.state.loaded, 100);
      expect(q.state.total, 130);
      expect(q.state.hasMore, isTrue);

      await q.loadMore();

      expect(listCalls().last.queryParameters['offset'], '100');
      expect(q.state.loaded, 130);
      expect(q.state.pins, hasLength(130));
      expect(q.state.reports, hasLength(130));
      expect(q.state.hasMore, isFalse);
    },
  );

  test('moving the map starts again from the first page', () async {
    final q = query(
      list: [for (var i = 0; i < 130; i++) _report(i)],
      withClusters: false,
    )..setArea(_area);
    await _settle();
    await q.loadMore();

    q.setArea(_moved);
    await _settle();

    expect(q.state.loaded, 100);
    expect(listCalls().last.queryParameters.containsKey('offset'), isFalse);
  });

  test('search counts against loaded reports, not the server total', () async {
    final q = query(
      list: [
        for (var i = 0; i < 130; i++)
          _report(i, note: i == 5 ? 'farola' : null),
      ],
      withClusters: false,
    )..setArea(_area);
    q.setFilters((group: null, category: null, query: 'farola'));
    await _settle();

    expect(q.state.reports, hasLength(1));
    expect(q.state.loaded, 100);
    expect(q.state.total, 130);
    expect(q.state.hasMore, isTrue);
  });

  test('clusters are requested 3 zoom levels out', () async {
    final clusters = FakeClusters([_cluster]);
    query(clusters: clusters).setArea(_area);
    await _settle();

    expect(clusters.lastZoom, 10);
  });

  test('a cluster lists every report in its grid cell', () async {
    final q = query(list: [_report(1), _report(2)])..setArea(_area);
    await _settle();

    final page = await q.clusterReports(_cluster);

    expect(page.items, hasLength(2));
    final bbox = listCalls().last.queryParameters['bbox']!
        .split(',')
        .map(double.parse)
        .toList();
    // Cell of 360 / 2^14 degrees around the cluster at request zoom 10.
    final size = 360 / 16384;
    expect(bbox[2] - bbox[0], closeTo(size, 1e-9));
    expect(bbox[3] - bbox[1], closeTo(size, 1e-9));
    expect(_cluster.position.longitude, inInclusiveRange(bbox[0], bbox[2]));
    expect(_cluster.position.latitude, inInclusiveRange(bbox[1], bbox[3]));

    await q.clusterReports(_cluster, offset: 100);
    expect(listCalls().last.queryParameters['offset'], '100');
  });

  test(
    'without filters the map shows clusters and loads the area once',
    () async {
      final clusters = FakeClusters([_cluster]);
      final q = query(list: [_report(1), _report(2)], clusters: clusters)
        ..setArea(_area);
      await _settle();

      expect(clusters.calls, 1);
      expect(q.state.loading, isFalse);
      expect(q.state.showsClusters, isTrue);
      expect(q.state.clusters, [_cluster]);
      expect(q.state.pins, isEmpty);
      expect(
        listCalls().single.queryParameters['bbox'],
        '-90.6,14.5,-90.4,14.7',
      );

      // Lista already has the same area's reports: no second request.
      q.setMode(ExploreMode.list);
      expect(q.state.reports, hasLength(2));
      expect(listCalls(), hasLength(1));
    },
  );

  test(
    'a one-report cluster becomes a state pin when its report is loaded',
    () async {
      final single = ReportCluster(
        position: const LatLng(14.62, -90.52),
        count: 1,
        ids: [_id(2)],
      );
      final q = query(
        list: [
          _report(1),
          _report(2, state: 'resuelto'),
        ],
        clusters: FakeClusters([_cluster, single]),
      )..setArea(_area);
      await _settle();

      expect(q.state.showsClusters, isTrue);
      expect(q.state.clusters, [_cluster]);
      expect(q.state.pins.map((r) => r.id), [_id(2)]);
    },
  );

  test(
    'a one-report cluster without a loaded report stays a cluster',
    () async {
      final single = ReportCluster(
        position: const LatLng(14.62, -90.52),
        count: 1,
        ids: [_id(99)],
      );
      final q = query(list: [_report(1)], clusters: FakeClusters([single]))
        ..setArea(_area);
      await _settle();

      expect(q.state.clusters, [single]);
      expect(q.state.pins, isEmpty);
    },
  );

  test('if the area list fails, clusters still show', () async {
    final gated = _gated();
    final q = ExploreQuery(
      repository: gated.repository,
      clusters: FakeClusters([_cluster]),
      debounce: const Duration(milliseconds: 5),
    )..setArea(_area);
    await _settle();
    gated.pending.single.complete(http.Response('down', 503));
    await _settle();

    expect(q.state.showsClusters, isTrue);
    expect(q.state.clusters, [_cluster]);
    expect(q.state.failed, isTrue, reason: 'Lista offers retry');
    expect(q.state.loading, isFalse);
  });

  test('a new area replaces clusters and pins in one step', () async {
    final gated = _gated();
    final single = ReportCluster(
      position: const LatLng(14.62, -90.52),
      count: 1,
      ids: [_id(2)],
    );
    final q = ExploreQuery(
      repository: gated.repository,
      clusters: FakeClusters([_cluster, single]),
      debounce: const Duration(milliseconds: 5),
    )..setArea(_area);
    await _settle();
    gated.pending.single.complete(_page([_report(2)]));
    await _settle();
    expect(q.state.pins.map((r) => r.id), [_id(2)]);

    q.setArea(_moved);
    await _settle();
    // Clusters for the new area are back, the list is not: keep the old view.
    expect(gated.pending, hasLength(2));
    expect(q.state.loading, isTrue);
    expect(q.state.clusters, [_cluster]);
    expect(q.state.pins.map((r) => r.id), [_id(2)]);

    gated.pending.last.complete(_page([_report(2)]));
    await _settle();
    expect(q.state.loading, isFalse);
    expect(q.state.clusters, [_cluster]);
    expect(q.state.pins.map((r) => r.id), [_id(2)]);
  });
}
