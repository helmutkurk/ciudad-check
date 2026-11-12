// One paid x402 request on PREPROD (M1, task B-03): the engine's x402 buyer (W-VBUY, spend cap,
// payee pinned to SELLER_ADDRESS) pays the running verifier for one POST /v1/verify and prints the
// settlement tx hash. Uses createVerifyClient from packages/payments, so a pass here is a pass for
// the engine's VerifyClient.
//   1. start the verifier (separate terminal), real x402, stub reader (no model, no vision key):
//      VERIFIER_PAYMENT=on VERIFIER_MODE=stub node --env-file=.env --import tsx apps/verifier/src/main.ts
//   2. node --env-file=.env --import tsx scripts/verify-once.ts              (dry run: health and price)
//      node --env-file=.env --import tsx scripts/verify-once.ts --send       (one real payment)
// The image is a synthetic noisy JPEG and the stub reader passes it: the VERDICT is not evidence,
// only the PAYMENT is (M1 proves the x402 path). Env through core EngineEnvSchema (network guard).
// Refuses FAKE_PAYMENTS, VERIFIER_PAYMENT=off, a verifier payee other than SELLER_ADDRESS and a
// price above VERIFY_MAX_PRICE_LOVELACE. One attempt; never re-signs on an unclear outcome.
// Exit codes: 0 ok, 1 refusal, 2 failed without a settlement hash, 3 outcome unclear (do NOT rerun
// --send; check W-VBUY on the explorer first).
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import sharp from "sharp";
import {
  AppError,
  EngineEnvSchema,
  VerifierHealthSchema,
  VerifierPriceSchema,
  collectSecretValues,
  createLogger,
  lovelaceToAdaString,
  loadEnv,
  newSubmissionId,
  newTaskId,
  randomIdGenerator,
  verifyIdempotencyKey,
} from "@shelfie/core";
import type { EngineEnv, VerifyRequest } from "@shelfie/core";
import { X402VerifyClient, createVerifyClient } from "@shelfie/payments";

function refuse(msg: string): never {
  process.stderr.write(`refused: ${msg}\n`);
  process.exit(1);
}
const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const short = (s: string): string => `${s.slice(0, 14)}...${s.slice(-6)}`;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
  if (!res.ok) throw new Error(`HTTP ${String(res.status)} from ${new URL(url).pathname}`);
  return res.json();
}

/** Deterministic noisy JPEG, 1000x800 (passes the decode and variance checks). */
async function photo(seed: number): Promise<Buffer> {
  const w = 1000;
  const h = 800;
  const raw = Buffer.alloc(w * h * 3);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < raw.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    raw[i] = s >>> 24;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: { send: { type: "boolean", default: false } },
    strict: true,
  });

  let env: EngineEnv;
  try {
    env = loadEnv(EngineEnvSchema, process.env);
  } catch (err) {
    if (err instanceof AppError) refuse(err.message);
    throw err;
  }
  if (env.FAKE_PAYMENTS) refuse("FAKE_PAYMENTS is on; this script only makes a real x402 payment.");
  if (env.VERIFIER_PAYMENT !== "on")
    refuse("set VERIFIER_PAYMENT=on (off uses the dry route, no payment).");
  const seller = env.SELLER_ADDRESS ?? refuse("SELLER_ADDRESS (W-SELL) is required.");

  // Free routes first: the verifier must be up and must ask for our W-SELL at an acceptable price.
  // Loopback only: the verifier is never public, and the request carries ENGINE_TOKEN.
  const verifierUrl = new URL(env.VERIFIER_URL);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(verifierUrl.hostname)) {
    refuse("VERIFIER_URL must point at the local verifier (127.0.0.1).");
  }
  const base = env.VERIFIER_URL.replace(/\/+$/, "");
  const health = VerifierHealthSchema.parse(await getJson(`${base}/health`));
  const price = VerifierPriceSchema.parse(await getJson(`${base}/v1/price`));
  out(`verifier ${verifierUrl.origin} ok=${String(health.ok)} pack=${health.packId}`);
  out(
    `price ${lovelaceToAdaString(price.price.amount)} tADA on ${price.network}, payTo ${short(price.payTo)}`,
  );
  if (price.payTo !== seller) refuse("verifier payTo differs from SELLER_ADDRESS.");
  if (price.network !== "cardano:preprod") refuse("verifier network is not cardano:preprod.");
  if (BigInt(price.price.amount) > BigInt(env.VERIFY_MAX_PRICE_LOVELACE)) {
    refuse("verifier price exceeds VERIFY_MAX_PRICE_LOVELACE.");
  }

  const now = Date.now();
  const iso = (ms: number): string => new Date(ms).toISOString();
  const submissionId = newSubmissionId(randomIdGenerator);
  const img = await photo(now);
  const req: VerifyRequest = {
    packId: health.packId,
    submissionId,
    task: {
      taskId: newTaskId(randomIdGenerator),
      product: {
        name: "Example Pale Ale 0,33 l",
        ean: "4008400402222",
        aliases: ["example pale ale"],
        priceMinEur: 1,
        priceMaxEur: 4,
      },
      store: { id: "m1-check", name: "M1 payment check" },
      expectedCode: "K7Q-4XM",
      outcome: "OBSERVED",
      claimIssuedAt: iso(now - 60_000),
      claimExpiresAt: iso(now + 240_000),
      taskWindowEndsAt: iso(now + 840_000),
      receivedAt: iso(now),
    },
    image: {
      mimeType: "image/jpeg",
      base64: img.toString("base64"),
      sha256: createHash("sha256").update(img).digest("hex"),
    },
    previousImageSha256: [],
  };
  const key = verifyIdempotencyKey(submissionId);
  out(`submission ${submissionId}  key ${key}`);
  if (!args.send) {
    out("DRY RUN: nothing paid. Add --send to pay the verifier once from W-VBUY.");
    return;
  }

  const logger = createLogger({ level: "warn", secretValues: collectSecretValues(process.env) });
  const client = createVerifyClient(env, logger, { expectedPayTo: seller });
  try {
    const { verdict, txHash } = await client.verify(req, key);
    out(`paid: txHash ${txHash}`);
    out(`explorer ${env.EXPLORER_TX_BASE}${txHash}`);
    out(
      `verdict ${verdict.outcome} pass=${String(verdict.pass)} model=${verdict.model.id} (stub, not evidence)`,
    );
  } catch (err) {
    const r = err instanceof AppError ? err.details["reason"] : undefined;
    const reason = typeof r === "string" ? r : err instanceof AppError ? err.code : "unknown";
    const name = err instanceof Error ? err.name : "unknown";
    out(`verify failed: ${name} reason=${reason}`);
    // The buyer records every unclear payment in uncertainKeys (reason payment_uncertain and others).
    const unclear = client instanceof X402VerifyClient && client.uncertainKeys.includes(key);
    out(
      unclear
        ? "Payment outcome UNCLEAR: do NOT rerun --send; check W-VBUY on the explorer first."
        : "No settlement hash received. Before any rerun of --send, check W-VBUY on the explorer.",
    );
    process.exit(unclear ? 3 : 2);
  }
}

main().catch((err: unknown) => {
  const msg =
    err instanceof AppError
      ? `${err.message} reason=${String(err.details["reason"])}`
      : err instanceof Error
        ? err.name // SDK and parse messages are not echoed (they may carry config details)
        : "unknown";
  process.stderr.write(`verify-once error: ${msg}\n`);
  process.exit(2);
});
