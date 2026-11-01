import { writeFileSync } from "node:fs";
import { BridgeError, WithheldError } from "./errors.js";

// Adapter from the starter's model seam to the bridge. The starter (d93783b) calls
// `answer(input, journal, deadline)` from worker.mjs (unpaid Task), paid-task.mjs (paid Task) and
// agent-api.mjs (MIP-003 job). In all three the journal path is `<dir>/<id>-session[.json]`,
// where <id> is the Sokosumi task id (or the MIP-003 job id): that is our idempotent externalRef.

/**
 * Task id from the starter's session journal path.
 * @param {string} journal
 * @returns {string}
 */
export function taskIdFromJournal(journal) {
  const file = String(journal).split(/[\\/]/).pop() ?? "";
  const id = file.replace(/-session(\.json)?$/, "");
  if (id === "" || id === file) {
    throw new BridgeError("bridge_input", "The starter journal path does not name a task.");
  }
  return id;
}

/**
 * Build a drop-in replacement for the starter's `answer(input, journal, deadline)`.
 * DELIVER resolves to the report text, which the starter hashes and submits.
 * WITHHOLD (or intake rejection, or the shell deadline) throws `WithheldError`: the starter then
 * records the task as blocked, submits no result and no hash, so the buyer's no-result refund applies.
 * @param {{ run: (input: unknown, ctx: { sokosumiTaskId: string, deadline?: number | Date }) => Promise<import("./bridge.js").BridgeResult> }} bridge
 * @param {{ writeJournal?: (path: string, text: string) => void }} [deps]
 */
export function createStarterAnswer(bridge, deps = {}) {
  const writeJournal = deps.writeJournal ?? ((path, text) => writeFileSync(path, text, { mode: 0o600 }));

  /**
   * @param {unknown} input Sokosumi task description (JSON with catalog ids)
   * @param {string} journal starter session journal path
   * @param {number} [deadline] submit deadline in epoch ms (paid paths only)
   * @param {{ escrowTxHash?: string }} [extra] confirmed lock tx (paid path)
   * @returns {Promise<string>}
   */
  async function answer(input, journal, deadline, extra = {}) {
    const sokosumiTaskId = taskIdFromJournal(journal);
    writeJournal(journal, JSON.stringify({ via: "shelfie-bridge", phase: "sending", sokosumiTaskId }));
    /** @type {{ sokosumiTaskId: string, deadline?: number, escrowTxHash?: string }} */
    const ctx = { sokosumiTaskId, deadline: Number.isFinite(deadline) ? deadline : undefined };
    if (typeof extra.escrowTxHash === "string" && /^[0-9a-f]{64}$/.test(extra.escrowTxHash)) ctx.escrowTxHash = extra.escrowTxHash;
    const result = await bridge.run(input, ctx);
    if (result.kind === "deliver") {
      writeJournal(journal, JSON.stringify({ via: "shelfie-bridge", phase: "answered", jobId: result.jobId, reportSha256: result.reportSha256 }));
      return result.resultText;
    }
    writeJournal(journal, JSON.stringify({ via: "shelfie-bridge", phase: "withheld", jobId: result.jobId, reason: result.reason }));
    throw new WithheldError(result.reason, result.comment);
  }
  // The engine create is idempotent on the Task id, so the starter may call this again after a
  // crash or restart in `model-pending` (a model call is not, so the starter keeps its stop there).
  answer.idempotent = true;
  return answer;
}
