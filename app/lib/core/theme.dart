import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Design tokens: Guatemala sky-blue palette approved on 2026-11-21
/// (documentation/decisions/ux-2026-11-21.md, app/docs/ux/design-direction.md).
/// The portal still uses the previous palette until it adopts these tokens.
///
/// Status colors paint dots and pins only. The status word is always set in
/// the normal text color beside the dot (never color alone, 4.5:1 for text).
class AldiaColors {
  const AldiaColors._();

  // Light tokens.
  /// Top bar of the shell and Explorar until those screens move to light
  /// surfaces (Phase 3 steps 3 and 4). White text on it is 6.8:1.
  static const Color bar = Color(0xFF235E8F);
  static const Color onBar = Color(0xFFFFFFFF);

  /// Muted text on [bar] (5.0:1).
  static const Color onBarMuted = Color(0xFFD9DEE3);

  /// Buttons, links' base hue and selected controls (white text 5.3:1).
  static const Color primary = Color(0xFF2A6FA8);

  /// Pressed buttons, text links and focus (6.8:1 on white).
  static const Color primaryDark = Color(0xFF235E8F);
  static const Color onPrimary = Color(0xFFFFFFFF);

  /// Guatemala flag sky blue: brand marks, map clusters, chart lines.
  /// Non-text only (3.2:1 on white).
  static const Color brand = Color(0xFF4997D0);

  /// Coral accent: badges, alerts, the key call to action. Text on it is
  /// always [onAccent]; never use coral as text color.
  static const Color accent = Color(0xFFFF7A59);
  static const Color onAccent = Color(0xFF1F2933);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color background = Color(0xFFFFFFFF);

  /// Light sky for cards and tiles.
  static const Color card = Color(0xFFEAF4FB);

  /// Thin decorative borders (cards, dividers). Not for input outlines.
  static const Color border = Color(0xFFC5D9E8);

  /// Input and control outlines (3:1 non-text).
  static const Color outline = Color(0xFF6B7280);
  static const Color text = Color(0xFF1F2933);
  static const Color textMuted = Color(0xFF52606D);
  static const Color focus = Color(0xFF235E8F);
  static const Color primaryContainer = Color(0xFFD3E7F6);
  static const Color onPrimaryContainer = Color(0xFF0B2A40);

  // Status dot and pin colors: none of them is the brand blue or the coral.
  static const Color open = Color(0xFFB26A00);
  static const Color inWork = Color(0xFF7E57C2);
  static const Color resolved = Color(0xFF17735A);
  static const Color closed = Color(0xFF6B7280);
  static const Color danger = Color(0xFFB91C1C);
  static const Color lightErrorContainer = Color(0xFFFDE8E8);

  /// Warning banners (amber icon, normal text color).
  static const Color warningContainer = Color(0xFFFFF1D6);

  /// Amber as text (drafts' status line), 6.3:1 on white. [open] is for
  /// dots only.
  static const Color draftText = Color(0xFF8A5300);

  /// Neutral icon tile on white cards (drafts).
  static const Color neutralTile = Color(0xFFF1F3F5);

  /// Dashed outline of unfinished drafts (decorative).
  static const Color dashed = Color(0xFFB8C0C8);

  /// Scrim behind text laid over photos (white text 9:1 or more).
  static const Color photoScrim = Color(0xCC1F2933);

  // Dark mode keeps the hues, lighter, on dark surfaces.
  static const Color darkBar = Color(0xFF0B2A40);
  static const Color darkBackground = Color(0xFF12181D);
  static const Color darkSurface = Color(0xFF1B2329);
  static const Color darkContainer = Color(0xFF22303A);
  static const Color darkBorder = Color(0xFF313C45);
  static const Color darkText = Color(0xFFF3F4F6);
  static const Color darkTextMuted = Color(0xFFC5CDD5);
  static const Color darkPrimary = Color(0xFF7DB8E6);
  static const Color darkOnPrimary = Color(0xFF0B2A40);
  static const Color darkAccent = Color(0xFFFF9A80);
  static const Color darkOpen = Color(0xFFE0A13A);
  static const Color darkInWork = Color(0xFFB39DDB);
  static const Color darkResolved = Color(0xFF4DB38A);
  static const Color darkClosed = Color(0xFF9CA3AF);
  static const Color darkDanger = Color(0xFFF2A5A5);
  static const Color darkErrorContainer = Color(0xFF4A2323);
  static const Color darkWarningContainer = Color(0xFF3D2E12);

  /// Dot or pin color for a citizen or verifier state. Pending states are
  /// drawn hollow by [statusIsHollow]. Use together with the word.
  static Color status(String? state, Brightness brightness) {
    final dark = brightness == Brightness.dark;
    return switch (state) {
      'resuelto' => dark ? darkResolved : resolved,
      'verified' || 'programado' || 'en_proceso' => dark ? darkInWork : inWork,
      'rechazado_verificador' || 'rejected' => dark ? darkDanger : danger,
      'pendiente_verificacion' || 'pending' => dark ? darkTextMuted : textMuted,
      'no_procede' ||
      'fuera_de_competencia' ||
      'duplicado' ||
      'oculto' => dark ? darkClosed : closed,
      _ => dark ? darkOpen : open,
    };
  }

  /// Pending verification is an outlined (hollow) dot instead of a fill.
  static bool statusIsHollow(String? state) =>
      state == 'pendiente_verificacion' || state == 'pending';

  static Color barOfBrightness(Brightness brightness) =>
      brightness == Brightness.dark ? darkBar : bar;

  /// Top bar color for the current theme.
  static Color barOf(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? darkBar : bar;
}

/// Corner radii (dp).
class AldiaRadius {
  const AldiaRadius._();

  static const double input = 12;
  static const double tile = 16;
  static const double card = 20;
  static const double sheet = 28;
}

/// Spacing scale (dp). Screens use these steps only.
class AldiaSpace {
  const AldiaSpace._();

  static const double xs = 4;
  static const double s = 8;
  static const double m = 12;
  static const double l = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;

  /// Minimum touch target.
  static const double target = 48;

  /// Room under scrolling content for the floating report button.
  static const double fabClearance = 88;
}

/// Light theme (default).
ThemeData buildTheme() => _build(Brightness.light);

/// Dark theme: inverted neutral surfaces/text and legible muted status colors.
ThemeData buildDarkTheme() => _build(Brightness.dark);

ThemeData _build(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  const c = AldiaColors.primaryContainer;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: dark ? AldiaColors.darkPrimary : AldiaColors.primary,
    onPrimary: dark ? AldiaColors.darkOnPrimary : AldiaColors.onPrimary,
    primaryContainer: dark
        ? AldiaColors.onPrimaryContainer
        : AldiaColors.primaryContainer,
    onPrimaryContainer: dark
        ? AldiaColors.primaryContainer
        : AldiaColors.onPrimaryContainer,
    secondary: dark ? AldiaColors.darkTextMuted : AldiaColors.textMuted,
    onSecondary: dark ? AldiaColors.darkOnPrimary : AldiaColors.surface,
    secondaryContainer: dark ? AldiaColors.darkContainer : c,
    onSecondaryContainer: dark ? AldiaColors.darkText : AldiaColors.text,
    tertiary: dark ? AldiaColors.darkPrimary : AldiaColors.primaryDark,
    onTertiary: dark ? AldiaColors.darkOnPrimary : AldiaColors.surface,
    tertiaryContainer: dark
        ? AldiaColors.onPrimaryContainer
        : AldiaColors.primaryContainer,
    onTertiaryContainer: dark
        ? AldiaColors.primaryContainer
        : AldiaColors.onPrimaryContainer,
    error: dark ? AldiaColors.darkDanger : AldiaColors.danger,
    onError: dark ? AldiaColors.darkOnPrimary : AldiaColors.surface,
    errorContainer: dark
        ? AldiaColors.darkErrorContainer
        : AldiaColors.lightErrorContainer,
    onErrorContainer: dark ? const Color(0xFFFBD5D5) : AldiaColors.danger,
    surface: dark ? AldiaColors.darkSurface : AldiaColors.surface,
    onSurface: dark ? AldiaColors.darkText : AldiaColors.text,
    onSurfaceVariant: dark ? AldiaColors.darkTextMuted : AldiaColors.textMuted,
    surfaceDim: dark ? AldiaColors.darkBackground : c,
    surfaceBright: dark ? AldiaColors.darkContainer : AldiaColors.surface,
    surfaceContainerLowest: dark
        ? AldiaColors.darkSurface
        : AldiaColors.surface,
    surfaceContainerLow: dark ? AldiaColors.darkSurface : AldiaColors.card,
    surfaceContainer: dark ? AldiaColors.darkContainer : AldiaColors.card,
    surfaceContainerHigh: dark ? AldiaColors.darkContainer : c,
    surfaceContainerHighest: dark ? AldiaColors.darkBorder : c,
    outline: dark ? AldiaColors.darkTextMuted : AldiaColors.outline,
    outlineVariant: dark ? AldiaColors.darkBorder : AldiaColors.border,
    inverseSurface: dark ? AldiaColors.primaryContainer : AldiaColors.text,
    onInverseSurface: dark ? AldiaColors.text : AldiaColors.surface,
    inversePrimary: dark ? AldiaColors.primaryDark : AldiaColors.darkPrimary,
    surfaceTint: Colors.transparent,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  final text = base.textTheme;
  final linkColor = dark ? AldiaColors.darkPrimary : AldiaColors.primaryDark;
  return base.copyWith(
    scaffoldBackgroundColor: dark
        ? AldiaColors.darkBackground
        : AldiaColors.background,
    // Material 3 type scale with bold, large headings (design-direction.md §6).
    textTheme: text.copyWith(
      displaySmall: text.displaySmall?.copyWith(fontWeight: FontWeight.w800),
      headlineLarge: text.headlineLarge?.copyWith(fontWeight: FontWeight.w700),
      headlineMedium: text.headlineMedium?.copyWith(
        fontWeight: FontWeight.w700,
      ),
      headlineSmall: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w600),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
      labelMedium: text.labelMedium?.copyWith(fontWeight: FontWeight.w600),
    ),
    splashFactory: InkRipple.splashFactory,
    focusColor: scheme.primary.withValues(alpha: 0.16),
    // Selection sits behind text, so it gets opacity; cursor and handles are
    // small and stay at full color.
    textSelectionTheme: TextSelectionThemeData(
      selectionColor: scheme.primary.withValues(alpha: 0.3),
      selectionHandleColor: scheme.primary,
      cursorColor: scheme.primary,
    ),
    pageTransitionsTheme: appPageTransitionsTheme,
    // Default app bar: sheet header (white). Explorar and the shell still use
    // the blue `bar` through [AldiaColors.barOf].
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      foregroundColor: scheme.onSurface,
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 0,
      elevation: 0,
      centerTitle: false,
      shape: Border(bottom: BorderSide(color: scheme.outlineVariant)),
      titleTextStyle: text.titleLarge?.copyWith(
        color: scheme.onSurface,
        fontWeight: FontWeight.w700,
      ),
    ),
    tabBarTheme: TabBarThemeData(
      indicatorColor: AldiaColors.accent,
      indicatorSize: TabBarIndicatorSize.tab,
      dividerColor: Colors.transparent,
      labelColor: scheme.onSurface,
      unselectedLabelColor: scheme.onSurfaceVariant,
      labelStyle: text.labelLarge?.copyWith(letterSpacing: 1),
      unselectedLabelStyle: text.labelLarge?.copyWith(letterSpacing: 1),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: scheme.primaryContainer,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => text.labelMedium?.copyWith(
          color: scheme.onSurface,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w700
              : FontWeight.w500,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected)
              ? scheme.onPrimaryContainer
              : scheme.onSurfaceVariant,
        ),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: dark ? AldiaColors.darkAccent : AldiaColors.accent,
      foregroundColor: AldiaColors.onAccent,
      shape: const StadiumBorder(),
      extendedPadding: const EdgeInsets.symmetric(horizontal: 24),
      extendedTextStyle: text.titleMedium?.copyWith(
        fontWeight: FontWeight.w700,
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: scheme.surfaceContainerLow,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AldiaRadius.card),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1),
    // Full-width pill buttons; darker when pressed.
    filledButtonTheme: FilledButtonThemeData(
      style:
          FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            shape: const StadiumBorder(),
            textStyle: text.labelLarge?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ).copyWith(
            backgroundColor: WidgetStateProperty.resolveWith((states) {
              if (states.contains(WidgetState.disabled)) return null;
              if (states.contains(WidgetState.pressed)) {
                return dark ? AldiaColors.primary : AldiaColors.primaryDark;
              }
              return scheme.primary;
            }),
            foregroundColor: WidgetStateProperty.resolveWith((states) {
              if (states.contains(WidgetState.disabled)) return null;
              if (states.contains(WidgetState.pressed) && dark) {
                return AldiaColors.onPrimary;
              }
              return scheme.onPrimary;
            }),
          ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: linkColor,
        shape: const StadiumBorder(),
        side: BorderSide(color: linkColor, width: 1.5),
        textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(AldiaSpace.target, AldiaSpace.target),
        foregroundColor: linkColor,
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size(AldiaSpace.target, AldiaSpace.target),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AldiaRadius.input),
        borderSide: BorderSide(color: scheme.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AldiaRadius.input),
        borderSide: BorderSide(color: scheme.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AldiaRadius.input),
        borderSide: BorderSide(
          color: dark ? AldiaColors.darkPrimary : AldiaColors.focus,
          width: 2,
        ),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AldiaRadius.input),
      ),
    ),
    // Pill filter chips: selected = primary container with a check mark.
    chipTheme: ChipThemeData(
      shape: const StadiumBorder(),
      side: BorderSide(color: scheme.outline),
      backgroundColor: scheme.surface,
      selectedColor: scheme.primaryContainer,
      checkmarkColor: scheme.onPrimaryContainer,
      labelStyle: text.labelLarge?.copyWith(color: scheme.onSurface),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AldiaRadius.sheet),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AldiaRadius.sheet),
        ),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: scheme.primary,
      linearTrackColor: scheme.outlineVariant,
    ),
  );
}

/// Native page transitions on Android and iOS (also in a mobile browser),
/// none on web and desktop, where pages are click and open.
const PageTransitionsTheme appPageTransitionsTheme = PageTransitionsTheme(
  builders: {
    TargetPlatform.android: kIsWeb
        ? _NoPageTransitionsBuilder()
        : PredictiveBackPageTransitionsBuilder(),
    TargetPlatform.iOS: kIsWeb
        ? _NoPageTransitionsBuilder()
        : CupertinoPageTransitionsBuilder(),
    TargetPlatform.macOS: _NoPageTransitionsBuilder(),
    TargetPlatform.windows: _NoPageTransitionsBuilder(),
    TargetPlatform.linux: _NoPageTransitionsBuilder(),
    TargetPlatform.fuchsia: _NoPageTransitionsBuilder(),
  },
);

class _NoPageTransitionsBuilder extends PageTransitionsBuilder {
  const _NoPageTransitionsBuilder();

  @override
  Duration get transitionDuration => Duration.zero;

  @override
  Duration get reverseTransitionDuration => Duration.zero;

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    return child;
  }
}
