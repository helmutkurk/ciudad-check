import 'dart:async';

import 'package:aldia_app/features/report/address_search.dart';
import 'package:aldia_app/services/geocoder_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

class _PendingGeocoder implements GeocoderService {
  final calls = <String, Completer<List<AddressResult>>>{};
  @override
  Future<List<AddressResult>> search(String query) =>
      (calls[query] = Completer<List<AddressResult>>()).future;

  @override
  Future<String?> reverse(LatLng position) async => null;
}

const _address = AddressResult(
  label: 'Synthetic street',
  position: LatLng(14, -90),
);

Widget _host(
  _PendingGeocoder service,
  ValueChanged<AddressResult> onSelected,
) => Provider<GeocoderService?>.value(
  value: service,
  child: MaterialApp(
    home: Scaffold(body: AddressSearch(onSelected: onSelected)),
  ),
);

Future<void> _search(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField), text);
  await tester.testTextInput.receiveAction(TextInputAction.search);
  await tester.pump(const Duration(milliseconds: 451));
}

void main() {
  testWidgets(
    'edited input ignores an older geocoder result and keeps selection',
    (tester) async {
      final service = _PendingGeocoder();
      AddressResult? selected;
      await tester.pumpWidget(_host(service, (value) => selected = value));
      await _search(tester, 'First street');
      await tester.enterText(find.byType(TextField), 'Second street');
      service.calls['First street']!.complete([_address]);
      await tester.pump();
      expect(find.text(_address.label), findsNothing);

      await _search(tester, 'Second street');
      service.calls['Second street']!.complete([_address]);
      await tester.pumpAndSettle();
      await tester.tap(find.text(_address.label));
      await tester.pumpAndSettle();
      expect(selected, same(_address));
      expect(find.text(_address.label), findsNothing);
    },
  );

  testWidgets('disposing address search cancels its pending debounce', (
    tester,
  ) async {
    final service = _PendingGeocoder();
    await tester.pumpWidget(_host(service, (_) {}));
    await tester.enterText(find.byType(TextField), 'Synthetic street');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 1));
    expect(service.calls, isEmpty);
    expect(tester.takeException(), isNull);
  });
}
