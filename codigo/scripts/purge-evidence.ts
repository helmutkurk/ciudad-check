// GDPR purge after the event (task B-12, security.md 4.9): deletes the worker photos and the
// engine records that hold worker data (claims: payout address and display name; submissions:
// capture location and image reference; payouts: worker address), the payout queue entries, the
// verifier's idempotency cache (verdicts derived from photos) and the hub-up logs. Keeps jobs,
// tasks, verdicts and settlements, and never touches the evidence ledger (checked by hash) or
// docs/evidence/.
//   node --env-file=.env --import tsx scripts/purge-evidence.ts            (dry run: counts only)
//   node --env-file=.env --import tsx scripts/purge-evidence.ts --confirm  (delete)
// Refuses unless the engine is clearly stopped (connection refused), while any payout is not
// final (journal or queue), and when a path leaves the data dir or points into docs/evidence.
// Afterwards the engine must not be restarted on this data dir (claims are gone).
// Exit 0 ok, 1 refused, 2 error.
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { AppError, EngineEnvSchema, PayoutSchema, loadEnv } from "@shelfie/core";
import type { EngineEnv, Payout } from "@shelfie/core";
import { z } from "zod";

/** A payout's address may only be deleted once nothing can move anymore. */
const FINAL_PAYOUT_STATES = new Set(["CONFIRMED", "FAILED_FINAL"]);

function refuse(msg: string): never {
  process.stderr.write(`refused: ${msg}\n`);
  process.exit(1);
}
const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const sha = (path: string): string | null =>
  existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null;
const inside = (child: string, parent: string): boolean => {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
};
const inDocsEvidence = (p: string): boolean => p.split(sep).join("/").includes("/docs/evidence");

/** Atomic rewrite (tmp + rename), owner-only. */
function rewrite(path: string, body: string): void {
  const tmp = `${path}.purge.tmp`;
  rmSync(tmp, { force: true }); // never write through a stale or planted tmp
  writeFileSync(tmp, body, { mode: 0o600, flag: "wx" });
  renameSync(tmp, path);
}

/** Only a refused connection proves the engine is down; a timeout or reset could be a busy engine. */
async function engineStopped(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${String(port)}/api/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return false;
  } catch (err) {
    const cause = err instanceof Error ? (err.cause as { code?: unknown } | undefined) : undefined;
    return cause?.code === "ECONNREFUSED";
  }
}

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: { confirm: { type: "boolean", default: false } },
    strict: true,
  });
  let env: EngineEnv;
  try {
    env = loadEnv(EngineEnvSchema, process.env);
  } catch (err) {
    if (err instanceof AppError) refuse(err.message);
    throw err;
  }

  const dataDir = resolve(dirname(env.STORE_PATH));
  if (!existsSync(dataDir))
    refuse("data dir does not exist (check STORE_PATH and the working dir).");
  const dataReal = realpathSync(dataDir);
  const imageDir = join(dataDir, "images");
  const journal = resolve(env.STORE_PATH);
  const queueFile = resolve(env.PAYOUT_STORE_PATH ?? join(dataDir, "payout-queue.json"));
  const cacheFile = resolve(
    process.env["IDEMPOTENCY_CACHE_PATH"] ?? "./data/idempotency-cache.json",
  );
  const ledger = resolve(env.LEDGER_PATH);
  for (const p of [dataReal, journal, queueFile, cacheFile]) {
    if (inDocsEvidence(p)) refuse("a purge path points into docs/evidence; refusing.");
  }
  if (existsSync(imageDir)) {
    if (lstatSync(imageDir).isSymbolicLink()) refuse("images/ is a symlink; refusing.");
    if (!inside(realpathSync(imageDir), dataReal)) refuse("images/ resolves outside the data dir.");
  }
  if (inside(ledger, imageDir)) refuse("the ledger lies inside images/; refusing.");
  if (!(await engineStopped(env.ENGINE_PORT))) {
    refuse(
      "the engine is not clearly stopped (stop it with hub-up.sh stop or systemctl, then retry).",
    );
  }

  // every payout must be final before its address is deleted: queue file AND journal records
  const queue = existsSync(queueFile)
    ? z.array(PayoutSchema).parse(JSON.parse(readFileSync(queueFile, "utf8")))
    : [];
  const lines = existsSync(journal)
    ? readFileSync(journal, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
    : [];
  const journalPayouts = new Map<string, Payout>();
  const keep: string[] = [];
  const dropped = { claims: 0, submissions: 0, payouts: 0 };
  for (const line of lines) {
    const rec = JSON.parse(line) as { c?: unknown; v?: unknown };
    if (rec.c === "payouts") {
      const p = PayoutSchema.safeParse(rec.v);
      if (p.success) journalPayouts.set(p.data.id, p.data); // last write wins
    }
    if (rec.c === "claims" || rec.c === "submissions" || rec.c === "payouts") dropped[rec.c]++;
    else keep.push(line);
  }
  const open = [...queue, ...journalPayouts.values()].filter(
    (p) => !FINAL_PAYOUT_STATES.has(p.state),
  );
  if (open.length > 0) {
    refuse(
      `${String(open.length)} payout(s) not final (QUEUED/SENDING/SUBMITTED/UNKNOWN); finish them first.`,
    );
  }

  const photos = existsSync(imageDir)
    ? readdirSync(imageDir).filter((f) => lstatSync(join(imageDir, f)).isFile())
    : [];
  const runDir = join(process.env["TMPDIR"] ?? tmpdir(), "shelfie-hub");
  const logs = existsSync(runDir) ? readdirSync(runDir).filter((f) => f.endsWith(".log")) : [];

  out(`data dir      ${dataReal}`);
  out(`photos        ${String(photos.length)} file(s) in images/`);
  out(
    `journal       drop claims ${String(dropped.claims)}, submissions ${String(dropped.submissions)}, payouts ${String(dropped.payouts)}; keep ${String(keep.length)} line(s)`,
  );
  out(`payout queue  ${String(queue.length)} final payout(s) with worker addresses`);
  out(`verify cache  ${existsSync(cacheFile) ? "present (deleted)" : "absent"}`);
  out(`hub logs      ${String(logs.length)} file(s) in ${runDir}`);
  out(`ledger        untouched (${existsSync(ledger) ? "present" : "absent"})`);
  if (!args.confirm) {
    out("DRY RUN: nothing deleted. Add --confirm after the event.");
    return;
  }

  const ledgerBefore = sha(ledger);
  // addresses first (journal, queue), then derived data, then photos and logs
  if (lines.length > 0) rewrite(journal, keep.length > 0 ? `${keep.join("\n")}\n` : "");
  if (queue.length > 0) rewrite(queueFile, "[]");
  rmSync(cacheFile, { force: true });
  for (const f of photos) rmSync(join(imageDir, f), { force: true });
  for (const f of logs) rmSync(join(runDir, f), { force: true });
  if (sha(ledger) !== ledgerBefore) {
    process.stderr.write("ERROR: the evidence ledger changed during the purge; check it now.\n");
    process.exit(2);
  }
  out(
    `purged: ${String(photos.length)} photo(s), ${String(dropped.claims + dropped.submissions + dropped.payouts)} journal record(s), ${String(queue.length)} queue entr(ies), ${String(logs.length)} log(s); ledger hash unchanged`,
  );
  out("Do not restart the engine on this data dir: its claims and submissions are gone.");
}

main().catch((err: unknown) => {
  process.stderr.write(`purge-evidence error: ${err instanceof Error ? err.name : "unknown"}\n`);
  process.exit(2);
});
