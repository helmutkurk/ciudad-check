import 'package:aldia_app/core/strings.dart';
import 'package:aldia_app/data/report.dart';
import 'package:aldia_app/features/detail/report_detail_screen.dart';
import 'package:aldia_app/features/drafts/draft_record.dart';
import 'package:aldia_app/features/home/home_screen.dart';
import 'package:aldia_app/features/mine/my_reports_screen.dart';
import 'package:aldia_app/features/outbox/outbox_service.dart';
import 'package:aldia_app/widgets/report_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import '../support/memory_draft_store.dart';
import 'harness.dart';

/// A phone-sized screen at 200 % text: any RenderFlex overflow fails the test.
void _largeText(WidgetTester tester) {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = 2.0;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);
}

DraftRecord _draft() => DraftRecord(
  id: 'd1',
  step: 'category',
  position: const LatLng(14.6, -90.5),
  createdAt: DateTime.now().toUtc(),
  categoryId: 'accessibility',
);

void main() {
  testWidgets('home at 200 % text: banner, map with pins, list, filters', (
    tester,
  ) async {
    _largeText(tester);
    final drafts = MemoryDraftStore();
    await drafts.save(_draft());
    await tester.pumpWidget(
      harness(
        home: const HomeScreen(),
        repository: repositoryWith(list: [stateJson('fuera_de_competencia')]),
        drafts: drafts,
        clusters: FakeClusters(const [], fail: true),
      ),
    );
    await tester.pumpAndSettle();
    final landing = find
        .descendant(
          of: find.byType(ListView).first,
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(
      find.text('Explorar mi ciudad'),
      180,
      scrollable: landing,
    );
    // "Visible" includes the area behind the bottom bar; scroll the action
    // clear of it, as a person would, before tapping.
    await tester.drag(landing, const Offset(0, -200));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    expect(find.text('Corresponde a otra entidad'), findsOneWidget);

    await tester.ensureVisible(find.text('Lista'));
    await tester.tap(find.text('Lista'));
    await tester.pumpAndSettle();
    expect(find.byType(ReportTile), findsWidgets);

    await tester.ensureVisible(find.byTooltip(S.filtersLabel));
    await tester.tap(find.byTooltip(S.filtersLabel));
    await tester.pumpAndSettle();
    expect(find.text(S.applyFilters), findsOneWidget);
    await tester.ensureVisible(find.text(S.applyFilters));
    await tester.tap(find.text(S.applyFilters));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Avisos'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Actualizar avisos'),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Actualizar avisos'), findsOneWidget);
    await tester.tap(find.text('Perfil'));
    await tester.pumpAndSettle();
    expect(find.text('Tu perfil en AlDía'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('report detail at 200 % text', (tester) async {
    _largeText(tester);
    final json = stateJson(
      'duplicado',
      extra: {
        'duplicate_of': mainId,
        'public_note': 'Ya existe un reporte sobre este mismo bache.',
        'events': [
          {
            'at': '2026-11-19T20:00:00Z',
            'to_state': 'duplicado',
            'public_note': 'Ya existe un reporte sobre este mismo bache.',
          },
        ],
      },
    );
    await tester.pumpWidget(
      harness(
        home: ReportDetailScreen(report: Report.fromJson(json)),
        repository: repositoryWith(byId: {detailId: json}),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text(S.viewMainReport), 200);
    expect(find.text(S.viewMainReport), findsOneWidget);
  });

  testWidgets('my reports at 200 % text: outbox, draft and sent', (
    tester,
  ) async {
    _largeText(tester);
    final drafts = MemoryDraftStore();
    await drafts.save(_draft());
    await tester.pumpWidget(
      harness(
        home: const MyReportsScreen(),
        repository: repositoryWith(byId: {detailId: stateJson('en_proceso')}),
        drafts: drafts,
        outbox: FakeOutbox([OutboxEntry(draft: _draft().copyWith(id: 'q1'))]),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(S.waitingNetwork), findsOneWidget);
    final sent = find.text(S.sentReports.toUpperCase());
    await tester.scrollUntilVisible(sent, 200);
    expect(sent, findsOneWidget);
  });

  testWidgets('my reports empty state at 200 % text', (tester) async {
    _largeText(tester);
    await tester.pumpWidget(
      harness(home: const MyReportsScreen(), repository: repositoryWith()),
    );
    await tester.pumpAndSettle();
    expect(find.text(S.firstReport), findsOneWidget);
  });
}
