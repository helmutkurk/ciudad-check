import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeError, WithheldError } from "./errors.js";
import { createStarterAnswer, taskIdFromJournal } from "./starter-answer.js";

// The starter's seam with a fake bridge: no engine, no files.

/** @param {(input: unknown, ctx: any) => any} run */
function setup(run) {
  /** @type {{ path: string, value: any }[]} */
  const writes = [];
  /** @type {any[]} */
  const runs = [];
  const answer = createStarterAnswer(
    {
      run: async (input, ctx) => {
        runs.push({ input, ctx });
        return run(input, ctx);
      },
    },
    { writeJournal: (path, text) => writes.push({ path, value: JSON.parse(text) }) },
  );
  return { answer, writes, runs };
}

describe("taskIdFromJournal", () => {
  it("reads the id from each starter journal shape", () => {
    assert.equal(taskIdFromJournal(".local/01a18c00-6853-722c-a809-4e36d00155fc-session.json"), "01a18c00-6853-722c-a809-4e36d00155fc");
    assert.equal(taskIdFromJournal(".local/standard-jobs/job-7-session"), "job-7");
    assert.equal(taskIdFromJournal(".local\\01a18c00-session.json"), "01a18c00");
  });

  it("refuses a path without the session suffix", () => {
    assert.throws(() => taskIdFromJournal(".local/task.json"), (e) => e instanceof BridgeError && e.code === "bridge_input");
    assert.throws(() => taskIdFromJournal(".local/-session.json"), BridgeError);
  });
});

describe("createStarterAnswer", () => {
  it("DELIVER returns the report text and passes task id and deadline to the bridge", async () => {
    const { answer, writes, runs } = setup(() => ({ kind: "deliver", jobId: "job_01", resultText: "# Report", reportSha256: "ab" }));
    const input = '{"productEan":"4000417025005","storeId":"rewe-1"}';
    assert.equal(await answer(input, ".local/t-1-session.json", 1_800_000_000_000), "# Report");
    assert.deepEqual(runs, [{ input, ctx: { sokosumiTaskId: "t-1", deadline: 1_800_000_000_000 } }]);
    assert.deepEqual(
      writes.map((w) => w.value.phase),
      ["sending", "answered"],
    );
    assert.equal(writes[1].value.jobId, "job_01");
    assert.ok(writes.every((w) => w.path === ".local/t-1-session.json"));
  });

  it("the unpaid worker passes no deadline", async () => {
    const { answer, runs } = setup(() => ({ kind: "deliver", jobId: "job_01", resultText: "ok", reportSha256: "" }));
    await answer("{}", ".local/t-2-session.json");
    assert.equal(runs[0].ctx.deadline, undefined);
  });

  it("WITHHOLD throws WithheldError so the starter submits no hash", async () => {
    const { answer, writes } = setup(() => ({ kind: "withhold", jobId: "job_01", reason: "no_passing_photo", comment: "Refunded." }));
    await assert.rejects(
      answer("{}", ".local/t-3-session.json", 1),
      (e) => e instanceof WithheldError && e.reason === "no_passing_photo" && e.comment === "Refunded.",
    );
    assert.equal(writes.at(-1)?.value.phase, "withheld");
  });

  it("an intake rejection is a withhold without a job", async () => {
    const { answer, writes } = setup(() => ({ kind: "withhold", jobId: null, reason: "intake_rejected", comment: "Unknown store." }));
    await assert.rejects(answer("{}", ".local/t-4-session.json"), (e) => e instanceof WithheldError && e.reason === "intake_rejected");
    assert.equal(writes.at(-1)?.value.jobId, null);
  });

  it("engine errors propagate unchanged", async () => {
    const { answer } = setup(() => {
      throw new BridgeError("dependency_unavailable", "The Shelfie engine is not reachable.", { status: 503 });
    });
    await assert.rejects(answer("{}", ".local/t-5-session.json"), (e) => e instanceof BridgeError && e.code === "dependency_unavailable");
  });
});

describe("recovery and escrow pass-through (A-25)", () => {
  it("is marked idempotent and passes a valid lock tx hash only", async () => {
    const { answer, runs } = setup(() => ({ kind: "deliver", jobId: "job_1", resultText: "r", reportSha256: "h" }));
    assert.equal(answer.idempotent, true);
    await answer("{}", ".local/t1-session.json", 5, { escrowTxHash: "b".repeat(64) });
    await answer("{}", ".local/t1-session.json", 5, { escrowTxHash: "not-a-hash" });
    assert.deepEqual(runs.map((r) => r.ctx.escrowTxHash), ["b".repeat(64), undefined]);
  });
});
