import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AppError,
  ClaimStreetMissionBodySchema,
  CreateStreetMissionBodySchema,
  CreateStreetReportBodySchema,
  ID_PREFIXES,
  STREET_CATEGORIES,
  STREET_COUNTRY_CURRENCY,
  STREET_PACK_ID,
  StreetMissionIdSchema,
  StreetMissionStatusSchema,
  StreetMissionsQuerySchema,
  StreetPhotoIdSchema,
  StreetReportStatusSchema,
  StreetReportsQuerySchema,
  StreetSubmissionIdSchema,
  SubmitStreetMissionBodySchema,
  addSeconds,
  isAppError,
  streetCountryForPoint,
} from "@shelfie/core";
import type {
  Clock,
  CreateStreetReportResponse,
  IdGenerator,
  Logger,
  StreetDashboardSummary,
  StreetEvaluateKind,
  StreetEvidencePack,
  StreetFix,
  StreetMission,
  StreetPackConfig,
  StreetPayout,
  StreetPhotoInput,
  StreetReport,
  StreetSubmission,
  StreetVerdict,
  SubmitStreetMissionResponse,
} from "@shelfie/core";
import type { z } from "zod";
import { DEFAULT_IMAGE_LIMITS, cleanJpeg, decodeBase64Strict } from "../jpeg.js";
import { assignCluster, distanceM } from "./cluster.js";
import type { StreetMissionRecord, StreetStore, StreetSubmissionRecord } from "./store.js";
import type { StreetVerifier } from "./verifier.js";

export interface StreetServiceDeps {
  store: StreetStore;
  verifier: StreetVerifier;
  pack: StreetPackConfig;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  /** Directory for cleaned photos (`<imageDir>/<photoId>.jpg`), outside the web root and the repo. */
  imageDir: string;
  /** Street payouts are simulated ledger records only. The service refuses to exist otherwise. */
  fakePayments: boolean;
  /** A `submitted` reservation older than this is released (the verifier never answered). */
  verifyTimeoutMs?: number;
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  throw new AppError("invalid_request", "The request does not match the expected schema.", 400, {
    issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), code: i.code })),
  });
}

const notFound = (what: string): AppError => new AppError("not_found", `${what} not found.`);

/**
 * CiudadCheck street flow: free citizen reports, paid missions, verification through the
 * StreetVerifier port and simulated payouts. Every public method validates its own input with the
 * strict contract schemas, so the HTTP layer stays thin.
 */
export class StreetService {
  private readonly d: StreetServiceDeps;
  private readonly verifyTimeoutMs: number;

  constructor(deps: StreetServiceDeps) {
    if (!deps.fakePayments) {
      throw new Error(
        "Street payouts are simulated only: FAKE_PAYMENTS must be on (no real money, no chain).",
      );
    }
    this.d = deps;
    this.verifyTimeoutMs = deps.verifyTimeoutMs ?? 60_000;
    mkdirSync(deps.imageDir, { recursive: true, mode: 0o700 });
  }

  get maxImageBytes(): number {
    return this.d.pack.thresholds.maxImageBytes;
  }

  get fakes(): { payments: boolean; verifier: boolean } {
    return { payments: this.d.fakePayments, verifier: this.d.verifier.fake };
  }

  // ---------------------------------------------------------------- photos
  private storePhoto(photo: StreetPhotoInput): { photoId: string; base64: string } {
    const raw = decodeBase64Strict(photo.base64, this.maxImageBytes);
    const clean = cleanJpeg(raw, {
      ...DEFAULT_IMAGE_LIMITS,
      maxBytes: this.maxImageBytes,
      minShortSide: this.d.pack.thresholds.minShortSidePx,
    });
    const photoId = this.d.ids.next(ID_PREFIXES.photo);
    const file = `${photoId}.jpg`;
    writeFileSync(join(this.d.imageDir, file), clean.bytes, { mode: 0o600 });
    this.d.store.photos.put({ id: photoId, sha256: clean.sha256, file });
    return { photoId, base64: clean.bytes.toString("base64") };
  }

  /** Cleaned JPEG bytes (A2). The id is regex-checked and looked up; no client string reaches a path. */
  photo(photoId: string): Buffer {
    if (!StreetPhotoIdSchema.safeParse(photoId).success) throw notFound("Photo");
    const rec = this.d.store.photos.get(photoId);
    if (!rec) throw notFound("Photo");
    try {
      return readFileSync(join(this.d.imageDir, rec.file));
    } catch {
      throw notFound("Photo");
    }
  }

  private async evaluate(args: {
    submissionId: string;
    kind: StreetEvaluateKind;
    category: StreetMission["category"];
    photoBase64: string;
    beforeBase64?: string | undefined;
    fix: StreetFix;
    nowMs: number;
    target: { lat: number; lng: number; radiusM: number };
  }): Promise<StreetVerdict> {
    return this.d.verifier.evaluate({
      pack: STREET_PACK_ID,
      submissionId: args.submissionId,
      kind: args.kind,
      category: args.category,
      photo: { mimeType: "image/jpeg", base64: args.photoBase64 },
      ...(args.beforeBase64 !== undefined
        ? { beforePhoto: { mimeType: "image/jpeg" as const, base64: args.beforeBase64 } }
        : {}),
      // A3: the fix time is server time minus the age the phone reported.
      location: {
        lat: args.fix.lat,
        lng: args.fix.lng,
        accuracyM: args.fix.accuracyM,
        capturedAt: new Date(args.nowMs - args.fix.fixAgeMs).toISOString(),
      },
      target: args.target,
    });
  }

  // ---------------------------------------------------------------- reports
  async createReport(raw: unknown): Promise<CreateStreetReportResponse> {
    const body = parse(CreateStreetReportBodySchema, raw);
    const { store, clock, ids, pack } = this.d;
    const { photoId, base64 } = this.storePhoto(body.photo);
    const nowMs = clock.nowMs();
    const capturedAt = clock.nowIso();
    const { lat, lng, accuracyM } = body.location;
    const country = streetCountryForPoint(lat, lng);
    const reportId = ids.next(ID_PREFIXES.report);
    let report: StreetReport = {
      id: reportId,
      category: body.category,
      lat,
      lng,
      accuracyM,
      capturedAt,
      photoId,
      ...(body.note !== undefined ? { note: body.note } : {}),
      status: "new",
      clusterId: assignCluster(
        { lat, lng, category: body.category },
        store.reports.all(),
        pack.location.clusterRadiusM,
        () => ids.next(ID_PREFIXES.cluster),
      ),
      ...(country ? { country } : {}),
    };
    let submission: StreetSubmission = {
      id: ids.next(ID_PREFIXES.submission),
      reportId,
      photoId,
      lat,
      lng,
      accuracyM,
      capturedAt,
    };
    const rec: StreetSubmissionRecord = {
      id: submission.id,
      submission,
      kind: "report",
      category: body.category,
      distanceM: 0,
      fakeVerifier: this.d.verifier.fake,
    };
    store.reports.put(report);
    store.submissions.put(rec);

    let verdict: StreetVerdict | null = null;
    try {
      verdict = await this.evaluate({
        submissionId: submission.id,
        kind: "report",
        category: body.category,
        photoBase64: base64,
        fix: body.location,
        nowMs,
        target: { lat, lng, radiusM: pack.location.defaultRadiusM },
      });
    } catch (err) {
      // A1: verifier down -> the report stays `new` and the verdict is null.
      this.d.logger.warn("street_verifier_unavailable", {
        submissionId: submission.id,
        code: isAppError(err) ? err.code : "internal",
      });
    }
    if (verdict) {
      submission = { ...submission, verdict };
      store.submissions.put({ ...rec, submission });
      // A later mission may already have moved the report on; only `new` reports take this verdict.
      const current = store.reports.get(reportId) ?? report;
      if (current.status === "new") {
        report = { ...current, status: verdict.passed ? "verified" : "rejected" };
        store.reports.put(report);
      } else {
        report = current;
      }
    }
    return { report, submission, verdict };
  }

  listReports(rawQuery: unknown): StreetReport[] {
    const q = parse(StreetReportsQuerySchema, rawQuery);
    const all = this.d.store.reports.all();
    if (q.bbox === undefined) return all;
    const [minLng, minLat, maxLng, maxLat] = q.bbox.split(",").map(Number) as [
      number,
      number,
      number,
      number,
    ];
    if (minLng > maxLng || minLat > maxLat) {
      throw new AppError("invalid_request", "bbox must be minLng,minLat,maxLng,maxLat.");
    }
    return all.filter(
      (r) => r.lng >= minLng && r.lng <= maxLng && r.lat >= minLat && r.lat <= maxLat,
    );
  }

  // ---------------------------------------------------------------- missions
  /** Lazy housekeeping on every read and write: expiry, claim TTL, stuck verifications. */
  private sweep(): void {
    const { store, clock, pack } = this.d;
    const now = clock.nowMs();
    for (const rec of store.missions.all()) {
      const m = rec.mission;
      if ((m.status === "open" || m.status === "claimed") && Date.parse(m.expiresAt) <= now) {
        const { claimedBy: _c, ...rest } = m;
        store.missions.put({
          id: rec.id,
          mission: { ...rest, status: "expired" },
          attempts: rec.attempts,
          generation: rec.generation + 1,
        });
      } else if (
        m.status === "claimed" &&
        rec.claimedAt !== undefined &&
        Date.parse(rec.claimedAt) + pack.worker.claimTtlSec * 1000 <= now
      ) {
        this.reopen(rec);
      } else if (
        m.status === "submitted" &&
        rec.submittedAt !== undefined &&
        Date.parse(rec.submittedAt) + this.verifyTimeoutMs <= now
      ) {
        this.reopen(rec);
      }
    }
  }

  private reopen(rec: StreetMissionRecord, attempts = rec.attempts): StreetMissionRecord {
    const { claimedBy: _c, ...rest } = rec.mission;
    const next: StreetMissionRecord = {
      id: rec.id,
      mission: { ...rest, status: "open" },
      attempts,
      generation: rec.generation + 1,
    };
    this.d.store.missions.put(next);
    return next;
  }

  private missionRecord(id: string): StreetMissionRecord {
    if (!StreetMissionIdSchema.safeParse(id).success) throw notFound("Mission");
    this.sweep();
    const rec = this.d.store.missions.get(id);
    if (!rec) throw notFound("Mission");
    return rec;
  }

  createMission(raw: unknown): StreetMission {
    const body = parse(CreateStreetMissionBodySchema, raw);
    const { store, clock, ids, pack } = this.d;
    const bad = (message: string, details: Record<string, unknown> = {}): AppError =>
      new AppError("unprocessable", message, undefined, details);

    let point = { lat: body.lat, lng: body.lng };
    if (body.beforeReportId !== undefined) {
      const before = store.reports.get(body.beforeReportId);
      if (!before) throw bad("beforeReportId does not exist.");
      if (before.category !== body.category) {
        throw bad("The mission category must match the referenced report.");
      }
      if (distanceM(point, before) > body.radiusM) {
        throw bad("The mission point must be within radiusM of the referenced report.");
      }
      // A repair is checked at the reported place: the target is the report's own point.
      if (body.kind === "repair_check") point = { lat: before.lat, lng: before.lng };
    }

    const { amountMinor, currency } = body.payout;
    const country = streetCountryForPoint(point.lat, point.lng);
    if (country && STREET_COUNTRY_CURRENCY[country] !== currency) {
      throw bad("The payout currency does not match the country of the mission point.", {
        expected: STREET_COUNTRY_CURRENCY[country],
      });
    }
    if (currency === "COP" && amountMinor % 100 !== 0) {
      throw bad("COP payouts must be whole pesos (a multiple of 100 minor units).");
    }
    if (amountMinor > pack.payout.maxMinor[currency]) {
      throw bad("The payout exceeds the maximum of the pack.", {
        maxMinor: pack.payout.maxMinor[currency],
      });
    }

    const mission: StreetMission = {
      id: ids.next(ID_PREFIXES.mission),
      kind: body.kind,
      category: body.category,
      lat: point.lat,
      lng: point.lng,
      radiusM: body.radiusM,
      ...(body.beforeReportId !== undefined ? { beforeReportId: body.beforeReportId } : {}),
      payout: { amountMinor, currency },
      status: "open",
      expiresAt: addSeconds(clock.nowIso(), body.expiresInSec),
      ...(country ? { country } : {}),
    };
    store.missions.put({ id: mission.id, mission, attempts: 0, generation: 0 });
    return mission;
  }

  listMissions(rawQuery: unknown): StreetMission[] {
    const q = parse(StreetMissionsQuerySchema, rawQuery);
    this.sweep();
    const all = this.d.store.missions.all().map((r) => r.mission);
    if (q.near === undefined) return all;
    const [lat, lng] = q.near.split(",").map(Number) as [number, number];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new AppError("invalid_request", "near must be lat,lng.");
    }
    return all.filter((m) => distanceM({ lat, lng }, m) <= q.radiusKm * 1000);
  }

  claim(missionId: string, raw: unknown): StreetMission {
    const body = parse(ClaimStreetMissionBodySchema, raw);
    const rec = this.missionRecord(missionId);
    if (rec.mission.status !== "open") {
      throw new AppError("task_not_open", "The mission is not open.", undefined, {
        status: rec.mission.status,
      });
    }
    const mission: StreetMission = { ...rec.mission, status: "claimed", claimedBy: body.workerId };
    this.d.store.missions.put({
      id: rec.id,
      mission,
      claimedAt: this.d.clock.nowIso(),
      attempts: rec.attempts,
      generation: rec.generation + 1,
    });
    return mission;
  }

  /**
   * Atomic submit: everything up to and including the `submitted` reservation runs synchronously,
   * so two concurrent submits cannot both reach the verifier. The verifier result is applied only
   * if the reservation is still the same one (generation and submission id); a late result of a
   * released reservation is rejected and never pays.
   */
  async submit(missionId: string, raw: unknown): Promise<SubmitStreetMissionResponse> {
    const body = parse(SubmitStreetMissionBodySchema, raw);
    const { store, clock, ids, pack } = this.d;
    const rec = this.missionRecord(missionId);
    const m = rec.mission;
    if (m.status === "submitted") {
      throw new AppError("already_submitted", "A submission for this mission is being verified.");
    }
    if (m.status !== "claimed") {
      throw new AppError("task_not_open", "The mission is not claimed.", undefined, {
        status: m.status,
      });
    }
    // Demo limitation (street-contract.md section 6): workerId is not authentication.
    if (m.claimedBy !== body.workerId) {
      throw new AppError("forbidden", "The mission is claimed by another worker.");
    }

    let beforeBase64: string | undefined;
    if (m.kind === "repair_check") {
      const before = m.beforeReportId ? store.reports.get(m.beforeReportId) : undefined;
      if (!before) throw new AppError("unprocessable", "The mission has no before report.");
      beforeBase64 = this.photo(before.photoId).toString("base64");
    }
    const { photoId, base64 } = this.storePhoto(body.photo);
    const nowMs = clock.nowMs();
    const { lat, lng, accuracyM } = body.location;
    let submission: StreetSubmission = {
      id: ids.next(ID_PREFIXES.submission),
      missionId: m.id,
      ...(m.beforeReportId !== undefined ? { reportId: m.beforeReportId } : {}),
      photoId,
      lat,
      lng,
      accuracyM,
      capturedAt: clock.nowIso(),
    };
    const subRec: StreetSubmissionRecord = {
      id: submission.id,
      submission,
      kind: m.kind,
      category: m.category,
      workerId: body.workerId,
      distanceM: Math.round(distanceM({ lat, lng }, m)),
      fakeVerifier: this.d.verifier.fake,
    };
    store.submissions.put(subRec);
    const generation = rec.generation + 1;
    const reserved: StreetMissionRecord = {
      ...rec,
      mission: { ...m, status: "submitted" },
      generation,
      pendingSubmissionId: submission.id,
      submittedAt: clock.nowIso(),
    };
    store.missions.put(reserved);
    // ---- reservation done; nothing above this line awaits.

    const stillOurs = (): StreetMissionRecord | undefined => {
      const cur = store.missions.get(m.id);
      return cur?.mission.status === "submitted" &&
        cur.generation === generation &&
        cur.pendingSubmissionId === submission.id
        ? cur
        : undefined;
    };

    let verdict: StreetVerdict;
    try {
      verdict = await this.evaluate({
        submissionId: submission.id,
        kind: m.kind,
        category: m.category,
        photoBase64: base64,
        beforeBase64,
        fix: body.location,
        nowMs,
        target: { lat: m.lat, lng: m.lng, radiusM: m.radiusM },
      });
    } catch (err) {
      // Verifier down: give the claim back to the same worker, no attempt is counted.
      const cur = stillOurs();
      if (cur) {
        store.missions.put({
          id: cur.id,
          mission: { ...cur.mission, status: "claimed" },
          claimedAt: clock.nowIso(),
          attempts: cur.attempts,
          generation: cur.generation + 1,
        });
      }
      throw isAppError(err)
        ? err
        : new AppError("dependency_unavailable", "The verifier is not available.");
    }

    submission = { ...submission, verdict };
    store.submissions.put({ ...subRec, submission });
    const cur = stillOurs();
    if (!cur) {
      this.d.logger.warn("street_stale_verdict", { missionId: m.id, submissionId: submission.id });
      throw new AppError(
        "invalid_transition",
        "The verification finished too late; the mission was released.",
      );
    }

    let mission: StreetMission;
    if (verdict.passed) {
      mission = { ...cur.mission, status: "passed" };
      store.missions.put({
        id: cur.id,
        mission,
        attempts: cur.attempts,
        generation: cur.generation + 1,
      });
      this.payOnce(mission, submission.id, body.workerId);
      if (m.beforeReportId !== undefined) {
        const before = store.reports.get(m.beforeReportId);
        if (before && before.status !== "repaired") {
          store.reports.put({
            ...before,
            status: m.kind === "repair_check" ? "repaired" : "verified",
          });
        }
      }
    } else {
      const attempts = cur.attempts + 1;
      if (attempts >= pack.worker.maxAttempts) {
        const { claimedBy: _c, ...rest } = cur.mission;
        mission = { ...rest, status: "failed" };
        store.missions.put({ id: cur.id, mission, attempts, generation: cur.generation + 1 });
      } else {
        mission = this.reopen(cur, attempts).mission;
      }
    }
    return { submission, verdict, mission };
  }

  /** One simulated payout per mission, ever. */
  private payOnce(mission: StreetMission, submissionId: string, workerId: string): StreetPayout {
    const { store, clock, ids } = this.d;
    if (!this.d.fakePayments) throw new AppError("internal", "Street payouts are simulated only.");
    const existing = store.payouts.all().find((p) => p.missionId === mission.id);
    if (existing) return existing;
    const payout: StreetPayout = {
      id: ids.next(ID_PREFIXES.streetPayout),
      missionId: mission.id,
      submissionId,
      workerId,
      amountMinor: mission.payout.amountMinor,
      currency: mission.payout.currency,
      status: "simulated",
      paidAt: clock.nowIso(),
    };
    store.payouts.put(payout);
    this.d.logger.info("street_payout_simulated", {
      payoutId: payout.id,
      missionId: mission.id,
      currency: payout.currency,
      amountMinor: payout.amountMinor,
    });
    return payout;
  }

  // ---------------------------------------------------------------- evidence, dashboard
  evidence(submissionId: string): StreetEvidencePack {
    if (!StreetSubmissionIdSchema.safeParse(submissionId).success) throw notFound("Submission");
    const { store } = this.d;
    const rec = store.submissions.get(submissionId);
    const photo = rec ? store.photos.get(rec.submission.photoId) : undefined;
    if (!rec || !photo) throw notFound("Submission");
    const s = rec.submission;
    return {
      submissionId: s.id,
      kind: rec.kind,
      category: rec.category,
      photo: { photoId: photo.id, sha256: photo.sha256 },
      capturedAt: s.capturedAt,
      place: { lat: s.lat, lng: s.lng, accuracyM: s.accuracyM, distanceM: rec.distanceM },
      passed: s.verdict?.passed ?? null,
      confidence: s.verdict?.confidence ?? null,
      gates: s.verdict?.gates ?? [],
      payout: store.payouts.all().find((p) => p.submissionId === s.id) ?? null,
      fakes: { payments: this.d.fakePayments, verifier: rec.fakeVerifier },
    };
  }

  summary(): StreetDashboardSummary {
    this.sweep();
    const { store } = this.d;
    const zero = <K extends string>(keys: readonly K[]): Record<K, number> =>
      Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
    const reportStatuses = StreetReportStatusSchema.options;
    const byCategory = Object.fromEntries(
      STREET_CATEGORIES.map((c) => [c, zero(reportStatuses)]),
    ) as StreetDashboardSummary["reports"]["byCategory"];
    const reports = store.reports.all();
    for (const r of reports) byCategory[r.category][r.status] += 1;

    const missions = store.missions.all().map((r) => r.mission);
    const byStatus = zero(StreetMissionStatusSchema.options);
    const missionsByCategory = zero(STREET_CATEGORIES);
    for (const m of missions) {
      byStatus[m.status] += 1;
      missionsByCategory[m.category] += 1;
    }
    const payouts = store.payouts.all();
    const totalMinor = { GTQ: 0, COP: 0 };
    for (const p of payouts) totalMinor[p.currency] += p.amountMinor;
    return {
      reports: { total: reports.length, byCategory },
      missions: { total: missions.length, byStatus, byCategory: missionsByCategory },
      payouts: { count: payouts.length, totalMinor, simulated: this.d.fakePayments },
    };
  }
}
