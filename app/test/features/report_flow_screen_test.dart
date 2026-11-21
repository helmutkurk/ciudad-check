import 'package:aldia_app/core/strings.dart';
import 'package:aldia_app/data/report_repository.dart';
import 'package:aldia_app/features/report/report_flow_screen.dart';
import 'package:aldia_app/services/location_service.dart';
import 'package:aldia_app/services/geocoder_service.dart';
import 'package:aldia_app/services/photo_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../support/fakes.dart';
import '../support/offline_tiles.dart';

Widget host(
  ReportRepository repository, {
  double textScale = 1,
  GeocoderService? geocoder,
}) => MultiProvider(
  providers: [
    Provider<ReportRepository>.value(value: repository),
    Provider<LocationService>.value(
      value: FakeLocation(const LatLng(14.61, -90.52)),
    ),
    Provider<PhotoService>.value(value: FakePhotos()),
    Provider<GeocoderService?>.value(value: geocoder ?? FakeGeocoder()),
    Provider<TileProvider>.value(value: OfflineTileProvider()),
  ],
  child: MaterialApp(
    home: Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(textScale)),
        child: const ReportFlowScreen(),
      ),
    ),
  ),
);

/// The wizard is a lazy list and the map would swallow drags, so scroll the
/// page through its controller until the text is built, then bring it on screen.
Future<void> reveal(WidgetTester tester, String text) async {
  final finder = find.text(text);
  final position = tester
      .state<ScrollableState>(find.byType(Scrollable).first)
      .position;
  position.jumpTo(0);
  await tester.pump();
  for (var i = 0; i < 40 && finder.evaluate().isEmpty; i++) {
    position.jumpTo(position.pixels + 200);
    await tester.pump();
  }
  expect(finder, findsOneWidget);
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
}

Future<void> tapText(WidgetTester tester, String text) async {
  await reveal(tester, text);
  await tester.tap(find.text(text));
  await tester.pumpAndSettle();
}

Future<void> advanceToPhoto(WidgetTester tester) async {
  await tapText(tester, S.useMyLocation);
  await tapText(tester, S.confirmLocation);
  await tapText(tester, 'Bache');
  await tapText(tester, S.next);
}

Future<void> advanceToReview(WidgetTester tester) async {
  await advanceToPhoto(tester);
  await tapText(tester, S.takePhoto);
  await tapText(tester, S.usePhoto);
  await tapText(tester, S.next);
}

void main() {
  testWidgets(
    'address search is explicit, debounced and selecting a fake result updates the summary',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final geocoder = FakeGeocoder()
        ..results = const [
          AddressResult(
            label: 'Zona 1, Ciudad de Guatemala',
            position: LatLng(14.64, -90.51),
          ),
        ];
      await tester.pumpWidget(host(fakeRepository(), geocoder: geocoder));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'Zona 1');
      await tester.pump(const Duration(seconds: 1));
      expect(geocoder.queries, isEmpty);
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump(const Duration(milliseconds: 449));
      expect(geocoder.queries, isEmpty);
      await tester.pump(const Duration(milliseconds: 2));
      await tester.pumpAndSettle();
      expect(geocoder.queries, ['Zona 1']);
      await tapText(tester, 'Zona 1, Ciudad de Guatemala');
      await tapText(tester, S.confirmLocation);
      expect(find.text('Zona 1, Ciudad de Guatemala'), findsOneWidget);
      expect(find.text(S.chooseCategory), findsOneWidget);
    },
  );

  testWidgets('wizard works at text scale 2.0 without overflow on every step', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(fakeRepository(), textScale: 2));
    await tester.pumpAndSettle();

    await advanceToReview(tester);

    await reveal(tester, S.send);
    await tester.scrollUntilVisible(
      find.textContaining('KB'),
      150,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.textContaining('KB'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tap targets are at least 48 dp tall on the photo step', (
    tester,
  ) async {
    await tester.pumpWidget(host(fakeRepository()));
    await tester.pumpAndSettle();
    await advanceToPhoto(tester);
    final size = tester.getSize(
      find.widgetWithText(OutlinedButton, S.takePhoto),
    );
    expect(size.height, greaterThanOrEqualTo(48));
    expect(
      tester.getSize(find.widgetWithText(FilledButton, S.usePhoto)).height,
      greaterThanOrEqualTo(48),
    );
  });

  testWidgets('the step heading is a header for screen readers', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(host(fakeRepository()));
    await tester.pumpAndSettle();
    expect(
      tester.getSemantics(find.text(S.stepLocation).last),
      isSemantics(label: S.stepLocation, isHeader: true, isFocused: true),
    );
    handle.dispose();
  });

  testWidgets(
    'a rejected result explains each failed check and offers the fixes',
    (tester) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        host(
          fakeRepository(
            createdStatus: 'rejected',
            createdChecks: [
              {'name': 'freshness', 'passed': false, 'detail': 'old'},
              {'name': 'category', 'passed': false, 'detail': 'no'},
              {'name': 'place', 'passed': true, 'detail': 'ok'},
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();
      await advanceToReview(tester);
      await tapText(tester, S.send);

      expect(find.textContaining('(prueba)'), findsWidgets);
      expect(find.text(S.freshnessReason), findsOneWidget);
      expect(find.text(S.freshnessFix), findsOneWidget);
      expect(find.text(S.categoryReason('Bache')), findsOneWidget);
      expect(find.text(S.categoryFix), findsOneWidget);
      expect(find.text(S.placeReason), findsNothing);
      expect(find.text(S.retakePhoto), findsOneWidget);
      expect(find.text(S.changeCategory), findsOneWidget);
      // Easiest fix first: category before freshness.
      expect(
        tester.getTopLeft(find.text(S.categoryReason('Bache'))).dy,
        lessThan(tester.getTopLeft(find.text(S.freshnessReason)).dy),
      );
      // Fewer than three attempts: no manual review yet.
      expect(find.text(S.manualReview), findsNothing);

      await tapText(tester, S.retakePhoto);
      expect(find.text(S.takePhoto), findsOneWidget);
    },
  );

  testWidgets(
    'a pending result is explained as saved and awaiting verification',
    (tester) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(host(fakeRepository(createdStatus: 'pending')));
      await tester.pumpAndSettle();
      await advanceToReview(tester);
      await tapText(tester, S.send);
      expect(find.text(S.pendingHelp), findsOneWidget);
    },
  );

  testWidgets('the location step shows the address, never coordinates', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(fakeRepository()));
    await tester.pumpAndSettle();
    await tapText(tester, S.useMyLocation);
    expect(find.text('6a. Avenida, Zona 1, Guatemala'), findsWidgets);
    expect(find.byType(TextField), findsOneWidget); // address search only
    expect(find.textContaining(RegExp(r'-?\d+\.\d{3,}')), findsNothing);
  });
}
