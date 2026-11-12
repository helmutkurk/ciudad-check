/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- test and smoke code reads untyped JSON responses */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DecisionResponseSchema,
  ErrorBodySchema,
  HealthResponseSchema,
  JobViewSchema,
  ConfigResponseSchema,
  SubmissionViewSchema,
  CatalogResponseSchema,
  TaskListResponseSchema,
  ClaimResponseSchema,
  CreateJobResponseSchema,
  SubmitPhotoResponseSchema,
  LedgerListResponseSchema,
  RevealChallengeResponseSchema,
} from "@shelfie/core";
import { verifyLedger } from "@shelfie/evidence";
import { afterEach, describe, expect, it } from "vitest";
import {
  BERLIN,
  CENTRE,
  EAN,
  NEAR_POS,
  STORE_ID,
  STORE_POS,
  makeRig,
  photoB64,
} from "./testkit.js";
import type { Rig } from "./testkit.js";

let rig: Rig;
afterEach(async () => {
  await rig.close();
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function open(): Promise<Rig> {
  rig = await makeRig();
  return rig;
}

describe("intake filter (contracts 1.1a)", () => {
  it("rejects unknown store, unknown product, wrong city and multi-store with reason codes and no tasks", async () => {
    await open();
    const cases: [Record<string, unknown>, string][] = [
      [{ stores: [{ id: "nope" }] }, "unknown_store"],
      [{ productEan: "9999999999999" }, "unknown_product"],
      [{ stores: [{ id: "b1" }] }, "city_not_supported"],
      [{ stores: [{ id: "s1" }, { id: "s2" }], k: 1 }, "multi_store_unsupported"],
    ];
    let i = 0;
    for (const [inputOver, code] of cases) {
      const res = await rig.createJob({
        externalRef: `bad-${i++}`,
        input: { productEan: EAN, stores: [{ id: STORE_ID }], ...inputOver },
      });
      expect(res.status).toBe(422);
      expect(res.json.error.code).toBe("intake_rejected");
      expect(res.json.error.details.reasons.map((r: { code: string }) => r.code)).toContain(code);
    }
    expect((await rig.call("GET", "/api/tasks")).status).toBe(403); // location required
    const tasks = await rig.call("GET", `/api/tasks?lat=${CENTRE.lat}&lon=${CENTRE.lon}`);
    expect(tasks.json.tasks).toHaveLength(0);
    expect(rig.store.tasks.all()).toHaveLength(0);
    expect(rig.payouts.enqueueCalls).toHaveLength(0);
    expect(rig.ledger.all().some((e) => e.kind === "INTAKE_REJECTED")).toBe(true);
  });

  it("rejects free text (ids only) as input_schema_violation", async () => {
    await open();
    const res = await rig.createJob({
      input: {
        productEan: EAN,
        stores: [{ id: STORE_ID, name: "Store A", address: "x" }],
        product: { name: "Beer" },
      },
    });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("input_schema_violation");
    expect(rig.store.jobs.all()).toHaveLength(0);
  });

  it("is idempotent on externalRef (duplicate create returns the same job, 200)", async () => {
    await open();
    const a = await rig.createJob({ externalRef: "sokosumi-1" });
    const b = await rig.createJob({ externalRef: "sokosumi-1" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.json.job.id).toBe(a.json.job.id);
    expect(b.json.tasks[0].id).toBe(a.json.tasks[0].id);
    expect(rig.store.tasks.all()).toHaveLength(1);
    CreateJobResponseSchema.parse(a.json);
  });
});

describe("happy path (price photo)", () => {
  it("claim -> submit -> verify -> payout -> DELIVER, one payout, ledger chain intact", async () => {
    await open();
    const { jobId, taskId, claimId, subId } = await rig.flow();

    const sub = await rig.call("GET", `/api/submissions/${subId}`);
    SubmissionViewSchema.parse(sub.json);
    expect(sub.json.state).toBe("PASSED");
    expect(sub.json.verdict.pass).toBe(true);
    expect(sub.json.payout.state).toBe("CONFIRMED");
    expect(sub.json.payout.txHash).toMatch(/^fake-payout-tx-/);
    expect(sub.json.task.state).toBe("PAID");

    expect(rig.verify.calls).toHaveLength(1);
    expect(rig.verify.calls[0]?.key).toBe(`verify:${subId}`);
    expect(rig.verify.calls[0]?.req.task.expectedCode).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    expect(rig.payouts.enqueueCalls).toEqual([taskId]);

    const dec = await rig.shell("GET", `/api/jobs/${jobId}/decision?waitSec=0`);
    const parsed = DecisionResponseSchema.parse(dec.json);
    expect(parsed.status).toBe("DELIVER");
    if (parsed.status === "DELIVER") {
      expect(parsed.outcomes).toEqual(["OBSERVED"]);
      expect(parsed.passed).toBe(1);
      expect(parsed.reportMd).toContain("Example Pale Ale");
      expect(parsed.reportSha256).toMatch(/^[0-9a-f]{64}$/);
    }

    const job = await rig.call("GET", `/api/jobs/${jobId}`);
    const view = JobViewSchema.parse(job.json);
    expect(view.job.state).toBe("DELIVERABLE");
    expect(view.counts).toEqual({ passed: 1, failed: 0, open: 0 });

    const payouts = await rig.call("GET", `/api/payouts?jobId=${jobId}`);
    expect(payouts.json.payouts).toHaveLength(1);

    const kinds = rig.ledger.all().map((e) => e.kind);
    for (const k of [
      "JOB_CREATED",
      "TASK_CLAIMED",
      "LOCATION_CHECKED",
      "VERIFY_PAID",
      "VERDICT",
      "PAYOUT_QUEUED",
      "PAYOUT_SUBMITTED",
      "PAYOUT_CONFIRMED",
      "JOB_DECIDED",
    ]) {
      expect(kinds).toContain(k);
    }
    expect(verifyLedger(rig.ledgerPath).ok).toBe(true);
    expect(rig.ledger.all().every((e) => e.flags["fakePayments"] === true)).toBe(true);
    // the claim was single-use
    const again = await rig.submit(taskId, claimId);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("already_submitted");
  });

  it("serves contract-shaped read endpoints", async () => {
    await open();
    await rig.createJob();
    HealthResponseSchema.parse((await rig.call("GET", "/api/health")).json);
    ConfigResponseSchema.parse((await rig.call("GET", "/api/config")).json);
    const cat = await rig.call("GET", "/api/catalog");
    CatalogResponseSchema.parse(cat.json);
    expect(JSON.stringify(cat.json)).not.toMatch(/priceMinEur|priceMaxEur|geofence/);
    const tasks = await rig.call(
      "GET",
      `/api/tasks?status=OPEN&lat=${CENTRE.lat}&lon=${CENTRE.lon}`,
    );
    const list = TaskListResponseSchema.parse(tasks.json);
    expect(list.tasks).toHaveLength(1);
    expect(JSON.stringify(tasks.json)).not.toMatch(/challenge|workerId/);
    const far = await rig.call("GET", `/api/tasks?lat=${BERLIN.lat}&lon=${BERLIN.lon}`);
    expect(far.json.tasks).toHaveLength(0);
    LedgerListResponseSchema.parse((await rig.call("GET", "/api/ledger?afterSeq=0&limit=5")).json);
    expect((await rig.call("GET", "/api/nope")).json.error.code).toBe("not_found");
  });
});

describe("public map data (contracts 1.1b, 1.2)", () => {
  it("catalog stores carry lat/lon; task list items carry storeId", async () => {
    await open();
    await rig.createJob();
    const cat = CatalogResponseSchema.parse((await rig.call("GET", "/api/catalog")).json);
    const store = cat.cities.flatMap((c) => c.stores).find((s) => s.id === STORE_ID);
    expect(store).toMatchObject({ lat: STORE_POS.lat, lon: STORE_POS.lon });
    const list = TaskListResponseSchema.parse(
      (await rig.call("GET", `/api/tasks?lat=${CENTRE.lat}&lon=${CENTRE.lon}`)).json,
    );
    expect(list.tasks[0]?.storeId).toBe(STORE_ID);
  });
});

describe("rejected then retry", () => {
  it("a wrong code burns the claim, reopens the task, no payout; a second claim passes", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c1 = await rig.claim(taskId);
    const s1 = await rig.submit(taskId, c1.json.claim.id, {
      imageBase64: photoB64("STUB_VERDICT=FAIL_CODE"),
    });
    expect(s1.status).toBe(202);
    SubmitPhotoResponseSchema.parse(s1.json);
    await rig.engine.idle();
    const v1 = await rig.call("GET", `/api/submissions/${s1.json.submission.id}`);
    expect(v1.json.state).toBe("REJECTED");
    expect(v1.json.verdict.failedGates).toEqual(["code_match"]);
    expect(v1.json.task).toEqual({ id: taskId, state: "OPEN", attemptsLeft: 2 });
    expect(v1.json.payout).toBeNull();
    expect(rig.payouts.enqueueCalls).toHaveLength(0);

    const c2 = await rig.claim(taskId, "B");
    expect(c2.status).toBe(201);
    expect(c2.json.challenge.code).not.toBe(c1.json.challenge.code);
    const s2 = await rig.submit(taskId, c2.json.claim.id);
    await rig.engine.idle();
    const v2 = await rig.call("GET", `/api/submissions/${s2.json.submission.id}`);
    expect(v2.json.state).toBe("PASSED");
    expect(rig.payouts.enqueueCalls).toHaveLength(1);
    expect(rig.verify.calls).toHaveLength(2);
  });

  it("after MAX_ATTEMPTS failures the task is FAILED and the job is withheld", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    for (let i = 0; i < 3; i++) {
      const c = await rig.claim(taskId);
      await rig.submit(taskId, c.json.claim.id, {
        imageBase64: photoB64("STUB_VERDICT=FAIL_CODE"),
      });
      await rig.engine.idle();
    }
    const view = JobViewSchema.parse((await rig.call("GET", `/api/jobs/${job.json.job.id}`)).json);
    expect(view.tasks[0]?.state).toBe("FAILED");
    expect(view.decision).toBe("WITHHOLD");
    const dec = await rig.shell("GET", `/api/jobs/${job.json.job.id}/decision`);
    expect(dec.json).toMatchObject({ status: "WITHHOLD", reason: "no_passing_photo", passed: 0 });
    expect(rig.payouts.enqueueCalls).toHaveLength(0);
  });
});

describe("window, claim TTL and cutoff", () => {
  it("window expiry with no passing photo -> WITHHOLD no_passing_photo, no payout", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const pending = await rig.shell("GET", `/api/jobs/${job.json.job.id}/decision?waitSec=0`);
    expect(pending.json.status).toBe("PENDING");
    await rig.claim(taskId);
    rig.clock.advanceSec(901);
    rig.engine.tick();
    const dec = await rig.shell("GET", `/api/jobs/${job.json.job.id}/decision`);
    expect(dec.json).toEqual({
      jobId: job.json.job.id,
      status: "WITHHOLD",
      passed: 0,
      k: 1,
      n: 1,
      reason: "no_passing_photo",
    });
    const view = JobViewSchema.parse((await rig.call("GET", `/api/jobs/${job.json.job.id}`)).json);
    expect(view.tasks[0]?.state).toBe("EXPIRED");
    expect(rig.payouts.enqueueCalls).toHaveLength(0);
    expect(
      rig.ledger.all().some((e) => e.kind === "JOB_DECIDED" && e.note.startsWith("WITHHOLD")),
    ).toBe(true);
  });

  it("a claim expires after CLAIM_TTL_SEC: the task reopens, the old claim cannot submit", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c1 = await rig.claim(taskId);
    expect((await rig.claim(taskId, "B")).json.error.code).toBe("task_not_open");
    rig.clock.advanceSec(301);
    const late = await rig.submit(taskId, c1.json.claim.id);
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe("claim_expired");
    const c2 = await rig.claim(taskId, "B");
    expect(c2.status).toBe(201);
    expect(rig.verify.calls).toHaveLength(0);
  });

  it("no claim after the cutoff (windowEndsAt - CLAIM_TTL - VERIFY_BUDGET)", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    rig.clock.advanceSec(900 - 300 - 120 + 1);
    const res = await rig.claim(taskId);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("claim_window_closed");
  });

  it("release gives the task back", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const rel = await rig.call("POST", `/api/claims/${c.json.claim.id}/release`);
    expect(rel.json.claim.state).toBe("RELEASED");
    expect((await rig.claim(taskId, "B")).status).toBe(201);
  });
});

describe("claims", () => {
  it("two concurrent claims: exactly one winner, the other gets task_not_open", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const results = await Promise.all([rig.claim(taskId, "A"), rig.claim(taskId, "B")]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(loser?.json.error.code).toBe("task_not_open");
    expect(loser?.json.error.message).toBe("Another worker was faster.");
    expect(rig.store.claims.all().filter((c) => c.state === "ACTIVE")).toHaveLength(1);
  });

  it("100 simultaneous claims on one task: one winner (engine level)", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const out = Array.from({ length: 100 }, (_, i) => {
      try {
        return rig.engine.claimTask(taskId, {
          workerId: `wrk_w${i}`,
          payoutAddress: `addr_test1${"a".repeat(20)}${String(i).padStart(3, "0")}`,
          location: { ...CENTRE },
        }).status;
      } catch {
        return 409;
      }
    });
    expect(out.filter((s) => s === 201)).toHaveLength(1);
  });

  it("repeating a claim by the same worker returns the same claim and code", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const a = await rig.claim(taskId);
    const b = await rig.claim(taskId);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.json.claim.id).toBe(a.json.claim.id);
    expect(b.json.challenge.code).toBe(a.json.challenge.code);
    ClaimResponseSchema.parse(a.json);
  });

  it("one active claim per worker; wrong city; location required; bad address", async () => {
    await open();
    const j1 = await rig.createJob();
    const j2 = await rig.createJob();
    const t1 = j1.json.tasks[0].id as string;
    const t2 = j2.json.tasks[0].id as string;
    expect((await rig.claim(t1)).status).toBe(201);
    const second = await rig.claim(t2);
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe("claim_already_active");

    const berlin = await rig.claim(t2, "B", BERLIN);
    expect(berlin.status).toBe(403);
    expect(berlin.json.error.code).toBe("wrong_city");
    expect(berlin.json.error.details.storeCity).toBe("Munich");
    const none = await rig.claim(t2, "B", null);
    expect(none.json.error.code).toBe("location_required");
    const badAddr = await rig.call("POST", `/api/tasks/${t2}/claim`, {
      workerId: "wrk_bbb",
      payoutAddress: "addr1notpreprod",
      location: { ...CENTRE },
    });
    expect(badAddr.status).toBe(422);
    expect(badAddr.json.error.code).toBe("invalid_payout_address");
    expect(ErrorBodySchema.safeParse(badAddr.json).success).toBe(true);
  });

  it("SSE feed: task_opened for a new task, task_closed when another worker claims it", async () => {
    await open();
    const ctl = new AbortController();
    const res = await fetch(`${rig.base}/api/tasks/stream?lat=${CENTRE.lat}&lon=${CENTRE.lon}`, {
      signal: ctl.signal,
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    let text = "";
    const reader = res.body?.getReader();
    const pump = (async () => {
      const dec = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value);
      }
    })().catch(() => undefined);
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    for (let i = 0; i < 50 && !text.includes("event: task_opened"); i++) await sleep(20);
    expect(text).toContain("event: task_opened");
    expect(text).toContain(taskId);
    expect(text).toContain(`"storeId":"${STORE_ID}"`);
    await rig.claim(taskId);
    for (let i = 0; i < 50 && !text.includes("event: task_closed"); i++) await sleep(20);
    expect(text).toContain("event: task_closed");
    expect(text).toContain('"reason":"claimed"');
    ctl.abort();
    await pump;
  });
});

describe("capture-time location precheck (contracts 1.3)", () => {
  it("too far: 422 location_mismatch, no verifier call, claim stays active, locationTries counted", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const res = await rig.submit(taskId, c.json.claim.id, {
      location: { ...CENTRE, accuracyM: 20, fixAgeMs: 500 },
    });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("location_mismatch");
    expect(res.json.error.details.distanceM).toBeGreaterThan(1000);
    expect(res.json.error.details.allowedM).toBe(170);
    expect(rig.verify.calls).toHaveLength(0);
    expect(rig.store.submissions.all()).toHaveLength(0);
    expect(rig.store.claims.get(c.json.claim.id)?.state).toBe("ACTIVE");
    expect(rig.store.claims.get(c.json.claim.id)?.locationTries).toBe(1);
    expect(rig.store.tasks.all()[0]?.attempts).toBe(0);
    expect(readdirSync(rig.imageDir)).toHaveLength(0);
    // the same claim can still submit from the shelf
    const ok = await rig.submit(taskId, c.json.claim.id);
    expect(ok.status).toBe(202);
  });

  it("accuracy widens the radius up to the cap; stale or inaccurate fixes are location_inaccurate", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const tight = await rig.submit(taskId, c.json.claim.id, {
      location: { ...NEAR_POS, accuracyM: 10, fixAgeMs: 500 },
    });
    expect(tight.json.error.code).toBe("location_mismatch");
    const stale = await rig.submit(taskId, c.json.claim.id, {
      location: { ...STORE_POS, accuracyM: 10, fixAgeMs: 31000 },
    });
    expect(stale.json.error.code).toBe("location_inaccurate");
    expect(rig.verify.calls).toHaveLength(0);
    const loose = await rig.submit(taskId, c.json.claim.id, {
      location: { ...NEAR_POS, accuracyM: 100, fixAgeMs: 500 },
    });
    expect(loose.status).toBe(202); // 150 + min(100, 100) = 250 m >= ~200 m
  });

  it("LOCATION_MAX_TRIES failures release the claim and reopen the task", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    for (let i = 0; i < 3; i++) {
      const r = await rig.submit(taskId, c.json.claim.id, {
        location: { ...CENTRE, accuracyM: 10, fixAgeMs: 1 },
      });
      expect(r.status).toBe(422);
      if (i === 2) expect(r.json.error.details.claimReleased).toBe(true);
    }
    expect(rig.store.claims.get(c.json.claim.id)?.state).toBe("RELEASED");
    expect(rig.store.tasks.all()[0]?.state).toBe("OPEN");
    expect(rig.verify.calls).toHaveLength(0);
    expect((await rig.claim(taskId, "B")).status).toBe(201);
  });

  it("missing location is 403 location_required", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const res = await rig.submit(taskId, c.json.claim.id, { location: undefined });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("location_required");
  });

  it("LOCATION_CHECK=off skips the precheck and flags the ledger", async () => {
    rig = await makeRig({ env: { LOCATION_CHECK: "off" } });
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId, "A", null);
    expect(c.status).toBe(201);
    const res = await rig.submit(taskId, c.json.claim.id, { location: undefined });
    expect(res.status).toBe(202);
    expect(rig.ledger.all().some((e) => e.flags["locationCheckOff"] === true)).toBe(true);
  });
});

describe("capture mode guard", () => {
  it("file / capture-input / admin-test without the flag -> capture_mode_not_allowed, nothing stored", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    for (const mode of ["file", "capture-input", "admin-test", ""]) {
      const res = await rig.submit(taskId, c.json.claim.id, { clientMeta: { captureMode: mode } });
      expect(res.status).toBe(422);
      expect(res.json.error.code).toBe("capture_mode_not_allowed");
    }
    expect(rig.store.submissions.all()).toHaveLength(0);
    expect(readdirSync(rig.imageDir)).toHaveLength(0);
    expect(rig.verify.calls).toHaveLength(0);
  });

  it("admin-test is accepted only with ALLOW_TEST_UPLOAD and the admin token, and is flagged", async () => {
    rig = await makeRig({ env: { ALLOW_TEST_UPLOAD: "true" } });
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const body = {
      claimId: c.json.claim.id,
      outcome: "OBSERVED",
      imageBase64: photoB64(),
      mimeType: "image/jpeg",
      location: { ...STORE_POS, accuracyM: 18, fixAgeMs: 100 },
      clientMeta: { captureMode: "admin-test" },
    };
    const anon = await rig.call("POST", `/api/tasks/${taskId}/submissions`, body);
    expect(anon.json.error.code).toBe("capture_mode_not_allowed");
    const asAdmin = await rig.admin("POST", `/api/tasks/${taskId}/submissions`, body);
    expect(asAdmin.status).toBe(202);
    expect(
      rig.ledger
        .all()
        .some((e) => e.kind === "SUBMISSION_RECEIVED" && e.flags["adminTestUpload"] === true),
    ).toBe(true);
  });
});

describe("duplicates", () => {
  it("submitting the same photo twice on one claim returns the same submission (one verify call)", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const img = photoB64();
    const a = await rig.submit(taskId, c.json.claim.id, { imageBase64: img });
    const b = await rig.submit(taskId, c.json.claim.id, { imageBase64: img });
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(b.json.submission.id).toBe(a.json.submission.id);
    await rig.engine.idle();
    expect(rig.verify.calls).toHaveLength(1);
    expect(rig.payouts.enqueueCalls).toHaveLength(1);
  });

  it("the same photo on a new claim is duplicate_image", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c1 = await rig.claim(taskId);
    const img = photoB64("STUB_VERDICT=FAIL_CODE");
    await rig.submit(taskId, c1.json.claim.id, { imageBase64: img });
    await rig.engine.idle();
    const c2 = await rig.claim(taskId, "B");
    const dup = await rig.submit(taskId, c2.json.claim.id, { imageBase64: img });
    expect(dup.status).toBe(422);
    expect(dup.json.error.code).toBe("duplicate_image");
    expect(rig.store.claims.get(c2.json.claim.id)?.state).toBe("ACTIVE");
  });
});

describe("out of stock (ADR-17)", () => {
  it("accepted OUT_OF_STOCK counts like a pass: same payout, report says out of stock", async () => {
    await open();
    const { jobId, taskId } = await rig.flow({ outcome: "OUT_OF_STOCK" });
    expect(rig.verify.calls[0]?.req.task.outcome).toBe("OUT_OF_STOCK");
    const dec = await rig.shell("GET", `/api/jobs/${jobId}/decision`);
    expect(dec.json.status).toBe("DELIVER");
    expect(dec.json.outcomes).toEqual(["OUT_OF_STOCK"]);
    expect(dec.json.reportMd).toContain("out of stock at Store A");
    const payout = rig.store.payouts.all()[0];
    expect(payout?.taskId).toBe(taskId);
    expect(payout?.amount).toBe(rig.env.PAYOUT_LOVELACE);
  });

  it("an out-of-stock photo with the product present is rejected (no payout)", async () => {
    await open();
    const { subId } = await rig.flow({
      outcome: "OUT_OF_STOCK",
      tag: "STUB_VERDICT=PRODUCT_PRESENT",
    });
    const v = await rig.call("GET", `/api/submissions/${subId}`);
    expect(v.json.state).toBe("REJECTED");
    expect(v.json.verdict.failedGates).toEqual(["slot_empty"]);
    expect(rig.payouts.enqueueCalls).toHaveLength(0);
  });
});

describe("verifier errors", () => {
  it("transport errors are retried with the same idempotency key", async () => {
    await open();
    rig.verify.failNext(1);
    const { subId } = await rig.flow();
    expect(rig.verify.calls.map((c) => c.key)).toEqual([`verify:${subId}`, `verify:${subId}`]);
    expect(rig.store.submissions.get(subId as never)?.state).toBe("PASSED");
  });

  it("exhausted retries -> ERROR_FINAL, task reopens, attempt not counted, operator alert", async () => {
    await open();
    rig.verify.failNext(3);
    const { subId, taskId } = await rig.flow();
    expect(rig.store.submissions.get(subId as never)?.state).toBe("ERROR_FINAL");
    const task = rig.store.tasks.get(taskId);
    expect(task?.state).toBe("OPEN");
    expect(task?.attempts).toBe(0);
    expect(rig.ledger.all().some((e) => e.flags["operatorAlert"] === true)).toBe(true);
    expect(rig.payouts.enqueueCalls).toHaveLength(0);
  });
});

describe("shell settlement events and decision", () => {
  it("DELIVER path: RESULT_SUBMITTED then SETTLED, repeatable", async () => {
    await open();
    const { jobId } = await rig.flow();
    const lock = await rig.shell("POST", `/api/jobs/${jobId}/settlement-events`, {
      event: "ESCROW_LOCKED",
      txHash: "a".repeat(64),
      ref: "masumi-1",
    });
    expect(lock.status).toBe(200);
    expect(rig.ledger.all().find((e) => e.kind === "ESCROW_LOCKED")?.explorerUrl).toContain(
      "a".repeat(64),
    );
    const early = await rig.shell("POST", `/api/jobs/${jobId}/settlement-events`, {
      event: "SETTLED",
    });
    expect(early.status).toBe(409); // not submitted yet
    for (let i = 0; i < 2; i++) {
      const r = await rig.shell("POST", `/api/jobs/${jobId}/settlement-events`, {
        event: "RESULT_SUBMITTED",
      });
      expect(r.json.jobState).toBe("DELIVERED");
    }
    const settled = await rig.shell("POST", `/api/jobs/${jobId}/settlement-events`, {
      event: "SETTLED",
      txHash: "b".repeat(64),
    });
    expect(settled.json.jobState).toBe("SETTLED");
    const view = JobViewSchema.parse((await rig.call("GET", `/api/jobs/${jobId}`)).json);
    expect(view.settlement?.state).toBe("SETTLED");
    expect(view.settlement?.txHashes["settleTx"]).toBe("b".repeat(64));
  });

  it("WITHHOLD path: no result may be submitted; WITHHELD then REFUND_OBSERVED -> REFUNDED", async () => {
    await open();
    const job = await rig.createJob();
    const jobId = job.json.job.id as string;
    await rig.admin("POST", `/api/admin/jobs/${jobId}/finalize`);
    const submit = await rig.shell("POST", `/api/jobs/${jobId}/settlement-events`, {
      event: "RESULT_SUBMITTED",
    });
    expect(submit.status).toBe(409);
    expect(
      (await rig.shell("POST", `/api/jobs/${jobId}/settlement-events`, { event: "WITHHELD" }))
        .status,
    ).toBe(200);
    const refund = await rig.shell("POST", `/api/jobs/${jobId}/settlement-events`, {
      event: "REFUND_OBSERVED",
      txHash: "c".repeat(64),
    });
    expect(refund.json.jobState).toBe("REFUNDED");
    expect(rig.payouts.enqueueCalls).toHaveLength(0);
  });

  it("intake-rejected job id can receive an INTAKE_REJECTED event", async () => {
    await open();
    const bad = await rig.createJob({ input: { productEan: EAN, stores: [{ id: "nope" }] } });
    const ev = await rig.shell(
      "POST",
      `/api/jobs/${bad.json.error.details.jobId}/settlement-events`,
      { event: "INTAKE_REJECTED", note: "comment posted" },
    );
    expect(ev.status).toBe(200);
  });

  it("long poll returns PENDING after waitSec and wakes up when the job is decided", async () => {
    await open();
    const job = await rig.createJob();
    const jobId = job.json.job.id as string;
    const t0 = Date.now();
    const pending = await rig.shell("GET", `/api/jobs/${jobId}/decision?waitSec=1`);
    expect(pending.json.status).toBe("PENDING");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    const waiting = rig.shell("GET", `/api/jobs/${jobId}/decision?waitSec=10`);
    await sleep(50);
    await rig.admin("POST", `/api/admin/jobs/${jobId}/finalize`);
    const res = await waiting;
    expect(res.json.status).toBe("WITHHOLD");
  });
});

describe("admin actions", () => {
  it("cancel, finalize and reset", async () => {
    await open();
    const j = await rig.createJob();
    const id = j.json.job.id as string;
    expect((await rig.admin("POST", `/api/jobs/${id}/cancel`)).json.job.state).toBe("CANCELLED");
    const d = await rig.shell("GET", `/api/jobs/${id}/decision`);
    expect(d.json).toMatchObject({ status: "WITHHOLD", reason: "cancelled" });
    const before = rig.ledger.size();
    expect((await rig.admin("POST", "/api/admin/reset")).status).toBe(200);
    expect(rig.store.jobs.all()).toHaveLength(0);
    expect(rig.ledger.size()).toBe(before + 1); // the ledger is never reset
    expect(verifyLedger(rig.ledgerPath).ok).toBe(true);
  });

  it("reset is refused during an evidence run", async () => {
    rig = await makeRig({ env: { NODE_ENV: "test" } });
    rig.engine["d"].evidenceRunLocked = true;
    expect((await rig.admin("POST", "/api/admin/reset")).status).toBe(403);
  });

  it("override: disabled by default (403), enabled turns a rejected photo into a flagged pass", async () => {
    await open();
    const { subId } = await rig.flow({ tag: "STUB_VERDICT=FAIL_CODE" });
    const off = await rig.admin("POST", `/api/admin/submissions/${subId}/override`, {
      pass: true,
      reason: "tag visible",
    });
    expect(off.status).toBe(403);
    expect(off.json.error.code).toBe("override_disabled");
    await rig.close();

    rig = await makeRig({ env: { ALLOW_DEMO_OVERRIDE: "true" } });
    const f = await rig.flow({ tag: "STUB_VERDICT=FAIL_CODE" });
    const noReason = await rig.admin("POST", `/api/admin/submissions/${f.subId}/override`, {
      pass: true,
    });
    expect(noReason.status).toBe(422);
    const ok = await rig.admin("POST", `/api/admin/submissions/${f.subId}/override`, {
      pass: true,
      reason: "tag visible",
    });
    expect(ok.status).toBe(200);
    await rig.engine.idle();
    expect(
      rig.ledger.all().some((e) => e.kind === "OVERRIDE" && e.flags["demoOverride"] === true),
    ).toBe(true);
    expect(rig.payouts.enqueueCalls).toHaveLength(1);
    const dec = await rig.shell("GET", `/api/jobs/${f.jobId}/decision`);
    expect(dec.json.status).toBe("DELIVER");
    expect(dec.json.reportMd).toContain("operator override");
  });

  it("payout operator paths: FAILED_FINAL -> retry -> confirmed; mark-paid", async () => {
    await open();
    rig.payouts.failNext(1);
    const { taskId } = await rig.flow();
    const p = rig.store.payouts.all()[0];
    expect(p?.state).toBe("FAILED_FINAL");
    expect(rig.store.tasks.get(taskId as never)?.state).toBe("ACCEPTED");
    const retry = await rig.admin("POST", `/api/admin/payouts/${p?.id}/retry`);
    expect(retry.status).toBe(200);
    await rig.engine.idle();
    expect(rig.store.payouts.get(p?.id as never)?.state).toBe("CONFIRMED");
    expect(rig.store.tasks.get(taskId as never)?.state).toBe("PAID");
    const bad = await rig.admin("POST", `/api/admin/payouts/${p?.id}/retry`);
    expect(bad.status).toBe(409); // CONFIRMED has no retry

    rig.payouts.failNext(1);
    const f2 = await rig.flow();
    const p2 = rig.store.payouts.all().find((x) => x.taskId === f2.taskId);
    const paid = await rig.admin("POST", `/api/admin/payouts/${p2?.id}/mark-paid`, {
      txHash: "d".repeat(64),
    });
    expect(paid.status).toBe(200);
    expect(rig.store.tasks.get(f2.taskId as never)?.state).toBe("PAID");
    expect(
      rig.ledger
        .all()
        .some((e) => e.kind === "PAYOUT_MARKED_PAID" && e.flags["operatorMarkedPaid"]),
    ).toBe(true);
  });
});

describe("upload pipeline", () => {
  it("strips EXIF/COM/trailing data before storage and flags exifPresent", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const res = await rig.submit(taskId, c.json.claim.id, {
      imageBase64: photoB64("", { exif: true, trailing: true }),
    });
    expect(res.status).toBe(202);
    const files = readdirSync(rig.imageDir);
    expect(files).toEqual([`${res.json.submission.id}.jpg`]);
    const stored = readFileSync(join(rig.imageDir, files[0] ?? "")).toString("latin1");
    expect(stored).not.toContain("Exif");
    expect(stored).not.toContain("GPSLatitude");
    expect(stored).not.toContain("TRAILING");
    expect(stored).not.toContain("comment");
    expect(rig.store.submissions.all()[0]?.exifPresent).toBe(true);
    // the verifier receives the cleaned bytes too
    const sent = Buffer.from(rig.verify.calls[0]?.req.image.base64 ?? "", "base64").toString(
      "latin1",
    );
    await rig.engine.idle();
    expect(sent).not.toContain("Exif");
  });

  it("rejects non-JPEG, truncated, oversize and tiny images and bad base64 with nothing written", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const png = Buffer.from("89504e470d0a1a0a" + "00".repeat(64), "hex").toString("base64");
    const truncated = photoB64().slice(0, 60);
    const huge = photoB64("", { width: 30000, height: 30000 });
    const tiny = photoB64("", { width: 100, height: 100 });
    for (const [img, code] of [
      [png, "image_not_decodable"],
      [truncated.slice(0, 56), "image_not_decodable"],
      [huge, "image_not_decodable"],
      [tiny, "image_not_decodable"],
      ["not base64 !!", "image_not_decodable"],
    ] as const) {
      const r = await rig.submit(taskId, c.json.claim.id, { imageBase64: img });
      expect(r.status).toBe(422);
      expect(r.json.error.code).toBe(code);
    }
    expect(readdirSync(rig.imageDir)).toHaveLength(0);
    expect(rig.store.submissions.all()).toHaveLength(0);
  });

  it("an image over MAX_IMAGE_BYTES is 413 image_too_large", async () => {
    rig = await makeRig({ env: { MAX_IMAGE_BYTES: "2000" } });
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const big = Buffer.concat([
      Buffer.from(photoB64(), "base64"),
      Buffer.alloc(5000, 0x41),
    ]).toString("base64");
    const r = await rig.submit(taskId, c.json.claim.id, { imageBase64: big });
    expect(r.status).toBe(413);
    expect(r.json.error.code).toBe("image_too_large");
  });
});

describe("logging", () => {
  it("never logs image bytes, tokens or raw coordinates", async () => {
    await open();
    const { subId } = await rig.flow();
    expect(subId).toBe("sub_01");
    const all = rig.logs.join("\n");
    expect(all).not.toContain("ENTROPY");
    expect(all).not.toContain(photoB64().slice(0, 40));
    expect(all).not.toContain("dev-admin-token");
    expect(all).not.toContain(String(STORE_POS.lat));
    expect(all).not.toContain("addr_test1qqqq");
  });
});

describe("gesture challenge (ADR-19)", () => {
  it("claim hides the gesture; reveal is idempotent; verify gets gesture and reveal time", async () => {
    rig = await makeRig({ env: { CHALLENGE_MODE: "gesture" } });
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    expect(c.status).toBe(201);
    const claim = ClaimResponseSchema.parse(c.json);
    expect(claim.challenge.mode).toBe("gesture");
    expect(claim.challenge.code).toBe("");
    expect(JSON.stringify(c.json)).not.toMatch(/fingers/);

    rig.clock.advanceSec(20);
    const r1 = await rig.call("POST", `/api/claims/${claim.claim.id}/challenge`);
    expect(r1.status).toBe(200);
    const reveal = RevealChallengeResponseSchema.parse(r1.json);
    expect(reveal.answerWithinSec).toBe(90);
    rig.clock.advanceSec(10);
    const r2 = await rig.call("POST", `/api/claims/${claim.claim.id}/challenge`);
    expect(r2.json).toEqual(r1.json); // no re-roll, no restart of the answer window

    rig.clock.advanceSec(10);
    const s = await rig.submit(taskId, claim.claim.id, { imageBase64: photoB64() });
    expect(s.status).toBe(202);
    await rig.engine.idle();
    const req = rig.verify.calls[0]?.req;
    expect(req?.task.expectedGesture).toEqual(reveal.gesture);
    expect(req?.task.challengeRevealedAt).toBe(reveal.revealedAt);
    expect((await rig.call("GET", "/api/config")).json.challengeMode).toBe("gesture");
  });

  it("reveal refuses unknown, used and code-mode claims", async () => {
    await open();
    const job = await rig.createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await rig.claim(taskId);
    const code = await rig.call("POST", `/api/claims/${c.json.claim.id}/challenge`);
    expect(code.json.error.code).toBe("invalid_request");
    const missing = await rig.call("POST", "/api/claims/clm_nope/challenge");
    expect(missing.json.error.code).toBe("not_found");
  });
});
