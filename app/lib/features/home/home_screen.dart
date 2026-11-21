import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/clusters_api.dart';
import '../../data/report.dart';
import '../../data/report_repository.dart';
import '../../services/haptics.dart';
import '../../widgets/routes.dart';
import '../changelog/changelog.dart';
import '../citizen/citizen_screens.dart';
import '../detail/report_detail_screen.dart';
import '../drafts/draft_record.dart';
import '../drafts/draft_store.dart';
import '../mine/my_reports_screen.dart';
import '../report/report_flow_screen.dart';
import 'bottom_navigation_reselect.dart';
import 'explore_query.dart';
import 'explore_reports.dart';
import 'home_landing.dart';
import 'home_navigation.dart';

/// Nearby reports as a map or a list, with filters and the report button.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.changelog});

  /// Pending "Novedades" to show once. Null in tests.
  final ChangelogController? changelog;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  HomeTab _tab = HomeTab.home;
  bool _exploring = false;
  late final ExploreQuery _explore;
  late Future<int?> _resolved;
  // Tabs are built on first visit and then kept (map camera, scroll position).
  final _visited = <HomeTab>{HomeTab.home};
  int _mineToken = 0;

  DraftRecord? _draft;

  @override
  void initState() {
    super.initState();
    // Lives as long as Inicio, so filters survive closing Explorar.
    _explore = ExploreQuery(
      repository: context.read<ReportRepository>(),
      clusters: context.read<ClustersApi?>(),
    );
    _resolved = _loadResolved();
    unawaited(_loadDraft());
    unawaited(_observeMine());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(showChangelogIfNeeded(context, widget.changelog));
    });
  }

  @override
  void dispose() {
    _explore.dispose();
    super.dispose();
  }

  Future<int?> _loadResolved() async {
    try {
      return await context.read<ReportRepository>().resolvedCount();
    } catch (_) {
      return null;
    }
  }

  Future<void> _observeMine() async {
    try {
      await context.read<ReportRepository>().mine();
    } catch (_) {
      /* The inbox remains available offline. */
    }
  }

  Future<void> _loadDraft() async {
    final drafts = await context.read<DraftStore?>()?.loadAll();
    if (mounted) setState(() => _draft = drafts?.firstOrNull);
  }

  void _reload() {
    setState(() {
      _resolved = _loadResolved();
    });
    unawaited(_explore.retry());
    unawaited(_observeMine());
  }

  void _open(Report report) =>
      AldiaRoute.open<void>(context, ReportDetailScreen(report: report));

  Future<void> _startReport([DraftRecord? draft]) async {
    await AldiaRoute.open<void>(context, ReportFlowScreen(draft: draft));
    if (!mounted) return;
    setState(() => _mineToken++);
    _reload();
    unawaited(_loadDraft());
  }

  Widget _body(HomeTab tab) {
    if (!_visited.contains(tab)) return const SizedBox.shrink();
    return switch (tab) {
      HomeTab.home =>
        _exploring
            ? ExploreReports(
                query: _explore,
                onOpen: _open,
                onBack: () => setState(() => _exploring = false),
              )
            : Landing(
                resolved: _resolved,
                onExplore: () => setState(() => _exploring = true),
                onReport: _startReport,
              ),
      HomeTab.notices => NoticesScreen(onOpen: _open),
      HomeTab.mine => MyReportsScreen(embedded: true, reloadToken: _mineToken),
      HomeTab.profile => ProfileScreen(
        onCleared: () {
          setState(() => _mineToken++);
          _reload();
          unawaited(_loadDraft());
        },
      ),
      HomeTab.report => const SizedBox.shrink(),
    };
  }

  @override
  Widget build(BuildContext context) {
    final exploring = _tab == HomeTab.home && _exploring;
    return Scaffold(
      // Explorar draws its own floating controls over a full-screen map.
      appBar: exploring
          ? null
          : _tab == HomeTab.home
          // Inicio's blue hero continues the blue bar.
          ? AppBar(
              backgroundColor: AldiaColors.barOf(context),
              foregroundColor: AldiaColors.onBar,
              iconTheme: const IconThemeData(color: AldiaColors.onBar),
              shape: null,
              title: const Text(
                S.appName,
                style: TextStyle(color: AldiaColors.onBar),
              ),
            )
          // Other tabs: light header from the theme (decision 15, Figma).
          : AppBar(
              title: Text(switch (_tab) {
                HomeTab.notices => 'Avisos',
                HomeTab.mine => S.myReports,
                _ => 'Perfil',
              }),
            ),
      body: Column(
        children: [
          if (_draft case final draft? when _tab == HomeTab.home && !exploring)
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.3,
              ),
              child: SingleChildScrollView(
                child: DraftBanner(
                  draft: draft,
                  onTap: () => _startReport(draft),
                ),
              ),
            ),
          Expanded(
            child: IndexedStack(
              index: _tab.index,
              children: [for (final tab in HomeTab.values) _body(tab)],
            ),
          ),
        ],
      ),
      bottomNavigationBar: HomeNavigationBar(
        selected: _tab,
        onSelected: (tab) {
          unawaited(HapticsHelper.light());
          if (tab == HomeTab.report) {
            unawaited(_startReport());
            return;
          }
          if (tab == _tab) {
            BottomNavigationReselect.scrollToTop(switch (tab) {
              HomeTab.home =>
                _exploring
                    ? BottomNavigationReselect.exploreListScrollController
                    : BottomNavigationReselect.landingScrollController,
              HomeTab.notices =>
                BottomNavigationReselect.noticesScrollController,
              HomeTab.mine => BottomNavigationReselect.mineScrollController,
              _ => BottomNavigationReselect.profileScrollController,
            }, reduceMotion: MediaQuery.disableAnimationsOf(context));
            return;
          }
          setState(() {
            _tab = tab;
            _visited.add(tab);
          });
          if (tab == HomeTab.notices || tab == HomeTab.mine) {
            unawaited(_observeMine());
          }
        },
      ),
    );
  }
}
