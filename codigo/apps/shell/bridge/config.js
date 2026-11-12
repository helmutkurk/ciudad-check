import { BridgeError } from "./errors.js";

/**
 * @typedef {object} BridgeConfig
 * @property {string} engineUrl            ENGINE_URL, no trailing slash
 * @property {string} shellToken           SHELL_TOKEN (never logged)
 * @property {number} decisionPollSec      SHELL_DECISION_POLL_SEC, long-poll waitSec (0..60)
 * @property {number} deadlineMarginSec    SHELL_DEADLINE_MARGIN_SEC, kept free for hashing and submitting
 * @property {string} packId               PACK_ID
 * @property {number} [windowSec]          optional JOB_WINDOW_SEC override sent as `windowSec`
 */

/**
 * Read the bridge settings from an env object (names only, from contracts.md section 5.4).
 * Never reads files. Missing or malformed values fail fast and name the variable, not its value.
 * @param {Record<string, string | undefined>} [env]
 * @returns {BridgeConfig}
 */
export function loadBridgeConfig(env = process.env) {
  const text = (name) => {
    const v = env[name];
    return v === undefined || v.trim() === "" ? undefined : v.trim();
  };
  const int = (name, fallback, min, max) => {
    const raw = text(name);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new BridgeError("bridge_config", `${name} must be an integer from ${min} to ${max}`);
    }
    return n;
  };

  const engineUrl = (text("ENGINE_URL") ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(engineUrl)) {
    throw new BridgeError("bridge_config", "ENGINE_URL must start with http:// or https://");
  }
  const shellToken = text("SHELL_TOKEN");
  if (shellToken === undefined) throw new BridgeError("bridge_config", "SHELL_TOKEN is required");

  /** @type {BridgeConfig} */
  const config = {
    engineUrl,
    shellToken,
    decisionPollSec: int("SHELL_DECISION_POLL_SEC", 20, 0, 60),
    deadlineMarginSec: int("SHELL_DEADLINE_MARGIN_SEC", 300, 0, 3600),
    packId: text("PACK_ID") ?? "shelf-check",
  };
  const windowSec = text("JOB_WINDOW_SEC");
  if (windowSec !== undefined) config.windowSec = int("JOB_WINDOW_SEC", 900, 1, 86400);
  return config;
}
