import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:provider/provider.dart';

import 'core/strings.dart';
import 'core/theme.dart';
import 'features/changelog/changelog.dart';
import 'data/clusters_api.dart';
import 'data/report_repository.dart';
import 'features/drafts/draft_store.dart';
import 'features/citizen/login_sheet.dart';
import 'features/home/home_screen.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/outbox/outbox_service.dart';
import 'services/connectivity_service.dart';
import 'services/location_service.dart';
import 'services/geocoder_service.dart';
import 'services/photo_service.dart';
import 'widgets/always_scrollbar_behavior.dart';

/// Root widget. Dependencies are injected so tests can replace them.
/// Optional services are absent in tests that do not need them.
class AldiaApp extends StatefulWidget {
  const AldiaApp({
    super.key,
    required this.repository,
    required this.location,
    required this.photos,
    this.geocoder,
    this.drafts,
    this.outbox,
    this.connectivity,
    this.clusters,
    this.tileProvider,
    this.showOnboarding = false,
    this.onOnboardingDone,
    this.changelog,
  });

  final ReportRepository repository;
  final LocationService location;
  final PhotoService photos;
  final GeocoderService? geocoder;
  final DraftStore? drafts;
  final OutboxService? outbox;
  final ConnectivityService? connectivity;
  final ClustersApi? clusters;

  /// Map tiles source. Tests inject an offline provider.
  final TileProvider? tileProvider;

  /// Shows the three first-run slides before Home.
  final bool showOnboarding;

  /// Called once when the slides end or are skipped (to remember it).
  final VoidCallback? onOnboardingDone;

  /// Shows "Novedades" on the first open after an update.
  final ChangelogController? changelog;

  @override
  State<AldiaApp> createState() => _AldiaAppState();
}

class _AldiaAppState extends State<AldiaApp> with WidgetsBindingObserver {
  late bool _onboarding = widget.showOnboarding;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Resumes anything left in the outbox by a previous run.
    unawaited(widget.outbox?.initialize());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _finishOnboarding() {
    setState(() => _onboarding = false);
    widget.onOnboardingDone?.call();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(widget.outbox?.retry());
  }

  @override
  Widget build(BuildContext context) {
    final AldiaApp(
      :repository,
      :location,
      :photos,
      :drafts,
      :outbox,
      :connectivity,
      :clusters,
      :tileProvider,
    ) = widget;
    return MultiProvider(
      providers: [
        Provider<ReportRepository>.value(value: repository),
        Provider<LocationService>.value(value: location),
        Provider<GeocoderService?>.value(value: widget.geocoder),
        Provider<PhotoService>.value(value: photos),
        Provider<DraftStore?>.value(value: drafts),
        // InheritedProvider: Provider.value rejects Listenable values.
        InheritedProvider<OutboxService?>.value(value: outbox),
        Provider<ConnectivityService?>.value(value: connectivity),
        Provider<ClustersApi?>.value(value: clusters),
        Provider<TileProvider>.value(
          value: tileProvider ?? NetworkTileProvider(),
        ),
      ],
      child: MaterialApp(
        title: S.appName,
        // Light only, as in the Figma designs. buildDarkTheme() stays for
        // a later opt-in.
        theme: buildTheme(),
        themeMode: ThemeMode.light,
        scrollBehavior: const AlwaysScrollbarBehavior(),
        debugShowCheckedModeBanner: false,
        locale: const Locale('es', 'GT'),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('es', 'GT'), Locale('es')],
        home: _onboarding
            ? OnboardingScreen(onDone: _finishOnboarding)
            : ListenableBuilder(
                // Logging out returns to the login screen.
                listenable: Listenable.merge([
                  repository.auth,
                  repository.testAccount,
                ]),
                builder: (context, _) =>
                    repository.requireCitizenLogin && !repository.hasAccount
                    ? CitizenLoginScreen(
                        auth: repository.auth,
                        onTestAccount: repository.testAccount?.start,
                      )
                    : HomeScreen(changelog: widget.changelog),
              ),
      ),
    );
  }
}
