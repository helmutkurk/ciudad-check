// Read-only deployment audit. Node loads --env-file before this program (as in fund-check.ts).
// No writer classes, SDKs, mnemonics, child processes, or transaction submission.
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  FundCheckEnvSchema,
  IsoTimestampSchema,
  LovelaceSchema,
  PayoutAddressSchema,
  loadEnv,
} from "@shelfie/core";
import { z } from "zod";
import { auditConsistency } from "./ledger-audit-consistency.js";
import type { Discrepancy } from "./ledger-audit-consistency.js";
import { auditChain } from "./ledger-audit-chain.js";
import type { Query } from "./ledger-audit-chain.js";

// Compose the core's read-only public-env schema; do not load EngineEnvSchema/signing secrets.
const AuditEnvSchema = FundCheckEnvSchema.and(
  z.object({
    BLOCKFROST_PROJECT_ID: z.string().startsWith("preprod").optional(),
    SELLER_ADDRESS: PayoutAddressSchema.optional(),
    WALLET_ADDRESS_VBUY: PayoutAddressSchema.optional(),
    WALLET_ADDRESS_PAY: PayoutAddressSchema.optional(),
    STORE_PATH: z.string().min(1).default("./data/engine-events.jsonl"),
    LEDGER_PATH: z.string().min(1).default("./data/evidence-ledger.jsonl"),
    PAYOUT_STORE_PATH: z.string().min(1).optional(),
    PAYOUT_LOVELACE: LovelaceSchema.default("3000000"),
    VERIFY_PRICE_LOVELACE: LovelaceSchema.default("1000000"),
  }),
);
export const parseAuditEnv = (source: Record<string, string | undefined>) =>
  loadEnv(AuditEnvSchema, source);

/** Fixed-origin, GET-only, paced requests. Neither errors nor response bodies expose credentials. */
export function makeBlockfrostQuery(
  projectId: string,
  fetchImpl: typeof fetch = fetch,
  intervalMs = 125,
): Query {
  let lastRequest = 0;
  return async (path) => {
    // Only the internal routes used below; never let an address/hash become a URL or query string.
    if (
      !/^\/(?:blocks\/latest|txs\/[0-9a-f]{64}(?:\/utxos)?|addresses\/addr_test1[0-9a-z]+\/transactions\?count=100&page=\d+&order=desc&to=\d+)$/.test(
        path,
      )
    )
      throw new Error("Unexpected Blockfrost route");
    const wait = intervalMs - (Date.now() - lastRequest);
    if (wait > 0) await delay(wait);
    lastRequest = Date.now();
    const response = await fetchImpl(`https://cardano-preprod.blockfrost.io/api/v0${path}`, {
      method: "GET",
      headers: { project_id: projectId },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Blockfrost HTTP ${response.status}`);
    return response.json();
  };
}

/** Stat every source before AND after all reads; a concurrent append/rename fails the audit. */
function readSnapshot(
  paths: Record<string, string>,
  discrepancies: Discrepancy[],
): Record<string, string> {
  const contents: Record<string, string> = {};
  const signatures = new Map<string, string>();
  const signature = (path: string): string => {
    const st = statSync(path, { bigint: true });
    if (!st.isFile()) throw new Error("Not a file");
    return `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`;
  };
  for (const [label, path] of Object.entries(paths)) {
    try {
      signatures.set(label, signature(path));
    } catch {
      discrepancies.push({
        code: "source_unreadable",
        detail: `${label} is missing or unreadable.`,
      });
    }
  }
  for (const [label, path] of Object.entries(paths)) {
    contents[label] = "";
    if (!signatures.has(label)) continue;
    try {
      contents[label] = readFileSync(path, "utf8");
    } catch {
      discrepancies.push({ code: "source_unreadable", detail: `${label} could not be read.` });
    }
  }
  for (const [label, before] of signatures) {
    try {
      if (signature(paths[label]!) !== before)
        discrepancies.push({
          code: "snapshot_changed",
          detail: `${label} changed while reading; retry when writes are quiet.`,
        });
    } catch {
      discrepancies.push({
        code: "snapshot_changed",
        detail: `${label} disappeared while reading.`,
      });
    }
  }
  return contents;
}

const HELP = `Read-only Shelfie ledger audit (Cardano preprod)
From codigo/: node --env-file="$HOME/.config/shelfie/dev.env" --import tsx scripts/ledger-audit.ts [options]
  --since <ISO UTC>     Scope jobs by creation/activity; verify the whole hash chain regardless.
  --no-chain            Skip Blockfrost; local consistency only (explicitly incomplete).
  --store <path>        Engine event journal (default STORE_PATH).
  --ledger <path>       Evidence ledger (default LEDGER_PATH).
  --payout-store <path> Payout snapshot (default PAYOUT_STORE_PATH or next to STORE_PATH).
  --verify-state <path> Buyer snapshot (default verify-client.json next to STORE_PATH).
  --tx-log <path>       Markdown transaction log (default this checkout's docs/evidence/tx-hashes.md).
  --help               Show usage.
All paths are read only. Never writes data, repairs a store, signs or submits a transaction.
Exit 0: no discrepancies in the requested checks; exit 1: discrepancies or incomplete/error input.`;

/** Exported for socket-free CLI tests. Unknown errors/arguments are never echoed. */
export async function runAudit(
  argv = process.argv.slice(2),
  source = process.env,
  out: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`);
  },
): Promise<number> {
  try {
    const { values: args } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        since: { type: "string" },
        "no-chain": { type: "boolean", default: false },
        store: { type: "string" },
        ledger: { type: "string" },
        "payout-store": { type: "string" },
        "verify-state": { type: "string" },
        "tx-log": { type: "string" },
        help: { type: "boolean" },
      },
    });
    if (args.help) {
      out(HELP);
      return 0;
    }
    const now = new Date().toISOString();
    if (
      args.since &&
      (!IsoTimestampSchema.safeParse(args.since).success ||
        Date.parse(args.since) > Date.parse(now))
    ) {
      out("FAIL --since must be an ISO UTC timestamp at or before the audit start.");
      return 1;
    }
    const env = parseAuditEnv(source);
    if (
      !args["no-chain"] &&
      (!env.BLOCKFROST_PROJECT_ID ||
        !env.WALLET_ADDRESS_VBUY ||
        !env.WALLET_ADDRESS_PAY ||
        !env.SELLER_ADDRESS)
    ) {
      out(
        "FAIL chain audit needs BLOCKFROST_PROJECT_ID, WALLET_ADDRESS_VBUY, WALLET_ADDRESS_PAY and SELLER_ADDRESS (public addresses only).",
      );
      return 1;
    }
    if (
      env.WALLET_ADDRESS_VBUY &&
      env.WALLET_ADDRESS_PAY &&
      env.WALLET_ADDRESS_VBUY === env.WALLET_ADDRESS_PAY
    ) {
      out("FAIL W-VBUY and W-PAY must be separate wallets.");
      return 1;
    }
    if (
      env.SELLER_ADDRESS &&
      [env.WALLET_ADDRESS_PAY, env.WALLET_ADDRESS_VBUY].includes(env.SELLER_ADDRESS)
    ) {
      out("FAIL W-SELL must be separate from the buyer and payout wallets.");
      return 1;
    }
    const storePath = args.store ?? env.STORE_PATH;
    const sourceDiscrepancies: Discrepancy[] = [];
    const text = readSnapshot(
      {
        journal: storePath,
        ledger: args.ledger ?? env.LEDGER_PATH,
        payouts:
          args["payout-store"] ??
          env.PAYOUT_STORE_PATH ??
          join(dirname(storePath), "payout-queue.json"),
        verify: args["verify-state"] ?? join(dirname(storePath), "verify-client.json"),
        documented:
          args["tx-log"] ??
          fileURLToPath(new URL("../docs/evidence/tx-hashes.md", import.meta.url)),
      },
      sourceDiscrepancies,
    );
    const result = auditConsistency({
      journal: text["journal"]!,
      ledger: text["ledger"]!,
      payouts: text["payouts"]!,
      verify: text["verify"]!,
      documented: text["documented"]!,
      now,
      payoutLovelace: env.PAYOUT_LOVELACE,
      verifyPriceLovelace: env.VERIFY_PRICE_LOVELACE,
      ...(args.since ? { since: args.since } : {}),
    });
    const discrepancies = [...sourceDiscrepancies, ...result.discrepancies];
    out("| Check | Count / result |");
    out("|---|---:|");
    for (const [key, value] of Object.entries(result.summary)) out(`| ${key} | ${value} |`);
    out(`| ledger head | ${result.headHash} |`);
    if (args["no-chain"]) out("| Blockfrost / balance deltas | SKIPPED (--no-chain) |");
    else {
      const chain = await auditChain(
        result.transactions,
        {
          buyer: env.WALLET_ADDRESS_VBUY!,
          pay: env.WALLET_ADDRESS_PAY!,
          seller: env.SELLER_ADDRESS!,
        },
        result.start,
        now,
        makeBlockfrostQuery(env.BLOCKFROST_PROJECT_ID!),
      );
      discrepancies.push(...chain.discrepancies);
      out(`| preprod transactions checked | ${chain.checked} / ${result.transactions.length} |`);
      out("\nBalance movement (integer lovelace; report only):");
      out("| Wallet | Recorded payments | Tx fees | Expected delta | Observed delta | Residual |");
      out("|---|---:|---:|---:|---:|---:|");
      for (const w of chain.wallets)
        out(
          `| ${w.wallet} | ${w.recordedPayments} | ${w.fees} | ${w.expectedDelta} | ${w.observedDelta} | ${w.residual} |`,
        );
      out(
        `Window: ${result.start} to ${now}. Observed delta = address outputs minus inputs across all transactions in the window.`,
      );
      out(
        "Residual includes funding, unrelated transfers, deposits, co-funded transactions and clock differences; it does not fail the audit.",
      );
    }
    for (const note of new Set(result.notes)) out(`NOTE ${note}`);
    out(
      "NOTE Chain links cannot prove tail completeness without a previously published head; payloadHash preimages are not stored.",
    );
    out(
      "NOTE Files are read without locking a running deployment; a detected concurrent change fails. Use a quiet interval or a consistent snapshot.",
    );
    out(
      "NOTE Documented hashes are always checked; setup/escrow hashes have existence-only checks unless a transfer expectation is recorded. --no-chain cannot prove payment amounts on chain.",
    );
    out(`\nDiscrepancies: ${discrepancies.length}`);
    for (const d of discrepancies) out(`- ${d.code}: ${d.detail}`);
    out(
      `${discrepancies.length ? "FAIL" : "PASS"}${args["no-chain"] ? " (local only; chain and balance checks skipped)" : ""}`,
    );
    return discrepancies.length ? 1 : 0;
  } catch {
    out(
      "FAIL audit input/configuration or invocation is invalid. Check --help, NETWORK, public addresses, amounts, paths and preprod project id; values are suppressed.",
    );
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runAudit();
}
