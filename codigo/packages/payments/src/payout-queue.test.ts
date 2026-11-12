import { describe, expect, it, vi } from "vitest";
import {
  AppError,
  FakeClock,
  MAX_PAYOUT_LOVELACE,
  SequentialIdGenerator,
  createLogger,
  transition,
} from "@shelfie/core";
import type { Payout } from "@shelfie/core";
import { FakePayoutAdapter } from "./fakes.js";
import { InMemoryPayoutStore } from "./payout-store.js";
import { createPayoutQueue } from "./payout-queue.js";
import type { PayoutEvent, PayoutQueueDeps } from "./payout-queue.js";

// Fault-injection tests required by repo-layout.md section 4 (payments row) and
// payments-and-wallets.md: timeout then reconcile, crash between write-ahead and hash,
// concurrent enqueue, insufficient funds pauses.

const ADDR = "addr_test1placeholderworkeraddressfortests";
const logs: string[] = [];
const logger = createLogger({ sink: (l) => logs.push(l) });

function setup(over: Partial<PayoutQueueDeps> = {}, adapterOpts = {}) {
  const clock = new FakeClock();
  const adapter = new FakePayoutAdapter({ clock, ...adapterOpts });
  const store = new InMemoryPayoutStore();
  const events: PayoutEvent[] = [];
  const queue = createPayoutQueue({
    adapter,
    store,
    clock,
    logger,
    ids: new SequentialIdGenerator(),
    onEvent: (e) => events.push(e),
    ...over,
  });
  return { clock, adapter, store, queue, events };
}

const enq = (q: ReturnType<typeof setup>["queue"], taskId = "tsk_01", lovelace = "3000000") =>
  q.enqueue({ taskId, toAddress: ADDR, lovelace });

describe("happy path", () => {
  it("write-ahead, send, SUBMITTED, then CONFIRMED on poll; hash is recorded once", async () => {
    const { queue, adapter, events } = setup();
    const p = await enq(queue);
    expect(p.state).toBe("QUEUED");
    expect(p.idempotencyKey).toBe("payout:tsk_01");
    expect(p.metadataTag).toBe(`shelfie:${p.id}`);
    await queue.drain();
    const done = await queue.get(p.id);
    expect(done.state).toBe("SUBMITTED");
    expect(done.attempts).toBe(1);
    expect(done.txHash).toBe(adapter.chain[0]?.txHash);
    expect(adapter.chain).toHaveLength(1);
    expect(adapter.chain[0]).toMatchObject({ toAddress: ADDR, lovelace: "3000000", metadataTag: p.metadataTag });
    await queue.pollConfirmations();
    expect((await queue.get(p.id)).state).toBe("CONFIRMED");
    expect(events.map((e) => e.kind)).toEqual([
      "PAYOUT_QUEUED",
      "PAYOUT_SENDING",
      "PAYOUT_SUBMITTED",
      "PAYOUT_CONFIRMED",
    ]);
  });

  it("is FIFO with concurrency 1", async () => {
    const { queue, adapter } = setup();
    adapter.sendDelayMs = 5;
    for (const t of ["tsk_01", "tsk_02", "tsk_03"]) await enq(queue, t);
    await queue.drain();
    expect(adapter.maxInFlight).toBe(1);
    expect(adapter.chain.map((t) => t.metadataTag)).toEqual(["shelfie:pay_01", "shelfie:pay_02", "shelfie:pay_03"]);
  });
});

describe("idempotency", () => {
  it("concurrent enqueue of the same task gives one payout and one transfer", async () => {
    const { queue, adapter } = setup();
    const results = await Promise.all(Array.from({ length: 6 }, () => enq(queue)));
    await queue.drain();
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(adapter.chain).toHaveLength(1);
    expect(adapter.sendCalls).toBe(1);
    // and a late repeat still returns the same payout without a second transfer
    const again = await enq(queue);
    await queue.drain();
    expect(again.id).toBe(results[0]?.id);
    expect(adapter.chain).toHaveLength(1);
  });
});

describe("timeout after send -> reconcile finds the tx -> exactly one payout", () => {
  it("goes UNKNOWN, reconcile finds it by metadata tag, never resends", async () => {
    const { queue, adapter, clock } = setup();
    adapter.injectFault("timeout_after_send");
    const p = await enq(queue);
    await queue.drain();
    // the immediate reconcile already found the transfer (the tag is on chain)
    const after = await queue.get(p.id);
    expect(after.state).toBe("SUBMITTED");
    expect(after.txHash).toBe(adapter.chain[0]?.txHash);
    clock.advanceSec(600);
    await queue.reconcile(p.id);
    await queue.drain();
    expect(adapter.chain).toHaveLength(1);
    expect(adapter.sendCalls).toBe(1);
  });
});

describe("crash between write-ahead and hash", () => {
  it("no transfer was made: stays UNKNOWN until the settling delay, then proven absent -> QUEUED -> sent once", async () => {
    const { queue, adapter, clock } = setup();
    adapter.injectFault("crash_before_send");
    const p = await enq(queue);
    await queue.drain();
    expect((await queue.get(p.id)).state).toBe("UNKNOWN");
    expect(adapter.sendCalls).toBe(1);

    // too early: lookup finds nothing but that is not proof yet
    clock.advanceSec(30);
    const early = await queue.reconcile(p.id);
    expect(early.state).toBe("UNKNOWN");
    await queue.drain();
    expect(adapter.sendCalls).toBe(1);

    // after the settling delay the absence is proof and the payout is queued again
    clock.advanceSec(120);
    const late = await queue.reconcile(p.id);
    expect(late.state).toBe("QUEUED");
    await queue.drain();
    const done = await queue.get(p.id);
    expect(done.state).toBe("SUBMITTED");
    expect(done.attempts).toBe(2);
    expect(adapter.chain).toHaveLength(1);
  });

  it("the transfer left but the hash was never stored (process died): recover() finds it by tag", async () => {
    const clock = new FakeClock();
    const adapter = new FakePayoutAdapter({ clock });
    // a store that dies on the second write: write-ahead lands, the SUBMITTED update does not
    class DyingStore extends InMemoryPayoutStore {
      updates = 0;
      override update(p: Payout): Promise<void> {
        this.updates++; // 1 = write-ahead (lands), 2 = SUBMITTED with the hash (dies)
        return this.updates >= 2 ? Promise.reject(new Error("disk gone")) : super.update(p);
      }
    }
    const store = new DyingStore();
    const q1 = createPayoutQueue({ adapter, store, clock, logger, ids: new SequentialIdGenerator() });
    const p = await q1.enqueue({ taskId: "tsk_09", toAddress: ADDR, lovelace: "3000000" });
    await q1.drain();
    expect(adapter.chain).toHaveLength(1); // money moved
    expect((await q1.get(p.id)).state).toBe("SENDING"); // record still says SENDING
    expect((await q1.status()).paused).toBe(true);

    // "restart": a new queue over the same persisted records
    const survivor = new InMemoryPayoutStore();
    await survivor.insert((await store.get(p.id)) as Payout);
    const q2 = createPayoutQueue({ adapter, store: survivor, clock, logger });
    await q2.recover();
    await q2.drain();
    const recovered = await q2.get(p.id);
    expect(recovered.state).toBe("SUBMITTED");
    expect(recovered.txHash).toBe(adapter.chain[0]?.txHash);
    expect(adapter.chain).toHaveLength(1);
    expect(adapter.sendCalls).toBe(1);
  });

  it("inconclusive reconcile (lookup fails) never resends, however long we wait", async () => {
    const { queue, adapter, clock } = setup();
    adapter.injectFault("timeout_before_send");
    const p = await enq(queue);
    await queue.drain();
    adapter.findFails = true;
    clock.advanceSec(3600);
    expect((await queue.reconcile(p.id)).state).toBe("UNKNOWN");
    await queue.drain();
    expect(adapter.sendCalls).toBe(1);
    // once the lookup works again the proof exists and the payout is queued again
    adapter.findFails = false;
    expect((await queue.reconcile(p.id)).state).toBe("QUEUED");
    await queue.drain();
    expect(adapter.chain).toHaveLength(1);
  });

  it("core refuses UNKNOWN -> QUEUED without proof (double-payment guard)", () => {
    expect(() => transition("payout", "UNKNOWN", "reconcile_proved_absent")).toThrow(AppError);
    expect(transition("payout", "UNKNOWN", "reconcile_proved_absent", { reconcileProvedAbsent: true })).toBe("QUEUED");
  });
});

describe("automatic reconcile on poll (no operator, no restart)", () => {
  it("absent after the settling delay: the poll never requeues; it alerts, and only the operator resends", async () => {
    const { queue, adapter, clock, events } = setup();
    adapter.injectFault("timeout_before_send");
    const p = await enq(queue);
    await queue.drain();
    expect((await queue.get(p.id)).state).toBe("UNKNOWN");
    const find = vi.spyOn(adapter, "find");

    clock.advanceSec(30);
    await queue.pollConfirmations();
    expect(find).not.toHaveBeenCalled(); // inside the settling delay: no lookup at all
    expect((await queue.get(p.id)).state).toBe("UNKNOWN");

    // a slow tx could still land (Blockfrost does not see the mempool): no requeue, no resend
    clock.advanceSec(100);
    await queue.pollConfirmations();
    await queue.drain();
    expect(find).toHaveBeenCalledTimes(1);
    expect((await queue.get(p.id)).state).toBe("UNKNOWN");
    expect(adapter.sendCalls).toBe(1);
    expect(events.filter((e) => e.kind === "PAYOUT_STALE")).toHaveLength(1);

    // the operator's reconcile is still the route back, with proof
    expect((await queue.reconcile(p.id)).state).toBe("QUEUED");
    await queue.drain();
    const done = await queue.get(p.id);
    expect(done.state).toBe("SUBMITTED");
    expect(done.attempts).toBe(2);
    expect(adapter.chain).toHaveLength(1);
  });

  it("an UNKNOWN payout without a write-ahead time is never looked up automatically (fail closed)", async () => {
    const { queue, adapter, clock, store } = setup();
    adapter.injectFault("timeout_before_send");
    const p = await enq(queue);
    await queue.drain();
    await store.update({ ...(await queue.get(p.id)), sendingSince: null });
    const find = vi.spyOn(adapter, "find");
    clock.advanceSec(3600);
    await queue.pollConfirmations();
    await queue.drain();
    expect(find).not.toHaveBeenCalled();
    expect((await queue.get(p.id)).state).toBe("UNKNOWN");
    expect(adapter.sendCalls).toBe(1);
  });

  it("timeout after send: an inconclusive lookup never resends; a later poll finds the tx", async () => {
    const { queue, adapter, clock } = setup();
    adapter.injectFault("timeout_after_send");
    adapter.findFails = true;
    const p = await enq(queue);
    await queue.drain();
    expect((await queue.get(p.id)).state).toBe("UNKNOWN");
    const find = vi.spyOn(adapter, "find");

    clock.advanceSec(300);
    await queue.pollConfirmations();
    await queue.drain();
    expect((await queue.get(p.id)).state).toBe("UNKNOWN");
    expect(find).toHaveBeenCalledTimes(1);

    // throttled: the next poll within reconcileIntervalSec does not hit the chain again
    await queue.pollConfirmations();
    expect(find).toHaveBeenCalledTimes(1);

    adapter.findFails = false;
    clock.advanceSec(31);
    await queue.pollConfirmations();
    await queue.drain();
    const found = await queue.get(p.id);
    // the same poll finds it (UNKNOWN -> SUBMITTED) and then confirms it
    expect(found.state).toBe("CONFIRMED");
    expect(found.txHash).toBe(adapter.chain[0]?.txHash);
    expect(adapter.sendCalls).toBe(1);
    expect(adapter.chain).toHaveLength(1);
  });

  it("a SUBMITTED payout unconfirmed past staleAfterSec raises PAYOUT_STALE once and is not resent", async () => {
    const { queue, adapter, clock, events } = setup({}, { confirmations: 0 });
    const p = await enq(queue);
    await queue.drain();
    await queue.pollConfirmations();
    expect(events.some((e) => e.kind === "PAYOUT_STALE")).toBe(false);

    clock.advanceSec(601);
    await queue.pollConfirmations();
    await queue.pollConfirmations();
    expect(events.filter((e) => e.kind === "PAYOUT_STALE")).toHaveLength(1);
    expect((await queue.get(p.id)).state).toBe("SUBMITTED");
    expect(adapter.sendCalls).toBe(1);
  });
});

describe("insufficient funds", () => {
  it("pauses the queue, keeps payouts QUEUED, and resumes after funding", async () => {
    const { queue, adapter, events } = setup({}, { balanceLovelace: "1000000" });
    const a = await enq(queue, "tsk_01");
    const b = await enq(queue, "tsk_02");
    await queue.drain();
    expect(adapter.sendCalls).toBe(0);
    expect((await queue.get(a.id)).state).toBe("QUEUED");
    expect((await queue.get(b.id)).state).toBe("QUEUED");
    const status = await queue.status();
    expect(status).toMatchObject({ paused: true, reason: "insufficient_funds", depth: 2 });
    expect(events.some((e) => e.kind === "QUEUE_PAUSED")).toBe(true);

    // new enqueues are accepted while paused, never dropped
    const c = await enq(queue, "tsk_03");
    await queue.drain();
    expect(adapter.sendCalls).toBe(0);

    adapter.setBalance("50000000");
    queue.resume();
    await queue.drain();
    expect(adapter.chain).toHaveLength(3);
    expect((await queue.get(c.id)).state).toBe("SUBMITTED");
  });

  it("a wallet error that provably sent nothing pauses and requeues without waiting", async () => {
    const { queue, adapter } = setup();
    adapter.injectFault("insufficient_funds");
    const p = await enq(queue);
    await queue.drain();
    const after = await queue.get(p.id);
    expect(after.state).toBe("QUEUED");
    expect(after.attempts).toBe(1);
    expect((await queue.status()).reason).toBe("insufficient_funds");
    queue.resume();
    await queue.drain();
    expect((await queue.get(p.id)).state).toBe("SUBMITTED");
    expect(adapter.chain).toHaveLength(1);
  });
});

describe("hard caps (payout.sec)", () => {
  it("rejects amounts above MAX_PAYOUT_LOVELACE, floats, negatives and bad addresses", async () => {
    const { queue, adapter } = setup();
    const over = (BigInt(MAX_PAYOUT_LOVELACE) + 1n).toString();
    for (const lovelace of [over, "3000000.5", "-1", "0", "1e6", "abc", ""]) {
      await expect(enq(queue, "tsk_x", lovelace)).rejects.toBeInstanceOf(AppError);
    }
    await expect(
      queue.enqueue({ taskId: "tsk_x", toAddress: "notpreprodaddress", lovelace: "1000000" }),
    ).rejects.toMatchObject({ code: "invalid_payout_address" });
    await expect(queue.enqueue({ taskId: "../etc", toAddress: ADDR, lovelace: "1000000" })).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(adapter.sendCalls).toBe(0);
  });

  it("a configured cap can only lower the hard cap, never raise it", async () => {
    const { queue } = setup({ maxPayoutLovelace: "999999999" });
    await expect(enq(queue, "tsk_x", (BigInt(MAX_PAYOUT_LOVELACE) + 1n).toString())).rejects.toMatchObject({
      code: "unprocessable",
    });
  });

  it("daily cap reached pauses the queue and leaves the rest QUEUED", async () => {
    const { queue, adapter } = setup({ dailyCapLovelace: "7000000" });
    const ps = [await enq(queue, "tsk_01"), await enq(queue, "tsk_02"), await enq(queue, "tsk_03")];
    await queue.drain();
    expect(adapter.chain).toHaveLength(2);
    expect((await queue.get(ps[2]?.id ?? "")).state).toBe("QUEUED");
    expect((await queue.status()).reason).toBe("daily_cap_reached");
  });
});

describe("failures and operator actions", () => {
  it("fails final after max attempts of provably unsent transfers", async () => {
    const { queue, adapter } = setup({ maxAttempts: 2 });
    adapter.injectFault("insufficient_funds", "insufficient_funds");
    const p = await enq(queue);
    await queue.drain();
    queue.resume();
    await queue.drain();
    queue.resume();
    await queue.drain();
    const after = await queue.get(p.id);
    expect(after.state).toBe("FAILED_FINAL");
    expect(adapter.chain).toHaveLength(0);
    const retried = await queue.retry(p.id);
    expect(retried.state).toBe("QUEUED");
    await queue.drain();
    expect((await queue.get(p.id)).state).toBe("SUBMITTED");
  });

  it("a submitted payout that the node rejects becomes FAILED_FINAL", async () => {
    const { queue, adapter } = setup();
    const p = await enq(queue);
    await queue.drain();
    adapter.rejectTx((await queue.get(p.id)).txHash ?? "");
    await queue.pollConfirmations();
    expect((await queue.get(p.id)).state).toBe("FAILED_FINAL");
  });

  it("markPaid records an out-of-band payment, flagged in lastError", async () => {
    const { queue, adapter } = setup();
    adapter.injectFault("crash_before_send");
    const p = await enq(queue);
    await queue.drain();
    const paid = await queue.markPaid(p.id, "manual-reference");
    expect(paid.state).toBe("CONFIRMED");
    expect(paid.lastError).toBe("marked_paid_by_operator");
  });

  it("never logs secrets", async () => {
    const { queue } = setup();
    await enq(queue);
    await queue.drain();
    expect(logs.join("\n")).not.toMatch(/mnemonic/i);
  });
});
