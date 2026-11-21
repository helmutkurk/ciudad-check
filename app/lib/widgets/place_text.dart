import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../core/strings.dart';
import '../core/text_x.dart';
import '../services/geocoder_service.dart';

/// Where a report is, as a street address; never raw coordinates.
///
/// Shows [label] when given, else looks the address up for [position]
/// (cached by the geocoder). While loading, or when no address is known, it
/// shows [S.pointOnMap].
class PlaceText extends StatefulWidget {
  const PlaceText({
    super.key,
    required this.position,
    this.label,
    this.style,
    this.icon = false,
  });

  final LatLng position;
  final String? label;
  final TextStyle? style;

  /// Leading location pin, as on report cards.
  final bool icon;

  @override
  State<PlaceText> createState() => _PlaceTextState();
}

class _PlaceTextState extends State<PlaceText> {
  Future<String?>? _lookup;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(PlaceText old) {
    super.didUpdateWidget(old);
    if (old.position != widget.position || old.label != widget.label) _start();
  }

  void _start() {
    if (widget.label.isUsable) {
      _lookup = null;
      return;
    }
    final geocoder = context.read<GeocoderService?>();
    _lookup = geocoder?.reverse(widget.position).catchError((_) => null);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<String?>(
    future: _lookup,
    builder: (context, snapshot) {
      final text = widget.label.isUsable
          ? widget.label!
          : (snapshot.data ?? S.pointOnMap);
      final label = Text(text, style: widget.style);
      if (!widget.icon) return label;
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2, right: 6),
            child: Icon(
              Icons.location_on_outlined,
              size: 20,
              color: widget.style?.color,
            ),
          ),
          Expanded(child: label),
        ],
      );
    },
  );
}
