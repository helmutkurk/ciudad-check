import 'package:flutter/material.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/report.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/report_tile.dart';
import 'bottom_navigation_reselect.dart';
import 'explore_query.dart';

/// Lista: the same reports as the map, for the same area and filters.
class ReportList extends StatelessWidget {
  const ReportList({super.key, required this.query, required this.onOpen});

  final ExploreQuery query;
  final void Function(Report) onOpen;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: query,
      builder: (context, _) {
        final state = query.state;
        if (state.loading) {
          return const Center(child: CircularProgressIndicator());
        }
        if (state.failed) {
          return EmptyState(
            icon: Icons.cloud_off,
            title: S.loadError,
            actionLabel: S.retry,
            onAction: query.retry,
          );
        }
        final reports = state.reports;
        final searching = query.filters.query.isNotEmpty;
        final filtered = query.filterCount > 0;
        if (reports.isEmpty && searching) {
          // Search only sees loaded pages; offer the next one.
          return EmptyState(
            icon: Icons.search_off,
            title: S.searchEmpty,
            help: state.hasMore
                ? S.searchScope(state.loaded, state.total)
                : S.searchEmptyHelp,
            actionLabel: state.hasMore ? S.loadMore : null,
            onAction: state.hasMore ? query.loadMore : null,
          );
        }
        if (reports.isEmpty) {
          return filtered
              ? EmptyState(
                  icon: Icons.filter_list_off,
                  title: S.emptyFiltered,
                  actionLabel: S.clearFilters,
                  onAction: () => query.setFilters(noFilters),
                )
              : const EmptyState(
                  icon: Icons.map_outlined,
                  title: S.emptyNearby,
                  help: S.emptyNearbyHelp,
                );
        }
        return RefreshIndicator(
          onRefresh: query.retry,
          child: ListView.separated(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            controller: BottomNavigationReselect.exploreListScrollController,
            padding: const EdgeInsets.fromLTRB(
              AldiaSpace.l,
              AldiaSpace.s,
              AldiaSpace.l,
              AldiaSpace.fabClearance,
            ),
            itemCount: reports.length + (state.hasMore ? 1 : 0),
            separatorBuilder: (_, _) => const SizedBox(height: AldiaSpace.s),
            itemBuilder: (context, i) => i == reports.length
                ? _LoadMore(query: query, searching: searching)
                : ReportTile(
                    report: reports[i],
                    onTap: () => onOpen(reports[i]),
                  ),
          ),
        );
      },
    );
  }
}

/// Footer when the server has more reports than are loaded: how many are
/// shown (or searched) and "Ver más" for the next page.
class _LoadMore extends StatelessWidget {
  const _LoadMore({required this.query, required this.searching});

  final ExploreQuery query;
  final bool searching;

  @override
  Widget build(BuildContext context) {
    final state = query.state;
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AldiaSpace.m),
      child: Column(
        children: [
          Text(
            searching
                ? S.searchScope(state.loaded, state.total)
                : S.listShowing(state.loaded, state.total),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: AldiaSpace.s),
          state.loadingMore
              ? const SizedBox.square(
                  dimension: 40,
                  child: Padding(
                    padding: EdgeInsets.all(AldiaSpace.s),
                    child: CircularProgressIndicator(strokeWidth: 3),
                  ),
                )
              : OutlinedButton(
                  onPressed: query.loadMore,
                  child: const Text(S.loadMore),
                ),
        ],
      ),
    );
  }
}
