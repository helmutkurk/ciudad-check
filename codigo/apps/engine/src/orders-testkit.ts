import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EngineEnvSchema,
  FakeClock,
  SequentialIdGenerator,
  createLogger,
  loadEnv,
} from "@shelfie/core";
import { Ledger } from "@shelfie/evidence";
import { Engine } from "./engine.js";
import { FakePayoutQueue } from "./fakes/payout-queue.js";
import { FakeVerifyClient } from "./fakes/verify-client.js";
import { defaultShelfPack } from "./pack.js";
import { MemoryStore } from "./store.js";
import { Orders } from "./orders.js";
import { FakeSokosumiClient } from "./sokosumi.js";
import type { SokosumiClient } from "./sokosumi.js";
import { testCatalog } from "./testkit.js";

export function orderRig(
  vars: Record<string, string> = {},
  client?: SokosumiClient,
  journal?: string,
) {
  const dir = mkdtempSync(join(tmpdir(), "orders-"));
  const env = loadEnv(EngineEnvSchema, {
    FAKE_PAYMENTS: "1",
    BRAND_TOKEN: "b".repeat(40),
    ...vars,
  });
  const clock = new FakeClock();
  const ids = new SequentialIdGenerator();
  const logs: string[] = [];
  const logger = createLogger({ clock, sink: (line) => logs.push(line) });
  const store = new MemoryStore(journal ?? join(dir, "store.jsonl"));
  const engine = new Engine({
    env,
    clock,
    ids,
    logger,
    store,
    catalog: testCatalog(),
    ledger: new Ledger({ path: join(dir, "ledger.jsonl"), clock }),
    pack: defaultShelfPack({
      payoutLovelace: env.PAYOUT_LOVELACE,
      maxAttempts: env.MAX_ATTEMPTS,
      claimTtlSec: env.CLAIM_TTL_SEC,
    }),
    payoutQueue: new FakePayoutQueue(ids, clock),
    verifyClient: new FakeVerifyClient(),
    probe: {
      payBalanceLovelace: () => Promise.resolve("0"),
      vbuyBalanceLovelace: () => Promise.resolve("0"),
      payQueueDepth: () => 0,
      verifierUp: () => Promise.resolve(true),
    },
    imageDir: join(dir, "images"),
    fakes: { payments: true, verifier: true },
    payoutPollMs: 0,
  });
  const sokosumi = client ?? new FakeSokosumiClient(engine, env, ids);
  const orders = new Orders({ engine, env, store, clock, ids, client: sokosumi });
  return { env, engine, store, clock, orders, logs, dir };
}

// ADR-21 brand fixtures (synthetic codes and preprod-shaped addresses only).
export const BRAND_A = { id: "brand-a", name: "Brand A", token: "a".repeat(40) } as const;
export const BRAND_B = { id: "brand-b", name: "Brand B", token: "c".repeat(40) } as const;
/** `BRAND_ACCOUNTS` value for two brands, to pass with `BRAND_TOKEN: ""` (no demo brand). */
export const TWO_BRANDS_ENV = [BRAND_A, BRAND_B]
  .map((b) => `${b.id}|${b.name}|addr_test1${"q".repeat(60)}|${b.token}`)
  .join(";");
