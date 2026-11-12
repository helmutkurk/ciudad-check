import { describe, expect, it } from "vitest";
import type { JobView, SubmissionView } from "@shelfie/core/browser";
import { isActiveJob, jobOutcome, jobViewStatus, matchesFilter } from "./dashboard/model.js";
import { addHistory, createMemoryStorage, loadHistory } from "./lib/storage.js";
import { historyEarnings } from "./worker/Wallet.js";

type Slice = Pick<JobView, "job" | "counts">;
const view = (state: string, source: string, failed = 0): Slice =>
  ({
    job: { state, source },
    counts: { passed: 0, open: 0, failed },
  }) as unknown as Slice;

describe("dashboard outcomes", () => {
  it("a finished test job (demo, DELIVERABLE) is delivered, not active", () => {
    const v = view("DELIVERABLE", "demo");
    expect(isActiveJob(v)).toBe(false);
    expect(jobOutcome(v)).toBe("delivered");
    expect(jobViewStatus(v).label).toBe("Delivered (test)");
  });
  it("a brand job waiting for RESULT_SUBMITTED stays active", () => {
    expect(isActiveJob(view("DELIVERABLE", "shell"))).toBe(true);
  });
  it("splits finished jobs into delivered, failed and timed out", () => {
    expect(jobOutcome(view("SETTLED", "shell"))).toBe("delivered");
    expect(jobOutcome(view("REFUNDED", "shell", 2))).toBe("failed");
    expect(jobOutcome(view("REFUNDED", "shell", 0))).toBe("timeout");
    expect(jobOutcome(view("CANCELLED", "demo"))).toBe("failed");
    expect(matchesFilter(view("WITHHELD", "shell"), "timeout")).toBe(true);
    expect(matchesFilter(view("COLLECTING", "shell"), "active")).toBe(true);
  });
});

describe("photo history on this device", () => {
  const entry = (id: string) => ({
    submissionId: id,
    productName: "Red Bull Energy Drink 250 ml",
    storeName: "Shelfie demo shelf",
    payoutAmount: "3000000",
    at: "2026-10-31T03:05:00.000Z",
  });
  it("keeps newest first, one entry per submission, at most 20", () => {
    const store = createMemoryStorage();
    addHistory(store, entry("sub_1"));
    addHistory(store, entry("sub_2"));
    addHistory(store, entry("sub_1"));
    expect(loadHistory(store).map((e) => e.submissionId)).toEqual(["sub_1", "sub_2"]);
    for (let i = 0; i < 25; i += 1) addHistory(store, entry(`sub_x${i}`));
    expect(loadHistory(store)).toHaveLength(20);
  });
  it("ignores malformed stored data and invalid ids", () => {
    const store = createMemoryStorage({ "shelfie.history": "{not json" });
    expect(loadHistory(store)).toEqual([]);
    expect(addHistory(store, entry("../etc"))).toEqual([]);
  });
});

describe("worker earnings", () => {
  const entry = (id: string, amount: string) => ({
    submissionId: id,
    productName: "Red Bull Energy Drink 250 ml",
    storeName: "Shelfie demo shelf",
    payoutAmount: amount,
    at: "2026-10-31T03:05:00.000Z",
  });
  const view = (state: string, payout?: string) =>
    ({ state, payout: payout ? { state: payout } : null }) as unknown as SubmissionView;
  it("sums confirmed payouts as paid and other accepted photos as pending, never rejected ones", () => {
    const history = [entry("sub_1", "3000000"), entry("sub_2", "2500000"), entry("sub_3", "9")];
    const views = new Map([
      ["sub_1", view("PASSED", "CONFIRMED")],
      ["sub_2", view("PASSED", "SUBMITTED")],
      ["sub_3", view("REJECTED")],
    ]);
    expect(historyEarnings(history, views)).toEqual({ paid: "3000000", pending: "2500000" });
    expect(historyEarnings(history, undefined)).toEqual({ paid: "0", pending: "0" });
  });
});
