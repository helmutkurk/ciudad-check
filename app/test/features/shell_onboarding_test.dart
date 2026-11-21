import 'package:aldia_app/app.dart';
import 'package:aldia_app/core/strings.dart';
import 'package:aldia_app/core/theme.dart';
import 'package:aldia_app/features/home/home_screen.dart';
import 'package:aldia_app/features/onboarding/onboarding_screen.dart';
import 'package:aldia_app/widgets/empty_state.dart';
import 'package:aldia_app/features/home/report_map_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import '../support/fakes.dart';
import '../support/offline_tiles.dart';
import '../widgets/harness.dart';

AldiaApp _app({bool onboarding = false, VoidCallback? onDone}) => AldiaApp(
  repository: fakeRepository(),
  location: FakeLocation(const LatLng(14.6, -90.5)),
  photos: FakePhotos(),
  tileProvider: OfflineTileProvider(),
  showOnboarding: onboarding,
  onOnboardingDone: onDone,
);

void main() {
  testWidgets(
    'bottom navigation has Inicio, Avisos, Reportar, Mis reportes and Perfil',
    (tester) async {
      await tester.pumpWidget(_app());
      await tester.pumpAndSettle();

      final bar = find.byType(NavigationBar);
      for (final label in [
        'Inicio',
        'Avisos',
        S.newReport,
        S.myReports,
        'Perfil',
      ]) {
        expect(
          find.descendant(of: bar, matching: find.text(label)),
          findsOneWidget,
        );
      }
      expect(find.text(S.newReport), findsOneWidget);

      await tester.tap(find.text(S.myReports));
      await tester.pumpAndSettle();
      expect(find.text(S.firstReport), findsOneWidget);
      // The filter action belongs to the map and list tabs only.
      expect(find.byTooltip(S.filtersLabel), findsNothing);
    },
  );

  testWidgets('the explore list shows photo cards with a state chip', (
    tester,
  ) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lista'));
    await tester.pumpAndSettle();
    expect(find.byType(Card), findsWidgets);
    expect(find.text('Bache'), findsOneWidget);
  });

  testWidgets('an empty list explains what to do', (tester) async {
    await tester.pumpWidget(
      harness(home: const HomeScreen(), repository: repositoryWith()),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lista'));
    await tester.pumpAndSettle();
    expect(find.byType(EmptyState), findsOneWidget);
    expect(find.text(S.emptyNearby), findsOneWidget);
    expect(find.text(S.emptyNearbyHelp), findsOneWidget);
  });

  testWidgets('onboarding: three slides, then Home, and it reports done once', (
    tester,
  ) async {
    var done = 0;
    await tester.pumpWidget(_app(onboarding: true, onDone: () => done++));
    await tester.pumpAndSettle();
    expect(find.byType(OnboardingScreen), findsOneWidget);
    expect(find.text(S.onboardingTitles[0]), findsOneWidget);

    await tester.tap(find.text(S.next));
    await tester.pumpAndSettle();
    expect(find.text(S.onboardingTitles[1]), findsOneWidget);
    await tester.tap(find.text(S.next));
    await tester.pumpAndSettle();
    expect(find.text(S.onboardingTitles[2]), findsOneWidget);
    expect(find.text(S.next), findsNothing);

    await tester.tap(find.text(S.onboardingStart));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(done, 1);
  });

  testWidgets('onboarding can be skipped and works at text scale 2.0', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    var done = 0;
    await tester.pumpWidget(_app(onboarding: true, onDone: () => done++));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text(S.onboardingSkip));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(done, 1);
  });

  testWidgets('onboarding controls are at least 48 dp', (tester) async {
    await tester.pumpWidget(_app(onboarding: true));
    await tester.pumpAndSettle();
    for (final label in [S.onboardingSkip, S.next]) {
      final box = find.ancestor(
        of: find.text(label),
        matching: find.byWidgetPredicate((w) => w is ButtonStyleButton),
      );
      final size = tester.getSize(box.first);
      expect(size.height, greaterThanOrEqualTo(48), reason: label);
      expect(size.width, greaterThanOrEqualTo(48), reason: label);
    }
  });

  testWidgets('the app stays light when the system is dark', (tester) async {
    expect(buildTheme().colorScheme.brightness, Brightness.light);
    final dark = buildDarkTheme();
    expect(dark.colorScheme.brightness, Brightness.dark);
    expect(dark.colorScheme.primary, isNot(buildTheme().colorScheme.primary));

    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    final context = tester.element(find.byType(HomeScreen));
    expect(Theme.of(context).brightness, Brightness.light);
  });

  testWidgets('with reduced motion the navigation bar does not animate', (
    tester,
  ) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();
    final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(bar.animationDuration, Duration.zero);
    await tester.tap(find.text('Explorar mi ciudad'));
    await tester.pumpAndSettle();
    // Mapa / Lista switch instantly: one frame after the tap the list shows.
    await tester.tap(find.text('Lista'));
    await tester.pump();
    final stack = tester.widget<IndexedStack>(
      find
          .ancestor(
            of: find.byType(MapView, skipOffstage: false),
            matching: find.byType(IndexedStack, skipOffstage: false),
          )
          .first,
    );
    expect(stack.index, 1);
  });
}
