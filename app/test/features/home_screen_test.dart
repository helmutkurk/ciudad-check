import 'package:aldia_app/core/strings.dart';
import 'package:aldia_app/core/theme.dart';
import 'package:aldia_app/data/report.dart';
import 'package:aldia_app/features/drafts/draft_record.dart';
import 'package:aldia_app/features/home/home_screen.dart';
import 'package:aldia_app/features/home/report_map_view.dart';
import 'package:aldia_app/widgets/neutral_map_pin.dart';
import 'package:aldia_app/widgets/report_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import '../support/memory_draft_store.dart';
import '../widgets/harness.dart';

const _cluster = ReportCluster(position: LatLng(14.63, -90.5), count: 7);

void main() {
  testWidgets('extracted map keeps its state across shell destinations', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(),
        clusters: FakeClusters([_cluster]),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    final map = tester.state(find.byType(MapView));
    await tester.tap(find.text('Perfil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Inicio'));
    await tester.pumpAndSettle();
    expect(tester.state(find.byType(MapView)), same(map));
    expect(find.text('Mapa'), findsOneWidget);
  });

  testWidgets('map shows clusters from the clusters endpoint', (tester) async {
    final clusters = FakeClusters([_cluster]);
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(),
        clusters: clusters,
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    expect(clusters.calls, greaterThan(0));
    expect(find.text('7'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('7 reportes')), findsOneWidget);
  });

  testWidgets('a one-report cluster shows the report state pin', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(list: [stateJson('resuelto')]),
        clusters: FakeClusters([
          _cluster,
          const ReportCluster(
            position: LatLng(14.62, -90.52),
            count: 1,
            ids: [detailId],
          ),
        ]),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();

    expect(find.byType(StatusMapPin), findsOneWidget);
    expect(find.text('7'), findsOneWidget);
  });

  testWidgets('tapping a cluster lists the reports of its area', (
    tester,
  ) async {
    final requests = <Uri>[];
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(
          // One report: a second card would load its photo off screen.
          list: [stateJson('nuevo')],
          requests: requests,
        ),
        clusters: FakeClusters([_cluster]),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('7'));
    await tester.pumpAndSettle();

    expect(find.text(S.clusterSheetTitle(1)), findsOneWidget);
    expect(find.byType(ReportTile), findsOneWidget);
    expect(
      requests.where(
        (u) => u.path.endsWith('/reports') && u.queryParameters['bbox'] != null,
      ),
      isNotEmpty,
    );
  });

  testWidgets(
    'falls back to pins with icon and state text, tap opens summary',
    (tester) async {
      await tester.pumpWidget(
        harness(
          home: const HomeScreen(),
          repository: repositoryWith(
            list: [
              stateJson('en_revision'),
              stateJson('resuelto', id: mainId, extra: {'longitude': -90.45}),
            ],
          ),
          clusters: FakeClusters(const [], fail: true),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Explorar mi ciudad'));
      await tester.pumpAndSettle();
      expect(find.text(S.mapFallback), findsOneWidget);
      expect(find.text('En revisión'), findsOneWidget);
      expect(find.byType(StatusMapPin), findsNWidgets(2));
      // Pin fill follows the state (orange open, blue resolved), white outline.
      final fills = <Color?>[];
      for (final pin in tester.widgetList<StatusMapPin>(
        find.byType(StatusMapPin),
      )) {
        final outer = tester.widget<Container>(
          find
              .descendant(
                of: find.byWidget(pin),
                matching: find.byType(Container),
              )
              .first,
        );
        final decoration = outer.decoration! as BoxDecoration;
        fills.add(decoration.color);
        expect(decoration.border, Border.all(color: Colors.white, width: 3));
      }
      expect(fills, [AldiaColors.open, AldiaColors.resolved]);

      await tester.tap(find.text('En revisión'));
      await tester.pumpAndSettle();
      expect(find.text(S.viewDetail), findsOneWidget);
      expect(find.text('Bache'), findsOneWidget);
    },
  );

  testWidgets('filter chips skip clusters and send state group and category', (
    tester,
  ) async {
    final requests = <Uri>[];
    final clusters = FakeClusters([_cluster]);
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(
          list: [stateJson('resuelto')],
          requests: requests,
        ),
        clusters: clusters,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    final before = clusters.calls;

    await tester.tap(find.byTooltip(S.filtersLabel));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilterChip, 'Resuelto'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilterChip, 'Bache'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text(S.applyFilters));
    await tester.tap(find.text(S.applyFilters));
    await tester.pumpAndSettle();

    expect(clusters.calls, before);
    expect(
      requests.where(
        (u) =>
            u.queryParameters['state_group'] == 'resolved' &&
            u.queryParameters['category'] == 'pothole',
      ),
      isNotEmpty,
    );
    // The filter button shows how many filters are active.
    expect(find.text('2'), findsOneWidget);
    expect(find.text('Resuelto'), findsWidgets);
  });

  testWidgets('search filters the map pins, not only the list', (tester) async {
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(
          list: [
            stateJson('nuevo'),
            stateJson(
              'nuevo',
              id: mainId,
              extra: {'category': 'graffiti', 'longitude': -90.45},
            ),
          ],
        ),
        clusters: FakeClusters([_cluster]),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    expect(find.byType(StatusMapPin), findsNothing, reason: 'clusters first');

    await tester.tap(find.byTooltip(S.filtersLabel));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'grafiti');
    await tester.ensureVisible(find.text(S.applyFilters));
    await tester.tap(find.text(S.applyFilters));
    await tester.pumpAndSettle();

    expect(find.byType(StatusMapPin), findsOneWidget);
    expect(find.text('1'), findsOneWidget, reason: 'filter badge');
  });

  testWidgets('more than 100 reports: map banner, search scope and Ver más', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(
          list: [
            for (var i = 0; i < 130; i++)
              stateJson(
                'nuevo',
                id: '00000000-0000-4000-8000-${i.toString().padLeft(12, '0')}',
              ),
          ],
        ),
        clusters: FakeClusters(const [], fail: true),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    expect(find.text(S.mapCapped(100)), findsOneWidget);

    // Search only sees loaded pages, so Lista says so and offers the next.
    await tester.tap(find.byTooltip(S.filtersLabel));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'farola');
    await tester.ensureVisible(find.text(S.applyFilters));
    await tester.tap(find.text(S.applyFilters));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lista'));
    await tester.pumpAndSettle();
    expect(find.text(S.searchEmpty), findsOneWidget);
    expect(find.text(S.searchScope(100, 130)), findsOneWidget);

    await tester.tap(find.text(S.loadMore));
    await tester.pumpAndSettle();
    expect(find.text(S.loadMore), findsNothing);
    expect(find.text(S.searchEmptyHelp), findsOneWidget);
  });

  testWidgets('full-screen map: no app bar, legend, and an empty message', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(),
        clusters: FakeClusters(const []),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    expect(find.byType(AppBar), findsNothing);
    expect(find.byTooltip(S.backToHome), findsOneWidget);
    expect(find.text(S.legendTitle), findsOneWidget);
    for (final word in ['Abierto', 'En proceso', 'Resuelto', 'Cerrado']) {
      expect(find.text(word), findsOneWidget, reason: word);
    }
    expect(find.text(S.mapEmpty), findsOneWidget);

    await tester.tap(find.byTooltip(S.backToHome));
    await tester.pumpAndSettle();
    expect(find.text('Explorar mi ciudad'), findsOneWidget);
  });

  testWidgets('list alternative shows reports and the empty state', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(list: [stateJson('programado')]),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lista'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Programado'), findsOneWidget);
  });

  testWidgets('shows a continue-draft banner that opens the flow', (
    tester,
  ) async {
    final drafts = MemoryDraftStore();
    await drafts.save(
      DraftRecord(
        id: 'd1',
        step: 'category',
        position: const LatLng(14.6, -90.5),
        createdAt: DateTime.now().toUtc(),
        categoryId: 'pothole',
      ),
    );
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(),
        drafts: drafts,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(S.continueDraft), findsOneWidget);
    expect(find.textContaining('Bache'), findsOneWidget);
  });
}
