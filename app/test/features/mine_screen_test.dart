import 'package:aldia_app/core/strings.dart';
import 'package:aldia_app/features/drafts/draft_record.dart';
import 'package:aldia_app/features/mine/my_reports_screen.dart';
import 'package:aldia_app/features/outbox/outbox_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import '../support/memory_draft_store.dart';
import '../widgets/harness.dart';

DraftRecord _draft(String id) => DraftRecord(
  id: id,
  step: 'category',
  position: const LatLng(14.6, -90.5),
  createdAt: DateTime.now().toUtc(),
  categoryId: 'graffiti',
);

void main() {
  testWidgets('empty state invites the first report', (tester) async {
    await tester.pumpWidget(
      harness(home: const MyReportsScreen(), repository: repositoryWith()),
    );
    await tester.pumpAndSettle();
    expect(find.text(S.emptyMine), findsOneWidget);
    expect(find.text(S.firstReport), findsOneWidget);
  });

  testWidgets(
    'outbox shows waiting status, retries and confirms deletion once',
    (tester) async {
      final outbox = FakeOutbox([OutboxEntry(draft: _draft('q1'))]);
      await tester.pumpWidget(
        harness(
          home: const MyReportsScreen(),
          repository: repositoryWith(),
          outbox: outbox,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(S.waitingNetwork), findsOneWidget);
      expect(find.byIcon(Icons.wifi_off), findsOneWidget);
      await tester.tap(find.text(S.retryNow));
      expect(outbox.retries, 1);

      await tester.tap(find.text(S.delete));
      await tester.pumpAndSettle();
      expect(find.text(S.deleteOutboxQuestion), findsOneWidget);
      expect(outbox.removed, isEmpty);
      await tester.tap(find.text(S.delete).last);
      await tester.pumpAndSettle();
      expect(outbox.removed, ['q1']);
      expect(find.text(S.waitingNetwork), findsNothing);
    },
  );

  testWidgets('a queued report with a lost photo offers no retry', (
    tester,
  ) async {
    final outbox = FakeOutbox([
      OutboxEntry(draft: _draft('q1'), missingPhoto: true),
    ]);
    await tester.pumpWidget(
      harness(
        home: const MyReportsScreen(),
        repository: repositoryWith(),
        outbox: outbox,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(S.missingPhoto), findsOneWidget);
    expect(find.text(S.retryNow), findsNothing);
  });

  testWidgets('drafts sit above sent reports; delete asks once', (
    tester,
  ) async {
    final drafts = MemoryDraftStore();
    await drafts.save(_draft('d1'));
    await tester.pumpWidget(
      harness(
        home: const MyReportsScreen(),
        repository: repositoryWith(byId: {detailId: stateJson('resuelto')}),
        drafts: drafts,
      ),
    );
    await tester.pumpAndSettle();

    final draftY = tester.getTopLeft(find.text(S.draftMissingPhoto)).dy;
    final sentY = tester.getTopLeft(find.text(S.sentReports.toUpperCase())).dy;
    expect(draftY, lessThan(sentY));
    expect(find.textContaining('Resuelto'), findsWidgets);

    expect(find.text('${S.unsent.toUpperCase()}  (1)'), findsOneWidget);
    expect(find.text(S.continueShort), findsOneWidget);
    await tester.tap(find.text(S.delete));
    await tester.pumpAndSettle();
    expect(find.text(S.deleteDraftQuestion), findsOneWidget);
    expect(drafts.records, isNotEmpty);
    await tester.tap(find.text(S.delete).last);
    await tester.pumpAndSettle();
    expect(drafts.records, isEmpty);
  });
  testWidgets('sent cards show no coordinates and mark verified photos', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        home: const MyReportsScreen(),
        repository: repositoryWith(byId: {detailId: stateJson('en_proceso')}),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Punto:'), findsNothing);
    expect(find.textContaining('14.'), findsNothing);
    expect(find.textContaining('Enviado hace'), findsOneWidget);
    expect(find.byTooltip(S.followReport), findsOneWidget);
  });
}
