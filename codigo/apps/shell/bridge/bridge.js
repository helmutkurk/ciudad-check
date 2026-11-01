import { resolveCatalogInput } from "./catalog-input.js";
import { BridgeError, WithheldError } from "./errors.js";

// The only shell code of ours (contracts.md section 1.6). The starter's job handler calls
// `answer(input, ctx)` where it used to call the model: it returns the result text to hash and
// submit (DELIVER) or `undefined` (WITHHOLD) so no result hash is submitted and the buyer's
// no-result auto-refund applies. No business logic here: ids in, decision out.

/**
 * @typedef {import("./config.js").BridgeConfig} BridgeConfig
 * @typedef {{ productEan: string, stores: { id: string }[] }} JobInput  ids only (ADR-17)
 * @typedef {{ kind: "deliver", jobId: string, resultText: string, reportSha256: string }
 *   | { kind: "withhold", jobId: string | null, reason: string, comment: string }} BridgeResult
 * @typedef {{ sokosumiTaskId: string, deadline?: number | Date, escrowTxHash?: string }} AnswerContext
 *   `deadline` is the starter's submit deadline (epoch ms, the payment's `submitResultTime`);
 *   `escrowTxHash` the confirmed FundsLocked tx, posted as ESCROW_LOCKED once the job exists.
 * @typedef {{ info: (msg: string, fields?: object) => void, warn: (msg: string, fields?: object) => void }} Logger
 */

const sleepReal = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @type {Logger} */
const jsonLogger = {
  info: (msg, fields = {}) => process.stdout.write(`${JSON.stringify({ level: "info", msg, ...fields })}\n`),
  warn: (msg, fields = {}) => process.stdout.write(`${JSON.stringify({ level: "warn", msg, ...fields })}\n`),
};

/**
 * Parse a Sokosumi task input into the pack's job input: catalog ids only (ADR-17).
 * Accepts an object or a JSON string with `productEan` and either `stores: [{ id }]` or `storeId`.
 * Anything else (names, addresses, free text) is dropped, never forwarded.
 * verify Friday: the real Coworker input schema and whether Sokosumi offers select fields; the
 * free-text-to-ids fallback (fuzzy match or LLM) is NOT built yet.
 * @param {unknown} input
 * @returns {JobInput}
 */
export function parseSokosumiInput(input) {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new BridgeError("input_schema_violation", "The request must carry a product and a store from the catalog.");
    }
  }
  if (typeof value !== "object" || value === null) {
    throw new BridgeError("input_schema_violation", "The request must carry a product and a store from the catalog.");
  }
  const o = /** @type {Record<string, unknown>} */ (value);
  const productEan = typeof o.productEan === "string" ? o.productEan.trim() : "";
  /** @type {string | undefined} */
  let storeId;
  if (typeof o.storeId === "string") storeId = o.storeId.trim();
  else if (Array.isArray(o.stores) && o.stores.length > 0) {
    const first = o.stores[0];
    if (typeof first === "object" && first !== null && typeof first.id === "string") storeId = first.id.trim();
  }
  if (!/^\d{8,14}$/.test(productEan) || !storeId) {
    throw new BridgeError("input_schema_violation", "The request must carry a product and a store from the catalog.");
  }
  return { productEan, stores: [{ id: storeId }] };
}

/**
 * @param {BridgeConfig} config
 * @param {{ fetchFn?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number, logger?: Logger }} [deps]
 */
export function createBridge(config, deps = {}) {
  const fetchFn = deps.fetchFn ?? ((input, init) => fetch(input, init));
  const sleep = deps.sleep ?? sleepReal;
  const now = deps.now ?? (() => Date.now());
  const log = deps.logger ?? jsonLogger;

  /**
   * One engine call. Throws BridgeError with the engine's stable code on an error body.
   * @param {"GET" | "POST"} method
   * @param {string} path
   * @param {unknown} [body]
   */
  async function engine(method, path, body) {
    /** @type {Record<string, string>} */
    const headers = { Accept: "application/json", "X-Shell-Token": config.shellToken };
    // A hung tunnel connection must not block the worker: the long poll gets its waitSec plus slack.
    const timeoutMs = (path.includes("/decision?") ? config.decisionPollSec + 15 : 15) * 1000;
    /** @type {RequestInit} */
    const init = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetchFn(`${config.engineUrl}${path}`, init);
    } catch {
      throw new BridgeError("dependency_unavailable", "The Shelfie engine is not reachable.", { status: 503 });
    }
    const text = await res.text();
    /** @type {any} */
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const e = json && typeof json === "object" ? json.error : undefined;
      throw new BridgeError(
        typeof e?.code === "string" ? e.code : res.status >= 500 ? "dependency_unavailable" : "invalid_request",
        typeof e?.message === "string" ? e.message : `Engine answered ${res.status}.`,
        { status: res.status, details: e?.details && typeof e.details === "object" ? e.details : {} },
      );
    }
    return { status: res.status, json };
  }

  /**
   * Retry only what is safe to repeat: the create is idempotent on `externalRef`, so a restarted
   * or retried call returns the same job (200 instead of 201).
   * @template T
   * @param {() => Promise<T>} fn
   */
  async function withRetry(fn, attempts = 3) {
    let last;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn();
      } catch (err) {
        last = err;
        const transient = err instanceof BridgeError && (err.code === "dependency_unavailable" || err.status === 503);
        if (!transient || i === attempts - 1) throw err;
        await sleep(500 * 2 ** i);
      }
    }
    throw last;
  }

  /**
   * Ids pass straight through (the dashboard format); dropdown indices, labels and free text are
   * resolved against the engine catalog (catalog-input.js). Unresolvable input stays an
   * `input_schema_violation`, which `run` turns into a withhold with a comment.
   * @param {unknown} sokosumiInput
   */
  async function toJobInput(sokosumiInput) {
    let violation;
    try {
      return parseSokosumiInput(sokosumiInput);
    } catch (err) {
      if (!(err instanceof BridgeError) || err.code !== "input_schema_violation") throw err;
      violation = err;
    }
    let catalog;
    try {
      ({ json: catalog } = await withRetry(() => engine("GET", "/api/catalog")));
    } catch (err) {
      if (err instanceof BridgeError && err.code === "dependency_unavailable") throw err;
      throw violation; // no catalog to resolve against: keep the plain rejection
    }
    return resolveCatalogInput(sokosumiInput, catalog);
  }

  /**
   * Create the engine job from a Sokosumi task. Idempotent: `externalRef` = Sokosumi task id.
   * With the submit deadline known, `windowSec` is clamped so the window closes before the bridge
   * stops waiting (deadline minus margin minus 30 s for the last long poll and the hash).
   * @param {unknown} sokosumiInput
   * @param {string} sokosumiTaskId
   * @param {number | Date} [deadline] submit deadline (epoch ms or Date)
   * @returns {Promise<{ jobId: string, created: boolean }>}
   */
  async function createJob(sokosumiInput, sokosumiTaskId, deadline) {
    if (typeof sokosumiTaskId !== "string" || sokosumiTaskId === "") {
      throw new BridgeError("bridge_input", "The Sokosumi task id is required for an idempotent create.");
    }
    const input = await toJobInput(sokosumiInput);
    /** @type {Record<string, unknown>} */
    const body = { packId: config.packId, source: "shell", externalRef: sokosumiTaskId, input };
    // ADR-20 correlation is separate from job input; engine validates it against the reservation.
    let value = sokosumiInput;
    if (typeof value === "string") { try { value = JSON.parse(value); } catch { value = null; } }
    if (typeof value === "object" && value !== null && typeof value.orderId === "string") {
      if (!/^ord_[A-Za-z0-9]+$/.test(value.orderId) || value.storeId !== input.stores[0].id) {
        throw new BridgeError("input_schema_violation", "Invalid order correlation.");
      }
      body.orderRef = { orderId: value.orderId, storeId: value.storeId };
    }
    if (config.windowSec !== undefined) body.windowSec = config.windowSec;
    const deadlineMs = deadline instanceof Date ? deadline.getTime() : deadline;
    if (typeof deadlineMs === "number" && Number.isFinite(deadlineMs)) {
      const fits = Math.floor((deadlineMs - config.deadlineMarginSec * 1000 - now()) / 1000) - 30;
      if (body.windowSec === undefined || fits < Number(body.windowSec)) body.windowSec = Math.max(1, fits);
    }
    const { status, json } = await withRetry(() => engine("POST", "/api/jobs", body));
    const jobId = json?.job?.id;
    if (typeof jobId !== "string") {
      throw new BridgeError("internal", "The engine answer did not contain a job id.", { status: 502 });
    }
    log.info("job_ready", { jobId, externalRef: sokosumiTaskId, created: status === 201, windowSec: body.windowSec });
    return { jobId, created: status === 201 };
  }

  /**
   * Long-poll the decision until DELIVER, WITHHOLD or the shell deadline minus the margin.
   * @param {string} jobId
   * @param {number | Date | undefined} [deadline] submit deadline (epoch ms or Date); verify Friday
   * @returns {Promise<{ status: "DELIVER", reportMd: string, reportSha256: string } | { status: "WITHHOLD", reason: string } | { status: "TIMEOUT" }>}
   */
  async function awaitDecision(jobId, deadline) {
    const deadlineMs = deadline instanceof Date ? deadline.getTime() : typeof deadline === "number" ? deadline : undefined;
    const stopAt = deadlineMs === undefined ? Infinity : deadlineMs - config.deadlineMarginSec * 1000;
    for (;;) {
      if (now() >= stopAt) return { status: "TIMEOUT" };
      const startedAt = now();
      try {
        const { json } = await engine("GET", `/api/jobs/${encodeURIComponent(jobId)}/decision?waitSec=${config.decisionPollSec}`);
        if (json?.status === "DELIVER" && typeof json.reportMd === "string") {
          return { status: "DELIVER", reportMd: json.reportMd, reportSha256: String(json.reportSha256 ?? "") };
        }
        if (json?.status === "WITHHOLD") {
          return { status: "WITHHOLD", reason: typeof json.reason === "string" ? json.reason : "no_passing_photo" };
        }
        // PENDING (or an unknown status): keep waiting.
      } catch (err) {
        if (!(err instanceof BridgeError) || (err.code !== "dependency_unavailable" && err.status !== 503)) throw err;
        log.warn("decision_poll_failed", { jobId, code: err.code });
      }
      // A long poll holds the request; if the engine answers at once, do not spin.
      const spent = now() - startedAt;
      if (spent < 1000) await sleep(1000 - spent);
    }
  }

  /**
   * Report a Masumi observation to the engine ledger (contracts.md 1.1). Never throws:
   * a ledger note must not break the payment path.
   * @param {string} jobId
   * @param {{ event: string, txHash?: string | null, ref?: string, note?: string }} event
   */
  async function postSettlementEvent(jobId, event) {
    try {
      await engine("POST", `/api/jobs/${encodeURIComponent(jobId)}/settlement-events`, {
        event: event.event,
        txHash: event.txHash ?? null,
        ref: event.ref ?? "",
        note: event.note ?? "",
      });
    } catch (err) {
      log.warn("settlement_event_failed", { jobId, event: event.event, code: err instanceof BridgeError ? err.code : "unknown" });
    }
  }

  /**
   * Whole bridge: Sokosumi input -> engine job -> decision -> result.
   * @param {unknown} input
   * @param {AnswerContext} ctx
   * @returns {Promise<BridgeResult>}
   */
  async function run(input, ctx) {
    /** @type {string} */
    let jobId;
    try {
      let created;
      ({ jobId, created } = await createJob(input, ctx.sokosumiTaskId, ctx.deadline));
      if (created && ctx.escrowTxHash) {
        await postSettlementEvent(jobId, { event: "ESCROW_LOCKED", txHash: ctx.escrowTxHash, ref: ctx.sokosumiTaskId });
      }
    } catch (err) {
      if (err instanceof BridgeError && (err.code === "intake_rejected" || err.code === "input_schema_violation")) {
        // No job, nothing paid to anyone. No hash; the comment tells the buyer why (contracts 1.1a).
        // verify Friday: whether the agent can decline before payment, and the INTAKE_REJECTED event
        // (it needs a job id, which a rejected request does not have).
        const reasons = Array.isArray(err.details.reasons) ? err.details.reasons.map((r) => r?.code).filter(Boolean) : [];
        return {
          kind: "withhold",
          jobId: null,
          reason: err.code,
          comment: reasons.length > 0 ? `${err.message} (${reasons.join(", ")})` : err.message,
        };
      }
      throw err;
    }

    const decision = await awaitDecision(jobId, ctx.deadline);
    if (decision.status === "DELIVER") {
      return { kind: "deliver", jobId, resultText: decision.reportMd, reportSha256: decision.reportSha256 };
    }
    const reason = decision.status === "WITHHOLD" ? decision.reason : "shell_deadline";
    const comment =
      decision.status === "WITHHOLD"
        ? "No photo passed the checks in time. The result is withheld and your fee is refunded."
        : "The job did not finish before the submit deadline. The result is withheld and your fee is refunded.";
    await postSettlementEvent(jobId, { event: "WITHHELD", ref: ctx.sokosumiTaskId, note: reason });
    return { kind: "withhold", jobId, reason, comment };
  }

  /**
   * The call the starter's job handler makes. Resolves to the result text (DELIVER) or
   * `undefined` (WITHHOLD): the caller must then submit no hash and may post `comment` via `run`.
   * @param {unknown} input
   * @param {AnswerContext} ctx
   * @returns {Promise<string | undefined>}
   */
  async function answer(input, ctx) {
    const result = await run(input, ctx);
    return result.kind === "deliver" ? result.resultText : undefined;
  }

  /**
   * Same, but throws `WithheldError` on WITHHOLD, for a starter that needs an error to skip the hash.
   * @param {unknown} input
   * @param {AnswerContext} ctx
   * @returns {Promise<string>}
   */
  async function answerOrThrow(input, ctx) {
    const result = await run(input, ctx);
    if (result.kind === "deliver") return result.resultText;
    throw new WithheldError(result.reason, result.comment);
  }

  return { createJob, awaitDecision, postSettlementEvent, run, answer, answerOrThrow };
}
