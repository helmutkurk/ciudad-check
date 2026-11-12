import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ObservedExtractionSchema,
  OosExtractionSchema,
  VerifierEnvSchema,
  collectSecretValues,
  createLogger,
  loadEnv,
  systemClock,
} from "@shelfie/core";
import type { Clock } from "@shelfie/core";
import { promptOutcome, shelfPack, thresholdsFromPack } from "@shelfie/domain-shelf";
import { createEvaluator, stubVisionOptions, withStubTask } from "@shelfie/verifier";
import type { Evaluator } from "@shelfie/verifier";
import { StubVisionClient, createVisionClient, enforceSchema } from "@shelfie/vision";
import { loadLabels } from "./labels.js";
import { createDryEvaluator } from "./http.js";
import { computeMetrics, renderMarkdown } from "./report.js";
import type { Metrics } from "./report.js";
import { replayMapFrom, runLabels, switchableStub } from "./run.js";
import type { EntryResult, RunResults } from "./run.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVAL_DIR = resolve(HERE, "..");

export interface ExecuteOptions {
  mode: "stub" | "live" | "replay";
  labelsPath?: string;
  photosDir?: string;
  /** Live mode only: POST to this origin's admin dry endpoint instead of local vision. */
  verifierUrl?: string;
  outDir?: string;
  /** Use generated stand-in photos for entries without a file. Default: true in stub mode only. */
  synthetic?: boolean;
  replayFrom?: string;
  costPerCheckEur?: number | null;
  note?: string | null;
  env?: Record<string, string | undefined>;
  clock?: Clock;
  write?: boolean;
  onEntry?: (r: EntryResult) => void;
}

export interface ExecuteOutput {
  results: RunResults;
  metrics: Metrics;
  markdown: string;
  jsonPath: string | null;
  mdPath: string | null;
}

export async function execute(opts: ExecuteOptions): Promise<ExecuteOutput> {
  const clock = opts.clock ?? systemClock;
  const labelsPath = opts.labelsPath ?? join(EVAL_DIR, "labels.json");
  const photosDir = opts.photosDir ?? join(EVAL_DIR, "photos");
  const outDir = opts.outDir ?? join(EVAL_DIR, "results");
  const labels = loadLabels(labelsPath).labels;
  const thresholds = thresholdsFromPack(shelfPack);
  const logger = createLogger({ level: "warn", base: { component: "eval" } });
  const synthetic = opts.synthetic ?? opts.mode === "stub";

  let evaluator: Pick<Evaluator, "evaluate">;
  let beforeEntry: ((l: (typeof labels)[number]) => void) | undefined;
  let provider = "stub";
  const models = new Set<string>();
  const sourceEnv = opts.env ?? process.env;
  const verifierUrl = opts.verifierUrl ?? sourceEnv["EVAL_VERIFIER_URL"];
  if (opts.verifierUrl && opts.mode !== "live") {
    throw new Error("--verifier-url requires --mode live");
  }

  if (opts.mode === "live" && verifierUrl) {
    evaluator = createDryEvaluator(verifierUrl, sourceEnv["ADMIN_TOKEN"]);
    provider = "dry HTTP (NOT evidence)";
  } else if (opts.mode === "stub") {
    const vision = new StubVisionClient(stubVisionOptions());
    evaluator = withStubTask(createEvaluator({ vision, thresholds, logger }));
  } else if (opts.mode === "replay") {
    if (!opts.replayFrom) throw new Error("replay mode needs replayFrom (a results JSON file)");
    const stored = JSON.parse(readFileSync(opts.replayFrom, "utf8")) as RunResults;
    const map = replayMapFrom(stored);
    const sw = switchableStub();
    evaluator = createEvaluator({ vision: sw.client, thresholds, logger });
    beforeEntry = (l) => {
      sw.set(map.get(l.file));
    };
    provider = `replay of ${stored.meta.provider}`;
  } else {
    const source = { ...(opts.env ?? process.env), VERIFIER_MODE: "live", ENABLE_DRY: "true" };
    const env = loadEnv(VerifierEnvSchema, source);
    const vlogger = createLogger({
      level: env.LOG_LEVEL,
      base: { component: "eval" },
      secretValues: collectSecretValues(source),
    });
    const vision = createVisionClient(env, vlogger, {
      validate: (req, json) =>
        promptOutcome(req.prompt) === "OBSERVED"
          ? enforceSchema(ObservedExtractionSchema, json)
          : enforceSchema(OosExtractionSchema, json),
    });
    evaluator = createEvaluator({
      vision,
      thresholds,
      logger: vlogger,
      visionTimeoutMs: env.VISION_TIMEOUT_MS,
    });
    provider = env.VISION_PROVIDER ?? "gemini";
  }

  const startedAt = clock.nowIso();
  const entries = await runLabels({
    labels,
    photosDir,
    evaluator,
    clock,
    synthetic,
    ...(beforeEntry ? { beforeEntry } : {}),
    ...(opts.onEntry ? { onEntry: opts.onEntry } : {}),
  });
  for (const e of entries)
    if (e.actual) models.add(`${e.actual.model.provider}/${e.actual.model.id}`);

  const results: RunResults = {
    meta: {
      startedAt,
      finishedAt: clock.nowIso(),
      mode: opts.mode,
      synthetic: synthetic && entries.some((e) => e.status === "ran"),
      provider,
      models: [...models],
      thresholds:
        opts.mode === "live" && verifierUrl
          ? { source: "remote verifier; thresholds not reported by dry endpoint" }
          : thresholds,
      labelsFile: labelsPath,
      note: opts.note ?? null,
      costPerCheckEur: opts.costPerCheckEur ?? null,
    },
    entries,
  };
  const metrics = computeMetrics(entries);
  const markdown = renderMarkdown(results, metrics);

  let jsonPath: string | null = null;
  let mdPath: string | null = null;
  if (opts.write ?? true) {
    mkdirSync(outDir, { recursive: true });
    const stamp = results.meta.startedAt.replace(/[:.]/g, "-");
    jsonPath = join(outDir, `${stamp}.json`);
    mdPath = join(outDir, `${stamp}.md`);
    writeFileSync(jsonPath, `${JSON.stringify({ ...results, metrics }, null, 2)}\n`);
    writeFileSync(mdPath, markdown);
  }
  return { results, metrics, markdown, jsonPath, mdPath };
}
