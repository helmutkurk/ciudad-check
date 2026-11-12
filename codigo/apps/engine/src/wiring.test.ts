import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  EngineEnvSchema,
  loadEnv,
  FakeClock,
  SequentialIdGenerator,
  createLogger,
  TaskIdSchema,
} from "@shelfie/core";
import { Ledger } from "@shelfie/evidence";
import { Engine } from "./engine.js";
import { MemoryStore } from "./store.js";
import { defaultShelfPack } from "./pack.js";
import { ADDR_A, EAN, STORE_ID, STORE_POS, testCatalog, photoB64 } from "./testkit.js";
import { wireAdapters } from "./wiring.js";

it("persists the payout queue beside engine data and records its hashes and fake flags", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wiring-"));
  try {
    const env = loadEnv(EngineEnvSchema, {
      FAKE_PAYMENTS: "1",
      STORE_PATH: join(dir, "engine.jsonl"),
    });
    const clock = new FakeClock();
    const ledger = new Ledger({ path: join(dir, "ledger.jsonl"), clock });
    const adapters = await wireAdapters(env, env, {
      clock,
      ids: new SequentialIdGenerator(),
      logger: createLogger({ sink: () => undefined }),
      ledger,
    });
    const p = await adapters.payoutQueue.enqueue({
      taskId: TaskIdSchema.parse("tsk_01"),
      toAddress: `addr_test1${"q".repeat(50)}`,
      lovelace: "3000000",
    });
    for (let i = 0; i < 100; i++) {
      if ((await adapters.payoutQueue.get(p.id)).state === "SUBMITTED") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await adapters.payoutQueue.pollConfirmations?.();
    const confirmed = await adapters.payoutQueue.get(p.id);
    expect(confirmed.state).toBe("CONFIRMED");
    expect(existsSync(join(dir, "payout-queue.json"))).toBe(true);
    for (const kind of ["PAYOUT_SUBMITTED", "PAYOUT_CONFIRMED"]) {
      const entry = ledger.all().find((e) => e.kind === kind);
      expect(entry?.txHash).toBe(confirmed.txHash);
      expect(entry?.flags.fakePayments).toBe(true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("runtime wiring keeps verify and payout hashes together in the job ledger on fakes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wired-engine-"));
  try {
    const env = loadEnv(EngineEnvSchema, {
      FAKE_PAYMENTS: "1",
      STORE_PATH: join(dir, "engine.jsonl"),
    });
    const clock = new FakeClock();
    const ids = new SequentialIdGenerator();
    const logger = createLogger({ sink: () => undefined });
    const store = new MemoryStore(env.STORE_PATH);
    const ledger = new Ledger({ path: join(dir, "ledger.jsonl"), clock });
    const adapters = await wireAdapters(env, env, {
      clock,
      ids,
      logger,
      ledger,
      jobIdForTask: (taskId) => store.tasks.all().find((t) => t.id === taskId)?.jobId,
    });
    const queue = adapters.payoutQueue;
    const get = queue.get.bind(queue);
    Object.assign(queue, {
      get: async (id: string) => {
        await queue.pollConfirmations?.();
        return get(id);
      },
    });
    const engine = new Engine({
      env,
      clock,
      ids,
      logger,
      store,
      ledger,
      catalog: testCatalog(),
      pack: defaultShelfPack({
        claimTtlSec: env.CLAIM_TTL_SEC,
        maxAttempts: env.MAX_ATTEMPTS,
        payoutLovelace: env.PAYOUT_LOVELACE,
      }),
      ...adapters,
      imageDir: join(dir, "images"),
      payoutPollMs: 1,
    });
    engine.createJob(
      {
        packId: "shelf-check",
        source: "demo",
        externalRef: "wiring-test",
        input: { productEan: EAN, stores: [{ id: STORE_ID }], k: 1 },
      },
      "shell",
    );
    const task = store.tasks.all()[0]!;
    engine.claimTask(task.id, {
      workerId: "wrk_aaa",
      payoutAddress: ADDR_A,
      location: { ...STORE_POS, accuracyM: 18 },
    });
    const claim = store.claims.all()[0]!;
    engine.submitPhoto(
      task.id,
      {
        claimId: claim.id,
        outcome: "OBSERVED",
        imageBase64: photoB64(),
        mimeType: "image/jpeg",
        location: { ...STORE_POS, accuracyM: 18, fixAgeMs: 1200 },
        clientMeta: {
          captureMode: "getUserMedia",
          width: 1600,
          height: 1200,
          streamStartedToShutterMs: 8400,
          deviceLabelPresent: true,
        },
      },
      { adminAuthed: false },
    );
    await engine.idle();
    const verifyTx = store.verdicts.all()[0]?.verifierTx;
    const payoutTx = store.payouts.all()[0]?.txHash;
    expect(verifyTx).toBeTruthy();
    expect(payoutTx).toBeTruthy();
    const entries = ledger.all().filter((e) => e.refs.jobId === task.jobId);
    for (const [kind, hash] of [
      ["VERIFY_PAID", verifyTx],
      ["PAYOUT_SUBMITTED", payoutTx],
      ["PAYOUT_CONFIRMED", payoutTx],
    ]) {
      expect(entries.filter((e) => e.kind === kind).map((e) => e.txHash)).toEqual([hash]);
    }
    expect(store.tasks.get(task.id)?.state).toBe("PAID");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
