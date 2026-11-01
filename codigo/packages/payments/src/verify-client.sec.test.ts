// Security tests for the x402 buyer's double-pay guard (security.md P5): a signed payment whose
// outcome is unclear must freeze the key, never look like "nothing sent, safe to retry".
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLogger } from "@shelfie/core";
import type { VerifyRequest } from "@shelfie/core";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { fakeVerdict } from "./fakes.js";
import { X402VerifyClient } from "./verify-client.js";
import type { X402Wallet } from "./verify-client.js";

const logger = createLogger({ sink: () => undefined });
const KEY = "verify:sub_01";

const req: VerifyRequest = {
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
};

const json = (status: number, body: string): Response =>
  new Response(body, { status, headers: { "content-type": "application/json" } });

/**
 * Same call shape as @x402/fetch 2.26.0 wrapFetchWithPayment: build a Request, call
 * fetch(request) without init, then retry with fetch(signed.clone()) where the payment header
 * sits on the Request (not in init).
 */
const x402LikeWallet: X402Wallet = {
  id: "vbuy-1",
  wrap: (inner) => async (input, init) => {
    const request = new Request(input, init);
    const cloned = request.clone();
    const first = await inner(request);
    if (first.status !== 402) return first;
    cloned.headers.set("PAYMENT-SIGNATURE", "signed-payload");
    return inner(cloned.clone());
  },
};

/** Verifier double: unpaid call -> 402; the signed retry -> `paid()`. */
function client(paid: () => Promise<Response>): X402VerifyClient {
  return new X402VerifyClient({
    verifierUrl: "http://127.0.0.1:4021",
    logger,
    wallets: [x402LikeWallet],
    settle: () => ({ transaction: "ab".repeat(32), success: true }),
    fetchImpl: (input) => {
      const signed = input instanceof Request && input.headers.has("payment-signature");
      return signed ? paid() : Promise.resolve(json(402, "{}"));
    },
  });
}

describe("X402VerifyClient double-pay guard (P5)", () => {
  it("pins the library call shape: @x402/fetch calls the inner fetch with a Request and no init", async () => {
    const seen: { isRequest: boolean; init: unknown }[] = [];
    const wrapped = wrapFetchWithPayment((input, init) => {
      seen.push({ isRequest: input instanceof Request, init });
      return Promise.resolve(json(200, "{}"));
    }, new x402Client());
    await wrapped("http://127.0.0.1:4021/v1/verify", {
      method: "POST",
      headers: { a: "b" },
      body: "{}",
    });
    expect(seen).toEqual([{ isRequest: true, init: undefined }]);
  });

  it("connection drop after the signed retry freezes the key (not 'safe to retry')", async () => {
    const c = client(() => Promise.reject(new TypeError("socket hang up")));
    await expect(c.verify(req, KEY)).rejects.toMatchObject({
      details: { reason: "payment_uncertain" },
    });
    expect(c.uncertainKeys).toEqual([KEY]);
    await expect(c.verify(req, KEY)).rejects.toMatchObject({
      details: { reason: "payment_uncertain" },
    });
  });

  it("5xx without our error body after the signed retry freezes the key", async () => {
    const c = client(() => Promise.resolve(json(502, "bad gateway")));
    await expect(c.verify(req, KEY)).rejects.toMatchObject({
      details: { reason: "payment_uncertain" },
    });
    expect(c.uncertainKeys).toEqual([KEY]);
  });

  it("200 with an unreadable verdict after the signed retry freezes the key", async () => {
    const c = client(() => Promise.resolve(json(200, '{"not":"a verdict"}')));
    await expect(c.verify(req, KEY)).rejects.toMatchObject({
      details: { reason: "payment_uncertain" },
    });
    expect(c.uncertainKeys).toEqual([KEY]);
  });

  it("402 after the signed retry freezes the key (settlement may have been submitted)", async () => {
    const c = client(() => Promise.resolve(json(402, "{}")));
    await expect(c.verify(req, KEY)).rejects.toMatchObject({ details: { reason: "payment_uncertain" } });
    expect(c.uncertainKeys).toEqual([KEY]);
  });

  it("a foreign 4xx (proxy, rate limit) after the signed retry freezes the key", async () => {
    const c = client(() => Promise.resolve(json(429, "too many requests")));
    await expect(c.verify(req, KEY)).rejects.toMatchObject({ details: { reason: "payment_uncertain" } });
    expect(c.uncertainKeys).toEqual([KEY]);
  });

  it("our own error body after the signed retry means settlement was cancelled: no freeze", async () => {
    const body = JSON.stringify({ error: { code: "invalid_request", message: "bad image", details: {} } });
    const c = client(() => Promise.resolve(json(422, body)));
    await expect(c.verify(req, KEY)).rejects.toMatchObject({ code: "invalid_request" });
    expect(c.uncertainKeys).toEqual([]);
  });

  it("a failure before any signature stays retryable (no freeze)", async () => {
    const c = new X402VerifyClient({
      verifierUrl: "http://127.0.0.1:4021",
      logger,
      wallets: [x402LikeWallet],
      settle: () => ({ transaction: "ab".repeat(32), success: true }),
      fetchImpl: () => Promise.reject(new TypeError("ECONNREFUSED")),
    });
    await expect(c.verify(req, KEY)).rejects.toMatchObject({
      details: { reason: "network_or_timeout" },
    });
    expect(c.uncertainKeys).toEqual([]);
  });

  it("a paid 200 with a valid verdict still returns the receipt", async () => {
    const c = client(() =>
      Promise.resolve(json(200, JSON.stringify(fakeVerdict(req, { pass: true })))),
    );
    const r = await c.verify(req, KEY);
    expect(r.txHash).toBe("ab".repeat(32));
    expect(c.uncertainKeys).toEqual([]);
  });
});

describe("X402VerifyClient durable state (B-13)", () => {
  const dir = mkdtempSync(join(tmpdir(), "shelfie-verify-state-"));
  let n = 0;
  const statePath = (): string => join(dir, `state-${String(n++)}.json`);
  const verdict = (): Response => json(200, JSON.stringify(fakeVerdict(req, { pass: true })));
  const durable = (path: string, paid: () => Promise<Response>, calls = { n: 0 }): X402VerifyClient =>
    new X402VerifyClient({
      verifierUrl: "http://127.0.0.1:4021",
      logger,
      wallets: [x402LikeWallet],
      settle: () => ({ transaction: "ab".repeat(32), success: true }),
      statePath: path,
      fetchImpl: (input) => {
        calls.n++;
        const signed = input instanceof Request && input.headers.has("payment-signature");
        return signed ? paid() : Promise.resolve(json(402, "{}"));
      },
    });

  it("a receipt survives a restart: the same key is answered from the file, no new payment", async () => {
    const path = statePath();
    await durable(path, () => Promise.resolve(verdict())).verify(req, KEY);
    const calls = { n: 0 };
    const restarted = durable(path, () => Promise.resolve(verdict()), calls);
    const r = await restarted.verify(req, KEY);
    expect(r.txHash).toBe("ab".repeat(32));
    expect(r.verdict.cached).toBe(true);
    expect(calls.n).toBe(0);
  });

  it("an unclear key survives a restart and stays frozen", async () => {
    const path = statePath();
    const c = durable(path, () => Promise.reject(new TypeError("socket hang up")));
    await expect(c.verify(req, KEY)).rejects.toMatchObject({ details: { reason: "payment_uncertain" } });
    const calls = { n: 0 };
    const restarted = durable(path, () => Promise.resolve(verdict()), calls);
    expect(restarted.uncertainKeys).toEqual([KEY]);
    await expect(restarted.verify(req, KEY)).rejects.toMatchObject({ details: { reason: "payment_uncertain" } });
    expect(calls.n).toBe(0);
  });

  it("a crash during an attempt (write-ahead pending mark) loads the key as unclear", async () => {
    const path = statePath();
    let release: (r: Response) => void = () => undefined;
    const c = durable(path, () => new Promise<Response>((ok) => (release = ok)));
    const running = c.verify(req, KEY); // signed retry in flight, process "crashes" now
    await new Promise((r) => setTimeout(r, 20));
    const afterCrash = durable(path, () => Promise.resolve(verdict()));
    expect(afterCrash.uncertainKeys).toEqual([KEY]);
    release(verdict());
    await running;
  });

  it("a failure before signing leaves no pending mark (retry allowed after restart)", async () => {
    const path = statePath();
    const c = new X402VerifyClient({
      verifierUrl: "http://127.0.0.1:4021",
      logger,
      wallets: [x402LikeWallet],
      settle: () => ({ transaction: "ab".repeat(32), success: true }),
      statePath: path,
      fetchImpl: () => Promise.reject(new TypeError("ECONNREFUSED")),
    });
    await expect(c.verify(req, KEY)).rejects.toMatchObject({ details: { reason: "network_or_timeout" } });
    expect(durable(path, () => Promise.resolve(verdict())).uncertainKeys).toEqual([]);
  });

  it("resolveUncertain is durable", async () => {
    const path = statePath();
    const c = durable(path, () => Promise.reject(new TypeError("socket hang up")));
    await expect(c.verify(req, KEY)).rejects.toThrow();
    c.resolveUncertain(KEY);
    expect(durable(path, () => Promise.resolve(verdict())).uncertainKeys).toEqual([]);
  });

  it("a corrupt state file stops the client instead of being replaced", () => {
    const path = statePath();
    writeFileSync(path, "{not json");
    expect(() => durable(path, () => Promise.resolve(verdict()))).toThrow(/unreadable/);
    expect(readFileSync(path, "utf8")).toBe("{not json");
  });
});

describe("X402VerifyClient state write failures (B-13)", () => {
  const base = mkdtempSync(join(tmpdir(), "shelfie-verify-fail-"));
  let n = 0;
  const freshDir = (): string => {
    const d = join(base, `d${String(n++)}`);
    mkdirSync(d);
    return d;
  };
  const make = (path: string, paid: () => Promise<Response>, calls = { n: 0 }): X402VerifyClient =>
    new X402VerifyClient({
      verifierUrl: "http://127.0.0.1:4021",
      logger,
      wallets: [x402LikeWallet],
      settle: () => ({ transaction: "ab".repeat(32), success: true }),
      statePath: path,
      fetchImpl: (input) => {
        calls.n++;
        const signed = input instanceof Request && input.headers.has("payment-signature");
        return signed ? paid() : Promise.resolve(json(402, "{}"));
      },
    });

  // chmod on a directory does not block writes on Windows (NTFS ignores it); these run on Linux/CI.
  const onPosix = it.skipIf(process.platform === "win32");

  onPosix("write-ahead failure: nothing is sent, state_unwritable, no pending mark left", async () => {
    const dir = freshDir();
    chmodSync(dir, 0o500);
    const calls = { n: 0 };
    const c = make(join(dir, "state.json"), () => Promise.resolve(json(200, "{}")), calls);
    try {
      await expect(c.verify(req, KEY)).rejects.toMatchObject({ details: { reason: "state_unwritable" } });
      expect(calls.n).toBe(0);
      expect(c.uncertainKeys).toEqual([]);
    } finally {
      chmodSync(dir, 0o700);
    }
  });

  onPosix("receipt write failure after payment still returns the receipt", async () => {
    const dir = freshDir();
    const c = make(join(dir, "state.json"), () => {
      chmodSync(dir, 0o500); // the disk "fails" after the payment
      return Promise.resolve(json(200, JSON.stringify(fakeVerdict(req, { pass: true }))));
    });
    try {
      const r = await c.verify(req, KEY);
      expect(r.txHash).toBe("ab".repeat(32));
    } finally {
      chmodSync(dir, 0o700);
    }
    // the write-ahead mark on disk keeps the paid key frozen after a restart (fail closed)
    expect(make(join(dir, "state.json"), () => Promise.resolve(json(200, "{}"))).uncertainKeys).toEqual([KEY]);
  });

  it("freeze write failure still throws payment_uncertain", async () => {
    const dir = freshDir();
    const c = make(join(dir, "state.json"), () => {
      chmodSync(dir, 0o500);
      return Promise.reject(new TypeError("socket hang up"));
    });
    try {
      await expect(c.verify(req, KEY)).rejects.toMatchObject({ details: { reason: "payment_uncertain" } });
      expect(c.uncertainKeys).toEqual([KEY]);
    } finally {
      chmodSync(dir, 0o700);
    }
  });

  it("resolveUncertain is refused while an attempt for the key is running", async () => {
    const dir = freshDir();
    let release: (r: Response) => void = () => undefined;
    const c = make(join(dir, "state.json"), () => new Promise<Response>((ok) => (release = ok)));
    const running = c.verify(req, KEY);
    await new Promise((r) => setTimeout(r, 20));
    expect(() => c.resolveUncertain(KEY)).toThrow(/still running/);
    release(json(200, JSON.stringify(fakeVerdict(req, { pass: true }))));
    await running;
  });
});

describe("X402VerifyClient run spend cap (B-10, P5)", () => {
  const runCap = { runCapLovelace: "3000000", maxPerPaymentLovelace: "1000000" };
  const reqFor = (i: number): VerifyRequest => ({ ...req, submissionId: `sub_${String(i)}` });
  const keyFor = (i: number): string => `verify:sub_${String(i)}`;
  const capped = (paid: () => Promise<Response>, calls = { n: 0 }): X402VerifyClient =>
    new X402VerifyClient({
      verifierUrl: "http://127.0.0.1:4021",
      logger,
      wallets: [x402LikeWallet],
      settle: () => ({ transaction: "ab".repeat(32), success: true }),
      runCap,
      fetchImpl: (input) => {
        calls.n++;
        const signed = input instanceof Request && input.headers.has("payment-signature");
        return signed ? paid() : Promise.resolve(json(402, "{}"));
      },
    });
  const okVerdict = (r: VerifyRequest) => () => Promise.resolve(json(200, JSON.stringify(fakeVerdict(r, { pass: true }))));

  it("the payment after the cap is refused before anything is sent", async () => {
    let i = 0;
    const calls = { n: 0 };
    const c = capped(() => okVerdict(reqFor(i))(), calls);
    for (i = 1; i <= 3; i++) await c.verify(reqFor(i), keyFor(i));
    const before = calls.n;
    await expect(c.verify(reqFor(4), keyFor(4))).rejects.toMatchObject({ details: { reason: "run_cap_reached" } });
    expect(calls.n).toBe(before);
  });

  it("a cached receipt costs nothing against the cap", async () => {
    const c = capped(okVerdict(reqFor(1)));
    await c.verify(reqFor(1), keyFor(1));
    for (let k = 0; k < 5; k++) await c.verify(reqFor(1), keyFor(1));
    await c.verify(reqFor(2), keyFor(2));
    await c.verify(reqFor(3), keyFor(3));
  });

  it("an attempt that paid nothing gives its reservation back", async () => {
    let fail = true;
    let i = 0;
    const c = new X402VerifyClient({
      verifierUrl: "http://127.0.0.1:4021",
      logger,
      wallets: [x402LikeWallet],
      settle: () => ({ transaction: "ab".repeat(32), success: true }),
      runCap,
      fetchImpl: (input) => {
        if (fail) return Promise.reject(new TypeError("ECONNREFUSED")); // before any signature
        const signed = input instanceof Request && input.headers.has("payment-signature");
        return signed ? okVerdict(reqFor(i))() : Promise.resolve(json(402, "{}"));
      },
    });
    for (let k = 0; k < 5; k++) await expect(c.verify(reqFor(9), keyFor(9))).rejects.toMatchObject({ details: { reason: "network_or_timeout" } });
    fail = false;
    for (i = 1; i <= 3; i++) await c.verify(reqFor(i), keyFor(i));
  });

  it("an unclear (frozen) payment keeps its reservation: it may have been paid", async () => {
    const c = capped(() => Promise.reject(new TypeError("socket hang up")));
    for (let i = 1; i <= 3; i++) await expect(c.verify(reqFor(i), keyFor(i))).rejects.toMatchObject({ details: { reason: "payment_uncertain" } });
    await expect(c.verify(reqFor(4), keyFor(4))).rejects.toMatchObject({ details: { reason: "run_cap_reached" } });
  });
});

describe("X402VerifyClient run cap after review (B-10)", () => {
  const runCap = { runCapLovelace: "3000000", maxPerPaymentLovelace: "1000000" };
  const reqFor = (i: number): VerifyRequest => ({ ...req, submissionId: `sub_${String(i)}` });
  const keyFor = (i: number): string => `verify:sub_${String(i)}`;
  const make = (paid: (i: number) => Promise<Response>, statePath?: string): X402VerifyClient => {
    let current = 0;
    return new X402VerifyClient({
      verifierUrl: "http://127.0.0.1:4021",
      logger,
      wallets: [x402LikeWallet],
      settle: () => ({ transaction: "ab".repeat(32), success: true }),
      runCap,
      ...(statePath ? { statePath } : {}),
      fetchImpl: async (input) => {
        const r = input as Request;
        if (!r.headers.has("payment-signature")) {
          current = Number((JSON.parse(await r.clone().text()) as { submissionId: string }).submissionId.slice(4));
          return json(402, "{}");
        }
        return paid(current);
      },
    });
  };
  const ok = (i: number) => Promise.resolve(json(200, JSON.stringify(fakeVerdict(reqFor(i), { pass: true }))));

  it("the cap survives a restart: stored receipts count against it", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "shelfie-cap-")), "state.json");
    const first = make(ok, path);
    for (let i = 1; i <= 2; i++) await first.verify(reqFor(i), keyFor(i));
    const restarted = make(ok, path);
    await restarted.verify(reqFor(3), keyFor(3));
    await expect(restarted.verify(reqFor(4), keyFor(4))).rejects.toMatchObject({ details: { reason: "run_cap_reached" } });
  });

  it("our error body after signing does not give the reservation back", async () => {
    const body = JSON.stringify({ error: { code: "invalid_request", message: "bad image", details: {} } });
    const c = make(() => Promise.resolve(json(422, body)));
    for (let i = 1; i <= 3; i++) await expect(c.verify(reqFor(i), keyFor(i))).rejects.toMatchObject({ code: "invalid_request" });
    await expect(c.verify(reqFor(4), keyFor(4))).rejects.toMatchObject({ details: { reason: "run_cap_reached" } });
  });
});
