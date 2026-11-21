import 'package:latlong2/latlong.dart';

class VerificationCheck {
  const VerificationCheck({
    required this.name,
    required this.passed,
    required this.detail,
  });

  factory VerificationCheck.fromJson(Map<String, Object?> json) =>
      VerificationCheck(
        name: json['name'] as String,
        passed: json['passed'] as bool,
        detail: (json['detail'] as String?) ?? '',
      );

  final String name;
  final bool passed;
  final String detail;
}

class Verification {
  const Verification({
    required this.passed,
    required this.mode,
    required this.checks,
  });

  factory Verification.fromJson(Map<String, Object?> json) => Verification(
    passed: json['passed'] as bool,
    mode: json['mode'] as String,
    checks: (json['checks'] as List<Object?>)
        .map((c) => VerificationCheck.fromJson(c as Map<String, Object?>))
        .toList(growable: false),
  );

  final bool passed;
  final String mode;
  final List<VerificationCheck> checks;

  bool get isStub => mode == 'stub';
}

/// Report as returned by the API (documentation/api-contract.md).
class Report {
  const Report({
    required this.id,
    required this.category,
    required this.position,
    required this.capturedAt,
    required this.createdAt,
    required this.status,
    required this.resolution,
    required this.photoUrl,
    this.note,
    this.verification,
    this.state,
    this.stateGroup,
    this.stateChangedAt,
    this.verifiedAt,
    this.resolvedAt,
    this.closedAt,
    this.assignee,
    this.duplicateOf,
    this.publicNote,
    this.thumbnailUrl,
    this.events = const [],
  });

  factory Report.fromJson(Map<String, Object?> json) => Report(
    state: json['state'] as String?,
    stateGroup: json['state_group'] as String?,
    stateChangedAt: _date(json['state_changed_at']),
    verifiedAt: _date(json['verified_at']),
    resolvedAt: _date(json['resolved_at']),
    closedAt: _date(json['closed_at']),
    assignee: json['assignee'] as String?,
    duplicateOf: json['duplicate_of'] as String?,
    publicNote: json['public_note'] as String?,
    thumbnailUrl: json['thumbnail_url'] as String?,
    events: List.unmodifiable(
      (json['events'] as List<Object?>? ?? []).map(
        (e) => ReportEvent.fromJson(
          Map<String, Object?>.from(e as Map<Object?, Object?>),
        ),
      ),
    ),
    id: json['id'] as String,
    category: json['category'] as String,
    position: LatLng(
      (json['latitude'] as num).toDouble(),
      (json['longitude'] as num).toDouble(),
    ),
    capturedAt: DateTime.parse(json['captured_at'] as String),
    createdAt: DateTime.parse(json['created_at'] as String),
    status: json['status'] as String,
    resolution: (json['resolution'] as String?) ?? 'open',
    note: json['note'] as String?,
    photoUrl: json['photo_url'] as String,
    verification: json['verification'] == null
        ? null
        : Verification.fromJson(json['verification'] as Map<String, Object?>),
  );

  final String id;
  final String category;
  final LatLng position;
  final DateTime capturedAt;
  final DateTime createdAt;

  /// `pending`, `verified` or `rejected`.
  final String status;

  /// `open`, `acknowledged` or `fixed`.
  final String resolution;
  final String? note;
  final String photoUrl;
  final Verification? verification;
  final String? state;
  final String? stateGroup;
  final DateTime? stateChangedAt;
  final DateTime? verifiedAt;
  final DateTime? resolvedAt;
  final DateTime? closedAt;
  final String? assignee;
  final String? duplicateOf;
  final String? publicNote;
  final String? thumbnailUrl;
  final List<ReportEvent> events;

  String get citizenState =>
      state ??
      switch (status) {
        'pending' => 'pendiente_verificacion',
        'rejected' => 'rechazado_verificador',
        _ => switch (resolution) {
          'fixed' => 'resuelto',
          'acknowledged' => 'en_proceso',
          'closed' => 'no_procede',
          _ => 'nuevo',
        },
      };
}

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;

/// Only public fields are retained, even if a server accidentally includes staff data.
class ReportEvent {
  const ReportEvent({
    required this.at,
    this.actorRole,
    this.fromState,
    this.toState,
    this.publicNote,
  });
  factory ReportEvent.fromJson(Map<String, Object?> json) => ReportEvent(
    at: _date(json['at']),
    actorRole: json['actor_role'] as String?,
    fromState: json['from_state'] as String?,
    toState: json['to_state'] as String?,
    publicNote: json['public_note'] as String?,
  );
  final DateTime? at;
  final String? actorRole;
  final String? fromState;
  final String? toState;
  final String? publicNote;
}

class ReportCluster {
  const ReportCluster({
    required this.position,
    required this.count,
    this.ids = const [],
  });
  factory ReportCluster.fromJson(Map<String, Object?> json) => ReportCluster(
    position: LatLng(
      (json['lat'] as num).toDouble(),
      (json['lon'] as num).toDouble(),
    ),
    count: json['count'] as int,
    ids: List.unmodifiable(
      (json['ids'] as List<Object?>? ?? []).cast<String>(),
    ),
  );
  final LatLng position;
  final int count;
  final List<String> ids;
}

/// One page of `GET /api/reports`: the reports and how many match in total.
class ReportPage {
  const ReportPage({required this.items, required this.total});

  final List<Report> items;

  /// All matching reports on the server, across pages.
  final int total;
}
