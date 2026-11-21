import 'package:flutter/material.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';

enum HomeTab { home, notices, report, mine, profile }

const _labels = ['Inicio', 'Avisos', S.newReport, S.myReports, 'Perfil'];

/// Horizontal room a destination keeps around its label.
const _labelInset = 8.0;

/// Bottom navigation. On narrow phones the labels shrink so the longest one
/// ("Mis reportes") stays on one line. With enlarged text (accessibility) they
/// shrink at most to 80 % and may wrap instead; the bar is taller then.
class HomeNavigationBar extends StatelessWidget {
  const HomeNavigationBar({
    super.key,
    required this.selected,
    required this.onSelected,
  });
  final HomeTab selected;
  final ValueChanged<HomeTab> onSelected;

  /// Factor (at most 1) that makes the widest label fit in [slot] pixels.
  static double _fit(BuildContext context, TextStyle style, double slot) {
    final scaler = MediaQuery.textScalerOf(context);
    var widest = 0.0;
    for (final label in _labels) {
      final painter = TextPainter(
        text: TextSpan(text: label, style: style),
        textDirection: TextDirection.ltr,
        textScaler: scaler,
        maxLines: 1,
      )..layout();
      widest = widest < painter.width ? painter.width : widest;
      painter.dispose();
    }
    if (widest <= slot) return 1;
    final factor = slot / widest;
    final enlarged = scaler.scale(10) > 10;
    return enlarged && factor < 0.8 ? 0.8 : factor;
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final theme = NavigationBarTheme.of(context);
      // Measure with the selected (bold) style, the widest one.
      final style = DefaultTextStyle.of(context).style
          .merge(theme.labelTextStyle?.resolve({WidgetState.selected}));
      final slot = constraints.maxWidth / _labels.length - _labelInset * 2;
      final factor = _fit(context, style, slot);
      final bar = _bar(context);
      if (factor >= 1) return bar;
      return NavigationBarTheme(
        data: theme.copyWith(
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) =>
                DefaultTextStyle.of(context).style
                    .merge(theme.labelTextStyle?.resolve(states))
                    .copyWith(fontSize: style.fontSize! * factor),
          ),
        ),
        child: bar,
      );
    },
  );

  Widget _bar(BuildContext context) => NavigationBar(
    selectedIndex: selected.index,
    height: MediaQuery.textScalerOf(context).scale(14) > 20 ? 104 : 80,
    animationDuration: MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 300),
    onDestinationSelected: (i) => onSelected(HomeTab.values[i]),
    destinations: [
      const NavigationDestination(
        icon: Icon(Icons.home_outlined),
        selectedIcon: Icon(Icons.home),
        label: 'Inicio',
      ),
      const NavigationDestination(
        icon: Icon(Icons.notifications_outlined),
        selectedIcon: Icon(Icons.notifications),
        label: 'Avisos',
      ),
      const NavigationDestination(icon: _ReportPill(), label: S.newReport),
      const NavigationDestination(
        icon: Icon(Icons.assignment_outlined),
        selectedIcon: Icon(Icons.assignment),
        label: S.myReports,
      ),
      const NavigationDestination(
        icon: Icon(Icons.person_outline),
        selectedIcon: Icon(Icons.person),
        label: 'Perfil',
      ),
    ],
  );
}

/// The key call to action of the bar: a coral pill with a plus.
class _ReportPill extends StatelessWidget {
  const _ReportPill();

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: 56,
      height: 36,
      decoration: ShapeDecoration(
        color: dark ? AldiaColors.darkAccent : AldiaColors.accent,
        shape: const StadiumBorder(),
      ),
      alignment: Alignment.center,
      child: const Icon(Icons.add, color: AldiaColors.onAccent, size: 26),
    );
  }
}
