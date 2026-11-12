import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeClock, SequentialIdGenerator, createLogger, isAppError } from "@shelfie/core";
import type { StreetEvaluateRequest, StreetVerdict } from "@shelfie/core";
import { streetPack } from "@shelfie/domain-street";
import { describe, expect, it } from "vitest";
import { StreetService } from "./service.js";
import { StreetStore } from "./store.js";
import { syntheticStreetPhoto } from "./synthetic.js";
import { FakeStreetVerifier } from "./verifier.js";
import type { StreetVerifier } from "./verifier.js";

/** Ciudad de Guatemala, made-up point. */
const GT = { lat: 14.6349, lng: -90.5069 };
/** Bogotá, made-up point. */
const CO = { lat: 4.711, lng: -74.0721 };
const M_PER_DEG_LAT = 111_195;
const north = (p: { lat: number; lng: number }, metres: number): { lat: number; lng: number } => ({
  lat: p.lat + metres / M_PER_DEG_LAT,
  lng: p.lng,
});
const fix = (
  p: { lat: number; lng: number },
  over: Partial<{ accuracyM: number; fixAgeMs: number }> = {},
): { lat: number; lng: number; accuracyM: number; fixAgeMs: number } => ({
  ...p,
  accuracyM: 8,
  fixAgeMs: 1000,
  ...over,
});
const W1 = "wrk_one";
const W2 = "wrk_two";

/** Wraps the fake so a test can hold verifier calls back or make them fail. */
class GatedVerifier implements StreetVerifier {
  readonly fake = true;
  down = false;
  hold = false;
  readonly seen: StreetEvaluateRequest[] = [];
  private readonly waiting: (() => void)[] = [];
  constructor(private readonly inner: StreetVerifier) {}
  async evaluate(req: StreetEvaluateRequest): Promise<StreetVerdict> {
    this.seen.push(req);
    if (this.down) throw new Error("connection refused");
    if (this.hold) await new Promise<void>((resolve) => this.waiting.push(resolve));
    return this.inner.evaluate(req);
  }
  releaseAll(): void {
    this.hold = false;
    for (const w of this.waiting.splice(0)) w();
  }
}

function setup(journalPath?: string): {
  svc: StreetService;
  store: StreetStore;
  clock: FakeClock;
  verifier: GatedVerifier;
  dir: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "street-"));
  const clock = new FakeClock();
  const store = new StreetStore(journalPath);
  const verifier = new GatedVerifier(new FakeStreetVerifier(streetPack, clock));
  const svc = new StreetService({
    store,
    verifier,
    pack: streetPack,
    clock,
    ids: new SequentialIdGenerator(),
    logger: createLogger({ level: "error", clock, sink: () => undefined }),
    imageDir: join(dir, "img"),
    fakePayments: true,
  });
  return { svc, store, clock, verifier, dir };
}

const report = (
  svc: StreetService,
  p = GT,
  category = "pothole",
  tag = "",
): ReturnType<StreetService["createReport"]> =>
  svc.createReport({ category, photo: syntheticStreetPhoto(tag), location: fix(p) });

const missionBody = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: "confirm",
  category: "pothole",
  ...GT,
  radiusM: 30,
  payout: { amountMinor: 1250, currency: "GTQ" },
  ...over,
});

async function code(p: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (err) {
    return isAppError(err) ? err.code : `unexpected: ${String(err)}`;
  }
  return "no error";
}

describe("reports and clustering", () => {
  it("clusters the same category within 15 m: 14 m joins, 16 m does not", async () => {
    const { svc } = setup();
    const a = await report(svc, GT);
    const b = await report(svc, north(GT, 14));
    const c = await report(svc, north(GT, -16));
    expect(b.report.clusterId).toBe(a.report.clusterId);
    expect(c.report.clusterId).not.toBe(a.report.clusterId);
    expect(a.report.clusterId).toMatch(/^clu_/);
  });

  it("does not cluster another category or a rejected report", async () => {
    const { svc } = setup();
    const a = await report(svc, GT, "pothole");
    const other = await report(svc, north(GT, 3), "graffiti");
    expect(other.report.clusterId).not.toBe(a.report.clusterId);
    const rejected = await report(svc, north(GT, 200), "ramp", "STUB_VERDICT=FAIL_CATEGORY");
    expect(rejected.report.status).toBe("rejected");
    const near = await report(svc, north(GT, 203), "ramp");
    expect(near.report.clusterId).not.toBe(rejected.report.clusterId);
  });

  it("pass gives verified, a failed gate gives rejected with a Spanish reason", async () => {
    const { svc } = setup();
    const ok = await report(svc);
    expect(ok.report.status).toBe("verified");
    expect(ok.report.country).toBe("GT");
    expect(ok.verdict?.passed).toBe(true);
    expect(ok.submission.reportId).toBe(ok.report.id);
    const bad = await report(svc, north(GT, 500), "pothole", "STUB_VERDICT=FAIL_CATEGORY");
    expect(bad.report.status).toBe("rejected");
    expect(bad.verdict?.gates.find((g) => g.name === "category_match")).toMatchObject({
      passed: false,
      detail: "La foto no muestra la categoría esperada.",
    });
  });

  it("stamps server time: a stale or inaccurate fix fails its gate (A3)", async () => {
    const { svc, verifier, clock } = setup();
    const stale = await svc.createReport({
      category: "ramp",
      photo: syntheticStreetPhoto(),
      location: fix(GT, { fixAgeMs: 200_000 }),
    });
    expect(stale.report.capturedAt).toBe(clock.nowIso());
    expect(verifier.seen[0]?.location.capturedAt).toBe(
      new Date(clock.nowMs() - 200_000).toISOString(),
    );
    expect(stale.verdict?.gates.find((g) => g.name === "fix_fresh")?.passed).toBe(false);
    const vague = await svc.createReport({
      category: "ramp",
      photo: syntheticStreetPhoto(),
      location: fix(north(GT, 900), { accuracyM: 400 }),
    });
    expect(vague.verdict?.gates.find((g) => g.name === "location_in_radius")?.passed).toBe(false);
  });

  it("verifier down: the report stays new and the verdict is null (A1)", async () => {
    const { svc, verifier } = setup();
    verifier.down = true;
    const out = await report(svc);
    expect(out.verdict).toBeNull();
    expect(out.report.status).toBe("new");
    expect(svc.evidence(out.submission.id)).toMatchObject({ passed: null, gates: [] });
  });

  it("filters by bbox and rejects an inverted one", async () => {
    const { svc } = setup();
    await report(svc, GT);
    await report(svc, CO);
    expect(svc.listReports({})).toHaveLength(2);
    const gt = svc.listReports({ bbox: "-90.6,14.5,-90.4,14.7" });
    expect(gt.map((r) => r.country)).toEqual(["GT"]);
    expect(await code(() => svc.listReports({ bbox: "-90.4,14.5,-90.6,14.7" }))).toBe(
      "invalid_request",
    );
  });
});

describe("mission lifecycle", () => {
  it("claim, submit pass, one simulated payout, evidence and summary", async () => {
    const { svc, store } = setup();
    const m = svc.createMission(missionBody());
    expect(m).toMatchObject({ status: "open", country: "GT" });
    expect(svc.claim(m.id, { workerId: W1 })).toMatchObject({ status: "claimed", claimedBy: W1 });
    expect(await code(() => svc.claim(m.id, { workerId: W2 }))).toBe("task_not_open");
    const out = await svc.submit(m.id, {
      workerId: W1,
      photo: syntheticStreetPhoto(),
      location: fix(north(GT, 10)),
    });
    expect(out.verdict.passed).toBe(true);
    expect(out.mission.status).toBe("passed");
    expect(store.payouts.all()).toHaveLength(1);
    const ev = svc.evidence(out.submission.id);
    expect(ev).toMatchObject({
      kind: "confirm",
      category: "pothole",
      passed: true,
      place: { distanceM: 10 },
      payout: { status: "simulated", amountMinor: 1250, currency: "GTQ", workerId: W1 },
      fakes: { payments: true, verifier: true },
    });
    expect(ev.photo.sha256).toMatch(/^[0-9a-f]{64}$/);
    // a passed mission cannot be claimed or submitted again: still one payout
    expect(await code(() => svc.claim(m.id, { workerId: W1 }))).toBe("task_not_open");
    expect(
      await code(
        svc.submit(m.id, { workerId: W1, photo: syntheticStreetPhoto(), location: fix(GT) }),
      ),
    ).toBe("task_not_open");
    const sum = svc.summary();
    expect(sum.missions.byStatus.passed).toBe(1);
    expect(sum.missions.byCategory.pothole).toBe(1);
    expect(sum.payouts).toEqual({ count: 1, totalMinor: { GTQ: 1250, COP: 0 }, simulated: true });
    expect(sum.reports.byCategory.ramp).toEqual({ new: 0, verified: 0, rejected: 0, repaired: 0 });
  });

  it("location failure: no payout, the mission reopens, and fails for good at maxAttempts", async () => {
    const { svc, store } = setup();
    const m = svc.createMission(missionBody());
    for (let i = 1; i <= streetPack.worker.maxAttempts; i++) {
      svc.claim(m.id, { workerId: W1 });
      const out = await svc.submit(m.id, {
        workerId: W1,
        photo: syntheticStreetPhoto(),
        location: fix(north(GT, 400)),
      });
      expect(out.verdict.passed).toBe(false);
      expect(out.verdict.gates.find((g) => g.name === "location_in_radius")?.detail).toMatch(
        /Estás a 400 m del punto/,
      );
      expect(out.mission.status).toBe(i < streetPack.worker.maxAttempts ? "open" : "failed");
      expect(out.mission.claimedBy).toBeUndefined();
    }
    expect(store.payouts.all()).toHaveLength(0);
    expect(await code(() => svc.claim(m.id, { workerId: W1 }))).toBe("task_not_open");
  });

  it("only the claiming worker may submit (demo identity, not authentication)", async () => {
    const { svc, verifier } = setup();
    const m = svc.createMission(missionBody());
    svc.claim(m.id, { workerId: W1 });
    expect(
      await code(
        svc.submit(m.id, { workerId: W2, photo: syntheticStreetPhoto(), location: fix(GT) }),
      ),
    ).toBe("forbidden");
    expect(verifier.seen).toHaveLength(0);
  });

  it("expires missions and releases stale claims lazily", async () => {
    const { svc, clock } = setup();
    const m = svc.createMission(missionBody({ expiresInSec: 3600 }));
    svc.claim(m.id, { workerId: W1 });
    clock.advanceSec(streetPack.worker.claimTtlSec + 1);
    expect(svc.listMissions({})[0]).toMatchObject({ status: "open" });
    expect(svc.listMissions({})[0]?.claimedBy).toBeUndefined();
    expect(svc.claim(m.id, { workerId: W2 }).claimedBy).toBe(W2);
    clock.advanceSec(3600);
    expect(svc.listMissions({})[0]?.status).toBe("expired");
    expect(
      await code(
        svc.submit(m.id, { workerId: W2, photo: syntheticStreetPhoto(), location: fix(GT) }),
      ),
    ).toBe("task_not_open");
  });

  it("lists missions near a point", () => {
    const { svc } = setup();
    svc.createMission(missionBody());
    svc.createMission(
      missionBody({ ...CO, category: "ramp", payout: { amountMinor: 600_000, currency: "COP" } }),
    );
    expect(svc.listMissions({})).toHaveLength(2);
    const near = svc.listMissions({ near: `${GT.lat},${GT.lng}`, radiusKm: "2" });
    expect(near.map((m) => m.country)).toEqual(["GT"]);
  });

  it("verifier down on submit: 503, no attempt counted, the worker keeps the claim", async () => {
    const { svc, verifier, store } = setup();
    const m = svc.createMission(missionBody());
    svc.claim(m.id, { workerId: W1 });
    verifier.down = true;
    const body = { workerId: W1, photo: syntheticStreetPhoto(), location: fix(GT) };
    expect(await code(svc.submit(m.id, body))).toBe("dependency_unavailable");
    expect(store.missions.get(m.id)).toMatchObject({
      attempts: 0,
      mission: { status: "claimed", claimedBy: W1 },
    });
    verifier.down = false;
    expect((await svc.submit(m.id, body)).mission.status).toBe("passed");
  });
});

describe("atomic submit", () => {
  it("two concurrent submits: one reaches the verifier, one payout", async () => {
    const { svc, verifier, store } = setup();
    const m = svc.createMission(missionBody());
    svc.claim(m.id, { workerId: W1 });
    const body = (): Record<string, unknown> => ({
      workerId: W1,
      photo: syntheticStreetPhoto(),
      location: fix(GT),
    });
    const results = await Promise.allSettled([svc.submit(m.id, body()), svc.submit(m.id, body())]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((r) => r.status === "rejected");
    expect(isAppError(rejected?.reason) && rejected.reason.code).toBe("already_submitted");
    expect(verifier.seen).toHaveLength(1);
    expect(store.payouts.all()).toHaveLength(1);
  });

  it("a verifier result that arrives after the reservation was released is rejected and never pays", async () => {
    const { svc, verifier, store, clock } = setup();
    const m = svc.createMission(missionBody());
    svc.claim(m.id, { workerId: W1 });
    verifier.hold = true;
    const late = svc.submit(m.id, {
      workerId: W1,
      photo: syntheticStreetPhoto(),
      location: fix(GT),
    });
    const lateCode = code(late);
    expect(store.missions.get(m.id)?.mission.status).toBe("submitted");
    // the verifier never answers: the reservation times out and another worker takes the mission
    clock.advanceSec(61);
    verifier.hold = false;
    svc.claim(m.id, { workerId: W2 });
    const second = await svc.submit(m.id, {
      workerId: W2,
      photo: syntheticStreetPhoto(),
      location: fix(GT, { fixAgeMs: 0 }),
    });
    expect(second.mission.status).toBe("passed");
    // now the first verification completes, out of order
    verifier.releaseAll();
    expect(await lateCode).toBe("invalid_transition");
    const payouts = store.payouts.all();
    expect(payouts).toHaveLength(1);
    expect(payouts[0]?.workerId).toBe(W2);
    expect(store.missions.get(m.id)?.mission.status).toBe("passed");
  });
});

describe("mission rules", () => {
  it("repair_check: target comes from the report; pass marks the report repaired", async () => {
    const { svc, verifier } = setup();
    const r = await report(svc, GT, "pothole");
    const m = svc.createMission(
      missionBody({ kind: "repair_check", ...north(GT, 12), beforeReportId: r.report.id }),
    );
    expect({ lat: m.lat, lng: m.lng }).toEqual(GT);
    svc.claim(m.id, { workerId: W1 });
    const out = await svc.submit(m.id, {
      workerId: W1,
      photo: syntheticStreetPhoto(),
      location: fix(GT),
    });
    expect(out.verdict.gates.map((g) => g.name)).toEqual(
      expect.arrayContaining(["repaired", "before_after_same_place"]),
    );
    expect(verifier.seen.at(-1)?.beforePhoto?.base64).toBe(
      svc.photo(r.report.photoId).toString("base64"),
    );
    expect(svc.listReports({})[0]?.status).toBe("repaired");
    expect(out.submission.reportId).toBe(r.report.id);
  });

  it("repair_check that still shows the issue fails and leaves the report alone", async () => {
    const { svc } = setup();
    const r = await report(svc, GT, "pothole");
    const m = svc.createMission(missionBody({ kind: "repair_check", beforeReportId: r.report.id }));
    svc.claim(m.id, { workerId: W1 });
    const out = await svc.submit(m.id, {
      workerId: W1,
      photo: syntheticStreetPhoto("STUB_VERDICT=FAIL_REPAIRED"),
      location: fix(GT),
    });
    expect(out.verdict.passed).toBe(false);
    expect(svc.listReports({})[0]?.status).toBe("verified");
  });

  it("beforeReportId must exist, match the category and lie within radiusM", async () => {
    const { svc } = setup();
    const r = await report(svc, GT, "pothole");
    const b = (over: Record<string, unknown>): Promise<string> =>
      code(() => svc.createMission(missionBody({ beforeReportId: r.report.id, ...over })));
    expect(await b({ beforeReportId: "rep_missing" })).toBe("unprocessable");
    expect(await b({ category: "graffiti" })).toBe("unprocessable");
    expect(await b({ ...north(GT, 60) })).toBe("unprocessable");
    expect(await b({ kind: "repair_check", beforeReportId: undefined })).toBe("invalid_request");
    expect(await b({})).toBe("no error");
  });

  it("money: currency follows the country, COP in whole pesos, pack maximum enforced", async () => {
    const { svc } = setup();
    const c = (over: Record<string, unknown>): Promise<string> =>
      code(() => svc.createMission(missionBody(over)));
    expect(await c({ payout: { amountMinor: 600_000, currency: "COP" } })).toBe("unprocessable");
    expect(await c({ ...CO, payout: { amountMinor: 1250, currency: "GTQ" } })).toBe(
      "unprocessable",
    );
    expect(await c({ ...CO, payout: { amountMinor: 600_050, currency: "COP" } })).toBe(
      "unprocessable",
    );
    expect(await c({ payout: { amountMinor: 50_001, currency: "GTQ" } })).toBe("unprocessable");
    expect(await c({ payout: { amountMinor: 12.5, currency: "GTQ" } })).toBe("invalid_request");
    expect(await c({ payout: { amountMinor: 1250, currency: "EUR" } })).toBe("invalid_request");
    const ok = svc.createMission(
      missionBody({ ...CO, payout: { amountMinor: 600_000, currency: "COP" } }),
    );
    expect(ok).toMatchObject({ country: "CO", payout: { currency: "COP" } });
  });

  it("measure adds the reference_object gate", async () => {
    const { svc } = setup();
    const m = svc.createMission(missionBody({ kind: "measure" }));
    svc.claim(m.id, { workerId: W1 });
    const out = await svc.submit(m.id, {
      workerId: W1,
      photo: syntheticStreetPhoto("STUB_VERDICT=FAIL_REFERENCE"),
      location: fix(GT),
    });
    expect(out.verdict.gates.find((g) => g.name === "reference_object")?.passed).toBe(false);
  });
});

describe("store journal", () => {
  it("replays reports, missions, submissions, payouts and photos", async () => {
    const dir = mkdtempSync(join(tmpdir(), "street-j-"));
    const path = join(dir, "street-events.jsonl");
    const a = setup(path);
    await report(a.svc);
    const m = a.svc.createMission(missionBody());
    a.svc.claim(m.id, { workerId: W1 });
    await a.svc.submit(m.id, { workerId: W1, photo: syntheticStreetPhoto(), location: fix(GT) });
    const b = new StreetStore(path);
    expect(b.reports.all()).toEqual(a.store.reports.all());
    expect(b.missions.get(m.id)?.mission.status).toBe("passed");
    expect(b.payouts.all()).toEqual(a.store.payouts.all());
    expect(b.submissions.all()).toHaveLength(2);
    expect(b.photos.all()).toHaveLength(2);
    expect(readFileSync(path, "utf8")).not.toMatch(/base64|\/9j\//);
  });

  it("refuses a corrupt, unknown or schema-violating record", () => {
    const dir = mkdtempSync(join(tmpdir(), "street-j-"));
    const bad = (line: string): (() => StreetStore) => {
      const path = join(dir, `${Math.random().toString(36).slice(2)}.jsonl`);
      writeFileSync(path, `${line}\n`);
      return () => new StreetStore(path);
    };
    expect(bad("{not json")).toThrow(/corrupt/);
    expect(bad('{"c":"constructor","v":{}}')).toThrow(/unknown record/);
    expect(bad('{"c":"payouts","v":{"id":"spy_1","status":"paid"}}')).toThrow(/fails its schema/);
    expect(bad('{"c":"photos","v":{"id":"pho_1","sha256":"0","file":"../x.jpg"}}')).toThrow(
      /fails its schema/,
    );
  });
});
