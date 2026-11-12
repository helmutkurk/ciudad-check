import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SequentialIdGenerator } from "@shelfie/core";
import { MemoryStore } from "./store.js";
import { Orders } from "./orders.js";
import { RealSokosumiClient } from "./sokosumi.js";
import type { SokosumiClient } from "./sokosumi.js";
import { ADDR_A, EAN, STORE_POS, photoB64 } from "./testkit.js";
import { orderRig } from "./orders-testkit.js";

const input = { productEan: EAN, storeIds: ["s1", "s2"] };
const DEMO = "demo";

describe("orders", () => {
  it("creates one fake shell job per store, deduplicates retries and follows delivery/settlement", async () => {
    const r = orderRig();
    const order = await r.orders.create(input, "request-01", DEMO);
    expect(order.fake).toBe(true);
    expect(order.jobs).toHaveLength(2);
    expect(order.jobs.every((j) => j.jobId && j.sokosumiTaskId?.startsWith("fake-"))).toBe(true);
    expect((await r.orders.create(input, "request-01", DEMO)).orderId).toBe(order.orderId);
    expect(r.store.jobs.all()).toHaveLength(2);
    await expect(
      r.orders.create({ ...input, storeIds: ["s1"] }, "request-01", DEMO),
    ).rejects.toMatchObject({ status: 409 });
    const jobId = order.jobs[0]!.jobId!;
    const task = r.store.tasks.all().find((t) => t.jobId === jobId)!;
    r.engine.claimTask(task.id, {
      workerId: "wrk_aaa",
      payoutAddress: ADDR_A,
      location: STORE_POS,
    });
    expect(r.orders.get(order.orderId, DEMO).jobs[0]?.status).toBe("CLAIMED");
    const claim = r.store.claims.all()[0]!;
    r.engine.submitPhoto(
      task.id,
      {
        claimId: claim.id,
        imageBase64: photoB64(),
        mimeType: "image/jpeg",
        location: { ...STORE_POS, accuracyM: 18, fixAgeMs: 0 },
        clientMeta: { captureMode: "getUserMedia" },
      },
      { adminAuthed: false },
    );
    await r.engine.idle();
    expect(r.orders.get(order.orderId, DEMO).jobs[0]?.status).toBe("DELIVERABLE");
    r.engine.settlementEvent(jobId, { event: "RESULT_SUBMITTED" });
    r.engine.settlementEvent(jobId, { event: "SETTLED" });
    expect(r.orders.get(order.orderId, DEMO).jobs[0]?.status).toBe("SETTLED");
    r.clock.advance(1000_000);
    r.engine.tick();
    expect(r.orders.get(order.orderId, DEMO).jobs[1]?.status).toBe("WITHHELD");
    r.engine.settlementEvent(order.jobs[1]!.jobId!, { event: "WITHHELD" });
    r.engine.settlementEvent(order.jobs[1]!.jobId!, { event: "REFUND_OBSERVED" });
    expect(r.orders.get(order.orderId, DEMO).jobs[1]?.status).toBe("REFUNDED");
  });

  it("reserves the daily cap before awaiting I/O, survives replay and reset, and never retries ambiguity", async () => {
    let calls = 0;
    const client: SokosumiClient = {
      createTask: () => {
        calls++;
        return Promise.reject(new Error("unknown purchase"));
      },
    };
    const r = orderRig({ ORDER_DAILY_CREDIT_CAP: "200" }, client);
    const results = await Promise.allSettled([
      r.orders.create(input, undefined, DEMO),
      r.orders.create(input, undefined, DEMO),
    ]);
    expect(results.every((v) => v.status === "rejected")).toBe(true);
    expect(calls).toBe(1); // remaining store is left unsubmitted after the first ambiguous failure
    const saved = r.store.orders.all()[0]!;
    expect(r.orders.get(saved.id, DEMO).jobs[0]?.status).toBe("SOKOSUMI_UNAVAILABLE");
    await expect(r.orders.create(input, saved.idempotencyKey, DEMO)).rejects.toMatchObject({
      status: 502,
    });
    const replay = new MemoryStore(join(r.dir, "store.jsonl"));
    const next = new Orders({
      engine: r.engine,
      env: r.env,
      store: replay,
      clock: r.clock,
      ids: new SequentialIdGenerator(),
      client,
    });
    r.engine.adminReset();
    expect(r.store.orders.all()).toHaveLength(1);
    await expect(next.create(input, undefined, DEMO)).rejects.toMatchObject({
      code: "daily_cap_reached",
    });
    r.clock.advance(86400_000);
    await expect(next.create(input, undefined, DEMO)).rejects.toMatchObject({ status: 502 });
    expect(new Set(replay.orders.all().map((o) => o.id)).size).toBe(2);
  });

  it("retains a known upstream Task id after a later purchase failure", async () => {
    const r = orderRig(
      {},
      {
        createTask: (_input, created) => {
          created?.("upstream-task");
          return Promise.reject(new Error("later failure"));
        },
      },
    );
    await expect(
      r.orders.create({ ...input, storeIds: ["s1"] }, undefined, DEMO),
    ).rejects.toMatchObject({
      status: 502,
    });
    expect(r.orders.list(DEMO).orders[0]?.jobs[0]).toMatchObject({
      sokosumiTaskId: "upstream-task",
      status: "SOKOSUMI_UNAVAILABLE",
    });
  });
  it("links a real asynchronous shell pickup by order/store ids and rejects mismatches", async () => {
    const r = orderRig({}, { createTask: () => Promise.resolve({ taskId: "real-task" }) });
    const order = await r.orders.create({ ...input, storeIds: ["s1"] }, undefined, DEMO);
    expect(order.jobs[0]?.status).toBe("AWAITING_SHELL");
    const body = {
      packId: "shelf-check",
      source: "shell",
      externalRef: "real-task",
      input: { productEan: EAN, stores: [{ id: "s1" }] },
      orderRef: { orderId: order.orderId, storeId: "s1" },
    };
    r.engine.createJob(body, "shell");
    r.engine.createJob(body, "shell");
    expect(r.orders.get(order.orderId, DEMO).jobs[0]?.jobId).toBe(r.store.jobs.all()[0]?.id);
    expect(r.store.jobs.all()).toHaveLength(1);
    expect(() => r.engine.createJob({ ...body, externalRef: "other-task" }, "shell")).toThrow();
    expect(() =>
      r.engine.createJob({ ...body, input: { productEan: EAN, stores: [{ id: "s2" }] } }, "shell"),
    ).toThrow();
  });
});

describe("real Sokosumi transport (mocked; request shape from A-25)", () => {
  const realEnv = () =>
    orderRig({
      SOKOSUMI_CLIENT: "real",
      SOKOSUMI_API_TOKEN: "synthetic-api-token",
      SOKOSUMI_COWORKER_ID: "coworker-1",
      SOKOSUMI_ORGANIZATION_SLUG: "org-slug",
    }).env;
  const task = { orderId: "ord_01", storeId: "s1", productEan: EAN, maxCredits: 100 };

  it("creates one READY coworker Task with the ids-only order description and reports its id", async () => {
    const urls: string[] = [];
    const calls: RequestInit[] = [];
    const seen: string[] = [];
    const client = new RealSokosumiClient(realEnv(), (url, init) => {
      urls.push(url instanceof Request ? url.url : String(url));
      calls.push(init!);
      return Promise.resolve(
        Response.json({ data: { id: "task-1", credits: 100 } }, { status: 201 }),
      );
    });
    await expect(client.createTask(task, (id) => seen.push(id))).resolves.toEqual({
      taskId: "task-1",
      credits: 100,
    });
    expect(urls).toEqual(["https://api.preprod.sokosumi.com/v1/tasks"]);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.redirect).toBe("error");
    const headers = new Headers(calls[0]?.headers);
    expect(headers.get("authorization")).toBe("Bearer synthetic-api-token");
    expect(headers.get("x-organization-slug")).toBe("org-slug");
    const body = JSON.parse(calls[0]?.body as string) as {
      coworkerId: string;
      status: string;
      description: string;
    };
    expect(body.coworkerId).toBe("coworker-1");
    expect(body.status).toBe("READY");
    expect(JSON.parse(body.description)).toEqual({
      orderId: "ord_01",
      storeId: "s1",
      productEan: EAN,
    });
    expect(seen).toEqual(["task-1"]);
  });

  it("a Task priced above the cap is reported (id kept for reconciliation), not silently accepted", async () => {
    const seen: string[] = [];
    const client = new RealSokosumiClient(realEnv(), () =>
      Promise.resolve(Response.json({ data: { id: "task-2", credits: 500 } }, { status: 201 })),
    );
    await expect(client.createTask(task, (id) => seen.push(id))).rejects.toMatchObject({
      code: "sokosumi_unavailable",
      details: { reason: "task_above_credit_cap", taskId: "task-2" },
    });
    expect(seen).toEqual(["task-2"]);
  });

  it("a created Task whose price is missing or whose answer is odd still records its id", async () => {
    for (const data of [{ id: "task-3" }, { id: "task-4", credits: "100" }]) {
      const seen: string[] = [];
      const client = new RealSokosumiClient(realEnv(), () =>
        Promise.resolve(Response.json({ data }, { status: 201 })),
      );
      await expect(client.createTask(task, (id) => seen.push(id))).rejects.toMatchObject({
        code: "sokosumi_unavailable",
      });
      expect(seen).toEqual([data.id]);
    }
  });

  it("reads a Task's price with a GET; anything odd is unknown, never an error", async () => {
    const urls: string[] = [];
    const calls: RequestInit[] = [];
    const answer = (data: unknown, status = 200) => {
      const client = new RealSokosumiClient(realEnv(), (url, init) => {
        urls.push(url instanceof Request ? url.url : String(url));
        calls.push(init!);
        return Promise.resolve(Response.json({ data }, { status }));
      });
      return client.taskCredits("task-1");
    };
    await expect(answer({ id: "task-1", totalCredits: 100 })).resolves.toBe(100);
    expect(urls[0]).toBe("https://api.preprod.sokosumi.com/v1/tasks/task-1");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.redirect).toBe("error");
    expect(new Headers(calls[0]?.headers).get("authorization")).toBe("Bearer synthetic-api-token");
    await expect(answer({ id: "task-1", credits: 40 })).resolves.toBe(40);
    await expect(answer({ id: "task-1" })).resolves.toBeUndefined();
    await expect(answer({ id: "task-1", totalCredits: "100" })).resolves.toBeUndefined();
    await expect(answer({ id: "task-1", totalCredits: 100 }, 404)).resolves.toBeUndefined();
    const client = new RealSokosumiClient(realEnv(), () => Promise.reject(new Error("reset")));
    await expect(client.taskCredits("task-1")).resolves.toBeUndefined();
    await expect(client.taskCredits("../x")).resolves.toBeUndefined();
  });

  it("hides upstream bodies, errors and malformed responses; does not retry", async () => {
    for (const response of [
      new Response("synthetic-api-token", { status: 401 }),
      Response.json({ data: "invalid" }, { status: 201 }),
      Response.json({ data: { id: "../x" } }, { status: 201 }),
    ]) {
      let count = 0;
      const client = new RealSokosumiClient(realEnv(), () => {
        count++;
        return Promise.resolve(response);
      });
      const err = await client.createTask(task).catch((e: unknown) => e);
      expect(err).toMatchObject({
        code: "sokosumi_unavailable",
        message: "Sokosumi request could not be confirmed.",
      });
      expect(JSON.stringify(err)).not.toContain("synthetic-api-token");
      expect(count).toBe(1);
    }
  });
});
