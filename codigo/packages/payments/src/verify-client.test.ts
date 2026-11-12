import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { AppError, createLogger, EngineEnvSchema, loadEnv } from "@shelfie/core";
import type { VerifyRequest } from "@shelfie/core";
import { FakeVerifyClient, fakeVerdict } from "./fakes.js";
import { isRealTxHash } from "./hash.js";
import { DryVerifyClient, X402VerifyClient, createVerifyClient } from "./verify-client.js";
import { createPayoutAdapter } from "./payout-adapter.js";
import { FakePayoutAdapter } from "./fakes.js";

const logger = createLogger({ sink: () => undefined });
const REAL_HASH = "ab".repeat(32);

const req = (over: Partial<VerifyRequest> = {}): VerifyRequest => ({
  packId: "shelf-check",
  submissionId: "sub_01",
  task: {
    taskId: "tsk_01",
    product: { name: "Example Pale Ale", ean: "4000000000000", aliases: [] },
    store: { id: "s1", name: "Store A" },
    expectedCode: "K7Q-4XM",
    outcome: "OBSERVED",
    claimIssuedAt: "2026-10-30T10:00:00.000Z",
    taskWindowEndsAt: "2026-10-30T10:15:00.000Z",
    receivedAt: "2026-10-30T10:01:00.000Z",
  },
  image: { mimeType: "image/jpeg", base64: "QUJD", sha256: "a".repeat(64) },
  previousImageSha256: [],
  ...over,
});

const verdictJson = (r: VerifyRequest, pass = true) => JSON.stringify(fakeVerdict(r, { pass }));
const json = (status: number, body: string, headers: Record<string, string> = {}): Response =>
  new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
const okSettle = () => ({ transaction: REAL_HASH, success: true });

describe("FakeVerifyClient", () => {
  it("returns scripted verdicts, pays once per key, and never yields a real-looking hash", async () => {
    const fake = new FakeVerifyClient({ script: (r) => fakeVerdict(r, { pass: false }) });
    const a = await fake.verify(req(), "verify:sub_01");
    const b = await fake.verify(req(), "verify:sub_01");
    expect(a.verdict.pass).toBe(false);
    expect(a.verdict.failedGates).toEqual(["code_match"]);
    expect(b.verdict.cached).toBe(true);
    expect(b.txHash).toBe(a.txHash);
    expect(fake.paidCount).toBe(1);
    expect(isRealTxHash(a.txHash)).toBe(false);
    fake.failNext();
    await expect(fake.verify(req(), "verify:sub_02")).rejects.toBeInstanceOf(AppError);
    expect((await fake.verify(req(), "verify:sub_02")).verdict.pass).toBe(false);
  });
});

describe("DryVerifyClient (VERIFIER_PAYMENT=off)", () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.closeAllConnections();
    server?.close();
  });
  it("posts to /v1/verify-dry with the key and tokens, no tx hash", async () => {
    let seen: { url?: string; headers?: Record<string, unknown>; body?: string } = {};
    server = createServer((r, res) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => {
        seen = { url: r.url, headers: r.headers, body: Buffer.concat(chunks).toString() };
        res.setHeader("content-type", "application/json");
        res.end(verdictJson(req()));
      });
    });
    await new Promise<void>((ok) => server?.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const client = new DryVerifyClient({ verifierUrl: url, engineToken: "e-token-123", adminToken: "a-token-123", logger });
    const out = await client.verify(req(), "verify:sub_01");
    expect(seen.url).toBe("/v1/verify-dry");
    expect(seen.headers?.["idempotency-key"]).toBe("verify:sub_01");
    expect(seen.headers?.["x-admin-token"]).toBe("a-token-123");
    expect(out.verdict.pass).toBe(true);
    expect(out.txHash).toBe("dry-run:verify:sub_01");
    expect(isRealTxHash(out.txHash)).toBe(false);
  });

  it("maps verifier error bodies to AppError with the same code", async () => {
    server = createServer((_r, res) => {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: { code: "vision_unavailable", message: "x", details: {} } }));
    });
    await new Promise<void>((ok) => server?.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const err = await new DryVerifyClient({ verifierUrl: url, logger }).verify(req(), "k").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "vision_unavailable", status: 503 });
  });

  it("reports an unreachable verifier as dependency_unavailable", async () => {
    const err = await new DryVerifyClient({ verifierUrl: "http://127.0.0.1:1", logger, timeoutMs: 500 })
      .verify(req(), "k")
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "dependency_unavailable" });
  });
});

describe("X402VerifyClient", () => {
  const make = (
    handler: (input: Parameters<typeof fetch>[0], init: RequestInit | undefined, n: number) => Promise<Response>,
    wallets = 1,
  ) => {
    const calls: { wallet: string; key: string | null; at: number }[] = [];
    let n = 0;
    const client = new X402VerifyClient({
      verifierUrl: "http://127.0.0.1:4021",
      logger,
      wallets: Array.from({ length: wallets }, (_, i) => ({
        id: `vbuy-${String(i + 1)}`,
        wrap: (inner) => async (input, init) => {
          const headers = new Headers(init?.headers);
          calls.push({ wallet: `vbuy-${String(i + 1)}`, key: headers.get("idempotency-key"), at: n });
          const res = await handler(input, init, n++);
          void inner; // the real wrapper would call inner; tests answer directly
          return res;
        },
      })),
      settle: okSettle,
    });
    return { client, calls };
  };

  it("returns the verdict with the settlement tx hash and caches the receipt per key", async () => {
    const { client, calls } = make((_i, _init) => Promise.resolve(json(200, verdictJson(req()), { "payment-response": "x" })));
    const a = await client.verify(req(), "verify:sub_01");
    const b = await client.verify(req(), "verify:sub_01");
    expect(a.txHash).toBe(REAL_HASH);
    expect(isRealTxHash(a.txHash)).toBe(true);
    expect(b.verdict.cached).toBe(true);
    expect(calls).toHaveLength(1); // second call: no request, no payment
  });

  it("concurrent calls with one key share one payment", async () => {
    const { client, calls } = make(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return json(200, verdictJson(req()));
    });
    await Promise.all([client.verify(req(), "verify:sub_01"), client.verify(req(), "verify:sub_01")]);
    expect(calls).toHaveLength(1);
  });

  it("serialises payments per wallet (concurrency 1)", async () => {
    let active = 0;
    let max = 0;
    const { client } = make(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return json(200, verdictJson(req()));
    });
    await Promise.all(["a", "b", "c"].map((s) => client.verify(req({ submissionId: `sub_${s}` }), `verify:sub_${s}`)));
    expect(max).toBe(1);
  });

  it("spreads load over two wallets, one payment at a time on each", async () => {
    let active = 0;
    let max = 0;
    const { client, calls } = make(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return json(200, verdictJson(req()));
    }, 2);
    await Promise.all(["a", "b", "c", "d"].map((s) => client.verify(req({ submissionId: `sub_${s}` }), `verify:sub_${s}`)));
    expect(new Set(calls.map((c) => c.wallet))).toEqual(new Set(["vbuy-1", "vbuy-2"]));
    expect(max).toBe(2);
  });

  it("a connection error before any payment is retryable with the same key", async () => {
    let first = true;
    const { client } = make(() => {
      if (first) {
        first = false;
        return Promise.reject(new TypeError("connect ECONNREFUSED"));
      }
      return Promise.resolve(json(200, verdictJson(req())));
    });
    await expect(client.verify(req(), "verify:sub_01")).rejects.toMatchObject({
      code: "dependency_unavailable",
      details: { paymentSent: false },
    });
    expect(client.uncertainKeys).toEqual([]);
    expect((await client.verify(req(), "verify:sub_01")).txHash).toBe(REAL_HASH);
  });

  it("freezes the key when a payment was sent and the connection broke (no re-sign)", async () => {
    let calls = 0;
    const client = new X402VerifyClient({
      verifierUrl: "http://127.0.0.1:4021",
      logger,
      wallets: [
        {
          id: "vbuy-1",
          wrap: (inner) => async (input, init) => {
            calls++;
            // behave like the real wrapper: the retry carries the payment header
            await inner(input, { ...init, headers: { ...(init?.headers as Record<string, string>), "payment-signature": "sig" } }).catch(() => undefined);
            throw new TypeError("socket hang up");
          },
        },
      ],
      settle: okSettle,
      fetchImpl: () => Promise.resolve(json(200, "{}")),
    });
    const err = await client.verify(req(), "verify:sub_01").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "dependency_unavailable", details: { reason: "payment_uncertain" } });
    expect(client.uncertainKeys).toEqual(["verify:sub_01"]);
    // refused without touching the wallet again
    await expect(client.verify(req(), "verify:sub_01")).rejects.toMatchObject({ details: { reason: "payment_uncertain" } });
    expect(calls).toBe(1);
    client.resolveUncertain("verify:sub_01");
    expect(client.uncertainKeys).toEqual([]);
  });

  it("maps verifier errors (handler failed, settlement cancelled) without freezing", async () => {
    const { client } = make(() =>
      Promise.resolve(json(503, JSON.stringify({ error: { code: "vision_unavailable", message: "x", details: {} } }))),
    );
    await expect(client.verify(req(), "verify:sub_01")).rejects.toMatchObject({ code: "vision_unavailable", status: 503 });
    expect(client.uncertainKeys).toEqual([]);
  });

  it("a final 402 is payment_required and is not retried", async () => {
    const { client, calls } = make(() => Promise.resolve(json(402, "{}")));
    await expect(client.verify(req(), "verify:sub_01")).rejects.toMatchObject({ code: "payment_required" });
    expect(calls).toHaveLength(1);
  });

  it("a verdict without a receipt freezes the key and returns no verdict", async () => {
    const client = new X402VerifyClient({
      verifierUrl: "http://127.0.0.1:4021",
      logger,
      wallets: [{ id: "vbuy-1", wrap: () => () => Promise.resolve(json(200, verdictJson(req()))) }],
      settle: () => {
        throw new Error("no header");
      },
    });
    await expect(client.verify(req(), "verify:sub_01")).rejects.toMatchObject({
      details: { reason: "missing_payment_receipt" },
    });
    expect(client.uncertainKeys).toHaveLength(1);
  });

  it("rejects a malformed request before any network call", async () => {
    const { client, calls } = make(() => Promise.resolve(json(200, "{}")));
    await expect(client.verify({ nope: 1 } as unknown as VerifyRequest, "k")).rejects.toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

describe("factories", () => {
  const env = (extra: Record<string, string>) => loadEnv(EngineEnvSchema, { FAKE_PAYMENTS: "true", ...extra });

  it("createVerifyClient: VERIFIER_PAYMENT=off -> dry; FAKE_PAYMENTS with payment on -> fake", () => {
    expect(createVerifyClient(env({ VERIFIER_PAYMENT: "off" }), logger)).toBeInstanceOf(DryVerifyClient);
    expect(createVerifyClient(env({ VERIFIER_PAYMENT: "on" }), logger)).toBeInstanceOf(FakeVerifyClient);
  });

  it("createVerifyClient refuses to start the real buyer without wallets", () => {
    const real = loadEnv(EngineEnvSchema, {
      FAKE_PAYMENTS: "false",
      VERIFIER_PAYMENT: "off",
      BLOCKFROST_PROJECT_ID: "preprodXXXXXXXXXX",
      PAY_MNEMONIC_1: "x",
    });
    expect(() => createVerifyClient({ ...real, VERIFIER_PAYMENT: "on" }, logger)).toThrow(/not configured/);
  });

  it("createPayoutAdapter: FAKE_PAYMENTS -> fake; real mode without wallet -> clear error", () => {
    expect(createPayoutAdapter(env({}), logger)).toBeInstanceOf(FakePayoutAdapter);
    const real = { FAKE_PAYMENTS: false, BLOCKFROST_PROJECT_ID: undefined, PAY_MNEMONIC_1: undefined, PAY_MNEMONIC_2: undefined };
    expect(() => createPayoutAdapter(real, logger)).toThrow(/not configured/);
    expect(() => createPayoutAdapter({ ...real, PAY_MNEMONIC_1: "x" }, logger)).toThrow(/BLOCKFROST_PROJECT_ID/);
  });
});
