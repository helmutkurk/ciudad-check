import 'dart:async';

import 'package:flutter/material.dart';
import 'package:image_fade/image_fade.dart';
import 'package:provider/provider.dart';

import '../core/categories.dart';
import '../core/citizen_states.dart';
import '../core/strings.dart';
import '../core/text_x.dart';
import '../core/theme.dart';
import 'place_text.dart';
import 'status_chips.dart';
import '../data/report.dart';
import '../data/report_repository.dart';
import '../services/haptics.dart';
import '../services/share_service.dart';

/// Public report card. Actions remain separate semantic targets from the detail.
class ReportTile extends StatelessWidget {
  const ReportTile({super.key, required this.report, required this.onTap});
  final Report report;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final category = categoryById(report.category);
    final state = citizenStateFor(report.citizenState);
    final repository = context.read<ReportRepository>();
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final verified = report.status == 'verified';
    // Follow and share sit beside the status line but stay separate semantic
    // targets, so they are laid over the tappable card instead of inside it.
    return Card(
      clipBehavior: Clip.antiAlias,
      color: scheme.surface,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final photoHeight = constraints.maxWidth * 9 / 16;
          return Stack(
            children: [
              Semantics(
                button: true,
                label: '${category.label}. ${state.label}. Ver detalle',
                child: InkWell(
                  onTap: onTap,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(
                        height: photoHeight,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Semantics(
                              image: true,
                              label: S.photoLabel(category.label, state.label),
                              child: ExcludeSemantics(
                                child: ImageFade(
                                  image: NetworkImage(
                                    repository.photoUrl(report),
                                  ),
                                  fit: BoxFit.cover,
                                  placeholder: ColoredBox(
                                    color: scheme.surfaceContainerHighest,
                                  ),
                                  errorBuilder: (context, exception) =>
                                      ColoredBox(
                                        color: scheme.surfaceContainerHighest,
                                        child: Icon(
                                          category.icon,
                                          size: 56,
                                          color: scheme.onSurfaceVariant,
                                        ),
                                      ),
                                ),
                              ),
                            ),
                            if (verified)
                              const Positioned(
                                left: AldiaSpace.m,
                                bottom: AldiaSpace.m,
                                child: _PhotoBadge(S.verifiedPhoto),
                              ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(AldiaSpace.l),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              // Room for the follow and share buttons.
                              padding: const EdgeInsets.only(
                                right: 2 * AldiaSpace.target,
                              ),
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(
                                  minHeight: AldiaSpace.target - AldiaSpace.l,
                                ),
                                child: Align(
                                  alignment: Alignment.centerLeft,
                                  child: StatusLabel(
                                    state: report.citizenState,
                                    style: theme.textTheme.titleSmall,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: AldiaSpace.s),
                            Text(
                              category.label,
                              style: theme.textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: AldiaSpace.xs),
                            PlaceText(
                              position: report.position,
                              icon: true,
                              style: theme.textTheme.bodyLarge,
                            ),
                            if (report.note.isUsable)
                              Padding(
                                padding: const EdgeInsets.only(
                                  top: AldiaSpace.xs,
                                ),
                                child: Text(
                                  report.note!,
                                  style: theme.textTheme.bodyLarge,
                                ),
                              ),
                            const SizedBox(height: AldiaSpace.s),
                            Text(
                              S.sentAgo(report.createdAt, DateTime.now()),
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: scheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                top: photoHeight + AldiaSpace.xs,
                right: AldiaSpace.xs,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _FollowButton(report: report),
                    IconButton(
                      tooltip: 'Compartir reporte',
                      icon: const Icon(Icons.share_outlined),
                      onPressed: () async {
                        final shared = await ShareService.shareReport(
                          report.id,
                        );
                        if (!shared && context.mounted) {
                          unawaited(HapticsHelper.success());
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'Enlace copiado. Pégalo en WhatsApp o donde quieras compartirlo.',
                              ),
                            ),
                          );
                        }
                      },
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _FollowButton extends StatelessWidget {
  const _FollowButton({required this.report});
  final Report report;

  @override
  Widget build(BuildContext context) {
    final repository = context.read<ReportRepository>();
    return AnimatedBuilder(
      animation: repository.local,
      builder: (context, _) {
        final followed = repository.local.follows(report.id);
        return IconButton(
          tooltip: followed ? 'Dejar de seguir reporte' : S.followReport,
          isSelected: followed,
          selectedIcon: const Icon(Icons.favorite),
          icon: const Icon(Icons.favorite_border),
          onPressed: () async {
            unawaited(HapticsHelper.light());
            try {
              if (followed) {
                await repository.local.setFollow(report.id, false);
              } else {
                await repository.follow(report);
              }
            } catch (_) {
              if (context.mounted) {
                unawaited(HapticsHelper.error());
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(const SnackBar(content: Text(S.storageError)));
              }
            }
          },
        );
      },
    );
  }
}

/// Small dark label over a photo, e.g. "Foto verificada".
class _PhotoBadge extends StatelessWidget {
  const _PhotoBadge(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: AldiaColors.photoScrim,
      borderRadius: BorderRadius.circular(AldiaSpace.s),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AldiaSpace.s,
        vertical: AldiaSpace.xs,
      ),
      child: Text(
        text,
        style: Theme.of(context).textTheme.labelMedium
            ?.copyWith(color: Colors.white),
      ),
    ),
  );
}
