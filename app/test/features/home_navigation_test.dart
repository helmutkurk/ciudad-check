import 'package:aldia_app/core/strings.dart';
import 'package:aldia_app/core/theme.dart';
import 'package:aldia_app/features/home/home_navigation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> _pumpBar(
  WidgetTester tester, {
  required double width,
  double textScale = 1,
}) async {
  tester.view
    ..physicalSize = Size(width, 800)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: buildTheme(),
      home: MediaQuery.withClampedTextScaling(
        minScaleFactor: textScale,
        maxScaleFactor: textScale,
        child: Scaffold(
          bottomNavigationBar: HomeNavigationBar(
            selected: HomeTab.mine,
            onSelected: (_) {},
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Rendered lines of a bar label.
int _lines(WidgetTester tester, String label) {
  final paragraph = tester.renderObject<RenderParagraph>(
    find.descendant(of: find.byType(NavigationBar), matching: find.text(label)),
  );
  final boxes = paragraph.getBoxesForSelection(
    TextSelection(baseOffset: 0, extentOffset: label.length),
  );
  return {for (final box in boxes) box.top.round()}.length;
}

/// Font size the bar label is painted with.
double? _fontSize(WidgetTester tester) => tester
    .renderObject<RenderParagraph>(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text(S.myReports),
      ),
    )
    .text
    .style
    ?.fontSize;

void main() {
  for (final width in [320.0, 346.0, 360.0]) {
    testWidgets('every bar label fits on one line at $width px', (
      tester,
    ) async {
      await _pumpBar(tester, width: width);
      for (final label in [
        'Inicio',
        'Avisos',
        S.newReport,
        S.myReports,
        'Perfil',
      ]) {
        expect(_lines(tester, label), 1, reason: label);
      }
    });
  }

  testWidgets('wide screens keep the theme label size', (tester) async {
    // The test font draws every glyph 1 em wide, so "wide" starts higher
    // here than on a phone with the real font.
    await _pumpBar(tester, width: 1400);
    final full = _fontSize(tester)!;
    await _pumpBar(tester, width: 1000);
    expect(_fontSize(tester), full);
    await _pumpBar(tester, width: 346);
    expect(_fontSize(tester), lessThan(full));
  });

  testWidgets('large text is not shrunk below 80 %; labels may wrap', (
    tester,
  ) async {
    await _pumpBar(tester, width: 1400);
    final full = _fontSize(tester)!;
    await _pumpBar(tester, width: 346, textScale: 2);
    expect(_fontSize(tester), greaterThanOrEqualTo(full * 0.8));
  });
}
