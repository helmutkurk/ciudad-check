import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeClock, SequentialIdGenerator, createLogger } from "@shelfie/core";
import { FakePayoutAdapter } from "./fakes.js";
import { FilePayoutStore } from "./payout-store.js";
import { createPayoutQueue } from "./payout-queue.js";

const logger = createLogger({ sink: () => undefined });
const ADDR = "addr_test1placeholderworkeraddressfortests";

describe("FilePayoutStore", () => {
  it("persists the write-ahead record so a restart sees the payout and does not duplicate it", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "payouts-")), "payouts.json");
    const clock = new FakeClock();
    const adapter = new FakePayoutAdapter({ clock });
    const q1 = createPayoutQueue({ adapter, store: new FilePayoutStore(path), clock, logger, ids: new SequentialIdGenerator() });
    const p = await q1.enqueue({ taskId: "tsk_01", toAddress: ADDR, lovelace: "3000000" });
    await q1.drain();
    const saved = JSON.parse(readFileSync(path, "utf8")) as { state: string }[];
    expect(saved[0]?.state).toBe("SUBMITTED");

    const q2 = createPayoutQueue({ adapter, store: new FilePayoutStore(path), clock, logger });
    const again = await q2.enqueue({ taskId: "tsk_01", toAddress: ADDR, lovelace: "3000000" });
    await q2.drain();
    expect(again.id).toBe(p.id);
    expect(adapter.chain).toHaveLength(1);
  });

  it("refuses to start on a corrupt file instead of forgetting payouts", () => {
    const path = join(mkdtempSync(join(tmpdir(), "payouts-")), "payouts.json");
    writeFileSync(path, "{not json");
    expect(() => new FilePayoutStore(path)).toThrow(/unreadable/);
  });
});
