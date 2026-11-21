import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/strings.dart';
import '../../core/theme.dart';
import '../../data/report_repository.dart';
import '../../services/haptics.dart';
import '../../services/location_service.dart';
import '../../services/photo_service.dart';
import '../../widgets/bottom_padding.dart';
import '../drafts/draft_record.dart';
import '../drafts/draft_store.dart';
import '../outbox/outbox_service.dart';
import 'report_category_step.dart';
import 'report_details_steps.dart';
import '../../widgets/aldia_banner.dart';
import 'report_flow_controller.dart';
import 'report_flow_widgets.dart';
import 'report_location_step.dart';
import 'report_photo_step.dart';
import 'report_result_view.dart';

class ReportFlowScreen extends StatelessWidget {
  const ReportFlowScreen({super.key, this.draft});
  final DraftRecord? draft;

  @override
  Widget build(BuildContext context) => ChangeNotifierProvider(
    create: (context) {
      final controller = ReportFlowController(
        repository: context.read<ReportRepository>(),
        location: context.read<LocationService>(),
        photos: context.read<PhotoService>(),
        drafts: context.read<DraftStore?>(),
        outbox: context.read<OutboxService?>(),
      );
      unawaited(controller.loadCategories());
      if (draft != null) unawaited(controller.restore(draft!));
      return controller;
    },
    child: const _FlowView(),
  );
}

class _FlowView extends StatefulWidget {
  const _FlowView();
  @override
  State<_FlowView> createState() => _FlowViewState();
}

class _FlowViewState extends State<_FlowView> with WidgetsBindingObserver {
  final _heading = FocusNode();
  ReportFlowController? _controller;
  String? _lastHeading;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controller ??= context.read<ReportFlowController>()
      ..addListener(_focusHeading);
  }

  void _focusHeading() {
    final c = _controller!;
    final key = '${c.step.name}:${c.submitState.name}';
    if (_lastHeading == key) return;
    _lastHeading = key;
    switch (c.submitState) {
      case SubmitState.done:
        unawaited(
          c.result?.status == 'rejected'
              ? HapticsHelper.error()
              : HapticsHelper.success(),
        );
      case SubmitState.queued ||
          SubmitState.manualSaved ||
          SubmitState.followed:
        unawaited(HapticsHelper.success());
      case SubmitState.failed:
        unawaited(HapticsHelper.error());
      default:
        break;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _heading.requestFocus();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_controller?.checkPhotoIntegrity());
    } else {
      unawaited(_controller?.saveDraft());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.removeListener(_focusHeading);
    unawaited(_controller?.saveDraft());
    _heading.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.watch<ReportFlowController>();
    _focusHeading();
    final outcome = c.submitState;
    final result =
        outcome == SubmitState.done ||
        outcome == SubmitState.queued ||
        outcome == SubmitState.manualSaved ||
        outcome == SubmitState.followed;
    return Scaffold(
      appBar: AppBar(
        title: const Text(S.newReport),
        actions: [
          IconButton(
            tooltip: 'Ayuda para reportar',
            icon: const Icon(Icons.help_outline),
            onPressed: () {
              FocusManager.instance.primaryFocus?.unfocus();
              showDialog<void>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Tu reporte, paso a paso'),
                  content: const Text(
                    'Confirma el lugar y elige una categoría. Luego toma una foto en el momento y revisa los datos antes de enviar.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text(S.close),
                    ),
                  ],
                ),
              );
            },
          ),
          if (Navigator.of(context).canPop())
            IconButton(
              tooltip: S.close,
              onPressed: () => Navigator.of(context).maybePop(),
              icon: const Icon(Icons.close),
            ),
        ],
      ),
      bottomNavigationBar: result || outcome == SubmitState.sending
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (c.step.index > 0) ...[
                      OutlinedButton(
                        onPressed: c.back,
                        child: const Text(S.back),
                      ),
                      const SizedBox(height: AldiaSpace.m),
                    ],
                    FilledButton(
                      onPressed: c.canAdvance
                          ? (c.isLastStep ? c.submit : c.next)
                          : null,
                      child: Text(switch (c.step) {
                        FlowStep.location => S.confirmLocation,
                        FlowStep.photo => S.usePhoto,
                        FlowStep.review => S.send,
                        FlowStep.category || FlowStep.note => S.next,
                      }),
                    ),
                  ],
                ),
              ),
            ),
      body: SafeArea(
        bottom: false,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.all(16)
                  .copyWith(bottom: BottomPadding.of(context)),
              children: [
                if (!result) ...[
                  SummaryRow(controller: c),
                  const SizedBox(height: 16),
                  Text(
                    S.stepProgress(c.step.index + 1, FlowStep.values.length),
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                  const SizedBox(height: AldiaSpace.s),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      minHeight: 6,
                      value: (c.step.index + 1) / FlowStep.values.length,
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                Focus(
                  focusNode: _heading,
                  child: Semantics(
                    header: true,
                    child: Text(
                      result ? _resultTitle(c) : _title(c.step),
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                if (c.storageError)
                  const FlowNotice(S.storageError, kind: BannerKind.error),
                if (outcome == SubmitState.sending) ...[
                  const LinearProgressIndicator(),
                  const SizedBox(height: 16),
                  const Text(S.sending),
                ] else if (result)
                  ResultView(controller: c)
                else ...[
                  switch (c.step) {
                    FlowStep.photo => PhotoStep(controller: c),
                    FlowStep.location => LocationStep(controller: c),
                    FlowStep.category => CategoryStep(controller: c),
                    FlowStep.note => NoteStep(controller: c),
                    FlowStep.review => ReviewStep(controller: c),
                  },
                  if (c.submitState == SubmitState.failed)
                    const FlowNotice(S.sendError, kind: BannerKind.error),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _title(FlowStep step) => switch (step) {
  FlowStep.photo => S.stepPhoto,
  FlowStep.location => S.stepLocation,
  FlowStep.category => S.stepCategory,
  FlowStep.note => S.stepNote,
  FlowStep.review => S.stepReview,
};

String _resultTitle(ReportFlowController c) => switch (c.submitState) {
  SubmitState.queued => S.waitingNetwork,
  SubmitState.manualSaved => S.draft,
  SubmitState.followed => S.following,
  _ => switch (c.result?.status) {
    'verified' =>
      '${S.resultVerified}${c.result?.verification?.isStub == true ? ' (prueba)' : ''}',
    'rejected' =>
      '${S.resultRejected}${c.result?.verification?.isStub == true ? ' (prueba)' : ''}',
    _ => S.resultPending,
  },
};
