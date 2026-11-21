import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

import '../../core/categories.dart';
import '../../core/citizen_states.dart';
import '../../data/cluster_query.dart';
import '../../data/clusters_api.dart';
import '../../data/report.dart';
import '../../data/report_repository.dart';

/// What the citizen chose in the filter sheet. A null field means "all".
typedef ReportFilters = ({String? group, String? category, String query});

const ReportFilters noFilters = (group: null, category: null, query: '');

/// The part of the city the map shows.
typedef MapArea = ({LatLng southWest, LatLng northEast, double zoom});

enum ExploreMode { map, list }

/// What Explorar shows right now. Mapa and Lista read the same snapshot.
@immutable
class ExploreState {
  const ExploreState({
    this.loading = true,
    this.failed = false,
    this.showsClusters = false,
    this.clustersUnavailable = false,
    this.clusters = const [],
    this.pins = const [],
    this.reports = const [],
    this.loaded = 0,
    this.total = 0,
    this.loadingMore = false,
  });

  /// Something the current mode needs is still on its way.
  final bool loading;

  /// The report list for the current area and filters failed to load. While
  /// [showsClusters] the map still works; Lista offers retry.
  final bool failed;

  /// The map shows [clusters]. Otherwise it shows only [pins].
  final bool showsClusters;

  /// The clusters endpoint failed, so the map fell back to pins.
  final bool clustersUnavailable;

  final List<ReportCluster> clusters;

  /// Reports drawn as state pins. While [showsClusters], only the one-report
  /// clusters whose report is loaded; those are left out of [clusters].
  final List<Report> pins;

  /// Reports for Lista, search applied.
  final List<Report> reports;

  /// Reports fetched so far, before search.
  final int loaded;

  /// Reports on the server for this area and filters.
  final int total;

  final bool loadingMore;

  bool get hasMore => loaded < total;
}

/// Decides which reports Explorar shows from the filters, the map area and the
/// Mapa/Lista mode (see `app/GLOSSARY.md`, "Explorar query").
///
/// Without filters the map uses clusters. The newest page of reports for the
/// same area loads too: Lista shows it, and a one-report cluster whose report
/// is in it is drawn as that report's state pin (clusters carry no category or
/// state). Any filter, search included, switches the map to pins, because the
/// clusters endpoint has no filters. Search is matched here, on the reports
/// loaded so far, because the API has no text search.
class ExploreQuery extends ChangeNotifier {
  ExploreQuery({
    required this._repository,
    ClustersApi? clusters,
    this._debounce = const Duration(milliseconds: 400),
  }) : _clustersApi = clusters;

  final ReportRepository _repository;
  final ClustersApi? _clustersApi;
  final Duration _debounce;

  ReportFilters _filters = noFilters;
  ExploreMode _mode = ExploreMode.map;
  MapArea? _area;
  Timer? _timer;
  int _token = 0;
  bool _disposed = false;

  /// Zoom the current clusters were requested at; their grid cells use it.
  int _clusterZoom = 0;

  bool _loading = true;
  bool _failed = false;
  bool _showsClusters = false;
  bool _clustersUnavailable = false;
  List<ReportCluster> _clusters = const [];
  List<Report> _fetched = const [];
  bool _fetchedReports = false;
  int _total = 0;
  bool _loadingMore = false;
  ExploreState _state = const ExploreState();

  ExploreState get state => _state;
  ReportFilters get filters => _filters;
  ExploreMode get mode => _mode;

  /// Active filters, for the badge on the filter button.
  int get filterCount =>
      (_filters.group != null ? 1 : 0) +
      (_filters.category != null ? 1 : 0) +
      (_filters.query.isNotEmpty ? 1 : 0);

  /// The map moved or became ready. The first area loads at once; later ones
  /// wait until the map has been still for the debounce time.
  void setArea(MapArea area) {
    final first = _area == null;
    _area = area;
    _timer?.cancel();
    _timer = Timer(first ? Duration.zero : _debounce, () => unawaited(_load()));
  }

  void setFilters(ReportFilters filters) {
    _filters = (
      group: filters.group,
      category: filters.category,
      query: filters.query.trim(),
    );
    _timer?.cancel();
    if (_area == null) {
      _publish();
      return;
    }
    unawaited(_load());
  }

  void setMode(ExploreMode mode) {
    if (mode == _mode) return;
    _mode = mode;
    _publish();
  }

  Future<void> retry() {
    _timer?.cancel();
    return _load();
  }

  /// Adds the next page of reports for the same area and filters.
  Future<void> loadMore() async {
    final area = _area;
    if (area == null || !_fetchedReports || _loadingMore) return;
    if (_fetched.length >= _total) return;
    final token = _token;
    _loadingMore = true;
    _publish();
    try {
      final page = await _nearby(area, offset: _fetched.length);
      if (_stale(token)) return;
      _fetched = [..._fetched, ...page.items];
      _total = page.total;
    } catch (_) {
      // Keep what is loaded; the citizen can tap "Ver más" again.
    }
    if (_stale(token)) return;
    _loadingMore = false;
    _publish();
  }

  /// One page of the reports grouped in [cluster]: every report in its grid
  /// cell, not only the first ids the clusters endpoint sends.
  Future<ReportPage> clusterReports(ReportCluster cluster, {int offset = 0}) {
    final cell = clusterCell(cluster.position, _clusterZoom);
    return _repository.nearby(
      southWest: cell.southWest,
      northEast: cell.northEast,
      offset: offset,
    );
  }

  bool get _filtered => filterCount > 0;
  bool _stale(int token) => _disposed || token != _token;

  Future<ReportPage> _nearby(MapArea area, {int offset = 0}) =>
      _repository.nearby(
        southWest: area.southWest,
        northEast: area.northEast,
        offset: offset,
        stateGroup: _filters.group,
        category: _filters.category,
      );

  /// Loads clusters and the area's newest reports in parallel, then replaces
  /// the whole view at once. Until then the previous view stays on screen, so
  /// a one-report cluster never shows as a plain pin before its state pin.
  Future<void> _load() async {
    final area = _area;
    if (area == null || _disposed) return;
    final token = ++_token;
    final clustersApi = _filtered ? null : _clustersApi;
    final zoom = clusterRequestZoom(area.zoom);
    _loadingMore = false;
    _loading = true;
    _failed = false;
    _publish();

    final clustersRequest = clustersApi
        ?.clusters(
          southWest: area.southWest,
          northEast: area.northEast,
          zoom: zoom.toDouble(),
        )
        .then<List<ReportCluster>?>(
          (clusters) => clusters,
          onError: (_) => null,
        );
    final pageRequest = _nearby(area)
        .then<ReportPage?>((page) => page, onError: (_) => null);
    final clusters = await clustersRequest;
    final page = await pageRequest;
    if (_stale(token)) return;

    _showsClusters = clusters != null;
    _clustersUnavailable = clustersApi != null && clusters == null;
    _clusters = clusters ?? const [];
    _clusterZoom = zoom;
    _fetched = page?.items ?? const [];
    _total = page?.total ?? 0;
    _fetchedReports = page != null;
    _failed = page == null;
    _loading = false;
    _publish();
  }

  void _publish() {
    if (_disposed) return;
    final needle = _filters.query.toLowerCase();
    final reports = needle.isEmpty
        ? _fetched
        : [
            for (final r in _fetched)
              if (_matches(r, needle)) r,
          ];
    var clusters = _clusters;
    var pins = reports;
    if (_showsClusters) {
      final byId = {for (final r in _fetched) r.id: r};
      Report? single(ReportCluster c) =>
          c.count == 1 && c.ids.length == 1 ? byId[c.ids.single] : null;
      clusters = [
        for (final c in _clusters)
          if (single(c) == null) c,
      ];
      pins = [for (final c in _clusters) ?single(c)];
    }
    _state = ExploreState(
      loading: _loading,
      failed: _failed,
      showsClusters: _showsClusters,
      clustersUnavailable: _clustersUnavailable,
      clusters: clusters,
      pins: pins,
      reports: reports,
      loaded: _fetched.length,
      total: _total,
      loadingMore: _loadingMore,
    );
    notifyListeners();
  }

  static bool _matches(Report r, String needle) => [
    categoryById(r.category).label,
    citizenStateFor(r.citizenState).label,
    r.note ?? '',
  ].any((text) => text.toLowerCase().contains(needle));

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}
