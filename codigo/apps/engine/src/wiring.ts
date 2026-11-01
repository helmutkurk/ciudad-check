import type { Engine } from "./engine.js";
import { FakeSokosumiClient, RealSokosumiClient } from "./sokosumi.js";
import type { SokosumiClient } from "./sokosumi.js";
import { dirname, join } from "node:path";
import type {
  Clock,
  EngineEnv,
  IdGenerator,
  Logger,
  PayoutQueue,
  VerifyClient,
} from "@shelfie/core";
import type { Ledger } from "@shelfie/evidence";
import type * as Payments from "@shelfie/payments";
import { FakePayoutQueue } from "./fakes/payout-queue.js";
import { FakeVerifyClient } from "./fakes/verify-client.js";
import { createAddressBalanceProbe } from "./balance.js";
import type { HealthProbe, PayoutQueueAdmin } from "./seams.js";

/** Compatibility alias; runtime switches now belong to the shared engine contract. */
export { EngineEnvSchema as EngineExtrasSchema } from "@shelfie/core";
export type EngineExtras = EngineEnv;

export interface Adapters {
  verifyClient: VerifyClient;
  payoutQueue: PayoutQueue & PayoutQueueAdmin;
  probe: HealthProbe;
  fakes: { payments: boolean; verifier: boolean };
}

async function loadPayments(): Promise<typeof Payments> {
  // Dynamic so that fake mode with PAYMENTS_IMPL=engine-fake never loads the wallet SDKs.
  return import("@shelfie/payments");
}

async function verifierUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(new URL("/health", url), { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Picks fakes or real adapters from env:
 *  - FAKE_PAYMENTS=1            -> FakePayoutQueue (no wallet, no network)
 *  - VERIFIER_PAYMENT=off + FAKE_PAYMENTS=1 (default) -> FakeVerifyClient; set VERIFY_CLIENT=real to
 *    call the real verifier's dry endpoint through @shelfie/payments instead
 *  - otherwise                  -> @shelfie/payments (throws dependency_unavailable until it exists)
 */
export async function wireAdapters(
  env: EngineEnv,
  extras: EngineExtras,
  deps: {
    clock: Clock;
    ids: IdGenerator;
    logger: Logger;
    ledger: Ledger;
    jobIdForTask?: (taskId: string) => string | undefined;
  },
): Promise<Adapters> {
  const useFakePayments = env.FAKE_PAYMENTS;
  const useFakeVerifier = (extras.VERIFY_CLIENT ?? (useFakePayments ? "fake" : "real")) === "fake";

  let payoutQueue: PayoutQueue & PayoutQueueAdmin;
  let balance: () => Promise<string> = () => Promise.resolve("0");
  let depth = 0;
  let depthFn = (): number => depth;
  if (useFakePayments && (extras.PAYMENTS_IMPL ?? "package") === "engine-fake") {
    const q = new FakePayoutQueue(deps.ids, deps.clock);
    payoutQueue = q;
    balance = () => Promise.resolve("100000000");
    depthFn = () => q.queueDepth();
  } else {
    const pay = await loadPayments();
    const adapter = pay.createPayoutAdapter(env, deps.logger, 0);
    const store = new pay.FilePayoutStore(
      extras.PAYOUT_STORE_PATH ?? join(dirname(env.STORE_PATH), "payout-queue.json"),
    );
    const queue = pay.createPayoutQueue({
      adapter,
      store,
      clock: deps.clock,
      logger: deps.logger,
      ids: deps.ids,
      walletId: "pay-1",
      maxAttempts: env.PAYOUT_MAX_ATTEMPTS,
      dailyCapLovelace: env.PAYOUT_DAILY_CAP_LOVELACE,
      onEvent: (event) => {
        const flags = {
          fakePayments: useFakePayments,
          fakeVerifier: useFakeVerifier,
          dryVerifier: env.VERIFIER_PAYMENT === "off",
          locationCheckOff: env.LOCATION_CHECK === "off",
          testUploadAllowed: env.ALLOW_TEST_UPLOAD,
        };
        if (event.kind === "QUEUE_PAUSED") {
          deps.ledger.append({
            kind: "ADMIN_ACTION",
            refs: { action: "payout_queue_paused" },
            flags: { ...flags, operatorAlert: true },
          });
          return;
        }
        const p = event.payout;
        const jobId = deps.jobIdForTask?.(p.taskId);
        const refs = { ...(jobId ? { jobId } : {}), taskId: p.taskId, payoutId: p.id };
        if (
          ["PAYOUT_QUEUED", "PAYOUT_SUBMITTED", "PAYOUT_CONFIRMED", "PAYOUT_RECONCILED"].includes(
            event.kind,
          )
        ) {
          deps.ledger.append({
            kind: event.kind as
              "PAYOUT_QUEUED" | "PAYOUT_SUBMITTED" | "PAYOUT_CONFIRMED" | "PAYOUT_RECONCILED",
            refs,
            ...(p.txHash ? { txHash: p.txHash } : {}),
            flags,
          });
        } else {
          deps.ledger.append({
            kind: "ADMIN_ACTION",
            refs: { ...refs, action: event.kind },
            ...(p.txHash ? { txHash: p.txHash } : {}),
            flags: { ...flags, operatorAlert: event.kind !== "PAYOUT_SENDING" },
          });
        }
      },
    });
    payoutQueue = queue;
    balance = () => adapter.balance();
    const refresh = (): void => {
      void queue.status().then((st) => {
        depth = st.depth;
      });
    };
    const poll = queue.pollConfirmations.bind(queue);
    payoutQueue = Object.assign(queue, {
      pollConfirmations: async () => {
        await poll();
        refresh();
      },
    });
  }

  let verifyClient: VerifyClient;
  if (useFakeVerifier) {
    verifyClient = new FakeVerifyClient();
  } else {
    const pay = await loadPayments();
    verifyClient = pay.createVerifyClient(env, deps.logger, {
      ...(env.SELLER_ADDRESS ? { expectedPayTo: env.SELLER_ADDRESS } : {}),
      // receipts and unclear x402 payments survive a restart (B-13); next to the payout queue file
      statePath: join(dirname(env.STORE_PATH), "verify-client.json"),
    });
  }

  const FAKE_BALANCE = "100000000";
  const probe: HealthProbe = {
    // TODO(integration): real balances from the payments adapter (PayoutAdapter.balance()).
    payBalanceLovelace: balance,
    vbuyBalanceLovelace: useFakePayments
      ? () => Promise.resolve(FAKE_BALANCE)
      : createAddressBalanceProbe(env),
    payQueueDepth: () => depthFn(),
    verifierUp: () => (useFakeVerifier ? Promise.resolve(true) : verifierUp(env.VERIFIER_URL)),
  };
  return {
    verifyClient,
    payoutQueue,
    probe,
    fakes: { payments: useFakePayments, verifier: useFakeVerifier },
  };
}

/** Separate switch: local order transport can be fake independently of verifier/payout adapters. */
export function wireSokosumi(env: EngineEnv, engine: Engine, ids: IdGenerator): SokosumiClient {
  return env.SOKOSUMI_CLIENT === "real"
    ? new RealSokosumiClient(env)
    : new FakeSokosumiClient(engine, env, ids);
}
