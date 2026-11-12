import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { addSeconds, systemClock } from "@shelfie/core";
import type {
  Clock,
  GateName,
  ReasonCode,
  VerifyContext,
  VerifyResponse,
  VerifyTask,
} from "@shelfie/core";
import { StubVisionClient } from "@shelfie/vision";
import type { Evaluator } from "@shelfie/verifier";
import type { Label } from "./labels.js";
import { syntheticPhoto } from "./synthetic.js";

// Runs `evaluate` over labelled photos with whatever Evaluator it is given (stub, replay or a
// live provider) and compares every verdict with the label. Photos are processed in order, so a
// `duplicateOf` label sees the earlier photo (and the evaluator's perceptual-hash memory).
// The evaluator is in-process by default, or an explicitly selected dry HTTP adapter.

export interface EntryResult {
  file: string;
  outcome: Label["outcome"];
  case: Label["case"];
  status: "ran" | "missing_photo" | "error";
  expect: Label["expect"];
  actual: {
    pass: boolean;
    failedGates: GateName[];
    reasonCodes: ReasonCode[];
    extraction: Record<string, unknown>;
    workerMessage: string;
    model: VerifyResponse["model"];
    wallLatencyMs: number;
  } | null;
  error?: { code: string; reason?: string; httpStatus?: number; providerMessage?: string };
  /** pass equals the label and every expected gate/reason is present. */
  matched: boolean | null;
  /** The decision itself (pass/fail) equals the label. */
  decisionCorrect: boolean | null;
  codeReadExact: boolean | null;
  priceExact: boolean | null;
}

export interface RunMeta {
  startedAt: string;
  finishedAt: string;
  mode: "stub" | "live" | "replay";
  synthetic: boolean;
  provider: string;
  models: string[];
  thresholds: unknown;
  labelsFile: string;
  /** Free text: git commit or note, supplied by the caller. */
  note: string | null;
  costPerCheckEur: number | null;
}

export interface RunResults {
  meta: RunMeta;
  entries: EntryResult[];
}

export interface RunOptions {
  labels: readonly Label[];
  photosDir: string;
  evaluator: Pick<Evaluator, "evaluate">;
  clock?: Clock;
  synthetic?: boolean;
  /** Replay: stored extraction per file, no model call (offline threshold tuning). */
  replay?: ReadonlyMap<string, unknown>;
  /** Hook that lets the caller point a swappable stub at the current photo's extraction. */
  beforeEntry?: (label: Label) => void;
  /** Wall-clock source for latency (injected for tests). */
  nowMs?: () => number;
  /** Per-entry logger (stdout in the CLI). */
  onEntry?: (r: EntryResult) => void;
}

const BASE_TIME = "2026-10-30T12:00:00.000Z";

function mimeFor(file: string): "image/jpeg" | "image/png" {
  return file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}
const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

export async function runLabels(opts: RunOptions): Promise<EntryResult[]> {
  const nowMs = opts.nowMs ?? (() => performance.now());
  const shaByFile = new Map<string, string>();
  const results: EntryResult[] = [];
  const runId = sha256(Buffer.from((opts.clock ?? systemClock).nowIso())).slice(0, 16);

  for (const label of opts.labels) {
    const base: Omit<
      EntryResult,
      "status" | "actual" | "matched" | "decisionCorrect" | "codeReadExact" | "priceExact"
    > = {
      file: label.file,
      outcome: label.outcome,
      case: label.case,
      expect: label.expect,
    };
    const empty = {
      actual: null,
      matched: null,
      decisionCorrect: null,
      codeReadExact: null,
      priceExact: null,
    };

    const path = isAbsolute(label.file) ? label.file : join(opts.photosDir, label.file);
    let bytes: Buffer | null = null;
    if (existsSync(path)) bytes = readFileSync(path);
    else if (opts.synthetic) bytes = await syntheticPhoto(label.file, label.stubScenario);
    if (!bytes) {
      const r: EntryResult = { ...base, status: "missing_photo", ...empty };
      results.push(r);
      opts.onEntry?.(r);
      continue;
    }
    shaByFile.set(label.file, sha256(bytes));

    const previous: string[] = [];
    if (label.duplicateOf) {
      const earlier = shaByFile.get(label.duplicateOf);
      if (earlier) previous.push(earlier);
    }
    const claimIssuedAt = BASE_TIME;
    // Full path hash avoids collisions between long WhatsApp names and directories.
    // Run namespace prevents the HTTP idempotency cache reusing an earlier eval's verdict.
    const entryId = `${runId}_${sha256(Buffer.from(label.file)).slice(0, 32)}`;
    const task: VerifyTask = {
      taskId: `tsk_${entryId}`,
      product: label.product,
      store: label.store,
      expectedCode: label.expectedCode,
      ...(label.expectedGesture
        ? {
            expectedGesture: label.expectedGesture,
            // synthetic: the sign was revealed 30 s before receipt (inside the 90 s window)
            challengeRevealedAt: addSeconds(claimIssuedAt, Math.max(0, label.claimOffsetSec - 30)),
          }
        : {}),
      outcome: label.outcome,
      claimIssuedAt,
      claimExpiresAt: addSeconds(claimIssuedAt, 300),
      taskWindowEndsAt: addSeconds(claimIssuedAt, 900),
      receivedAt: addSeconds(claimIssuedAt, label.claimOffsetSec),
    };
    const ctx: VerifyContext = {
      packId: "shelf-check",
      submissionId: `sub_${entryId}`,
      previousImageSha256: previous,
    };

    opts.beforeEntry?.(label);
    const started = nowMs();
    try {
      const verdict = await opts.evaluator.evaluate(
        task,
        { mimeType: mimeFor(label.file), base64: bytes.toString("base64"), sha256: sha256(bytes) },
        ctx,
      );
      const wall = Math.round(nowMs() - started);
      const reasonCodes = verdict.gates.flatMap((g) =>
        g.pass || !g.reasonCode ? [] : [g.reasonCode],
      );
      const decisionCorrect = verdict.pass === label.expect.pass;
      const gatesOk = label.expect.failedGates.every((g) => verdict.failedGates.includes(g));
      const reasonsOk = label.expect.reasonCodes.every((c) => reasonCodes.includes(c));
      const anyOk =
        label.expect.reasonCodesAnyOf.length === 0 ||
        label.expect.reasonCodesAnyOf.some((c) => reasonCodes.includes(c));
      const seenCode =
        (verdict.extraction["code"] as { text?: string | null } | undefined)?.text ?? null;
      const seenGesture = verdict.extraction["gesture"] as
        { fingers?: number | null; side?: string | null } | null | undefined;
      const priceSeen = verdict.extraction["verifierPriceValue"];
      const r: EntryResult = {
        ...base,
        status: "ran",
        actual: {
          pass: verdict.pass,
          failedGates: verdict.failedGates,
          reasonCodes,
          extraction: verdict.extraction,
          workerMessage: verdict.workerMessage,
          model: verdict.model,
          wallLatencyMs: wall,
        },
        matched: decisionCorrect && gatesOk && reasonsOk && anyOk,
        decisionCorrect,
        // challenge read: the gesture in gesture labels, else the written code
        codeReadExact: label.expectedGesture
          ? label.truth.gesture === undefined || label.truth.gesture === null
            ? null
            : seenGesture?.fingers === label.truth.gesture.fingers &&
              seenGesture.side === label.truth.gesture.side
          : label.truth.code === undefined || label.truth.code === null
            ? null
            : normalize(seenCode) === normalize(label.truth.code),
        priceExact:
          label.truth.priceValue === undefined || label.truth.priceValue === null
            ? null
            : typeof priceSeen === "number" && Math.abs(priceSeen - label.truth.priceValue) < 0.005,
      };
      results.push(r);
      opts.onEntry?.(r);
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err ? String(err.code) : "unknown";
      const details =
        typeof err === "object" && err !== null && "details" in err
          ? (err as { details: Record<string, unknown> }).details
          : {};
      const reason = typeof details["reason"] === "string" ? details["reason"] : "";
      const httpStatus = typeof details["status"] === "number" ? details["status"] : undefined;
      const providerMessage =
        typeof details["providerMessage"] === "string" ? details["providerMessage"] : undefined;
      const r: EntryResult = {
        ...base,
        status: "error",
        ...empty,
        error: {
          code,
          ...(reason ? { reason } : {}),
          ...(httpStatus ? { httpStatus } : {}),
          ...(providerMessage ? { providerMessage } : {}),
        },
      };
      results.push(r);
      opts.onEntry?.(r);
    }
  }
  return results;
}

const normalize = (s: string | null | undefined): string =>
  (s ?? "").toUpperCase().replace(/[\s-]+/g, "");

/** Stored extractions from an earlier results file, keyed by photo file name. */
export function replayMapFrom(results: RunResults): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const e of results.entries) {
    if (e.actual) {
      // verifier-added keys are not part of the model output; drop them before replay
      const { verifierNotes: _n, verifierPriceValue: _p, ...raw } = e.actual.extraction;
      void _n;
      void _p;
      m.set(e.file, raw);
    }
  }
  return m;
}

/** A StubVisionClient whose answer is switched per entry (replay and synthetic runs). */
export function switchableStub(): { client: StubVisionClient; set: (extraction: unknown) => void } {
  let current: unknown;
  const client = new StubVisionClient({ resolve: () => current, modelId: "replay" });
  return {
    client,
    set: (x) => {
      current = x;
    },
  };
}

export { systemClock };
