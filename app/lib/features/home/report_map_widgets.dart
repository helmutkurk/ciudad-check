import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/categories.dart';
import '../../core/citizen_states.dart';
import '../../core/number_format.dart';
import '../../core/strings.dart';
import '../../core/text_x.dart';
import '../../core/theme.dart';
import '../../data/report.dart';
import '../../widgets/empty_state.dart';
import 'explore_query.dart';
import '../../widgets/neutral_map_pin.dart';
import '../../widgets/report_tile.dart';

class ReportMapSummary extends StatelessWidget {
  const ReportMapSummary({
    super.key,
    required this.report,
    required this.onOpen,
  });
  final Report report;
  final VoidCallback onOpen;
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AldiaSpace.l),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ReportTile(report: report, onTap: onOpen),
            if (report.publicNote.isUsable)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(report.publicNote!),
              ),
            const SizedBox(height: 8),
            FilledButton(onPressed: onOpen, child: const Text(S.viewDetail)),
          ],
        ),
      ),
    );
  }
}

/// Pin with the state as icon and short text, so it is not color-only.
class StatePin extends StatelessWidget {
  const StatePin({super.key, required this.report, required this.onTap});
  final Report report;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final state = citizenStateFor(report.citizenState);
    final category = categoryById(report.category).label;
    return Semantics(
      button: true,
      label: '$category. ${state.label}',
      excludeSemantics: true,
      onTap: onTap,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            StatusMapPin(
              state: report.citizenState,
              icon: categoryById(report.category).icon,
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(4),
                border: Border.all(
                  color: Theme.of(context).colorScheme.outline,
                ),
              ),
              child: Text(
                state.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textScaler: TextScaler.noScaling,
                style: TextStyle(
                  fontSize: 11,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ClusterPin extends StatelessWidget {
  const ClusterPin({super.key, required this.cluster, required this.onTap});
  final ReportCluster cluster;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final single = cluster.count == 1;
    return Semantics(
      button: true,
      label: single
          ? S.pinReport
          : '${S.clusterCount(cluster.count)}. ${S.openCluster}',
      excludeSemantics: true,
      onTap: onTap,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: NeutralMapPin(
          child: single
              ? const Icon(Icons.location_on)
              : Text(
                  cluster.count.humanizedCompact(),
                  textScaler: TextScaler.noScaling,
                ),
        ),
      ),
    );
  }
}

/// Bottom sheet with every report grouped in a cluster, newest first, with
/// "Ver más" when the cell holds more than one page.
class ClusterReportsSheet extends StatefulWidget {
  const ClusterReportsSheet({
    super.key,
    required this.query,
    required this.cluster,
    required this.onOpen,
  });

  final ExploreQuery query;
  final ReportCluster cluster;
  final void Function(Report) onOpen;

  @override
  State<ClusterReportsSheet> createState() => _ClusterReportsSheetState();
}

class _ClusterReportsSheetState extends State<ClusterReportsSheet> {
  List<Report> _reports = const [];
  late int _total = widget.cluster.count;
  bool _loading = true;
  bool _failed = false;
  bool _loadingMore = false;

  @override
  void initState() {
    super.initState();
    unawaited(_loadFirst());
  }

  void _retry() {
    setState(() {
      _loading = true;
      _failed = false;
    });
    unawaited(_loadFirst());
  }

  Future<void> _loadFirst() async {
    try {
      final page = await widget.query.clusterReports(widget.cluster);
      if (!mounted) return;
      setState(() {
        _reports = page.items;
        _total = page.total;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  Future<void> _loadMore() async {
    setState(() => _loadingMore = true);
    try {
      final page = await widget.query.clusterReports(
        widget.cluster,
        offset: _reports.length,
      );
      if (!mounted) return;
      setState(() {
        _reports = [..._reports, ...page.items];
        _total = page.total;
      });
    } catch (_) {
      // Keep what is loaded; "Ver más" stays available.
    }
    if (mounted) setState(() => _loadingMore = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.92,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(
          AldiaSpace.l,
          AldiaSpace.s,
          AldiaSpace.l,
          AldiaSpace.xl,
        ),
        children: [
          Semantics(
            header: true,
            child: Text(
              S.clusterSheetTitle(_total),
              style: theme.textTheme.titleLarge,
            ),
          ),
          const SizedBox(height: AldiaSpace.m),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(AldiaSpace.xl),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_failed)
            EmptyState(
              icon: Icons.cloud_off,
              title: S.loadError,
              actionLabel: S.retry,
              onAction: _retry,
            )
          else ...[
            for (final report in _reports)
              Padding(
                padding: const EdgeInsets.only(bottom: AldiaSpace.s),
                child: ReportTile(
                  report: report,
                  onTap: () {
                    Navigator.of(context).pop();
                    widget.onOpen(report);
                  },
                ),
              ),
            if (_reports.length < _total)
              Center(
                child: _loadingMore
                    ? const Padding(
                        padding: EdgeInsets.all(AldiaSpace.s),
                        child: CircularProgressIndicator(strokeWidth: 3),
                      )
                    : OutlinedButton(
                        onPressed: _loadMore,
                        child: const Text(S.loadMore),
                      ),
              ),
          ],
        ],
      ),
    );
  }
}
