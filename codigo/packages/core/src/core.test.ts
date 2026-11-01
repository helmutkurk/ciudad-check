import { describe, expect, it } from "vitest";
import {
  AppError,
  BrandProfileSchema,
  CHALLENGE_ALPHABET,
  brandAccounts,
  ClaimRequestSchema,
  CreateJobRequestSchema,
  DecisionResponseSchema,
  EngineEnvSchema,
  ERROR_CODES,
  ERROR_STATUS,
  ErrorBodySchema,
  FakeClock,
  FeedEventSchema,
  JobSchema,
  LedgerEventSchema,
  PackConfigSchema,
  SequentialIdGenerator,
  ShellBridgeEnvSchema,
  SharedEnvSchema,
  VerifierEnvSchema,
  VerifyRequestSchema,
  VerifyResponseSchema,
  WebEnvSchema,
  collectSecretValues,
  createLogger,
  gatesFor,
  GestureChallengeSchema,
  makeGestureChallenge,
  loadEnv,
  lovelaceToAdaString,
  makeChallengeCode,
  newJobId,
  newTaskId,
  normalizeChallengeCode,
  parseOrThrow,
  randomIdGenerator,
  redact,
  type VerifyResponse,
} from "./index.js";

const SHA = "a".repeat(64);

describe("ids and clock", () => {
  it("sequential generator is deterministic and per prefix", () => {
    const a = new SequentialIdGenerator();
    const b = new SequentialIdGenerator();
    expect([newJobId(a), newJobId(a), newTaskId(a)]).toEqual(["job_01", "job_02", "tsk_01"]);
    expect([newJobId(b), newJobId(b)]).toEqual(["job_01", "job_02"]);
  });

  it("random generator yields valid, distinct ids", () => {
    const x = newJobId(randomIdGenerator);
    const y = newJobId(randomIdGenerator);
    expect(x).not.toBe(y);
    expect(x).toMatch(/^job_[0-9a-f]{12}$/);
  });

  it("challenge code uses the safe alphabet and is deterministic with an injected rng", () => {
    let i = 0;
    const code = makeChallengeCode(() => i++ % CHALLENGE_ALPHABET.length);
    expect(code).toBe("ABC-DEF");
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(CHALLENGE_ALPHABET).not.toMatch(/[01OIL]/);
    expect(normalizeChallengeCode(" abc-def ")).toBe("ABCDEF");
  });

  it("fake clock advances on demand", () => {
    const c = new FakeClock("2026-10-30T09:00:00.000Z");
    c.advanceSec(90);
    expect(c.nowIso()).toBe("2026-10-30T09:01:30.000Z");
    expect(c.now().getTime()).toBe(c.nowMs());
  });
});

describe("errors", () => {
  it("status defaults come from the table and round-trip through the body schema", () => {
    const err = new AppError("claim_expired", "Claim expired, claim the task again.");
    expect(err.status).toBe(409);
    const body = ErrorBodySchema.parse(JSON.parse(JSON.stringify(err.toBody())));
    expect(body.error.code).toBe("claim_expired");
    expect(body.error.details).toEqual({});
  });

  it("covers every code named in contracts.md", () => {
    const named = [
      "invalid_request",
      "unauthorized",
      "not_found",
      "task_not_open",
      "claim_expired",
      "already_submitted",
      "image_too_large",
      "unprocessable",
      "rate_limited",
      "internal",
      "dependency_unavailable",
      "input_schema_violation",
      "intake_rejected",
      "location_required",
      "wrong_city",
      "claim_already_active",
      "invalid_payout_address",
      "claim_window_closed",
      "location_mismatch",
      "location_inaccurate",
      "capture_mode_not_allowed",
      "image_not_decodable",
      "duplicate_image",
      "override_disabled",
      "vision_unavailable",
    ];
    for (const c of named) expect(ERROR_CODES).toContain(c);
    expect(ERROR_STATUS.capture_mode_not_allowed).toBe(422);
    expect(ERROR_STATUS.wrong_city).toBe(403);
    expect(ERROR_STATUS.vision_unavailable).toBe(503);
    expect(ERROR_STATUS.image_too_large).toBe(413);
  });

  it("parseOrThrow maps zod failures to 422 input_schema_violation", () => {
    try {
      parseOrThrow(CreateJobRequestSchema, { packId: "x" });
      expect.unreachable();
    } catch (e) {
      expect((e as AppError).code).toBe("input_schema_violation");
      expect((e as AppError).status).toBe(422);
    }
  });
});

describe("schema round-trips", () => {
  it("create job request: ids only, free text rejected", () => {
    const ok = {
      packId: "shelf-check",
      source: "shell",
      externalRef: "sokosumi-1",
      input: { productEan: "4000000000000", stores: [{ id: "s1" }], k: 1 },
      windowSec: 900,
    };
    expect(CreateJobRequestSchema.parse(ok)).toEqual(ok);
    const withText = {
      ...ok,
      input: { ...ok.input, stores: [{ id: "s1", name: "Store A" }] },
    };
    expect(CreateJobRequestSchema.safeParse(withText).success).toBe(false);
    const withProduct = { ...ok, input: { ...ok.input, product: { name: "x" } } };
    expect(CreateJobRequestSchema.safeParse(withProduct).success).toBe(false);
  });

  it("job entity", () => {
    const job = {
      id: "job_01",
      packId: "shelf-check",
      input: { productEan: "4000000000000", stores: [{ id: "s1" }] },
      source: "demo",
      externalRef: "demo-uuid",
      k: 1,
      n: 1,
      windowEndsAt: "2026-10-30T10:00:00.000Z",
      state: "COLLECTING",
      decision: null,
      reportMd: null,
      createdAt: "2026-10-30T09:45:00.000Z",
    };
    expect(JobSchema.parse(job)).toEqual(job);
    expect(JobSchema.safeParse({ ...job, state: "BOGUS" }).success).toBe(false);
  });

  it("claim request needs a worker id and accepts a missing location (engine maps to 403)", () => {
    const req = {
      workerId: "wrk_abc",
      displayName: "Anna",
      payoutAddress: "addr_test1qqqqqqqqqqqqqqqqqqqqqqqq",
      location: { lat: 48.14, lon: 11.58, accuracyM: 800 },
    };
    expect(ClaimRequestSchema.parse(req)).toEqual(req);
    expect(ClaimRequestSchema.safeParse({ ...req, workerId: "abc" }).success).toBe(false);
  });

  it("decision union", () => {
    for (const d of [
      { jobId: "job_01", status: "PENDING" },
      {
        jobId: "job_01",
        status: "DELIVER",
        outcomes: ["OBSERVED"],
        passed: 1,
        k: 1,
        n: 1,
        reportMd: "# Shelf check",
        reportSha256: SHA,
      },
      { jobId: "job_01", status: "WITHHOLD", passed: 0, k: 1, n: 1, reason: "no_passing_photo" },
    ]) {
      expect(DecisionResponseSchema.parse(d)).toEqual(d);
    }
  });

  it("feed events", () => {
    const closed = { type: "task_closed", taskId: "tsk_01", reason: "claimed" };
    expect(FeedEventSchema.parse(closed)).toEqual(closed);
    expect(
      FeedEventSchema.safeParse({ type: "task_closed", taskId: "tsk_01", reason: "x" }).success,
    ).toBe(false);
  });

  it("verify request and response", () => {
    const req = {
      packId: "shelf-check",
      submissionId: "sub_01",
      task: {
        taskId: "tsk_01",
        product: { name: "Example Pale Ale 0.33l", ean: "4000000000000", aliases: ["example"] },
        store: { id: "s1", name: "Store A" },
        expectedCode: "K7Q-4XM",
        outcome: "OBSERVED",
        claimIssuedAt: "2026-10-30T09:00:00.000Z",
        taskWindowEndsAt: "2026-10-30T09:15:00.000Z",
        receivedAt: "2026-10-30T09:02:00.000Z",
      },
      image: { mimeType: "image/jpeg", base64: "AAAA", sha256: SHA },
      previousImageSha256: [],
    };
    expect(VerifyRequestSchema.parse(req)).toEqual(req);
    const res: VerifyResponse = {
      submissionId: "sub_01",
      outcome: "OBSERVED",
      pass: false,
      gates: [
        { name: "image_ok", pass: true },
        {
          name: "code_match",
          pass: false,
          reasonCode: "code_mismatch",
          detail: { expected: "K7Q-4XM", seen: "K7Q-4XN" },
        },
      ],
      failedGates: ["code_match"],
      extraction: {},
      workerMessage: "We could not read the code K7Q-4XM in your photo.",
      model: { provider: "env", id: "env", latencyMs: 3100 },
      cached: false,
    };
    expect(VerifyResponseSchema.parse(res)).toEqual(res);
    expect(
      VerifyResponseSchema.safeParse({ ...res, gates: [{ name: "x", pass: true }] }).success,
    ).toBe(false);
  });

  it("gate sets per outcome", () => {
    expect(gatesFor("OBSERVED")).toContain("price_sanity");
    expect(gatesFor("OUT_OF_STOCK")).toEqual([
      "image_ok",
      "code_match",
      "not_screen",
      "label_visible",
      "label_match",
      "slot_empty",
      "timing",
      "not_duplicate",
    ]);
  });

  it("gesture challenge: 2-5 fingers, left or right, strict", () => {
    let i = 0;
    const seq = [0, 0, 3, 1];
    const g1 = makeGestureChallenge(() => seq[i++] ?? 0);
    const g2 = makeGestureChallenge(() => seq[i++] ?? 0);
    expect(g1).toEqual({ fingers: 2, side: "left" });
    expect(g2).toEqual({ fingers: 5, side: "right" });
    expect(GestureChallengeSchema.safeParse(g2).success).toBe(true);
    expect(GestureChallengeSchema.safeParse({ fingers: 1, side: "left" }).success).toBe(false);
    expect(GestureChallengeSchema.safeParse({ fingers: 6, side: "left" }).success).toBe(false);
    expect(GestureChallengeSchema.safeParse({ fingers: 3, side: "up" }).success).toBe(false);
    expect(GestureChallengeSchema.safeParse({ fingers: 3, side: "left", x: 1 }).success).toBe(
      false,
    );
  });

  it("ledger event", () => {
    const e = {
      seq: 1,
      ts: "2026-10-30T09:00:00.000Z",
      kind: "PAYOUT_QUEUED",
      refs: { taskId: "tsk_01" },
      payloadHash: "ab",
      prevHash: "00",
      note: "",
      flags: {},
    };
    expect(LedgerEventSchema.parse(e)).toEqual(e);
  });

  it("pack config from contracts section 6", () => {
    const pack = {
      id: "shelf-check",
      version: "1",
      jobInputSchemaRef: "./schemas/job-input.schema.json",
      worker: {
        kind: "human",
        capture: "photo",
        challenge: {
          mode: "handwritten",
          alphabet: CHALLENGE_ALPHABET,
          length: 6,
          ttlSec: 300,
          cardPool: null,
        },
        maxAttempts: 3,
        instructions: ["Find the product"],
      },
      extraction: { promptRef: "./p.md", outputSchemaRef: "./s.json", imageRequired: true },
      rules: [{ name: "image_ok", params: { minWidth: 800 } }],
      outOfStock: {
        enabled: true,
        rules: [{ name: "slot_empty", params: {} }],
        payoutLovelace: "3000000",
        reportTemplateRef: "./oos.md.hbs",
      },
      location: {
        defaultGeofenceM: 150,
        accuracyCapM: 100,
        maxAccuracyM: 300,
        maxFixAgeMs: 30000,
        maxTries: 3,
      },
      payout: { amountLovelace: "3000000", perTask: true },
      jobInput: {
        idsOnly: true,
        maxStores: 1,
        catalogs: { stores: "./catalog/stores.json", products: "./catalog/products.json" },
        city: "Munich",
      },
      settlement: { rule: "k-of-n", kDefault: "n", earlyDeliver: false },
      report: { templateRef: "./r.md.hbs", columns: ["store", "price"] },
      ui: { claimButton: "Take this task" },
    };
    expect(PackConfigSchema.parse(pack)).toEqual(pack);
  });

  it("lovelace helper", () => {
    expect(lovelaceToAdaString("3000000")).toBe("3");
    expect(lovelaceToAdaString("1170000")).toBe("1.17");
  });
});

describe("env loader", () => {
  it("fake mode runs with an empty environment", () => {
    const env = loadEnv(EngineEnvSchema, { FAKE_PAYMENTS: "1" });
    expect(env.FAKE_PAYMENTS).toBe(true);
    expect(env.NETWORK).toBe("preprod");
    expect(env.ENGINE_PORT).toBe(4000);
    expect(env.JOB_WINDOW_SEC).toBe(900);
    expect(env.ADMIN_TOKEN).toBe("dev-admin-token");
    expect(env.VERIFIER_PAYMENT).toBe("off");
  });

  it("treats blank values (a copied .env.example) as unset", () => {
    const env = loadEnv(EngineEnvSchema, { FAKE_PAYMENTS: "1", ENGINE_PORT: "", NETWORK: "" });
    expect(env.ENGINE_PORT).toBe(4000);
  });

  it("refuses mainnet without echoing the value", () => {
    const run = () => loadEnv(SharedEnvSchema, { NETWORK: "mainnet-secret-marker" });
    expect(run).toThrow(AppError);
    try {
      run();
    } catch (e) {
      const text = JSON.stringify([(e as AppError).message, (e as AppError).details]);
      expect(text).toContain("NETWORK");
      expect(text).toContain("preprod");
      expect(text).not.toContain("mainnet-secret-marker");
    }
  });

  it("refuses a mainnet seller address and blockfrost project", () => {
    const base = { ENABLE_DRY: "true" };
    expect(() => loadEnv(VerifierEnvSchema, { ...base, SELLER_ADDRESS: "addr1qxyz" })).toThrow(
      /SELLER_ADDRESS/,
    );
    expect(() =>
      loadEnv(VerifierEnvSchema, { ...base, BLOCKFROST_PROJECT_ID: "mainnetABC" }),
    ).toThrow(/BLOCKFROST_PROJECT_ID/);
  });

  it("missing required variable names the variable, never a value", () => {
    const secret = "word1 word2 word3 super-secret-mnemonic";
    try {
      loadEnv(EngineEnvSchema, { VBUY_MNEMONIC_1: secret, VERIFIER_PAYMENT: "on" });
      expect.unreachable();
    } catch (e) {
      const err = e as AppError;
      expect(err.message).toContain("PAY_MNEMONIC_1");
      expect(err.message).toContain("BLOCKFROST_PROJECT_ID");
      expect(JSON.stringify(err.details) + err.message).not.toContain("super-secret-mnemonic");
    }
  });

  it("invalid value of a present variable does not leak it", () => {
    try {
      loadEnv(EngineEnvSchema, { FAKE_PAYMENTS: "1", ENGINE_PORT: "port-leak-marker" });
      expect.unreachable();
    } catch (e) {
      const err = e as AppError;
      expect(err.message).toContain("ENGINE_PORT");
      expect(err.message + JSON.stringify(err.details)).not.toContain("port-leak-marker");
    }
  });

  it("claim window must fit in the job window", () => {
    expect(() =>
      loadEnv(EngineEnvSchema, { FAKE_PAYMENTS: "1", JOB_WINDOW_SEC: "300", CLAIM_TTL_SEC: "300" }),
    ).toThrow(/JOB_WINDOW_SEC/);
  });

  it("payout above the hard cap is refused", () => {
    expect(() =>
      loadEnv(EngineEnvSchema, { FAKE_PAYMENTS: "1", PAYOUT_LOVELACE: "9000000" }),
    ).toThrow(/PAYOUT_LOVELACE/);
  });

  it("production requires explicit tokens", () => {
    expect(() => loadEnv(SharedEnvSchema, { NODE_ENV: "production" })).toThrow(/ADMIN_TOKEN/);
  });

  it("verifier stub mode with dry endpoint needs no keys; live mode needs vision settings", () => {
    const v = loadEnv(VerifierEnvSchema, { ENABLE_DRY: "true", VERIFIER_MODE: "stub" });
    expect(v.VERIFIER_PORT).toBe(4021);
    expect(v.VERIFY_PRICE_LOVELACE).toBe("1000000");
    expect(() => loadEnv(VerifierEnvSchema, { ENABLE_DRY: "true", VERIFIER_MODE: "live" })).toThrow(
      /VISION_API_KEY/,
    );
    expect(() => loadEnv(VerifierEnvSchema, {})).toThrow(/SELLER_ADDRESS/);
  });

  it("shell bridge and web schemas have defaults", () => {
    expect(loadEnv(ShellBridgeEnvSchema, {}).SHELL_DECISION_POLL_SEC).toBe(25);
    expect(loadEnv(WebEnvSchema, { VITE_DEMO_BADGES: "true" })).toEqual({
      VITE_API_BASE: "",
      VITE_DEMO_BADGES: true,
    });
  });
});

describe("logger", () => {
  const lines: string[] = [];
  const logger = createLogger({
    level: "debug",
    clock: new FakeClock("2026-10-30T09:00:00.000Z"),
    sink: (l) => lines.push(l),
    secretValues: ["literal-secret-value"],
  });

  it("writes JSON lines with correlation fields", () => {
    lines.length = 0;
    logger.child({ component: "engine" }).info("claimed", { jobId: "job_01", taskId: "tsk_01" });
    const rec = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(rec).toMatchObject({
      ts: "2026-10-30T09:00:00.000Z",
      level: "info",
      msg: "claimed",
      component: "engine",
      jobId: "job_01",
      taskId: "tsk_01",
    });
  });

  it("redacts secret-looking keys, nested too", () => {
    lines.length = 0;
    logger.info("cfg", {
      PAY_MNEMONIC_1: "abandon abandon",
      nested: { apiKey: "k", ADMIN_TOKEN: "t", password: "p", seedPhrase: "s", client_secret: "c" },
      verifyIdempotencyKey: "verify:sub_01",
      ok: "visible",
    });
    const out = lines[0] ?? "";
    expect(out).not.toContain("abandon");
    expect(out).toContain("visible");
    expect(out).toContain("verify:sub_01");
    const rec = JSON.parse(out) as { nested: Record<string, string> };
    expect(Object.values(rec.nested)).toEqual(Array(5).fill("[REDACTED]"));
  });

  it("never logs buffers or base64 image data", () => {
    lines.length = 0;
    const b64 = "QUJD".repeat(200);
    logger.info("upload", {
      buf: Buffer.from("raw image bytes"),
      bytes: new Uint8Array(10),
      imageBase64: b64,
      caption: b64,
      dataUrl: `data:image/jpeg;base64,${b64}`,
    });
    const out = lines[0] ?? "";
    expect(out).not.toContain("QUJD");
    expect(out).not.toContain("raw image");
    expect(out).toContain("[binary 15 bytes]");
  });

  it("scrubs literal secret values inside strings and respects level", () => {
    lines.length = 0;
    logger.warn("failed with literal-secret-value inside");
    expect(lines[0]).not.toContain("literal-secret-value");
    const quiet = createLogger({ level: "error", sink: (l) => lines.push(l) });
    lines.length = 0;
    quiet.info("hidden");
    expect(lines).toHaveLength(0);
  });

  it("handles errors and circular objects", () => {
    const circ: Record<string, unknown> = {};
    circ["self"] = circ;
    const out = redact({ err: new AppError("internal", "boom", 500, { token: "x" }), circ });
    expect(JSON.stringify(out)).toContain("boom");
    expect(JSON.stringify(out)).toContain("[circular]");
    expect(JSON.stringify(out)).not.toContain('"x"');
  });

  it("collectSecretValues picks secret-looking env entries", () => {
    expect(
      collectSecretValues({ PAY_MNEMONIC_1: "abcd efgh", PORT: "4000", ADMIN_TOKEN: "tok-12345" }),
    ).toEqual(["abcd efgh", "tok-12345"]);
  });
});

describe("brand access codes (ADR-21)", () => {
  const wallet = (tag: string) => `addr_test1${tag.padEnd(60, "q")}`;
  const tokenA = "a".repeat(40);
  const tokenB = "c".repeat(40);
  const real = {
    SOKOSUMI_CLIENT: "real",
    SOKOSUMI_API_TOKEN: "synthetic-api-token",
    SOKOSUMI_COWORKER_ID: "coworker-1",
    SOKOSUMI_ORGANIZATION_SLUG: "org-slug",
    FAKE_PAYMENTS: "1",
  };
  const parse = (BRAND_ACCOUNTS: string, extra: Record<string, string> = {}) =>
    loadEnv(EngineEnvSchema, { FAKE_PAYMENTS: "1", BRAND_ACCOUNTS, ...extra });

  it("parses several brands with trimmed fields and lists them without a demo brand", () => {
    const env = parse(
      ` brand-a | Brand A |${wallet("w1")}|${tokenA} ; brand-b|Acme 2|${wallet("w2")}|${tokenB};`,
    );
    expect(brandAccounts(env)).toEqual([
      { id: "brand-a", name: "Brand A", walletAddress: wallet("w1"), token: tokenA },
      { id: "brand-b", name: "Acme 2", walletAddress: wallet("w2"), token: tokenB },
    ]);
  });

  it("maps BRAND_TOKEN to a walletless demo brand, unless an account already uses it", () => {
    const demoOnly = loadEnv(EngineEnvSchema, { FAKE_PAYMENTS: "1", BRAND_TOKEN: tokenA });
    expect(brandAccounts(demoOnly)).toEqual([
      { id: "demo", name: "Demo brand", walletAddress: null, token: tokenA },
    ]);
    const shared = parse(`brand-a|Brand A|${wallet("w1")}|${tokenA}`, { BRAND_TOKEN: tokenA });
    expect(brandAccounts(shared).map((b) => b.id)).toEqual(["brand-a"]);
    const both = parse(`brand-a|Brand A|${wallet("w1")}|${tokenA}`, { BRAND_TOKEN: tokenB });
    expect(brandAccounts(both).map((b) => b.id)).toEqual(["brand-a", "demo"]);
    expect(brandAccounts(loadEnv(EngineEnvSchema, { FAKE_PAYMENTS: "1" }))).toEqual([]);
  });

  it("refuses mainnet addresses, malformed ids, short or placeholder codes, duplicates and reserved ids", () => {
    const bad = [
      `brand-a|Brand A|addr1${"q".repeat(60)}|${tokenA}`,
      `brand-a|Brand A|addr_test1short|${tokenA}`,
      `Brand_A|Brand A|${wallet("w1")}|${tokenA}`,
      `x|Brand A|${wallet("w1")}|${tokenA}`,
      `brand-a|Brand A|${wallet("w1")}|${"a".repeat(31)}`,
      `brand-a|Brand A|${wallet("w1")}|CHANGE_ME`,
      `brand-a|Brand A|${wallet("w1")}`,
      `brand-a|Brand A|${wallet("w1")}|${tokenA}|extra`,
      `brand-a|${"n".repeat(61)}|${wallet("w1")}|${tokenA}`,
      `brand-a|Brand A|${wallet("w1")}|${tokenA};brand-a|Other|${wallet("w2")}|${tokenB}`,
      `brand-a|Brand A|${wallet("w1")}|${tokenA};brand-b|Other|${wallet("w2")}|${tokenA}`,
      `demo|Demo|${wallet("w1")}|${tokenA}`,
      ";",
    ];
    for (const value of bad) {
      let message = "";
      try {
        parse(value);
      } catch (error) {
        message = error instanceof AppError ? error.message : String(error);
      }
      expect(message, value).toContain("BRAND_ACCOUNTS");
      expect(message).not.toContain(tokenA);
      expect(message).not.toContain("addr_test1q");
      expect(message).not.toContain("addr1q");
    }
  });

  it("requires BRAND_TOKEN or BRAND_ACCOUNTS for real orders", () => {
    const missing = EngineEnvSchema.safeParse(real);
    expect(missing.success).toBe(false);
    expect(JSON.stringify(missing.error?.issues)).toContain("required for real orders");
    const ok = loadEnv(EngineEnvSchema, {
      ...real,
      BRAND_ACCOUNTS: `brand-a|Brand A|${wallet("w1")}|${tokenA}`,
    });
    expect(brandAccounts(ok)).toHaveLength(1);
  });

  it("collects brand codes as secret values for log redaction", () => {
    expect(
      collectSecretValues({ BRAND_ACCOUNTS: `brand-a|Brand A|${wallet("w1")}|${tokenA}` }),
    ).toEqual([tokenA]);
  });

  it("validates the brand profile shape", () => {
    const profile = {
      brandId: "brand-a",
      name: "Brand A",
      walletAddress: wallet("w1"),
      creditsReservedToday: 0,
      dailyCreditCap: 500,
      maxCreditsPerTask: 100,
      maxStores: 5,
      fake: true,
    };
    expect(BrandProfileSchema.parse(profile)).toEqual(profile);
    expect(() => BrandProfileSchema.parse({ ...profile, token: tokenA })).toThrow();
  });
});
