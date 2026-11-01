import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, it } from "node:test";
import { BridgeError, WithheldError, createBridge, loadBridgeConfig, parseSokosumiInput } from "./index.js";

// Fake engine on node:http (127.0.0.1, random port). Nothing leaves the machine.
const TOKEN = "test-shell-token"; // fake value for the fake engine only

/** @type {import("node:http").Server} */
let server;
/** @type {{ method: string, url: string, headers: Record<string, any>, body: any }[]} */
let calls;
/** @type {{ create: (call: any) => [number, any], decision: (call: any) => [number, any], catalog?: (call: any) => [number, any] }} */
let script;
let baseUrl = "";

beforeEach(async () => {
  calls = [];
  script = {
    create: () => [201, { job: { id: "job_01", state: "COLLECTING" }, tasks: [] }],
    decision: () => [200, { jobId: "job_01", status: "PENDING" }],
  };
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const call = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : undefined };
      calls.push(call);
      let reply = [404, { error: { code: "not_found", message: "no route", details: {} } }];
      if (call.headers["x-shell-token"] !== TOKEN) reply = [401, { error: { code: "unauthorized", message: "bad token", details: {} } }];
      else if (call.method === "POST" && call.url === "/api/jobs") reply = script.create(call);
      else if (call.method === "GET" && call.url.startsWith("/api/jobs/job_01/decision")) reply = script.decision(call);
      else if (call.method === "POST" && call.url === "/api/jobs/job_01/settlement-events") reply = [201, { ok: true }];
      else if (call.method === "GET" && call.url === "/api/catalog" && script.catalog) reply = script.catalog(call);
      res.writeHead(reply[0], { "Content-Type": "application/json" });
      res.end(JSON.stringify(reply[1]));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const silent = { info: () => {}, warn: () => {} };
const makeBridge = (extra = {}) =>
  createBridge(
    loadBridgeConfig({ ENGINE_URL: baseUrl, SHELL_TOKEN: TOKEN, SHELL_DECISION_POLL_SEC: "0", ...extra }),
    { sleep: async () => {}, logger: silent },
  );
const INPUT = { productEan: "4000000000000", storeId: "s1" };
const decisions = (...replies) => {
  let i = 0;
  return () => [200, replies[Math.min(i++, replies.length - 1)]];
};

describe("input parsing", () => {
  it("keeps catalog ids only and drops free text", () => {
    const parsed = parseSokosumiInput({ productEan: "4000000000000", stores: [{ id: "s1", name: "Store A" }], note: "hi" });
    assert.deepEqual(parsed, { productEan: "4000000000000", stores: [{ id: "s1" }] });
  });
  it("accepts a JSON string and storeId", () => {
    assert.deepEqual(parseSokosumiInput(JSON.stringify(INPUT)), { productEan: "4000000000000", stores: [{ id: "s1" }] });
  });
  it("rejects input without a product and a store", () => {
    assert.throws(() => parseSokosumiInput({ productEan: "x" }), (e) => e instanceof BridgeError && e.code === "input_schema_violation");
    assert.throws(() => parseSokosumiInput("not json"), BridgeError);
  });
});

describe("config", () => {
  it("fails fast on a missing token and names the variable, not a value", () => {
    assert.throws(() => loadBridgeConfig({ ENGINE_URL: baseUrl }), /SHELL_TOKEN is required/);
  });
  it("applies defaults", () => {
    const c = loadBridgeConfig({ SHELL_TOKEN: "t" });
    assert.equal(c.engineUrl, "http://127.0.0.1:4000");
    assert.equal(c.deadlineMarginSec, 300);
    assert.equal(c.packId, "shelf-check");
  });
});

describe("create job", () => {
  it("resolves a free-text request against the engine catalog and still sends ids only", async () => {
    script.catalog = () => [
      200,
      { cities: [{ id: "munich", name: "München", stores: [{ id: "s1", name: "REWE", chain: "REWE", address: "Main Street 1" }], products: [{ ean: "4000000000000", name: "Nutella 450 g" }] }] },
    ];
    const bridge = makeBridge();
    await bridge.createJob("Nutella at the REWE on Main Street", "sokosumi-task-9");
    const create = calls.find((c) => c.method === "POST");
    assert.deepEqual(create?.body.input, { productEan: "4000000000000", stores: [{ id: "s1" }] });
  });

  it("sends ids only, the shell token and externalRef = Sokosumi task id", async () => {
    const bridge = makeBridge();
    const { jobId, created } = await bridge.createJob(INPUT, "sokosumi-task-1");
    assert.equal(jobId, "job_01");
    assert.equal(created, true);
    assert.equal(calls[0].headers["x-shell-token"], TOKEN);
    assert.deepEqual(calls[0].body, {
      packId: "shelf-check",
      source: "shell",
      externalRef: "sokosumi-task-1",
      input: { productEan: "4000000000000", stores: [{ id: "s1" }] },
    });
  });

  it("is idempotent: a repeated create returns the same job (engine answers 200)", async () => {
    const bridge = makeBridge();
    await bridge.createJob(INPUT, "sokosumi-task-1");
    script.create = () => [200, { job: { id: "job_01", state: "COLLECTING" }, tasks: [] }];
    const again = await bridge.createJob(INPUT, "sokosumi-task-1");
    assert.deepEqual(again, { jobId: "job_01", created: false });
  });

  it("retries a transient 503 and then succeeds", async () => {
    let n = 0;
    script.create = () =>
      n++ === 0
        ? [503, { error: { code: "dependency_unavailable", message: "busy", details: {} } }]
        : [201, { job: { id: "job_01", state: "COLLECTING" }, tasks: [] }];
    const { jobId } = await makeBridge().createJob(INPUT, "t1");
    assert.equal(jobId, "job_01");
    assert.equal(calls.filter((c) => c.url === "/api/jobs").length, 2);
  });
});

describe("answer", () => {
  it("DELIVER: waits through PENDING and returns the report text", async () => {
    script.decision = decisions(
      { jobId: "job_01", status: "PENDING" },
      { jobId: "job_01", status: "DELIVER", outcomes: ["OBSERVED"], passed: 1, k: 1, n: 1, reportMd: "# Shelf check\nPrice 2.49 EUR", reportSha256: "abc" },
    );
    const text = await makeBridge().answer(INPUT, { sokosumiTaskId: "t1" });
    assert.equal(text, "# Shelf check\nPrice 2.49 EUR");
    assert.equal(calls.filter((c) => c.url.includes("/decision")).length, 2);
    assert.equal(calls.filter((c) => c.url.includes("settlement-events")).length, 0);
  });

  it("WITHHOLD: returns nothing (no hash) and records WITHHELD", async () => {
    script.decision = decisions({ jobId: "job_01", status: "WITHHOLD", passed: 0, k: 1, n: 1, reason: "no_passing_photo" });
    const bridge = makeBridge();
    assert.equal(await bridge.answer(INPUT, { sokosumiTaskId: "t1" }), undefined);
    const event = calls.find((c) => c.url.includes("settlement-events"));
    assert.equal(event.body.event, "WITHHELD");
    assert.equal(event.body.ref, "t1");
    assert.equal(event.body.note, "no_passing_photo");
  });

  it("answerOrThrow raises WithheldError with a buyer-readable comment", async () => {
    script.decision = decisions({ jobId: "job_01", status: "WITHHOLD", passed: 0, k: 1, n: 1, reason: "no_passing_photo" });
    await assert.rejects(
      makeBridge().answerOrThrow(INPUT, { sokosumiTaskId: "t1" }),
      (e) => e instanceof WithheldError && e.reason === "no_passing_photo" && /refunded/.test(e.comment),
    );
  });

  it("intake_rejected: no result, the reasons become the comment, nothing else is called", async () => {
    script.create = () => [
      422,
      { error: { code: "intake_rejected", message: "Store is not in the supported Munich catalog.", details: { reasons: [{ code: "unknown_store", field: "input.stores[0].id" }] } } },
    ];
    const result = await makeBridge().run(INPUT, { sokosumiTaskId: "t1" });
    assert.equal(result.kind, "withhold");
    assert.equal(result.reason, "intake_rejected");
    assert.match(result.comment, /unknown_store/);
    assert.equal(calls.filter((c) => c.url.includes("/decision")).length, 0);
  });

  it("stops before the submit deadline minus the margin and withholds", async () => {
    let clock = 1_000_000;
    const bridge = createBridge(
      loadBridgeConfig({ ENGINE_URL: baseUrl, SHELL_TOKEN: TOKEN, SHELL_DECISION_POLL_SEC: "0", SHELL_DEADLINE_MARGIN_SEC: "300" }),
      { sleep: async (ms) => void (clock += ms), now: () => clock, logger: silent },
    );
    const deadline = clock + 301_000; // 1 s of waiting left after the 300 s margin
    const result = await bridge.run(INPUT, { sokosumiTaskId: "t1", deadline });
    assert.equal(result.kind, "withhold");
    assert.equal(result.reason, "shell_deadline");
  });

  it("a wrong shell token surfaces as unauthorized, not as a withhold", async () => {
    const bridge = createBridge(loadBridgeConfig({ ENGINE_URL: baseUrl, SHELL_TOKEN: "wrong" }), { sleep: async () => {}, logger: silent });
    await assert.rejects(bridge.answer(INPUT, { sokosumiTaskId: "t1" }), (e) => e instanceof BridgeError && e.code === "unauthorized");
  });
});

describe("timing and escrow (A-25)", () => {
  it("clamps windowSec so the window closes before the deadline minus the margin", async () => {
    const t0 = 1_000_000_000_000;
    const bridge = createBridge(
      loadBridgeConfig({ ENGINE_URL: baseUrl, SHELL_TOKEN: TOKEN, SHELL_DECISION_POLL_SEC: "0", JOB_WINDOW_SEC: "600" }),
      { sleep: async () => {}, logger: silent, now: () => t0 },
    );
    await bridge.createJob(INPUT, "task-early", t0 + 17.5 * 60_000); // lock seen at +2.5 min of 20
    assert.equal(calls.at(-1).body.windowSec, 600);
    await bridge.createJob(INPUT, "task-late", t0 + 14 * 60_000); // lock seen at +6 min of 20
    assert.equal(calls.at(-1).body.windowSec, 14 * 60 - 300 - 30);
  });

  it("posts ESCROW_LOCKED with the lock tx once the job is created", async () => {
    script.decision = decisions({ jobId: "job_01", status: "DELIVER", reportMd: "# r", reportSha256: "x" });
    await makeBridge().run(INPUT, { sokosumiTaskId: "task-1", escrowTxHash: "a".repeat(64) });
    const ev = calls.find((c) => c.url.endsWith("/settlement-events"));
    assert.deepEqual([ev?.body.event, ev?.body.txHash, ev?.body.ref], ["ESCROW_LOCKED", "a".repeat(64), "task-1"]);
  });

  it("does not repost ESCROW_LOCKED when the create returns an existing job", async () => {
    script.create = () => [200, { job: { id: "job_01", state: "COLLECTING" }, tasks: [] }];
    script.decision = decisions({ jobId: "job_01", status: "DELIVER", reportMd: "# r", reportSha256: "x" });
    await makeBridge().run(INPUT, { sokosumiTaskId: "task-1", escrowTxHash: "a".repeat(64) });
    assert.equal(calls.filter((c) => c.url.endsWith("/settlement-events")).length, 0);
  });
});
