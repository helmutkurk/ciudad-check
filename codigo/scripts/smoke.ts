/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- test and smoke code reads untyped JSON responses */
// End-to-end smoke (repo-layout section 4) against a RUNNING engine on fakes.
//   terminal 1: npm run dev -w @shelfie/engine
//   terminal 2: npx tsx scripts/smoke.ts            (from codigo/)
// Env (all optional): ENGINE_URL (default http://127.0.0.1:4000), ADMIN_TOKEN and SHELL_TOKEN
// (dev defaults are used when unset; the engine only accepts them outside production),
// CATALOG_DIR (to read store coordinates; default ../investigacion/catalogo).
// Exit code 0 = every assertion passed, 1 = at least one failed. Tokens are never printed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GENESIS_HASH, entryHash } from "@shelfie/evidence";
import { loadEnv, SmokeEnvSchema } from "@shelfie/core";
import type { LedgerEvent } from "@shelfie/core";

const env = loadEnv(SmokeEnvSchema);
const BASE = env.ENGINE_URL.replace(/\/$/, "");
const ADMIN = env.ADMIN_TOKEN;
const SHELL = env.SHELL_TOKEN;
const CATALOG_DIR =
  env.CATALOG_DIR ?? fileURLToPath(new URL("../../investigacion/catalogo/", import.meta.url));
const RUN = Date.now().toString(36);
const CENTRE = { lat: 48.137, lon: 11.575 }; // Munich centre: passes the city check, not at a store

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    process.stdout.write(`PASS ${name}\n`);
  } else {
    failures++;
    process.stdout.write(
      `FAIL ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail).slice(0, 300)}` : ""}\n`,
    );
  }
}

interface Res {
  status: number;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Res> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(40_000),
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get("retry-after") ?? "10");
      process.stdout.write(`... rate limited, waiting ${wait}s\n`);
      await new Promise((r) => setTimeout(r, Math.min(wait, 70) * 1000 + 250));
      continue;
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json };
  }
  throw new Error("unreachable");
}
const shell = (m: string, p: string, b?: unknown): Promise<Res> =>
  call(m, p, b, { "x-shell-token": SHELL });
const admin = (m: string, p: string, b?: unknown): Promise<Res> =>
  call(m, p, b, { "x-admin-token": ADMIN });

/** Synthetic JPEG (SOI, SOF0 1600x1200, SOS, EOI). The fake verifier reads markers from the tag. */
function jpeg(tag: string): string {
  const u16 = (n: number): Buffer => Buffer.from([(n >> 8) & 0xff, n & 0xff]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xc0]),
    u16(17),
    Buffer.from([8]),
    u16(1200),
    u16(1600),
    Buffer.from([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    Buffer.from([0xff, 0xda]),
    u16(12),
    Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]),
    Buffer.from(`SMOKE ${RUN} ${tag} ${"x".repeat(64)}`, "latin1"),
    Buffer.from([0xff, 0xd9]),
  ]).toString("base64");
}

const wait = async <T>(
  fn: () => Promise<T | null | undefined | false>,
  ms = 15_000,
): Promise<T | null> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
};

interface Pick {
  storeId: string;
  ean: string;
  lat: number;
  lon: number;
}

async function pickCatalogEntry(): Promise<Pick> {
  const cat = await call("GET", "/api/catalog");
  const city = cat.json?.cities?.[0];
  const stores: { id: string }[] = city?.stores ?? [];
  const products: { ean: string }[] = city?.products ?? [];
  const coords = JSON.parse(readFileSync(join(CATALOG_DIR, "stores.json"), "utf8")) as {
    id: string;
    lat: number;
    lon: number;
  }[];
  for (const s of stores) {
    const c = coords.find((x) => x.id === s.id);
    const p = products[0];
    if (c && p) return { storeId: s.id, ean: p.ean, lat: c.lat, lon: c.lon };
  }
  throw new Error("no usable store/product in /api/catalog (is CATALOG_DIR right?)");
}

let counter = 0;
function newWorker(): { workerId: string; payoutAddress: string } {
  counter++;
  return {
    workerId: `wrk_smoke${RUN}${counter}`,
    payoutAddress: `addr_test1${"q".repeat(46)}${String(counter)
      .padStart(4, "0")
      .replace(/\d/g, (d) => "abcdefghij"[Number(d)] ?? "a")}`,
  };
}

async function createJob(p: Pick, tag: string, over: Record<string, unknown> = {}): Promise<Res> {
  return shell("POST", "/api/jobs", {
    packId: "shelf-check",
    source: "demo",
    externalRef: `smoke-${RUN}-${tag}`,
    input: { productEan: p.ean, stores: [{ id: p.storeId }], k: 1 },
    ...over,
  });
}

async function claimAndSubmit(
  p: Pick,
  taskId: string,
  opts: { tag: string; outcome?: "OBSERVED" | "OUT_OF_STOCK"; at?: { lat: number; lon: number } },
): Promise<{ claim: Res; sub: Res | null; claimId: string }> {
  const w = newWorker();
  const claim = await call("POST", `/api/tasks/${taskId}/claim`, {
    ...w,
    displayName: "Smoke",
    location: { ...CENTRE, accuracyM: 500 },
  });
  const claimId = claim.json?.claim?.id as string;
  if (claim.status !== 201) return { claim, sub: null, claimId };
  // gesture mode (ADR-19): reveal the hand sign first, as the worker app does on camera open
  if (claim.json?.challenge?.mode === "gesture") {
    await call("POST", `/api/claims/${claimId}/challenge`, {});
  }
  const sub = await call("POST", `/api/tasks/${taskId}/submissions`, {
    claimId,
    outcome: opts.outcome ?? "OBSERVED",
    imageBase64: jpeg(opts.tag),
    mimeType: "image/jpeg",
    location: { ...(opts.at ?? { lat: p.lat, lon: p.lon }), accuracyM: 15, fixAgeMs: 800 },
    clientMeta: {
      captureMode: "getUserMedia",
      width: 1600,
      height: 1200,
      streamStartedToShutterMs: 6000,
      deviceLabelPresent: true,
    },
  });
  return { claim, sub, claimId };
}

async function settled(subId: string): Promise<Res["json"]> {
  return wait(async () => {
    const r = await call("GET", `/api/submissions/${subId}`);
    return r.json && r.json.state !== "VERIFYING" && r.json.state !== "RECEIVED" ? r.json : null;
  });
}

async function verifyLedgerChain(): Promise<void> {
  const all: LedgerEvent[] = [];
  let after = 0;
  for (;;) {
    const r = await call("GET", `/api/ledger?afterSeq=${after}&limit=500`);
    const page = (r.json?.entries ?? []) as LedgerEvent[];
    if (page.length === 0) break;
    all.push(...page);
    after = page[page.length - 1]?.seq ?? after;
  }
  let prev = GENESIS_HASH;
  let ok = all.length > 0;
  for (let i = 0; i < all.length; i++) {
    const e = all[i] as LedgerEvent;
    if (e.seq !== i + 1 || e.prevHash !== prev) ok = false;
    prev = entryHash(e);
  }
  check(`ledger chain intact via API (${all.length} entries)`, ok);
}

async function main(): Promise<void> {
  process.stdout.write(`smoke against ${BASE} (run ${RUN})\n`);
  const health = await call("GET", "/api/health");
  check("health ok", health.status === 200 && health.json?.ok === true, health.json);
  const fakes = health.json?.fakes;
  check(
    "engine runs on fakes (FAKE_PAYMENTS=1)",
    fakes?.payments === true && fakes?.verifier === true,
    fakes,
  );
  if (fakes?.payments !== true || fakes?.verifier !== true) {
    process.stdout.write(
      "Refusing to continue: the smoke drives fake verdicts and must not run against real payments.\n",
    );
    process.exit(1);
  }
  const p = await pickCatalogEntry();

  // ---- A: wrong code (FAIL, no payout, attempts left), then a valid photo (PASS, one payout, DELIVER)
  const a = await createJob(p, "A");
  check("A: job created", a.status === 201 && a.json?.job?.state === "COLLECTING", a.json);
  const aJob = a.json.job.id as string;
  const aTask = a.json.tasks[0].id as string;
  const dup = await createJob(p, "A");
  check(
    "A: duplicate create is idempotent (200, same job)",
    dup.status === 200 && dup.json?.job?.id === aJob,
    dup.json,
  );

  const wrong = await claimAndSubmit(p, aTask, { tag: "STUB_VERDICT=FAIL_CODE wrong" });
  check(
    "A: wrong-code photo accepted for verification (202)",
    wrong.sub?.status === 202,
    wrong.sub?.json,
  );
  const wrongView = wrong.sub ? await settled(wrong.sub.json.submission.id) : null;
  check(
    "A: wrong code -> REJECTED with code_match",
    wrongView?.state === "REJECTED" && wrongView?.verdict?.failedGates?.includes("code_match"),
    wrongView,
  );
  check(
    "A: attempts left after the failure",
    wrongView?.task?.attemptsLeft === 2 && wrongView?.task?.state === "OPEN",
    wrongView?.task,
  );
  const noPay = await call("GET", `/api/payouts?jobId=${aJob}`);
  check("A: no payout after the failed photo", noPay.json?.payouts?.length === 0, noPay.json);

  const good = await claimAndSubmit(p, aTask, { tag: "valid" });
  check("A: valid photo accepted (202)", good.sub?.status === 202, good.sub?.json);
  const subId = good.sub?.json?.submission?.id as string;
  const goodView = good.sub ? await settled(subId) : null;
  check(
    "A: valid photo -> PASSED",
    goodView?.state === "PASSED" && goodView?.verdict?.pass === true,
    goodView,
  );
  const again = await call("POST", `/api/tasks/${aTask}/submissions`, {
    claimId: good.claimId,
    outcome: "OBSERVED",
    imageBase64: jpeg("valid"), // same bytes as the first valid upload
    mimeType: "image/jpeg",
    location: { lat: p.lat, lon: p.lon, accuracyM: 15, fixAgeMs: 800 },
    clientMeta: { captureMode: "getUserMedia" },
  });
  check(
    "A: duplicate submit returns the same submission or a clean refusal",
    again.status === 202
      ? again.json?.submission?.id === subId
      : again.status === 409 || again.status === 422,
    again.json,
  );
  const paid = await wait(async () => {
    const r = await call("GET", `/api/payouts?jobId=${aJob}`);
    return r.json?.payouts?.length === 1 && r.json.payouts[0].state === "CONFIRMED"
      ? r.json.payouts
      : null;
  });
  check("A: exactly one payout, CONFIRMED (fake)", paid?.length === 1, paid);
  const decA = await shell("GET", `/api/jobs/${aJob}/decision?waitSec=15`);
  check(
    "A: decision DELIVER with report",
    decA.json?.status === "DELIVER" &&
      typeof decA.json?.reportMd === "string" &&
      decA.json.reportMd.length > 0,
    decA.json,
  );

  // ---- B: out-of-stock observation (PASS OUT_OF_STOCK, one payout, report says out of stock)
  const b = await createJob(p, "B");
  const bTask = b.json.tasks[0].id as string;
  const oos = await claimAndSubmit(p, bTask, { tag: "oos", outcome: "OUT_OF_STOCK" });
  const oosView = oos.sub ? await settled(oos.sub.json.submission.id) : null;
  check(
    "B: out-of-stock photo -> PASSED OUT_OF_STOCK",
    oosView?.state === "PASSED" && oosView?.verdict?.outcome === "OUT_OF_STOCK",
    oosView,
  );
  const bPay = await wait(async () => {
    const r = await call("GET", `/api/payouts?jobId=${b.json.job.id}`);
    return r.json?.payouts?.length === 1 ? r.json.payouts : null;
  });
  check("B: exactly one payout", bPay?.length === 1, bPay);
  const decB = await shell("GET", `/api/jobs/${b.json.job.id}/decision?waitSec=15`);
  check(
    "B: DELIVER, outcomes OUT_OF_STOCK, report says out of stock",
    decB.json?.status === "DELIVER" &&
      decB.json?.outcomes?.[0] === "OUT_OF_STOCK" &&
      /out of stock/i.test(decB.json?.reportMd ?? ""),
    decB.json,
  );

  // ---- C: submission far from the store (422 location_mismatch, no verify tx)
  const verifyTxBefore = (
    (await call("GET", "/api/ledger?afterSeq=0&limit=1000")).json?.entries ?? []
  ).filter((e: LedgerEvent) => e.kind === "VERIFY_PAID").length;
  const c = await createJob(p, "C");
  const cTask = c.json.tasks[0].id as string;
  const far = await claimAndSubmit(p, cTask, { tag: "far", at: CENTRE });
  check(
    "C: far-away submission -> 422 location_mismatch",
    far.sub?.status === 422 && far.sub?.json?.error?.code === "location_mismatch",
    far.sub?.json,
  );
  const verifyTxAfter = (
    (await call("GET", "/api/ledger?afterSeq=0&limit=1000")).json?.entries ?? []
  ).filter((e: LedgerEvent) => e.kind === "VERIFY_PAID").length;
  check("C: no verify tx was created", verifyTxAfter === verifyTxBefore, {
    verifyTxBefore,
    verifyTxAfter,
  });
  await call("POST", `/api/claims/${far.claimId}/release`);
  const cancel = await admin("POST", `/api/jobs/${c.json.job.id}/cancel`);
  check("C: demo job cleaned up (admin cancel)", cancel.status === 200, cancel.json);

  // ---- D: out-of-catalog job (422 intake_rejected, no task)
  const open0 = (
    (await call("GET", `/api/tasks?lat=${CENTRE.lat}&lon=${CENTRE.lon}`)).json?.tasks ?? []
  ).length;
  const d = await createJob(p, "D", {
    input: { productEan: p.ean, stores: [{ id: "no-such-store" }], k: 1 },
  });
  check(
    "D: unknown store -> 422 intake_rejected",
    d.status === 422 && d.json?.error?.code === "intake_rejected",
    d.json,
  );
  const open1 = (
    (await call("GET", `/api/tasks?lat=${CENTRE.lat}&lon=${CENTRE.lon}`)).json?.tasks ?? []
  ).length;
  check("D: no task was created", open1 === open0, { open0, open1 });
  const free = await createJob(p, "E", {
    input: { productEan: p.ean, stores: [{ id: p.storeId, name: "Free Text Store" }] },
  });
  check(
    "E: free-text store name -> 422 input_schema_violation",
    free.status === 422 && free.json?.error?.code === "input_schema_violation",
    free.json,
  );

  await verifyLedgerChain();

  if (failures > 0) {
    process.stdout.write(`\nSMOKE FAILED: ${failures} assertion(s)\n`);
    process.exit(1);
  }
  process.stdout.write("\nSMOKE OK\n");
}

main().catch((err: unknown) => {
  process.stdout.write(`SMOKE ERROR: ${err instanceof Error ? err.message : "unknown"}\n`);
  process.exit(1);
});
