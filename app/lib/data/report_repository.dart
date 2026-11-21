import 'package:latlong2/latlong.dart';

import '../services/photo_service.dart';
import '../core/categories.dart';
import 'api_client.dart';
import 'my_reports_store.dart';
import 'report.dart';
import 'local_citizen_store.dart';
import '../services/identity_services.dart';
import '../services/test_account.dart';

class ReportRepository {
  ReportRepository({
    required this._api,
    required this._store,
    LocalCitizenStore? local,
    this.requireCitizenLogin = false,
    this.testAccount,
  }) : local = local ?? LocalCitizenStore();

  final LocalCitizenStore local;
  final bool requireCitizenLogin;
  final TestAccountSession? testAccount;
  AuthService get auth => _api.auth;

  /// A verified phone session or the MVP test account.
  bool get hasAccount => auth.isSignedIn || (testAccount?.active ?? false);
  Future<int?> resolvedCount() => _api.resolvedCount();

  Future<void> clearLocalData() async {
    if (_store case final PrefsMyReportsStore prefs) await prefs.clear();
    await local.clear();
  }

  final ApiClient _api;
  final MyReportsStore _store;

  Future<void> _observe(List<Report> reports) async {
    try {
      await local.observe(reports);
    } catch (_) {
      /* A local inbox failure must not retry an accepted upload. */
    }
  }

  Future<List<ReportCategory>> categories() => _api.categories();

  String photoUrl(Report report) => _api.photoUrl(report.photoUrl);

  /// One page of public reports, newest first. [offset] pages through
  /// [ReportPage.total] in steps of the API limit (100).
  Future<ReportPage> nearby({
    LatLng? southWest,
    LatLng? northEast,
    int offset = 0,
    String? state,
    String? stateGroup,
    String? category,
  }) => _api.listReports(
    southWest: southWest,
    northEast: northEast,
    offset: offset,
    state: state,
    stateGroup: stateGroup,
    category: category,
  );
  Future<List<Report>> duplicates(LatLng position, String category) =>
      _api.nearbyReports(position: position, category: category);
  Future<Report> get(String id) async {
    final report = await _api.getReport(id);
    if ((await _store.ids()).contains(id) || local.follows(id)) {
      await _observe([report]);
    }
    return report;
  }

  Future<void> follow(Report report) async {
    await local.setFollow(report.id, true);
    await _observe([report]);
  }

  String thumbnailUrl(Report report) =>
      _api.photoUrl(report.thumbnailUrl ?? report.photoUrl);

  /// Own and locally followed reports. Missing ids are skipped.
  Future<List<Report>> mine() async {
    final ids = {...await _store.ids(), ...local.followedIds};
    List<Report> remote = const [];
    ApiException? accountError;
    try {
      remote = await _api.citizenReports();
    } on ApiException catch (error) {
      // Keep local ids usable offline; the next refresh retries account reports.
      accountError = error;
    }
    final results = await Future.wait(
      ids.map((id) async {
        try {
          return await _api.getReport(id);
        } on ApiException {
          return null;
        }
      }),
    );
    final reports = {
      for (final report in results.whereType<Report>()) report.id: report,
      for (final report in remote) report.id: report,
    }.values.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    if (reports.isEmpty && accountError != null) {
      throw accountError;
    }
    await _observe(reports);
    return reports;
  }

  Future<Report> submit({
    required CapturedPhoto photo,
    required String category,
    required LatLng position,
    String? note,
    String? idempotencyKey,
  }) async {
    if (requireCitizenLogin && !hasAccount) {
      throw const ApiException(
        'Verifica tu número antes de enviar el reporte.',
        statusCode: 401,
      );
    }
    final report = await _api.createReport(
      photoBytes: photo.bytes,
      filename: photo.filename,
      category: category,
      position: position,
      capturedAt: photo.capturedAt,
      note: note,
      idempotencyKey: idempotencyKey,
    );
    await _store.add(report.id);
    await _observe([report]);
    return report;
  }
}
