import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:provider/provider.dart';

import '../../core/config.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/report.dart';
import '../../data/report_repository.dart';
import '../../services/haptics.dart';
import '../../services/location_service.dart';
import '../../core/citizen_states.dart';
import '../../widgets/aldia_banner.dart';
import '../../widgets/map_layers_button.dart';
import '../../widgets/status_chips.dart';
import 'explore_query.dart';
import 'report_map_widgets.dart';

/// The Explorar map. [query] decides what it shows; the map reports the
/// visible area to it and draws clusters or pins from its state.
class MapView extends StatefulWidget {
  const MapView({
    super.key,
    required this.query,
    required this.onOpen,
    this.overlayTop = 0,
  });

  final ExploreQuery query;
  final void Function(Report) onOpen;

  /// Height covered by the floating Explorar controls; overlays start below.
  final double overlayTop;

  @override
  State<MapView> createState() => _MapViewState();
}

class _MapViewState extends State<MapView> {
  final _controller = MapController();
  var _ready = false;
  bool _showReports = true;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    final point = await context.read<LocationService>().currentPosition();
    if (!mounted) return;
    if (point != null) {
      _controller.move(point, 16);
    } else {
      unawaited(HapticsHelper.error());
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text(S.locationUnavailable)));
    }
  }

  void _reportArea() {
    final camera = _controller.camera;
    final bounds = camera.visibleBounds;
    widget.query.setArea((
      southWest: bounds.southWest,
      northEast: bounds.northEast,
      zoom: camera.zoom,
    ));
  }

  Future<void> _showSummary(Report report) {
    FocusManager.instance.primaryFocus?.unfocus();
    return showModalBottomSheet<void>(
      context: context,
      sheetAnimationStyle: MediaQuery.disableAnimationsOf(context)
          ? AnimationStyle.noAnimation
          : null,
      builder: (sheetContext) {
        void openDetail() {
          Navigator.of(sheetContext).pop();
          widget.onOpen(report);
        }

        return ReportMapSummary(report: report, onOpen: openDetail);
      },
    );
  }

  Future<void> _tapCluster(ReportCluster cluster) async {
    if (cluster.count == 1 && cluster.ids.length == 1) {
      try {
        final report = await context.read<ReportRepository>().get(
          cluster.ids.single,
        );
        if (mounted) await _showSummary(report);
      } catch (_) {
        if (mounted) {
          unawaited(HapticsHelper.error());
          ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text(S.loadError)));
        }
      }
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      sheetAnimationStyle: MediaQuery.disableAnimationsOf(context)
          ? AnimationStyle.noAnimation
          : null,
      builder: (_) => ClusterReportsSheet(
        query: widget.query,
        cluster: cluster,
        onOpen: widget.onOpen,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.query,
      builder: (context, _) => _build(context, widget.query.state),
    );
  }

  Widget _build(BuildContext context, ExploreState state) {
    return Stack(
      children: [
        Semantics(
          label: S.mapAlternative,
          child: FlutterMap(
            mapController: _controller,
            options: MapOptions(
              initialCenter: AppConfig.defaultCenter,
              initialZoom: AppConfig.defaultZoom,
              onMapReady: () {
                _ready = true;
                _reportArea();
              },
              onPositionChanged: (_, _) {
                if (_ready) _reportArea();
              },
            ),
            children: [
              TileLayer(
                urlTemplate: AppConfig.tileUrl,
                tileProvider: context.read<TileProvider>(),
                userAgentPackageName: AppConfig.userAgentPackage,
              ),
              if (_showReports)
                MarkerLayer(
                  markers: [
                    for (final report in state.pins)
                      Marker(
                        point: report.position,
                        width: 104,
                        height: 72,
                        child: StatePin(
                          report: report,
                          onTap: () => _showSummary(report),
                        ),
                      ),
                    for (final cluster in state.clusters)
                      Marker(
                        point: cluster.position,
                        width: 56,
                        height: 56,
                        child: ClusterPin(
                          cluster: cluster,
                          onTap: () => _tapCluster(cluster),
                        ),
                      ),
                  ],
                ),
            ],
          ),
        ),
        Positioned(
          left: AldiaSpace.l,
          right: AldiaSpace.l,
          top: widget.overlayTop,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (state.loading && _ready)
                const _Floating(child: AldiaBanner(S.mapLoading))
              else if (state.failed && !state.showsClusters)
                _Floating(
                  child: Semantics(
                    button: true,
                    onTap: widget.query.retry,
                    child: GestureDetector(
                      onTap: widget.query.retry,
                      child: const AldiaBanner(
                        S.mapError,
                        kind: BannerKind.error,
                      ),
                    ),
                  ),
                )
              else if (_ready && state.pins.isEmpty && state.clusters.isEmpty)
                const _Floating(
                  child: AldiaBanner(S.mapEmpty, kind: BannerKind.warning),
                ),
              if (state.clustersUnavailable)
                const _Floating(child: AldiaBanner(S.mapFallback)),
              if (!state.showsClusters &&
                  state.hasMore &&
                  !state.loading &&
                  !state.failed)
                _Floating(child: AldiaBanner(S.mapCapped(state.loaded))),
            ],
          ),
        ),
        const Positioned(
          left: AldiaSpace.l,
          bottom: AldiaSpace.l,
          child: _Legend(),
        ),
        Positioned(
          right: AldiaSpace.l,
          bottom: AldiaSpace.xxl,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _Floating(
                radius: AldiaRadius.tile,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: S.zoomIn,
                      onPressed: () => _controller.move(
                        _controller.camera.center,
                        (_controller.camera.zoom + 1).clamp(3, 19),
                      ),
                      icon: const Icon(Icons.add),
                    ),
                    const SizedBox(width: 32, child: Divider(height: 1)),
                    IconButton(
                      tooltip: S.zoomOut,
                      onPressed: () => _controller.move(
                        _controller.camera.center,
                        (_controller.camera.zoom - 1).clamp(3, 19),
                      ),
                      icon: const Icon(Icons.remove),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AldiaSpace.m),
              _Floating(
                radius: 26,
                child: IconButton(
                  tooltip: S.useMyLocation,
                  onPressed: _locate,
                  icon: const Icon(Icons.my_location),
                ),
              ),
              const SizedBox(height: AldiaSpace.m),
              _Floating(
                radius: 26,
                child: MapLayersButton(
                  overlay: 'Reportes de la comunidad',
                  visible: _showReports,
                  onChanged: (value) => setState(() => _showReports = value),
                ),
              ),
            ],
          ),
        ),
        Positioned(
          right: AldiaSpace.s,
          bottom: AldiaSpace.xs,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.9),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              child: Text(
                '© OpenStreetMap contributors',
                style: TextStyle(color: AldiaColors.text, fontSize: 11),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Surface with a soft shadow for controls floating over the map.
class _Floating extends StatelessWidget {
  const _Floating({required this.child, this.radius = AldiaRadius.input});
  final Widget child;
  final double radius;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: AldiaSpace.s),
    child: Material(
      color: Theme.of(context).colorScheme.surface,
      elevation: 3,
      shadowColor: Colors.black45,
      borderRadius: BorderRadius.circular(radius),
      clipBehavior: Clip.antiAlias,
      child: child,
    ),
  );
}

/// Map key: one dot and word per public state group.
class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _Floating(
      radius: AldiaRadius.tile,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AldiaSpace.m,
          AldiaSpace.s,
          AldiaSpace.l,
          AldiaSpace.s,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(S.legendTitle, style: theme.textTheme.labelLarge),
            ),
            for (final group in const ['open', 'in_work', 'resolved', 'closed'])
              Padding(
                padding: const EdgeInsets.only(top: AldiaSpace.xs),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    StatusDot(state: stateGroups[group]!.$2),
                    const SizedBox(width: AldiaSpace.s),
                    Text(
                      stateGroups[group]!.$1,
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
