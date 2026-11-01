// Photo-free checks against the REAL deployed engine (D-17). Run from codigo/:
//   read -rs ADMIN_TOKEN && export ADMIN_TOKEN
//   ENGINE_URL=https://api-dev.shelfieapp.fyi npx tsx scripts/live-check.ts --store <id> --ean <ean>
// Supply 2-3 DISTINCT preprod addresses: repeated --addr <address> or WORKER_ADDRS (comma-separated).
// Optional --window <seconds> (default 600). Creates one demo-source job, then releases/cancels it.
// No fake adapters, admin-test upload or paid verification. Exit 0 = all checks pass, 1 = failure.
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  AppError,
  CancelJobResponseSchema,
  CatalogResponseSchema,
  ClaimResponseSchema,
  ConfigResponseSchema,
  CreateJobResponseSchema,
  ErrorBodySchema,
  HealthResponseSchema,
  JobViewSchema,
  LedgerListResponseSchema,
  NetworkSchema,
  PayoutAddressSchema,
  PayoutListResponseSchema,
  ReleaseClaimResponseSchema,
  RevealChallengeResponseSchema,
  SubmitPhotoResponseSchema,
  TaskListResponseSchema,
  loadEnv,
} from "@shelfie/core";
import type { LedgerEvent } from "@shelfie/core";
import { z } from "zod";

// Unlike SmokeEnvSchema, these script-local settings have NO development token fallback.
const LiveEnvSchema = z.object({
  ADMIN_TOKEN: z
    .string()
    .min(32)
    .refine((v) => v !== "CHANGE_ME"),
  NETWORK: NetworkSchema.default("preprod"),
  ENGINE_URL: z.url().default("https://api-dev.shelfieapp.fyi"),
  WORKER_ADDRS: z.string().optional(),
});

export function readOptions(args: string[], source: NodeJS.ProcessEnv = process.env) {
  const env = loadEnv(LiveEnvSchema, source);
  const { values } = parseArgs({
    args,
    options: {
      store: { type: "string", default: "rewe-81671-august-everding-strasse-20" },
      ean: { type: "string", default: "5449000000439" },
      window: { type: "string", default: "600" },
      addr: { type: "string", multiple: true },
    },
    strict: true,
    allowPositionals: false,
  });
  const base = new URL(env.ENGINE_URL);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new AppError(
      "invalid_request",
      "ENGINE_URL must be an HTTPS origin without credentials.",
    );
  const addresses = values.addr ?? env.WORKER_ADDRS?.split(",") ?? [];
  const flags = z
    .strictObject({
      store: z.string().regex(/^[a-z0-9-]{1,80}$/),
      ean: z.string().regex(/^\d{8,14}$/),
      windowSec: z.coerce.number().int().min(500).max(3600),
      addresses: z
        .array(PayoutAddressSchema)
        .min(2)
        .max(3)
        .refine((a) => new Set(a).size === a.length),
    })
    .parse({
      store: values.store,
      ean: values.ean,
      windowSec: values.window,
      addresses: addresses.map((a) => a.trim()),
    });
  return { ...flags, base: base.origin, admin: env.ADMIN_TOKEN };
}

// Valid base64, deliberately NOT a usable photo. The current engine decodes base64, checks
// location, then cleans the JPEG. If location checking is disabled this fails JPEG validation
// before SUBMISSION_RECEIVED / any paid call. Never replace it with a valid canned photo.
export const LOCATION_PROBE = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");

export function jobActivity(entries: readonly LedgerEvent[], jobId: string, taskId: string) {
  // A global VERIFY_PAID count (smoke.ts) is unsafe on a shared engine: other workers may pay.
  return entries
    .filter((e) => e.refs["jobId"] === jobId || e.refs["taskId"] === taskId)
    .filter(
      (e) =>
        ["SUBMISSION_RECEIVED", "VERIFY_PAID", "VERDICT"].includes(e.kind) ||
        e.kind.startsWith("PAYOUT_"),
    );
}

type Result = { name: string; ok: boolean; detail: string };
type Reply<T> = { status: number; data: T | null; code: string };

function client(base: string) {
  // Same JSON bodies/headers as /w's ApiClient. Worker routes currently have no session cookie
  // or token handshake; workerId is sent in the claim body (web README's deferred auth gap).
  return async <S extends z.ZodType>(
    method: "GET" | "POST",
    path: string,
    schema: S,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Reply<z.output<S>>> => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined
          ? {}
          : {
              "content-type": "application/json",
            }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error", // Never forward the operator token to a redirect target.
      signal: AbortSignal.timeout(20_000),
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = ErrorBodySchema.safeParse(json);
      return {
        status: response.status,
        data: null,
        code: error.success ? error.data.error.code : "unparsed_error",
      };
    }
    const parsed = schema.safeParse(json);
    return {
      status: response.status,
      data: parsed.success ? parsed.data : null,
      code: parsed.success ? "ok" : "unexpected_response",
    };
  };
}

const CHECKS = [
  "health ok",
  "real payments",
  "real verifier",
  "verifier up",
  "override off / HTTPS",
  "catalog selection",
  "worker profiles / local consent",
  "one job created",
  "all workers see task",
  "outside Munich refused",
  "A claims task",
  "B feed hides task",
  "B claim refused",
  "camera challenge ready",
  "far capture refused",
  "no verification / payout",
  "claim released / feed reopened",
  "B can reclaim",
  "final claims released",
  "test job cancelled",
] as const;
type CheckName = (typeof CHECKS)[number];

export async function main(): Promise<number> {
  const results = new Map<CheckName, Result>(
    CHECKS.map((name) => [name, { name, ok: false, detail: "not_run (prerequisite failed)" }]),
  );
  const check = (name: CheckName, ok: boolean, detail: string): boolean => {
    results.set(name, { name, ok, detail });
    return ok;
  };
  const must = (ok: boolean): void => {
    if (!ok) throw new AppError("invalid_request", "A prerequisite failed.");
  };
  let jobId: string | undefined;
  let taskId: string | undefined;
  const claims = new Set<string>();
  let request: ReturnType<typeof client> | undefined;
  let adminHeaders: Record<string, string> = {};
  try {
    const opts = readOptions(process.argv.slice(2));
    request = client(opts.base);
    adminHeaders = { "x-admin-token": opts.admin };
    process.stdout.write(`Live API checks: ${opts.base} (no real photo; no paid request)\n`);
    const health = await request("GET", "/api/health", HealthResponseSchema);
    const h = health.data;
    const healthy = check("health ok", health.status === 200 && h?.ok === true, health.code);
    const payments = check(
      "real payments",
      h?.fakes.payments === false,
      `fakes.payments=${String(h?.fakes.payments ?? "unknown")}`,
    );
    const verifier = check(
      "real verifier",
      h?.fakes.verifier === false,
      `fakes.verifier=${String(h?.fakes.verifier ?? "unknown")}`,
    );
    const up = check("verifier up", h?.verifier === "up", h?.verifier ?? health.code);
    must(healthy && payments && verifier && up);
    const config = await request("GET", "/api/config", ConfigResponseSchema);
    must(
      check(
        "override off / HTTPS",
        config.data?.demoOverrideEnabled === false && config.data.secureContext,
        config.code,
      ),
    );

    const catalog = await request("GET", "/api/catalog", CatalogResponseSchema);
    const city = catalog.data?.cities.find((c) => c.id === "munich");
    const store = city?.stores.find((s) => s.id === opts.store);
    must(
      check(
        "catalog selection",
        Boolean(store && city?.products.some((p) => p.ean === opts.ean)),
        catalog.code,
      ),
    );
    if (!store) throw new AppError("invalid_request", "Store is unavailable.");
    const atStore = { lat: store.lat, lon: store.lon, accuracyM: 15 };
    const feedPath = `/api/tasks?status=OPEN&lat=${store.lat}&lon=${store.lon}`;
    const workers = opts.addresses.map((payoutAddress, index) => ({
      // Mirrors shelfie.workerId / shelfie.profile / shelfie.consent, kept in memory only.
      profile: {
        workerId: `wrk_${randomUUID().replaceAll("-", "")}`,
        displayName: `Live ${index + 1}`,
        payoutAddress,
      },
      consent: "consent-v1",
      request: client(opts.base),
    }));
    const [a, b] = workers;
    if (!a || !b) throw new AppError("invalid_request", "Two workers are required.");
    check(
      "worker profiles / local consent",
      workers.every((w) => w.consent === "consent-v1"),
      workers.map((w, i) => `${i + 1}:${w.profile.payoutAddress.slice(0, 8)}...`).join(" "),
    );

    const externalRef = `live-check-${randomUUID()}`;
    // Lets the operator find an ambiguously created job after a transport/schema failure.
    process.stdout.write(`Test job reference: ${externalRef}\n`);
    const job = await request(
      "POST",
      "/api/jobs",
      CreateJobResponseSchema,
      {
        packId: "shelf-check",
        source: "demo",
        externalRef,
        input: { productEan: opts.ean, stores: [{ id: opts.store }] },
        windowSec: opts.windowSec,
      },
      adminHeaders,
    );
    // Save handles before assertions, so cleanup also runs on an unexpected state/task count.
    jobId = job.data?.job.id;
    taskId = job.data?.tasks[0]?.id;
    must(
      check(
        "one job created",
        job.status === 201 &&
          job.data?.job.state === "COLLECTING" &&
          job.data.tasks.length === 1 &&
          job.data.tasks[0]?.state === "OPEN",
        job.code,
      ),
    );
    if (!jobId || !taskId) throw new AppError("invalid_request", "Missing job handles.");
    process.stdout.write(
      `Job ${jobId}; task ${taskId}; window ends ${job.data?.job.windowEndsAt}\n`,
    );
    const claimPath = `/api/tasks/${taskId}/claim`;
    let visible = true;
    for (const w of workers) {
      const feed = await w.request("GET", feedPath, TaskListResponseSchema);
      visible =
        visible && feed.status === 200 && Boolean(feed.data?.tasks.some((t) => t.id === taskId));
    }
    must(check("all workers see task", visible, `${workers.length} independent profiles`));

    // Run while OPEN: otherwise the engine returns task_not_open before checking city.
    const outside = await b.request("POST", claimPath, ClaimResponseSchema, {
      ...b.profile,
      location: { lat: 52.52, lon: 13.405, accuracyM: 15 },
    });
    if (outside.data) claims.add(outside.data.claim.id);
    must(
      check(
        "outside Munich refused",
        outside.status === 403 && outside.code === "wrong_city",
        `HTTP ${outside.status} ${outside.code}`,
      ),
    );
    const claim = await a.request("POST", claimPath, ClaimResponseSchema, {
      ...a.profile,
      location: atStore,
    });
    if (claim.data) claims.add(claim.data.claim.id);
    must(
      check(
        "A claims task",
        claim.status === 201 && claim.data?.claim.taskId === taskId,
        claim.code,
      ),
    );
    if (!claim.data) throw new AppError("invalid_request", "No claim.");
    const claimId = claim.data.claim.id;
    const hidden = await b.request("GET", feedPath, TaskListResponseSchema);
    check(
      "B feed hides task",
      hidden.status === 200 &&
        hidden.data !== null &&
        !hidden.data.tasks.some((t) => t.id === taskId),
      hidden.code,
    );
    const lost = await b.request("POST", claimPath, ClaimResponseSchema, {
      ...b.profile,
      location: atStore,
    });
    if (lost.data) claims.add(lost.data.claim.id);
    must(
      check(
        "B claim refused",
        lost.status === 409 && lost.code === "task_not_open",
        `HTTP ${lost.status} ${lost.code}`,
      ),
    );

    if (claim.data.challenge.mode === "gesture") {
      const reveal = await a.request(
        "POST",
        `/api/claims/${claimId}/challenge`,
        RevealChallengeResponseSchema,
        {},
      );
      must(
        check(
          "camera challenge ready",
          reveal.status === 200 && reveal.data?.claimId === claimId,
          reveal.code,
        ),
      );
    } else check("camera challenge ready", true, "code supplied by claim response");

    const before = await request("GET", `/api/jobs/${jobId}`, JobViewSchema);
    // Far from every Munich store. This is a synthetic rejection probe, never photo evidence.
    const far = await a.request(
      "POST",
      `/api/tasks/${taskId}/submissions`,
      SubmitPhotoResponseSchema,
      {
        claimId,
        outcome: "OBSERVED",
        imageBase64: LOCATION_PROBE,
        mimeType: "image/jpeg",
        location: { lat: 52.52, lon: 13.405, accuracyM: 15, fixAgeMs: 0 },
        clientMeta: { captureMode: "getUserMedia" },
      },
    );
    check(
      "far capture refused",
      far.status === 422 && far.code === "location_mismatch",
      `HTTP ${far.status} ${far.code}`,
    );

    // Paginate the public dashboard ledger, matching THIS job/task; unrelated payments are fine.
    const entries: LedgerEvent[] = [];
    let cursor = 0;
    let complete = false;
    for (let page = 0; page < 100; page++) {
      const ledger = await request(
        "GET",
        `/api/ledger?afterSeq=${cursor}&limit=1000`,
        LedgerListResponseSchema,
      );
      if (!ledger.data || ledger.status !== 200) break;
      const batch = ledger.data.entries;
      if (batch.length === 0) {
        complete = true;
        break;
      }
      const next = batch[batch.length - 1]?.seq ?? cursor;
      if (next <= cursor) break;
      entries.push(...batch);
      cursor = next;
    }
    const after = await request("GET", `/api/jobs/${jobId}`, JobViewSchema);
    const payouts = await request("GET", `/api/payouts?jobId=${jobId}`, PayoutListResponseSchema);
    const attempts = before.data?.tasks.find((t) => t.id === taskId)?.attempts;
    const locationChecked = entries.some(
      (e) =>
        e.kind === "LOCATION_CHECKED" &&
        e.refs["claimId"] === claimId &&
        e.note?.startsWith("location_mismatch"),
    );
    const activity = jobActivity(entries, jobId, taskId).length;
    check(
      "no verification / payout",
      far.status === 422 &&
        far.code === "location_mismatch" &&
        complete &&
        locationChecked &&
        attempts !== undefined &&
        after.data?.tasks.find((t) => t.id === taskId)?.attempts === attempts &&
        activity === 0 &&
        payouts.data?.payouts.length === 0,
      complete
        ? `location rejection=${locationChecked}; activity=${activity}; payouts=${payouts.data?.payouts.length ?? "unknown"}; attempts=${attempts ?? "unknown"}->${after.data?.tasks.find((t) => t.id === taskId)?.attempts ?? "unknown"}`
        : "ledger unavailable/incomplete; no-payment proof unavailable",
    );

    const release = await a.request(
      "POST",
      `/api/claims/${claimId}/release`,
      ReleaseClaimResponseSchema,
      {},
    );
    if (release.data?.claim.state === "RELEASED") claims.delete(claimId);
    const reopened = await b.request("GET", feedPath, TaskListResponseSchema);
    must(
      check(
        "claim released / feed reopened",
        release.status === 200 &&
          release.data?.claim.state === "RELEASED" &&
          Boolean(reopened.data?.tasks.some((t) => t.id === taskId)),
        release.code,
      ),
    );
    const reclaim = await b.request("POST", claimPath, ClaimResponseSchema, {
      ...b.profile,
      location: atStore,
    });
    if (reclaim.data) claims.add(reclaim.data.claim.id);
    check(
      "B can reclaim",
      reclaim.status === 201 && reclaim.data?.claim.taskId === taskId,
      reclaim.code,
    );
  } catch {
    // Never print exception messages, response bodies, argv or env: they can contain secrets.
    process.stdout.write(
      "Run stopped: invalid settings, transport failure, or failed prerequisite.\n",
    );
  } finally {
    if (request) {
      let released = true;
      for (const id of claims) {
        try {
          const r = await request(
            "POST",
            `/api/claims/${id}/release`,
            ReleaseClaimResponseSchema,
            {},
          );
          released =
            released &&
            ((r.status === 200 && r.data?.claim.state === "RELEASED") ||
              r.code === "claim_expired");
        } catch {
          released = false;
        }
      }
      check(
        "final claims released",
        released && jobId !== undefined,
        released
          ? "released or already expired"
          : "release failed; wait for claim TTL / job window",
      );
      if (jobId) {
        try {
          const r = await request(
            "POST",
            `/api/jobs/${jobId}/cancel`,
            CancelJobResponseSchema,
            {},
            adminHeaders,
          );
          check(
            "test job cancelled",
            r.status === 200 && r.data?.job.state === "CANCELLED",
            `HTTP ${r.status} ${r.code}`,
          );
        } catch {
          check("test job cancelled", false, "transport failure; job window will expire");
        }
      }
    }
  }
  process.stdout.write("\nResult  Check                              Detail / error code\n");
  for (const r of results.values()) {
    process.stdout.write(`${r.ok ? "PASS" : "FAIL"}    ${r.name.padEnd(35)}${r.detail}\n`);
  }
  return [...results.values()].every((r) => r.ok) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      process.stderr.write("FAIL live-check: unexpected failure (details withheld)\n");
      process.exitCode = 1;
    });
}
