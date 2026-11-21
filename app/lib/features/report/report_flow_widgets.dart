import 'package:flutter/material.dart';

import '../../core/text_x.dart';
import '../../core/theme.dart';
import '../../widgets/aldia_banner.dart';
import '../../widgets/place_text.dart';
import 'report_flow_controller.dart';

class SummaryRow extends StatelessWidget {
  const SummaryRow({super.key, required this.controller});
  final ReportFlowController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final Widget place = c.placeLabel.isUsable || c.locationConfirmed
        ? PlaceText(position: c.position, label: c.placeLabel)
        : const Text('Elige el lugar del problema');
    final category = c.categories
        .where((item) => item.id == c.categoryId)
        .firstOrNull;
    return Semantics(
      container: true,
      child: Container(
        padding: const EdgeInsets.all(AldiaSpace.m),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.primaryContainer,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              child: Icon(
                c.photo == null
                    ? Icons.add_a_photo_outlined
                    : Icons.photo_camera,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    c.step == FlowStep.location
                        ? '¿Es este el lugar correcto?'
                        : 'Tu reporte',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  place,
                  if (category != null) Text(category.label),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Notice inside a wizard step; an [AldiaBanner] with vertical spacing.
class FlowNotice extends StatelessWidget {
  const FlowNotice(this.text, {super.key, this.kind = BannerKind.info});
  final String text;
  final BannerKind kind;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: AldiaSpace.s),
    child: AldiaBanner(text, kind: kind),
  );
}
