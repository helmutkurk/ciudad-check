// One real payout through the engine's payout queue on PREPROD (task B-07): DefaultPayoutQueue +
// EvolutionPayoutAdapter (W-PAY) + FilePayoutStore, the same parts the engine wires. Pays one task,
// waits for a confirmation, then enqueues the SAME task again and proves nothing new is sent.
// Run it a second time with --task <id> to prove the same across a restart (store on disk).
//   node --env-file=.env --import tsx scripts/payout-queue-once.ts --to addr_test1...           (dry run)
//   node --env-file=.env --import tsx scripts/payout-queue-once.ts --to addr_test1... --send
//   node --env-file=.env --import tsx scripts/payout-queue-once.ts --to addr_test1... --send --task tsk_...
// Env through core EngineEnvSchema (network guard). Refuses FAKE_PAYMENTS. Amount PAYOUT_LOVELACE
// (default 3 tADA, hard cap MAX_PAYOUT_LOVELACE). Store default ./data/payout-queue-once.json (not
// the engine's queue file). Exit codes: 0 ok, 1 refusal, 2 failed (state printed), 3 a second send
// was attempted (idempotency broken) or the payout is not confirmed in time.
import { parseArgs } from "node:util";
import {
  AppError,
  EngineEnvSchema,
  PayoutAddressSchema,
  collectSecretValues,
  createLogger,
  lovelaceToAdaString,
  loadEnv,
  newTaskId,
  randomIdGenerator,
  systemClock,
} from "@shelfie/core";
import type { EngineEnv, Payout, PayoutAdapter } from "@shelfie/core";
import { DefaultPayoutQueue, FilePayoutStore, createPayoutAdapter } from "@shelfie/payments";

const POLL_MS = 20_000;
const WAIT_MS = 10 * 60_000;

function refuse(msg: string): never {
  process.stderr.write(`refused: ${msg}\n`);
  process.exit(1);
}
const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const short = (s: string): string => `${s.slice(0, 14)}...${s.slice(-6)}`;
const show = (p: Payout): string =>
  `payout ${p.id} task ${p.taskId} state ${p.state} attempts ${String(p.attempts)} tx ${p.txHash ?? "-"}`;

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: {
      to: { type: "string" },
      send: { type: "boolean", default: false },
      task: { type: "string" },
      store: { type: "string", default: "./data/payout-queue-once.json" },
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
  const to = args.to ?? refuse("--to <addr_test1...> is required.");
  if (!PayoutAddressSchema.safeParse(to).success)
    refuse("--to must be a preprod address (addr_test1...).");
  if (args.task !== undefined && !/^tsk_[A-Za-z0-9]+$/.test(args.task))
    refuse("--task must be tsk_<id>.");
  const taskId = args.task ?? newTaskId(randomIdGenerator);

  const logger = createLogger({ level: "warn", secretValues: collectSecretValues(process.env) });
  const real = createPayoutAdapter(env, logger, 0);
  let sends = 0;
  const adapter: PayoutAdapter = {
    send: (a) => {
      sends++;
      return real.send(a);
    },
    find: (a) => real.find(a),
    confirmations: (h) => real.confirmations(h),
    balance: () => real.balance(),
  };

  out(`W-PAY balance ${lovelaceToAdaString(await adapter.balance())} tADA`);
  out(
    `task ${taskId} -> ${short(to)}  amount ${lovelaceToAdaString(env.PAYOUT_LOVELACE)} tADA  store ${args.store}`,
  );
  if (!args.send) {
    out("DRY RUN: nothing queued or sent. Add --send.");
    return;
  }

  const store = new FilePayoutStore(args.store);
  // An unfinished payout from an earlier run must be finished under its own task, never next to a
  // new one (a fresh task id is a fresh payout: two transfers).
  const open = (await store.list(["QUEUED", "SENDING", "UNKNOWN", "SUBMITTED"])).filter(
    (o) => o.taskId !== taskId,
  );
  if (open.length > 0) {
    refuse(`earlier payout not finished: ${open.map(show).join("; ")}. Rerun with --task ${open[0]?.taskId ?? ""}.`);
  }
  const queue = new DefaultPayoutQueue({
    adapter,
    store,
    clock: systemClock,
    logger,
    maxPayoutLovelace: env.PAYOUT_LOVELACE,
    dailyCapLovelace: env.PAYOUT_DAILY_CAP_LOVELACE,
    maxAttempts: env.PAYOUT_MAX_ATTEMPTS,
  });
  await queue.recover(); // a payout left mid-send by an earlier run becomes UNKNOWN, never resent blindly

  // 1. first enqueue (or the existing payout of this task from an earlier run)
  let p = await queue.enqueue({ taskId, toAddress: to, lovelace: env.PAYOUT_LOVELACE });
  await queue.drain();
  p = await queue.get(p.id);
  out(`after enqueue: ${show(p)}`);
  if (p.toAddress !== to || p.amount !== env.PAYOUT_LOVELACE) {
    out(`note: this task was stored earlier for ${short(p.toAddress)}, ${lovelaceToAdaString(p.amount)} tADA; --to and the amount are ignored`);
  }

  // 2. wait for the confirmation
  const deadline = Date.now() + WAIT_MS;
  while (p.state !== "CONFIRMED" && Date.now() < deadline) {
    if (!["SUBMITTED", "UNKNOWN", "SENDING"].includes(p.state)) break;
    out(`waiting (${p.state})...`);
    await new Promise((r) => setTimeout(r, POLL_MS));
    await queue.pollConfirmations();
    p = await queue.get(p.id);
  }
  out(`after polling: ${show(p)}`);
  if (p.txHash) out(`explorer ${env.EXPLORER_TX_BASE}${p.txHash}`);

  // 3. idempotency: the same task again must return the same payout and send nothing
  const sendsBefore = sends;
  const again = await queue.enqueue({ taskId, toAddress: to, lovelace: env.PAYOUT_LOVELACE });
  await queue.drain();
  const same = again.id === p.id && sends === sendsBefore;
  out(
    `re-enqueue same task: ${same ? "OK, same payout, no new send" : `BROKEN: payout ${again.id}, sends ${String(sends - sendsBefore)}`}`,
  );
  out(`sends this run: ${String(sends)}  (task ${taskId})`);
  const st = await queue.status();
  if (st.paused) out(`queue paused: ${st.reason ?? "unknown"}`);
  if (!same) process.exit(3);
  if (p.state !== "CONFIRMED") process.exit(p.state === "FAILED_FINAL" ? 2 : 3);
}

main().catch((err: unknown) => {
  const r = err instanceof AppError ? err.details["reason"] : undefined;
  const msg =
    err instanceof AppError
      ? `${err.message} reason=${typeof r === "string" ? r : err.code}`
      : err instanceof Error
        ? err.name
        : "unknown";
  process.stderr.write(`payout-queue-once error: ${msg}\n`);
  process.exit(2);
});
