import 'dart:async';

import 'package:aldia_app/app.dart';
import 'package:aldia_app/core/strings.dart';
import 'package:aldia_app/data/report_repository.dart';
import 'package:aldia_app/features/outbox/outbox_service.dart';
import 'package:aldia_app/services/connectivity_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../support/fakes.dart';
import '../support/memory_draft_store.dart';
import '../support/offline_tiles.dart';
import '../widgets/harness.dart';
import 'report_flow_screen_test.dart' show tapText, advanceToReview;

class _Connectivity implements ConnectivityService {
  _Connectivity(this.isOnline);
  @override
  bool isOnline;
  final _changes = StreamController<bool>.broadcast(sync: true);
  @override
  Stream<bool> get changes => _changes.stream;
  @override
  Future<void> initialize() async {}
  @override
  void dispose() => unawaited(_changes.close());
  void setOnline(bool value) {
    isOnline = value;
    _changes.add(value);
  }
}

class _NoTimers implements RetryScheduler {
  @override
  void cancel() {}
  @override
  void schedule(Duration delay, void Function() callback) {}
}

/// The real wizard, drafts and outbox services over in-memory stores.
class _Wired {
  _Wired({bool online = true}) : connectivity = _Connectivity(online) {
    repository = repositoryWith(posts: posts);
    outbox = DurableOutbox(
      store: queue,
      connectivity: connectivity,
      scheduler: _NoTimers(),
      send: (draft) async => repository.submit(
        photo: (await queue.readPhoto(draft))!,
        category: draft.categoryId!,
        position: draft.position,
        note: draft.note,
        idempotencyKey: draft.id,
      ),
    );
  }

  final _Connectivity connectivity;
  final drafts = MemoryDraftStore();
  late final queue = MemoryDraftStore(sharedPhotos: drafts.photos);
  final posts = <http.Request>[];
  late final ReportRepository repository;
  late final DurableOutbox outbox;

  Widget app() => AldiaApp(
    repository: repository,
    location: FakeLocation(const LatLng(14.61, -90.52)),
    photos: FakePhotos(),
    geocoder: FakeGeocoder(),
    drafts: drafts,
    outbox: outbox,
    connectivity: connectivity,
    tileProvider: OfflineTileProvider(),
  );
}

void _tall(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<void> _openMine(WidgetTester tester) async {
  await tester.tap(find.text(S.myReports));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a draft saved by the wizard shows on Home and in My reports', (
    tester,
  ) async {
    _tall(tester);
    final wired = _Wired();
    await tester.pumpWidget(wired.app());
    await tester.pumpAndSettle();

    await tester.tap(find.text(S.newReport));
    await tester.pumpAndSettle();
    await tapText(tester, S.useMyLocation);
    await tapText(tester, S.confirmLocation);
    expect(wired.drafts.records, isNotEmpty);

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text(S.continueDraft), findsOneWidget);

    await _openMine(tester);
    expect(find.text('${S.unsent.toUpperCase()}  (1)'), findsOneWidget);
    expect(find.text(S.continueShort), findsOneWidget);
  });

  testWidgets('an offline send is queued, then sent once with its key online', (
    tester,
  ) async {
    _tall(tester);
    final wired = _Wired(online: false);
    await tester.pumpWidget(wired.app());
    await tester.pumpAndSettle();

    await tester.tap(find.text(S.newReport));
    await tester.pumpAndSettle();
    await advanceToReview(tester);
    await tapText(tester, S.send);

    expect(wired.outbox.entries, hasLength(1));
    expect(wired.posts, isEmpty);
    expect(wired.drafts.records, isEmpty);

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    await _openMine(tester);
    expect(find.text('${S.unsent.toUpperCase()}  (1)'), findsOneWidget);
    expect(find.text(S.waitingNetwork), findsOneWidget);

    wired.connectivity.setOnline(true);
    await tester.pumpAndSettle();

    expect(wired.posts, hasLength(1));
    expect(wired.posts.single.headers['Idempotency-Key'], isNotEmpty);
    expect(wired.outbox.entries, isEmpty);
    expect(find.text(S.waitingNetwork), findsNothing);
  });
}
