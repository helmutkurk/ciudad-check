// B-06 / security.md P5: the engine's x402 buyer never signs a payment above
// VERIFY_MAX_PRICE_LOVELACE or to a payee other than SELLER_ADDRESS.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, EngineEnvSchema, loadEnv } from "@shelfie/core";
import type { VerifyRequest } from "@shelfie/core";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import { createVerifyClient } from "./verify-client.js";

const logger = createLogger({ sink: () => undefined });
const SELLER = "addr_test1qz3edturjtvrytfy933t927942auguhd0wxkrxkdv0mumwph9ehp5qhzatv4x6rpwxs7adkwplkl2gsudfxk052frhcq3tnrpj";
const OTHER = "addr_test1qqnh8wm48f3lhjmttvxc8tqw6vk583ccshhhz7lwjawp654ppgpngcx2q5w2xrs8a2j0prh297w3x5gd4sryx566wqrsh39gsk";
// BIP-39 public test vector (no funds anywhere); never a real wallet.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const env = loadEnv(EngineEnvSchema, {
  VERIFIER_PAYMENT: "on",
  SELLER_ADDRESS: SELLER,
  FACILITATOR_URL: "https://facilitator.invalid",
  BLOCKFROST_PROJECT_ID: "preprodTestOnly",
  PAY_MNEMONIC_1: TEST_MNEMONIC,
  VBUY_MNEMONIC_1: TEST_MNEMONIC,
  VERIFY_MAX_PRICE_LOVELACE: "2000000",
});

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

/** A verifier that always asks for `amount` lovelace to `payTo`; records signed retries. */
function verifier(amount: string, payTo: string) {
  const signed: unknown[] = [];
  const fetchImpl = (input: Parameters<typeof fetch>[0]) => {
    const r = input instanceof Request ? input : new Request(input);
    if (r.headers.has("payment-signature")) signed.push(r);
    const header = encodePaymentRequiredHeader({
      x402Version: 2,
      resource: { url: "http://127.0.0.1:4021/v1/verify", description: "verify", mimeType: "application/json" },
      accepts: [
        { scheme: "exact", network: "cardano:preprod", amount, asset: "lovelace", payTo, maxTimeoutSeconds: 300, extra: {} },
      ],
    });
    return Promise.resolve(new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": header } }));
  };
  return { signed, fetchImpl };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("x402 buyer spend controls (B-06, P5)", () => {
  // Building a payment needs the chain (Blockfrost through global fetch); it is stubbed to fail,
  // so "chain contacted" means the offer passed the cap and payee checks.
  const chain = () => {
    const spy = vi.fn(() => Promise.reject(new TypeError("offline in tests")));
    vi.stubGlobal("fetch", spy);
    return spy;
  };

  it("control: an offer at the price cap to SELLER_ADDRESS gets past the checks", async () => {
    const spy = chain();
    const v = verifier("2000000", SELLER);
    const c = createVerifyClient(env, logger, { expectedPayTo: SELLER, fetchImpl: v.fetchImpl });
    await expect(c.verify(req, "verify:sub_01")).rejects.toBeDefined();
    expect(spy).toHaveBeenCalled();
    expect(v.signed).toEqual([]);
  });

  it("an offer above VERIFY_MAX_PRICE_LOVELACE is never signed (chain not even contacted)", async () => {
    const spy = chain();
    const v = verifier("2000001", SELLER);
    const c = createVerifyClient(env, logger, { expectedPayTo: SELLER, fetchImpl: v.fetchImpl });
    await expect(c.verify(req, "verify:sub_01")).rejects.toBeDefined();
    expect(spy).not.toHaveBeenCalled();
    expect(v.signed).toEqual([]);
  });

  it("an offer to a payee other than SELLER_ADDRESS is never signed", async () => {
    const spy = chain();
    const v = verifier("1000000", OTHER);
    const c = createVerifyClient(env, logger, { expectedPayTo: SELLER, fetchImpl: v.fetchImpl });
    await expect(c.verify(req, "verify:sub_01")).rejects.toBeDefined();
    expect(spy).not.toHaveBeenCalled();
    expect(v.signed).toEqual([]);
  });
});
