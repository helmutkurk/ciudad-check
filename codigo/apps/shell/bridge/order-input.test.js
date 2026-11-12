import assert from "node:assert/strict";
import { it } from "node:test";
import { createBridge } from "./bridge.js";

it("carries validated order/store ids separately from catalog job input without a socket", async () => {
  const calls = [];
  const bridge = createBridge({ engineUrl: "http://127.0.0.1:4000", packId: "shelf-check", shellToken: "synthetic-shell-token" }, {
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return Response.json({ job: { id: "job_01" } }, { status: 201 });
    }, logger: { info() {}, warn() {} },
  });
  await bridge.createJob(JSON.stringify({ orderId: "ord_01", storeId: "s1", productEan: "4000000000000" }), "sokosumi-task-1");
  assert.deepEqual(calls[0], { packId: "shelf-check", source: "shell", externalRef: "sokosumi-task-1", input: { productEan: "4000000000000", stores: [{ id: "s1" }] }, orderRef: { orderId: "ord_01", storeId: "s1" } });
  await assert.rejects(bridge.createJob({ orderId: "../bad", storeId: "s1", productEan: "4000000000000" }, "sokosumi-task-2"));
  assert.equal(calls.length, 1);
});
