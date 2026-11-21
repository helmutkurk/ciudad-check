import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/categories.dart';
import '../../core/strings.dart';
import '../../data/report.dart';
import '../../data/report_repository.dart';
import '../../core/theme.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/report_tile.dart';
import '../../widgets/routes.dart';
import '../detail/report_detail_screen.dart';
import '../drafts/draft_record.dart';
import '../drafts/draft_store.dart';
import '../home/bottom_navigation_reselect.dart';
import '../outbox/outbox_service.dart';
import '../report/report_flow_screen.dart';

/// Unsent work first (outbox, then drafts), then the reports already sent.
class MyReportsScreen extends StatefulWidget {
  const MyReportsScreen({
    super.key,
    this.embedded = false,
    this.reloadToken = 0,
  });

  /// True inside the home shell: no app bar of its own.
  final bool embedded;

  /// Changing this value reloads the sent reports and the drafts.
  final int reloadToken;

  @override
  State<MyReportsScreen> createState() => _MyReportsScreenState();
}

class _MyReportsScreenState extends State<MyReportsScreen> {
  late Future<List<Report>> _sent;
  List<DraftRecord> _drafts = const [];

  @override
  void initState() {
    super.initState();
    _sent = context.read<ReportRepository>().mine();
    unawaited(_loadDrafts());
  }

  @override
  void didUpdateWidget(MyReportsScreen old) {
    super.didUpdateWidget(old);
    if (old.reloadToken != widget.reloadToken) {
      _reloadSent();
      unawaited(_loadDrafts());
    }
  }

  Future<void> _loadDrafts() async {
    final drafts = await context.read<DraftStore?>()?.loadAll();
    if (mounted) setState(() => _drafts = drafts ?? const []);
  }

  void _reloadSent() {
    setState(() {
      _sent = context.read<ReportRepository>().mine();
    });
  }

  Future<void> _openFlow([DraftRecord? draft]) async {
    await AldiaRoute.open<void>(context, ReportFlowScreen(draft: draft));
    if (!mounted) return;
    _reloadSent();
    unawaited(_loadDrafts());
  }

  Future<bool> _confirmDelete(String question) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          content: Text(question),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text(S.cancel),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text(S.delete),
            ),
          ],
        ),
      ) ??
      false;

  Future<void> _deleteDraft(DraftRecord draft) async {
    if (!await _confirmDelete(S.deleteDraftQuestion) || !mounted) return;
    await context.read<DraftStore?>()?.delete(draft.id);
    await _loadDrafts();
  }

  Future<void> _deleteQueued(OutboxService outbox, OutboxEntry entry) async {
    if (!await _confirmDelete(S.deleteOutboxQuestion)) return;
    await outbox.remove(entry.draft.id);
  }

  @override
  Widget build(BuildContext context) {
    final outbox = context.read<OutboxService?>();
    return Scaffold(
      appBar: widget.embedded ? null : AppBar(title: const Text(S.myReports)),
      body: ListenableBuilder(
        listenable: Listenable.merge([?outbox]),
        builder: (context, _) {
          final queued = outbox?.entries ?? const <OutboxEntry>[];
          return FutureBuilder<List<Report>>(
            future: _sent,
            builder: (context, snapshot) {
              final loading = snapshot.connectionState != ConnectionState.done;
              final sent = snapshot.data ?? const <Report>[];
              final empty = queued.isEmpty && _drafts.isEmpty && sent.isEmpty;
              if (!loading && !snapshot.hasError && empty) {
                return _EmptyState(onStart: _openFlow);
              }
              return ListView(
                controller: widget.embedded
                    ? BottomNavigationReselect.mineScrollController
                    : null,
                padding: const EdgeInsets.fromLTRB(
                  AldiaSpace.l,
                  0,
                  AldiaSpace.l,
                  AldiaSpace.fabClearance,
                ),
                children: [
                  if (queued.isNotEmpty || _drafts.isNotEmpty)
                    _SectionHeader(
                      S.unsent,
                      count: queued.length + _drafts.length,
                    ),
                  for (final entry in queued)
                    _LocalCard(
                      kind: _LocalKind.queued,
                      categoryId: entry.draft.categoryId,
                      status: S.waitingNetwork,
                      statusIcon: Icons.wifi_off,
                      help: entry.missingPhoto
                          ? S.missingPhoto
                          : S.outboxWillRetry,
                      actions: [
                        if (!entry.missingPhoto)
                          _CardAction(
                            label: S.retryNow,
                            onPressed: () => unawaited(outbox!.retry()),
                          ),
                        _CardAction(
                          label: S.delete,
                          destructive: true,
                          onPressed: () => _deleteQueued(outbox!, entry),
                        ),
                      ],
                    ),
                  for (final draft in _drafts)
                    _LocalCard(
                      kind: _LocalKind.draft,
                      categoryId: draft.categoryId,
                      status: draft.photoPath == null
                          ? S.draftMissingPhoto
                          : S.draft,
                      statusIcon: Icons.photo_camera_outlined,
                      help: S.age(draft.createdAt, DateTime.now()),
                      actions: [
                        _CardAction(
                          label: S.continueShort,
                          onPressed: () => _openFlow(draft),
                        ),
                        _CardAction(
                          label: S.delete,
                          destructive: true,
                          onPressed: () => _deleteDraft(draft),
                        ),
                      ],
                    ),
                  if (queued.isNotEmpty || _drafts.isNotEmpty)
                    const _SectionHeader(S.sentReports),
                  if (loading)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  if (snapshot.hasError)
                    Center(
                      child: Column(
                        children: [
                          const Text(S.loadError),
                          TextButton(
                            onPressed: _reloadSent,
                            child: const Text(S.retry),
                          ),
                        ],
                      ),
                    ),
                  for (final report in sent)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AldiaSpace.s),
                      child: ReportTile(
                        report: report,
                        onTap: () => AldiaRoute.open<void>(
                          context,
                          ReportDetailScreen(report: report),
                        ),
                      ),
                    ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title, {this.count});
  final String title;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final style = theme.textTheme.labelLarge?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
      fontWeight: FontWeight.w700,
      letterSpacing: 1,
    );
    return Semantics(
      header: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(0, AldiaSpace.xl, 0, AldiaSpace.m),
        child: Text.rich(
          TextSpan(
            text: title.toUpperCase(),
            children: [
              if (count != null)
                TextSpan(
                  text: '  ($count)',
                  style: style?.copyWith(
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0,
                  ),
                ),
            ],
          ),
          style: style,
        ),
      ),
    );
  }
}

class _CardAction {
  const _CardAction({
    required this.label,
    required this.onPressed,
    this.destructive = false,
  });
  final String label;
  final VoidCallback onPressed;
  final bool destructive;
}

enum _LocalKind { queued, draft }

/// A queued report (light blue card) or a draft (dashed outline): icon tile,
/// status as icon plus text, title, help and text actions.
class _LocalCard extends StatelessWidget {
  const _LocalCard({
    required this.kind,
    required this.categoryId,
    required this.status,
    required this.statusIcon,
    required this.help,
    required this.actions,
  });

  final _LocalKind kind;
  final String? categoryId;
  final String status;
  final IconData statusIcon;
  final String help;
  final List<_CardAction> actions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final queued = kind == _LocalKind.queued;
    final category = categoryId == null ? null : categoryById(categoryId!);
    final statusColor = queued
        ? AldiaColors.primaryDark
        : AldiaColors.draftText;
    final content = Padding(
      padding: const EdgeInsets.fromLTRB(
        AldiaSpace.l,
        AldiaSpace.l,
        AldiaSpace.l,
        AldiaSpace.xs,
      ),
      child: Semantics(
        container: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: queued
                          ? AldiaColors.primaryContainer
                          : AldiaColors.neutralTile,
                      borderRadius: BorderRadius.circular(AldiaRadius.input),
                    ),
                    child: Icon(
                      queued ? Icons.refresh : Icons.edit_outlined,
                      size: 30,
                      color: queued
                          ? AldiaColors.primaryDark
                          : AldiaColors.textMuted,
                    ),
                  ),
                ),
                const SizedBox(width: AldiaSpace.l),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(statusIcon, size: 18, color: statusColor),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              status,
                              style: theme.textTheme.labelLarge?.copyWith(
                                color: statusColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        category?.label ?? S.draft,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        help,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Wrap(
              spacing: AldiaSpace.s,
              children: [
                for (final action in actions)
                  TextButton(
                    style: TextButton.styleFrom(
                      foregroundColor: action.destructive
                          ? AldiaColors.danger
                          : AldiaColors.primaryDark,
                      padding: const EdgeInsets.symmetric(
                        horizontal: AldiaSpace.s,
                      ),
                      textStyle: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    onPressed: action.onPressed,
                    child: Text(action.label),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: AldiaSpace.m),
      child: queued
          ? DecoratedBox(
              decoration: BoxDecoration(
                color: AldiaColors.card,
                borderRadius: BorderRadius.circular(AldiaRadius.card),
              ),
              child: content,
            )
          : CustomPaint(
              foregroundPainter: const _DashedBorderPainter(
                color: AldiaColors.dashed,
                radius: AldiaRadius.card,
              ),
              child: content,
            ),
    );
  }
}

/// Dashed rounded outline: marks a draft as unfinished.
class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color, required this.radius});
  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          (Offset.zero & size).deflate(0.75),
          Radius.circular(radius),
        ),
      );
    const dash = 5.0;
    const gap = 4.0;
    for (final metric in path.computeMetrics()) {
      for (var d = 0.0; d < metric.length; d += dash + gap) {
        canvas.drawPath(metric.extractPath(d, d + dash), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter old) =>
      old.color != color || old.radius != radius;
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onStart});
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) => EmptyState(
    icon: Icons.add_a_photo_outlined,
    title: S.emptyMine,
    actionLabel: S.firstReport,
    onAction: onStart,
  );
}
