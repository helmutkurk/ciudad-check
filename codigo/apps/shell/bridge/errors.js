// Errors of the bridge. Codes mirror the engine's stable codes (contracts.md section 0) where
// the engine produced them; `bridge_*` codes are ours. The shell stays JavaScript (no @shelfie/core).

export class BridgeError extends Error {
  /**
   * @param {string} code stable machine-readable code
   * @param {string} message human-readable, safe to post as a Sokosumi comment
   * @param {{ status?: number, details?: Record<string, unknown> }} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.status = extra.status ?? 0;
    this.details = extra.details ?? {};
  }
}

/**
 * Thrown by `answerOrThrow` when the job is withheld. The starter must treat it as
 * "no result hash, no completion" so the buyer's no-result auto-refund applies.
 * verify Friday: exact starter mechanism (runbook section 4: stock behaviour blocks on errors).
 */
export class WithheldError extends Error {
  /**
   * @param {string} reason machine-readable reason, for example "no_passing_photo"
   * @param {string} comment human-readable text for the Sokosumi task comment
   */
  constructor(reason, comment) {
    super(comment);
    this.name = "WithheldError";
    this.reason = reason;
    this.comment = comment;
  }
}
