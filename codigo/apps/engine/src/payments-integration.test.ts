/* eslint-disable @typescript-eslint/no-unsafe-member-access -- test reads untyped JSON responses */
import { afterEach, describe, expect, it } from "vitest";
import { FakePayoutAdapter, InMemoryPayoutStore, createPayoutQueue } from "@shelfie/payments";
import { makeRig } from "./testkit.js";
import type { Rig } from "./testkit.js";

let rig: Rig;
afterEach(async () => {
  await rig.close();
});

describe("engine on the @shelfie/payments queue (FakePayoutAdapter)", () => {
  it("one accepted photo -> exactly one payout, CONFIRMED, task PAID, job DELIVER", async () => {
    rig = await makeRig({
      payoutQueue: ({ ids, clock, logger }) => {
        const queue = createPayoutQueue({
          adapter: new FakePayoutAdapter(),
          store: new InMemoryPayoutStore(),
          clock,
          logger,
          ids,
        });
        // the real queue confirms only when polled; main.ts does that every 3 s
        const get = queue.get.bind(queue);
        return Object.assign(queue, {
          get: async (id: string) => {
            await queue.pollConfirmations();
            return get(id);
          },
        });
      },
    });
    const { jobId, taskId } = await rig.flow();
    expect(rig.store.payouts.all()).toHaveLength(1);
    expect(rig.store.payouts.all()[0]?.state).toBe("CONFIRMED");
    expect(rig.store.tasks.get(taskId as never)?.state).toBe("PAID");
    const dec = await rig.shell("GET", `/api/jobs/${jobId}/decision`);
    expect(dec.json.status).toBe("DELIVER");
    expect(rig.ledger.all().some((e) => e.kind === "PAYOUT_CONFIRMED")).toBe(true);
  });
});
