// One plain payout from W-PAY on PREPROD, to settle ADR-04 (task B-04): can the pinned
// @evolution-sdk/evolution build, sign and submit a transfer with metadata, and do the Blockfrost
// shapes used by find()/confirmations()/balance() hold? Uses the same EvolutionPayoutAdapter as
// the payout queue, so a pass here is a pass for the queue's adapter.
//   node --env-file=.env --import tsx scripts/payout-once.ts --to addr_test1...            (dry run)
//   node --env-file=.env --import tsx scripts/payout-once.ts --to addr_test1... --send     (real)
//   node --env-file=.env --import tsx scripts/payout-once.ts --check <txHash> --tag <tag> --since <iso>
// Env through core EngineEnvSchema (network guard; needs BLOCKFROST_PROJECT_ID, PAY_MNEMONIC_1).
// Refuses FAKE_PAYMENTS (a fake hash must never look real). Never prints the mnemonic or the
// project id; addresses are shortened. Without --send nothing is signed or broadcast.
// Exit codes: 0 ok, 1 refusal or bad arguments, 2 send/query error, 3 sent but not confirmed or
// not found by find() before the wait ended (check the explorer, then rerun with --check).
import { parseArgs } from "node:util";
import {
  AppError,
  EngineEnvSchema,
  MAX_PAYOUT_LOVELACE,
  PayoutAddressSchema,
  collectSecretValues,
  createLogger,
  lovelaceToAdaString,
  loadEnv,
  payoutMetadataTag,
} from "@shelfie/core";
import type { EngineEnv, PayoutAdapter } from "@shelfie/core";
import { createPayoutAdapter } from "@shelfie/payments";

const DEFAULT_LOVELACE = "2000000"; // about 1 tADA is the min UTxO; 2 tADA leaves margin
const MIN_LOVELACE = 1_000_000n;
const POLL_MS = 20_000;
const WAIT_MS = 10 * 60_000;

function refuse(msg: string): never {
  process.stderr.write(`refused: ${msg}\n`);
  process.exit(1);
}

const short = (s: string): string => `${s.slice(0, 14)}...${s.slice(-6)}`;
const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: {
      to: { type: "string" },
      lovelace: { type: "string", default: DEFAULT_LOVELACE },
      send: { type: "boolean", default: false },
      check: { type: "string" },
      tag: { type: "string" },
      since: { type: "string" },
    },
    strict: true,
  });

  let env: EngineEnv;
  try {
    env = loadEnv(EngineEnvSchema, process.env);
  } catch (err) {
    if (err instanceof AppError) refuse(err.message);
    throw err;
  }
  if (env.FAKE_PAYMENTS)
    refuse("FAKE_PAYMENTS is on; this script only makes real preprod payouts.");

  const logger = createLogger({ level: "warn", secretValues: collectSecretValues(process.env) });
  const adapter = createPayoutAdapter(env, logger, 0);
  out(`W-PAY balance: ${lovelaceToAdaString(await adapter.balance())} tADA`);

  if (args.check !== undefined) {
    if (args.tag === undefined || args.since === undefined)
      refuse("--check needs --tag and --since.");
    if (!/^[0-9a-f]{64}$/.test(args.check)) refuse("--check must be a 64-char hex tx hash.");
    if (!/^shelfie:payout-once-\d+$/.test(args.tag))
      refuse("--tag must be shelfie:payout-once-<n>.");
    if (!Number.isFinite(Date.parse(args.since))) refuse("--since must be an ISO timestamp.");
    process.exit(await confirmAndFindAfterSend(adapter, args.check, args.tag, args.since));
  }

  const to = args.to ?? refuse("--to <addr_test1...> is required.");
  if (!PayoutAddressSchema.safeParse(to).success) {
    refuse("--to must be a preprod address (addr_test1...).");
  }
  if (!/^\d+$/.test(args.lovelace)) refuse("--lovelace must be an integer.");
  const amount = BigInt(args.lovelace);
  if (amount < MIN_LOVELACE) refuse("--lovelace is below 1 tADA (min UTxO).");
  if (amount > BigInt(MAX_PAYOUT_LOVELACE)) {
    refuse(
      `--lovelace exceeds the hard payout cap (${lovelaceToAdaString(MAX_PAYOUT_LOVELACE)} tADA).`,
    );
  }

  const sinceIso = new Date().toISOString();
  const tag = payoutMetadataTag(`payout-once-${String(Date.now())}`);
  out(`to ${short(to)}  amount ${lovelaceToAdaString(amount.toString())} tADA  tag ${tag}`);
  if (!args.send) {
    out("DRY RUN: nothing signed or sent. Add --send to make the transfer.");
    return;
  }

  // One attempt only: on an unknown outcome never resend, check the explorer first.
  let txHash: string;
  try {
    ({ txHash } = await adapter.send({
      toAddress: to,
      lovelace: amount.toString(),
      metadataTag: tag,
    }));
  } catch (err) {
    if (err instanceof AppError) {
      out(`send failed: ${err.message} reason=${String(err.details["reason"])}`);
      out(
        err.details["notSent"] === true
          ? "Nothing was broadcast."
          : "Outcome UNKNOWN: check the explorer before any retry.",
      );
      process.exit(2);
    }
    throw err;
  }
  out(`txHash ${txHash}`);
  out(`explorer ${env.EXPLORER_TX_BASE}${txHash}`);
  out(`recheck: --check ${txHash} --tag ${tag} --since ${sinceIso}`);
  process.exit(await confirmAndFindAfterSend(adapter, txHash, tag, sinceIso));
}

/**
 * The transfer was sent (or is being rechecked): a query error here must never read as
 * "nothing sent", so it maps to exit 3 with a do-not-resend notice instead of exit 2.
 */
async function confirmAndFindAfterSend(
  adapter: PayoutAdapter,
  txHash: string,
  tag: string,
  sinceIso: string,
): Promise<number> {
  try {
    return await confirmAndFind(adapter, txHash, tag, sinceIso);
  } catch (err) {
    const reason = err instanceof AppError ? String(err.details["reason"]) : "unknown";
    out(`check failed (reason=${reason}). The tx WAS sent: do NOT resend; rerun with --check.`);
    return 3;
  }
}

/** Wait for >= 1 confirmation, then check that find() returns the same hash by metadata tag. */
async function confirmAndFind(
  adapter: PayoutAdapter,
  txHash: string,
  tag: string,
  sinceIso: string,
): Promise<number> {
  const deadline = Date.now() + WAIT_MS;
  let confs = await adapter.confirmations(txHash);
  while (confs < 1 && Date.now() < deadline) {
    out("waiting for confirmation...");
    await new Promise((r) => setTimeout(r, POLL_MS));
    confs = await adapter.confirmations(txHash);
  }
  out(`confirmations ${String(confs)}`);
  if (confs < 1) return 3;

  const found = await adapter.find({ metadataTag: tag, sinceIso });
  if (found === null) {
    out("find(): NOT FOUND by metadata tag (label or Blockfrost shape mismatch?)");
    return 3;
  }
  const same = found.txHash === txHash;
  out(`find(): ${same ? "OK, same hash" : `MISMATCH, found ${found.txHash}`}`);
  return same ? 0 : 3;
}

main().catch((err: unknown) => {
  const msg =
    err instanceof AppError
      ? `${err.message} reason=${String(err.details["reason"])}`
      : err instanceof Error
        ? err.name
        : "unknown";
  process.stderr.write(`payout-once error: ${msg}\n`);
  process.exit(2);
});
