/** Pure checks only. Never construct Ledger/MemoryStore/payment adapters: they can write. */
import {
  ClaimSchema,
  JobSchema,
  LedgerEventSchema,
  OrderRecordSchema,
  PayoutSchema,
  SettlementSchema,
  Sha256Schema,
  SubmissionSchema,
  TaskSchema,
  VerdictSchema,
  VerifyResponseSchema,
} from "@shelfie/core";
import type { LedgerEvent, Payout } from "@shelfie/core";
import { canonicalJson, entryHash, GENESIS_HASH } from "@shelfie/evidence";
import { z } from "zod";

export interface Discrepancy {
  code: string;
  detail: string;
}
export interface ExpectedTransfer {
  kind: "verify" | "payout";
  amount: string;
  /** Missing for historical documentation which does not record the worker address. */
  receiver?: string;
}
export interface RecordedTransaction {
  hash: string;
  expected: ExpectedTransfer[];
}
export interface AuditInput {
  ledger: string;
  journal: string;
  payouts: string;
  verify: string;
  documented: string;
  payoutLovelace: string;
  verifyPriceLovelace: string;
  now: string;
  since?: string;
}
export interface AuditResult {
  discrepancies: Discrepancy[];
  notes: string[];
  transactions: RecordedTransaction[];
  summary: {
    entries: number;
    jobs: number;
    payouts: number;
    verifyPayments: number;
    transactions: number;
  };
  start: string;
  headHash: string;
}

const schemas = {
  jobs: JobSchema,
  tasks: TaskSchema,
  claims: ClaimSchema,
  submissions: SubmissionSchema,
  verdicts: VerdictSchema,
  payouts: PayoutSchema,
  settlements: SettlementSchema,
  orders: OrderRecordSchema,
};
type Collections = { [K in keyof typeof schemas]: Map<string, z.infer<(typeof schemas)[K]>> };
const VerifyStoreSchema = z.strictObject({
  version: z.literal(1),
  receipts: z.array(
    z.strictObject({
      key: z.string(),
      txHash: z.string(),
      verdict: VerifyResponseSchema,
      receipt: z.unknown(),
    }),
  ),
  uncertain: z.array(z.string()),
  pending: z.array(z.string()),
});

export const shortHash = (hash: string): string => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

/** Full ledger is checked before applying any time window; checks continue after bad lines. */
function parseLedger(text: string, fail: (code: string, detail: string) => void) {
  const entries: LedgerEvent[] = [];
  let previous = GENESIS_HASH;
  let previousTime = -Infinity;
  let position = 0;
  const keys = new Set<string>();
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    position++;
    let event: LedgerEvent;
    try {
      event = LedgerEventSchema.strict().parse(JSON.parse(line));
    } catch {
      fail("ledger_parse", `Ledger line ${index + 1} is invalid.`);
      continue;
    }
    if (event.seq !== position)
      fail("ledger_sequence", `Ledger line ${index + 1} has a sequence gap.`);
    if (event.prevHash !== previous || !Sha256Schema.safeParse(event.payloadHash).success)
      fail("ledger_hash", `Ledger line ${index + 1} has an invalid hash link or payload hash.`);
    const time = Date.parse(event.ts);
    if (time < previousTime) fail("ledger_timestamp", `Ledger line ${index + 1} reverses time.`);
    const key = canonicalJson({ kind: event.kind, refs: event.refs, txHash: event.txHash ?? null });
    if (keys.has(key))
      fail("ledger_duplicate", `Ledger line ${index + 1} duplicates a natural key.`);
    keys.add(key);
    entries.push(event);
    previous = entryHash(event);
    previousTime = time;
  }
  return { entries, headHash: previous };
}

/** Retain last value per id across clears: auditing history must not forget previous payments. */
function parseJournal(text: string, fail: (code: string, detail: string) => void) {
  const collections: Collections = {
    jobs: new Map(),
    tasks: new Map(),
    claims: new Map(),
    submissions: new Map(),
    verdicts: new Map(),
    payouts: new Map(),
    settlements: new Map(),
    orders: new Map(),
  };
  const payouts: Payout[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      const record = z
        .object({ c: z.string(), v: z.unknown().optional(), op: z.string().optional() })
        .parse(JSON.parse(line));
      if (record.c === "*" && record.op === "clear") continue;
      if (!Object.hasOwn(schemas, record.c)) throw new Error();
      const name = record.c as keyof Collections;
      const value = schemas[name].parse(record.v);
      // Only a validated collection's own schema can enter its map.
      (collections[name] as Map<string, typeof value>).set(value.id, value);
      if (name === "payouts") payouts.push(PayoutSchema.parse(value));
    } catch {
      fail("journal_parse", `Engine journal line ${index + 1} is invalid.`);
    }
  }
  return { collections, payouts };
}

export function auditConsistency(input: AuditInput): AuditResult {
  const discrepancies: Discrepancy[] = [];
  const notes: string[] = [];
  const fail = (code: string, detail: string): void => {
    discrepancies.push({ code, detail });
  };
  const { entries, headHash } = parseLedger(input.ledger, fail);
  const { collections: c, payouts: payoutHistory } = parseJournal(input.journal, fail);
  const since = input.since ? Date.parse(input.since) : -Infinity;
  const now = Date.parse(input.now);
  const inWindow = (time: string): boolean => Date.parse(time) >= since;
  let queue: Payout[] = [];
  try {
    queue = z.array(PayoutSchema).parse(JSON.parse(input.payouts));
  } catch {
    fail("payout_store_parse", "Payout queue snapshot is invalid.");
  }
  const recentTasks = new Set([
    ...[...payoutHistory, ...queue]
      .filter((p) => p.sendingSince && inWindow(p.sendingSince))
      .map((p) => p.taskId),
    ...[...c.submissions.values()].filter((s) => inWindow(s.receivedAt)).map((s) => s.taskId),
  ]);
  const selectedEntries = entries.filter((e) => inWindow(e.ts));
  const activeJobIds = new Set(selectedEntries.map((e) => e.refs["jobId"]));
  const selectedJobs = [...c.jobs.values()].filter(
    (j) =>
      inWindow(j.createdAt) ||
      activeJobIds.has(j.id) ||
      [...c.tasks.values()].some(
        (t) =>
          t.jobId === j.id &&
          (recentTasks.has(t.id) || selectedEntries.some((e) => e.refs["taskId"] === t.id)),
      ),
  );
  const selectedJobIds = new Set<string>(selectedJobs.map((j) => j.id));
  const taskSelected = (id: string): boolean => {
    const task = c.tasks.get(id);
    return task ? selectedJobIds.has(task.jobId) : true; // Unattributed payments cannot be hidden by --since.
  };
  const submissionSelected = (id: string): boolean => {
    const sub = c.submissions.get(id);
    return sub ? taskSelected(sub.taskId) : true;
  };
  const transactions = new Map<string, RecordedTransaction>();
  const recordTx = (hash: string, expected?: ExpectedTransfer): void => {
    if (!Sha256Schema.safeParse(hash).success) {
      fail(
        "tx_hash_invalid",
        "A recorded transaction is not a real 64-character hex hash (fake/dry or corrupt).",
      );
      return;
    }
    const key = hash.toLowerCase();
    const tx = transactions.get(key) ?? { hash: key, expected: [] };
    if (expected && !tx.expected.some((e) => canonicalJson(e) === canonicalJson(expected)))
      tx.expected.push(expected);
    transactions.set(key, tx);
  };

  const ids = new Set<string>();
  for (const p of queue) {
    if (ids.has(p.id)) fail("payout_duplicate_id", "Payout queue contains a repeated id.");
    ids.add(p.id);
  }
  const allPayouts = [...payoutHistory, ...queue].filter((p) => taskSelected(p.taskId));
  const payouts = new Map<string, Payout>();
  const payoutHashes = new Map<string, Set<string>>();
  for (const p of allPayouts) {
    const earlier = payouts.get(p.id);
    if (
      earlier &&
      (earlier.taskId !== p.taskId ||
        earlier.amount !== p.amount ||
        earlier.toAddress !== p.toAddress ||
        earlier.idempotencyKey !== p.idempotencyKey)
    )
      fail(
        "payout_record_conflict",
        `Payout ${p.id} changes immutable fields across stores/history.`,
      );
    payouts.set(p.id, p);
    if (BigInt(p.amount) !== BigInt(input.payoutLovelace))
      fail("payout_amount", `Payout ${p.id} differs from PAYOUT_LOVELACE.`);
    if (p.idempotencyKey !== `payout:${p.taskId}`)
      fail("payout_key", `Payout ${p.id} has the wrong idempotency key.`);
    if (p.txHash) {
      const hashes = payoutHashes.get(p.id) ?? new Set<string>();
      hashes.add(p.txHash);
      payoutHashes.set(p.id, hashes);
      recordTx(p.txHash, { kind: "payout", amount: p.amount, receiver: p.toAddress });
    }
  }
  // Ledger may reveal a second hash which the latest mutable snapshots have forgotten.
  for (const e of entries) {
    const taskId = e.refs["taskId"];
    if (e.txHash && e.kind.startsWith("PAYOUT_") && (!taskId || taskSelected(taskId))) {
      const id = e.refs["payoutId"];
      const p = id ? payouts.get(id) : undefined;
      if (id) {
        const hashes = payoutHashes.get(id) ?? new Set<string>();
        hashes.add(e.txHash);
        payoutHashes.set(id, hashes);
      }
      if (!p)
        fail("payout_missing", `Ledger payout at sequence ${e.seq} has no retained payout record.`);
      recordTx(
        e.txHash,
        p ? { kind: "payout", amount: p.amount, receiver: p.toAddress } : undefined,
      );
    }
  }
  for (const hashes of payoutHashes.values())
    if (hashes.size > 1)
      fail("payout_hash_conflict", "One payout id has multiple transaction hashes.");
  const paidTasks = new Map<string, string>();
  const paidSubmissions = new Set<string>();
  const spentHashes = new Set<string>();
  for (const p of payouts.values()) {
    if (!ids.has(p.id))
      fail("payout_queue_missing", `Payout ${p.id} is absent from the durable queue snapshot.`);
    if (
      p.txHash &&
      !entries.some(
        (e) => e.kind.startsWith("PAYOUT_") && e.refs["payoutId"] === p.id && e.txHash === p.txHash,
      )
    )
      fail("payout_ledger_missing", `Payout ${p.id} transaction is absent from the ledger.`);
    if (paidTasks.has(p.taskId)) fail("payout_double", `Task ${p.taskId} has multiple payouts.`);
    paidTasks.set(p.taskId, p.id);
    if (p.txHash && spentHashes.has(p.txHash))
      fail("payout_tx_reused", "One transaction hash is assigned to multiple payouts.");
    if (p.txHash) spentHashes.add(p.txHash);
    if (!p.txHash || !["SUBMITTED", "CONFIRMED"].includes(p.state))
      fail("payout_unresolved", `Payout ${p.id} is unfinished or lacks a transaction hash.`);
    const task = c.tasks.get(p.taskId);
    const sub = task?.acceptedSubmissionId
      ? c.submissions.get(task.acceptedSubmissionId)
      : undefined;
    const claim = sub ? c.claims.get(sub.claimId) : undefined;
    if (!task || !sub || sub.taskId !== task.id || !claim || claim.taskId !== task.id) {
      fail("payout_orphan", `Payout ${p.id} cannot be linked to an accepted worker submission.`);
      continue;
    }
    if (paidSubmissions.has(sub.id))
      fail("submission_double", "One worker submission receives multiple payouts.");
    paidSubmissions.add(sub.id);
    if (claim.payoutAddress !== p.toAddress)
      fail("payout_receiver", `Payout ${p.id} differs from the stored worker address.`);
    const verdicts = [...c.verdicts.values()].filter((v) => v.submissionId === sub.id);
    const superseded = new Set(verdicts.map((v) => v.supersedesVerdictId));
    const effective = verdicts.filter((v) => !superseded.has(v.id));
    if (
      effective.length !== 1 ||
      effective[0]?.pass !== true ||
      sub.state !== "PASSED" ||
      !["ACCEPTED", "PAID"].includes(task.state)
    )
      fail("payout_without_pass", `Payout ${p.id} lacks an effective accepted PASS.`);
  }
  for (const task of c.tasks.values()) {
    if (!taskSelected(task.id)) continue;
    if (BigInt(task.payoutAmount) !== BigInt(input.payoutLovelace))
      fail("task_amount", `Task ${task.id} differs from PAYOUT_LOVELACE.`);
    if (["ACCEPTED", "PAID"].includes(task.state) && !paidTasks.has(task.id))
      fail("payout_missing", `Passing task ${task.id} has no payout.`);
    if (["FAILED", "EXPIRED"].includes(task.state) && paidTasks.has(task.id))
      fail("failed_task_payout", `Non-passing task ${task.id} has a payout.`);
  }
  for (const job of selectedJobs) {
    const tasks = [...c.tasks.values()].filter((t) => t.jobId === job.id);
    const jobPayouts = [...payouts.values()].filter((p) => tasks.some((t) => t.id === p.taskId));
    const decisions = entries.filter((e) => e.kind === "JOB_DECIDED" && e.refs["jobId"] === job.id);
    const parsedDecisions = decisions.map((e) => /^(DELIVER|WITHHOLD)\b/.exec(e.note)?.[1]);
    if (parsedDecisions.some((d) => d !== job.decision))
      fail("job_decision_conflict", `Job ${job.id} disagrees with its ledger decision.`);
    if (job.decision && decisions.length !== 1)
      fail("job_decision_ledger", `Job ${job.id} does not have exactly one ledger decision.`);
    if (job.state !== "REJECTED_INPUT" && (job.n !== 1 || job.k !== 1 || tasks.length !== 1))
      fail("job_shape", `Job ${job.id} does not match MVP one-job/one-task N=1 K=1.`);
    if (job.decision === "DELIVER") {
      if (jobPayouts.length !== 1)
        fail("job_pass_payout", `Delivered job ${job.id} does not have exactly one payout.`);
      if (
        !tasks.some((t) => ["ACCEPTED", "PAID"].includes(t.state)) ||
        !["DELIVERABLE", "DELIVERED", "SETTLED"].includes(job.state)
      )
        fail("job_state", `Delivered job ${job.id} has inconsistent job/task state.`);
    } else if (
      job.decision === "WITHHOLD" ||
      ["WITHHELD", "REFUNDED", "CANCELLED", "REJECTED_INPUT"].includes(job.state)
    ) {
      if (jobPayouts.length) fail("withhold_payout", `Withheld/failed job ${job.id} has a payout.`);
      if (job.decision === "WITHHOLD" && !["WITHHELD", "REFUNDED"].includes(job.state))
        fail("job_state", `Withheld job ${job.id} has inconsistent state.`);
    } else if (
      Date.parse(job.windowEndsAt) <= now ||
      ["DELIVERABLE", "DELIVERED", "SETTLED"].includes(job.state)
    ) {
      fail("job_undecided", `Expired/terminal job ${job.id} has no decision.`);
    } else notes.push(`Job ${job.id} is still in flight; no terminal outcome required yet.`);
    for (const settlement of c.settlements.values())
      if (settlement.jobId === job.id) {
        if (job.decision && settlement.decision !== job.decision)
          fail("settlement_decision", `Job ${job.id} and settlement disagree.`);
        for (const hash of Object.values(settlement.escrowRefs)) if (hash) recordTx(hash);
      }
  }

  const verifyHashes = new Map<string, Set<string>>();
  const verifyOwners = new Map<string, string>();
  const addVerify = (key: string, hash: string): void => {
    const hashes = verifyHashes.get(key) ?? new Set<string>();
    hashes.add(hash);
    verifyHashes.set(key, hashes);
    const owner = verifyOwners.get(hash);
    if (owner && owner !== key)
      fail("verify_tx_reused", "A verify transaction is assigned to multiple submissions.");
    verifyOwners.set(hash, key);
    recordTx(hash, { kind: "verify", amount: input.verifyPriceLovelace });
  };
  for (const v of c.verdicts.values())
    if (v.verifierTx && submissionSelected(v.submissionId))
      addVerify(`verify:${v.submissionId}`, v.verifierTx);
  for (const e of entries) {
    const subId = e.refs["submissionId"];
    const selected =
      inWindow(e.ts) || (e.refs["jobId"] ? selectedJobIds.has(e.refs["jobId"]) : false);
    if (e.kind === "VERIFY_PAID" && subId && submissionSelected(subId) && e.txHash)
      addVerify(`verify:${subId}`, e.txHash);
    else if (e.txHash && selected && !e.kind.startsWith("PAYOUT_")) recordTx(e.txHash);
    if (
      selected &&
      ["fakePayments", "fakeVerifier", "dryVerifier", "demoOverride", "operatorMarkedPaid"].some(
        (flag) => e.flags[flag],
      )
    )
      fail("non_real_evidence", `Ledger sequence ${e.seq} is flagged fake, dry or overridden.`);
    if (
      ["JOB_CREATED", "JOB_DECIDED"].includes(e.kind) &&
      selected &&
      (!e.refs["jobId"] || !c.jobs.has(e.refs["jobId"]))
    )
      fail("job_missing", `Ledger job event at sequence ${e.seq} has no retained job record.`);
  }
  const receiptKeys = new Set<string>();
  try {
    const state = VerifyStoreSchema.parse(JSON.parse(input.verify));
    for (const r of state.receipts) {
      const subId = r.key.startsWith("verify:") ? r.key.slice(7) : "";
      if (!submissionSelected(subId)) continue;
      if (receiptKeys.has(r.key))
        fail("verify_duplicate_key", "Verify state has a duplicate receipt key.");
      receiptKeys.add(r.key);
      if (!subId || !c.submissions.has(subId))
        fail("verify_orphan", "A verify receipt has no retained submission.");
      addVerify(r.key, r.txHash);
    }
    for (const key of new Set([...state.uncertain, ...state.pending])) {
      if (submissionSelected(key.startsWith("verify:") ? key.slice(7) : ""))
        fail(
          "verify_uncertain",
          "Verify state contains a pending/uncertain payment; chain outcome is unresolved.",
        );
    }
  } catch {
    fail("verify_store_parse", "Verify client snapshot is invalid.");
  }
  for (const [key, hashes] of verifyHashes) {
    if (!receiptKeys.has(key))
      fail("verify_receipt_missing", "A recorded verifier payment has no durable buyer receipt.");
    for (const hash of hashes) {
      if (
        !entries.some(
          (e) =>
            e.kind === "VERIFY_PAID" &&
            `verify:${e.refs["submissionId"] ?? ""}` === key &&
            e.txHash === hash,
        )
      )
        fail(
          "verify_ledger_missing",
          "A recorded verifier payment is absent from the evidence ledger.",
        );
      if (spentHashes.has(hash))
        fail(
          "transaction_role_conflict",
          "One transaction hash is recorded as both verifier fee and worker payout.",
        );
    }
  }
  for (const hashes of verifyHashes.values())
    if (hashes.size > 1)
      fail("verify_double", "One submission/idempotency key has multiple verifier payment hashes.");

  // Markdown has no reliable timestamp/address schema: always check every hash, even with --since.
  for (const line of input.documented.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const hashes = new Set(line.match(/\b[0-9a-f]{64}\b/gi) ?? []);
    const kind = /x402|paid.*verify/i.test(line)
      ? "verify"
      : /\bpayout\b|plain SDK/i.test(line) &&
          !/faucet|funds|funding|registration|escrow/i.test(line)
        ? "payout"
        : undefined;
    const amountMatch = /\b(\d[\d,]*)(?:\.(\d{1,6}))?\s+tADA\b/i.exec(line);
    const amount = amountMatch
      ? (
          BigInt((amountMatch[1] ?? "0").replaceAll(",", "")) * 1_000_000n +
          BigInt((amountMatch[2] ?? "").padEnd(6, "0"))
        ).toString()
      : undefined;
    for (const hash of hashes) {
      const existing = transactions.get(hash.toLowerCase());
      if (!existing?.expected.length && kind && amount) recordTx(hash, { kind, amount });
      else recordTx(hash);
      if (kind === "payout" && !existing?.expected.some((e) => e.receiver))
        notes.push(
          `Documented payout ${shortHash(hash)} has no stored worker address; only sender and amount can be checked.`,
        );
    }
  }
  if (entries.length === 0)
    fail(
      "ledger_empty",
      "Evidence ledger contains no entries; deployment history cannot be established.",
    );
  const uniqueDiscrepancies = [
    ...new Map(discrepancies.map((d) => [`${d.code}:${d.detail}`, d])).values(),
  ];
  return {
    discrepancies: uniqueDiscrepancies,
    notes,
    transactions: [...transactions.values()],
    headHash,
    start:
      input.since ??
      entries.reduce((min, e) => (Date.parse(e.ts) < Date.parse(min) ? e.ts : min), input.now),
    summary: {
      entries: entries.length,
      jobs: selectedJobs.length,
      payouts: payouts.size,
      verifyPayments: verifyOwners.size,
      transactions: transactions.size,
    },
  };
}
