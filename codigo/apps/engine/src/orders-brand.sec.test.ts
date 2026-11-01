import { describe, expect, it } from "vitest";
import { BRAND_A, BRAND_B, TWO_BRANDS_ENV, orderRig } from "./orders-testkit.js";
import { EAN } from "./testkit.js";
import { SequentialIdGenerator } from "@shelfie/core";
import { FakeSokosumiClient } from "./sokosumi.js";
import type { SokosumiClient } from "./sokosumi.js";

const twoBrands = { BRAND_TOKEN: "", BRAND_ACCOUNTS: TWO_BRANDS_ENV };
const body = { productEan: EAN, storeIds: ["s1", "s2"] };

/** Fake Sokosumi that also records a price, so spend can be derived without estimates. */
const pricedRig = () => {
  const holder: { inner?: SokosumiClient } = {};
  const r = orderRig(twoBrands, {
    createTask: (input, created) =>
      holder.inner!.createTask(input, created).then((out) => ({ ...out, credits: 40 })),
  });
  holder.inner = new FakeSokosumiClient(r.engine, r.env, new SequentialIdGenerator());
  return r;
};

describe("brand summary and transactions (B-17)", () => {
  it("derives spent and refunded credits and check counts from the brand's own orders", async () => {
    const r = pricedRig();
    const order = await r.orders.create(body, undefined, BRAND_A.id);
    expect(r.orders.summary(BRAND_A.id)).toEqual({
      credits: { spent: 0, refunded: 0, unpricedChecks: 0 },
      checks: { passed: 0, failed: 0, timedOut: 0, open: 2 },
    });
    // The window closes with no photo: both checks are withheld and refunded (timed out).
    r.clock.advance(1000_000);
    r.engine.tick();
    for (const row of order.jobs) {
      r.engine.settlementEvent(row.jobId!, { event: "WITHHELD" });
      r.engine.settlementEvent(row.jobId!, { event: "REFUND_OBSERVED", txHash: "f".repeat(64) });
    }
    expect(r.orders.get(order.orderId, BRAND_A.id).jobs[0]?.result).toMatchObject({
      outcome: "timed_out",
    });
    expect(r.orders.get(order.orderId, BRAND_A.id).jobs[0]?.credits).toBe(40);
    expect(r.orders.summary(BRAND_A.id)).toEqual({
      credits: { spent: 0, refunded: 80, unpricedChecks: 0 },
      checks: { passed: 0, failed: 0, timedOut: 2, open: 0 },
    });
  });

  it("replaces the 0 price of the create answer with the Task's real price once a job is linked", async () => {
    const holder: { inner?: SokosumiClient } = {};
    const lookups: string[] = [];
    const r = orderRig(twoBrands, {
      // Like Sokosumi: the create answer has price 0; the Task is priced when payment is requested.
      createTask: (input, created) =>
        holder.inner!.createTask(input, created).then((out) => ({ ...out, credits: 0 })),
      taskCredits: (taskId) => {
        lookups.push(taskId);
        return Promise.resolve(100);
      },
    });
    holder.inner = new FakeSokosumiClient(r.engine, r.env, new SequentialIdGenerator());
    const order = await r.orders.create({ ...body, storeIds: ["s1"] }, undefined, BRAND_A.id);
    r.orders.summary(BRAND_A.id);
    r.orders.list(BRAND_A.id); // within a minute: no second lookup
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lookups).toEqual([order.jobs[0]!.sokosumiTaskId]);
    expect(r.orders.get(order.orderId, BRAND_A.id).jobs[0]?.credits).toBe(100);
    r.clock.advance(1000_000);
    r.engine.tick();
    r.engine.settlementEvent(order.jobs[0]!.jobId!, { event: "WITHHELD" });
    expect(r.orders.summary(BRAND_A.id).credits).toEqual({
      spent: 0,
      refunded: 100,
      unpricedChecks: 0,
    });
    expect(lookups).toHaveLength(1); // priced rows are never looked up again
  });

  it("counts settled checks without a recorded price as unpriced, never as a number", async () => {
    const r = orderRig(twoBrands); // the fake client records no price
    const order = await r.orders.create({ ...body, storeIds: ["s1"] }, undefined, BRAND_A.id);
    r.clock.advance(1000_000);
    r.engine.tick();
    r.engine.settlementEvent(order.jobs[0]!.jobId!, { event: "WITHHELD" });
    expect(r.orders.summary(BRAND_A.id).credits).toEqual({
      spent: 0,
      refunded: 0,
      unpricedChecks: 1,
    });
  });

  it("returns only the calling brand's transactions; another brand sees none of them", async () => {
    const r = pricedRig();
    const mine = await r.orders.create(body, undefined, BRAND_A.id);
    const jobId = mine.jobs[0]!.jobId!;
    const lock = "a".repeat(64);
    r.engine.settlementEvent(jobId, { event: "ESCROW_LOCKED", txHash: lock });
    r.clock.advance(1000_000);
    r.engine.tick();
    r.engine.settlementEvent(jobId, { event: "WITHHELD" });
    r.engine.settlementEvent(jobId, { event: "REFUND_OBSERVED", txHash: "b".repeat(64) });

    const a = r.orders.transactions(BRAND_A.id).transactions;
    expect(a.map((t) => [t.jobId, t.kind, t.txHash])).toEqual([
      [jobId, "escrow_lock", lock],
      [jobId, "refund", "b".repeat(64)],
    ]);
    expect(a.every((t) => t.orderId === mine.orderId)).toBe(true);
    // Fake orders never get an explorer link.
    expect(a.every((t) => t.explorerUrl === undefined)).toBe(true);
    expect(r.orders.transactions(BRAND_B.id)).toEqual({ transactions: [] });
    expect(r.orders.summary(BRAND_B.id)).toEqual({
      credits: { spent: 0, refunded: 0, unpricedChecks: 0 },
      checks: { passed: 0, failed: 0, timedOut: 0, open: 0 },
    });
  });
});
