import { describe, expect, it } from "vitest";
import { auditConsistency } from "./ledger-audit-consistency.js";
import {
  fixture,
  ledger,
  journal,
  job,
  task,
  claim,
  submission,
  verdict,
  payout,
  hash,
} from "./ledger-audit-fixtures.js";

describe("deployment consistency (synthetic fixtures)", () => {
  it("accepts a decided PASS with one payout observed in both stores and ledger phases", () => {
    expect(auditConsistency(fixture()).discrepancies).toEqual([]);
  });
  it.each([
    ["sequence gap", { seq: 7 }, "ledger_sequence"],
    ["broken link", { prevHash: "f".repeat(64) }, "ledger_hash"],
    ["clock reversal", { ts: "2026-10-30T11:59:59.000Z" }, "ledger_timestamp"],
  ])("detects %s even before --since", (_name, change, code) => {
    const f = fixture();
    f.ledger = ledger([
      { kind: "ADMIN_ACTION", refs: { action: "one" } },
      { ...change, refs: { action: "two" } },
    ]);
    expect(
      auditConsistency({ ...f, since: "2026-10-30T12:30:00.000Z" }).discrepancies.some(
        (d) => d.code === code,
      ),
    ).toBe(true);
  });
  it("detects a missing payout and an unpaid terminal queue state", () => {
    const f = fixture();
    f.payouts = "[]";
    f.journal = journal([
      { c: "jobs", v: job },
      { c: "tasks", v: task },
      { c: "claims", v: claim },
      { c: "submissions", v: submission },
      { c: "verdicts", v: verdict },
    ]);
    expect(auditConsistency(f).discrepancies.map((d) => d.code)).toContain("payout_missing");
  });
  it("rejects WITHHOLD with a payout, a wrong amount, and wrong worker destination", () => {
    const f = fixture();
    f.journal +=
      "\n" + journal([{ c: "jobs", v: { ...job, state: "WITHHELD", decision: "WITHHOLD" } }]);
    f.payouts = JSON.stringify([
      { ...payout, amount: "1", toAddress: `addr_test1${"b".repeat(30)}` },
    ]);
    const codes = auditConsistency(f).discrepancies.map((d) => d.code);
    expect(codes).toEqual(
      expect.arrayContaining(["withhold_payout", "payout_amount", "payout_receiver"]),
    );
  });
  it("detects double payouts and conflicting hashes across historical updates", () => {
    const f = fixture();
    f.journal += "\n" + journal([{ c: "payouts", v: { ...payout, txHash: "c".repeat(64) } }]);
    f.payouts = JSON.stringify([payout, { ...payout, id: "pay_02", txHash: "d".repeat(64) }]);
    expect(auditConsistency(f).discrepancies.map((d) => d.code)).toEqual(
      expect.arrayContaining(["payout_double", "payout_hash_conflict"]),
    );
  });
  it("retains history across engine clear and does not filter a pre-window job with later activity", () => {
    const f = fixture();
    f.journal += '\n{"c":"*","op":"clear"}';
    expect(auditConsistency(f).discrepancies).toEqual([]);
    expect(auditConsistency({ ...f, since: "2026-10-30T12:00:00.000Z" }).summary.jobs).toBe(1);
  });
  it("fails closed for malformed input instead of silently accepting an empty run", () => {
    const f = fixture();
    f.journal += "\n{";
    f.payouts = "{}";
    f.verify = "{}";
    expect(auditConsistency(f).discrepancies.map((d) => d.code)).toEqual(
      expect.arrayContaining(["journal_parse", "payout_store_parse", "verify_store_parse"]),
    );
  });
  it("reports expired undecided jobs and unresolved verifier payments", () => {
    const f = fixture();
    f.journal +=
      "\n" + journal([{ c: "jobs", v: { ...job, state: "COLLECTING", decision: null } }]);
    f.verify = JSON.stringify({
      version: 1,
      receipts: [],
      uncertain: ["verify:sub_01"],
      pending: [],
    });
    expect(auditConsistency(f).discrepancies.map((d) => d.code)).toEqual(
      expect.arrayContaining(["job_undecided", "verify_uncertain"]),
    );
  });
  it("deduplicates hashes in markdown hash and explorer columns", () => {
    const f = fixture();
    f.documented = `| M1 | Paid x402 verify 1 tADA | \`${"c".repeat(64)}\` | https://preprod.cardanoscan.io/transaction/${"c".repeat(64)} |`;
    const result = auditConsistency(f);
    expect(result.transactions.filter((t) => t.hash === "c".repeat(64))).toHaveLength(1);
    expect(result.transactions.find((t) => t.hash === "c".repeat(64))?.expected[0]?.amount).toBe(
      "1000000",
    );
  });
  it("rejects a persisted payout whose transaction is absent from the ledger", () => {
    const f = fixture();
    f.ledger = ledger([
      { kind: "JOB_CREATED", refs: { jobId: "job_01" } },
      { kind: "JOB_DECIDED", refs: { jobId: "job_01" }, note: "DELIVER passed=1 k=1 n=1" },
    ]);
    expect(auditConsistency(f).discrepancies.map((d) => d.code)).toContain("payout_ledger_missing");
  });
  it("rejects a journal payout missing from the durable queue snapshot", () => {
    const f = fixture();
    f.payouts = "[]";
    expect(auditConsistency(f).discrepancies.map((d) => d.code)).toContain("payout_queue_missing");
  });
  it("accepts rejected intake without a task or payout", () => {
    const f = fixture();
    f.ledger = ledger([{ kind: "INTAKE_REJECTED", refs: { jobId: "job_01" } }]);
    f.journal = journal([{ c: "jobs", v: { ...job, state: "REJECTED_INPUT", decision: null } }]);
    f.payouts = "[]";
    expect(auditConsistency(f).discrepancies).toEqual([]);
  });
  it("rejects a passing task without an effective PASS and unfinished payouts", () => {
    const f = fixture();
    f.journal += "\n" + journal([{ c: "verdicts", v: { ...verdict, pass: false } }]);
    f.payouts = JSON.stringify([{ ...payout, state: "UNKNOWN", txHash: null }]);
    expect(auditConsistency(f).discrepancies.map((d) => d.code)).toEqual(
      expect.arrayContaining(["payout_without_pass", "payout_unresolved"]),
    );
  });
  it("detects a verifier payment lost from ledger and receipt state", () => {
    const f = fixture();
    f.journal += "\n" + journal([{ c: "verdicts", v: { ...verdict, verifierTx: "e".repeat(64) } }]);
    expect(auditConsistency(f).discrepancies.map((d) => d.code)).toEqual(
      expect.arrayContaining(["verify_ledger_missing", "verify_receipt_missing"]),
    );
  });
  it("keeps a job created before --since when its payout has later activity", () => {
    const f = fixture();
    f.ledger = ledger([
      { kind: "JOB_DECIDED", refs: { jobId: "job_01" }, note: "DELIVER passed=1 k=1 n=1" },
      {
        kind: "PAYOUT_CONFIRMED",
        refs: { taskId: "tsk_01", payoutId: "pay_01" },
        txHash: hash,
        ts: "2026-10-30T12:30:00.000Z",
      },
    ]);
    expect(auditConsistency({ ...f, since: "2026-10-30T12:30:00.000Z" }).summary.jobs).toBe(1);
  });
  it("does not mistake documented faucet funding mentioning worker payouts for a payout", () => {
    const f = fixture();
    f.documented = `| M2 setup | Faucet funds W-PAY (worker payouts) with 10,000 tADA | \`${"f".repeat(64)}\` |`;
    expect(
      auditConsistency(f).transactions.find((t) => t.hash === "f".repeat(64))?.expected,
    ).toEqual([]);
  });
  it("detects an entirely missing job even when only the ledger remembers it", () => {
    const f = fixture();
    f.ledger = ledger([{ kind: "JOB_CREATED", refs: { jobId: "job_99" } }]);
    f.journal = "";
    f.payouts = "[]";
    expect(auditConsistency(f).discrepancies.map((d) => d.code)).toContain("job_missing");
  });
  it("selects pre-window jobs with later write-ahead payout activity", () => {
    const f = fixture();
    f.payouts = JSON.stringify([{ ...payout, sendingSince: "2026-10-30T12:30:00.000Z" }]);
    expect(auditConsistency({ ...f, since: "2026-10-30T12:30:00.000Z" }).summary.jobs).toBe(1);
  });
  it("validates a paid verifier receipt and detects double fees for one submission", () => {
    const f = fixture();
    const verifyHash = "e".repeat(64);
    f.ledger = ledger([
      ...f.ledger
        .split("\n")
        .map((line) => JSON.parse(line) as Parameters<typeof ledger>[0][number]),
      {
        kind: "VERIFY_PAID",
        refs: { jobId: "job_01", submissionId: "sub_01" },
        txHash: verifyHash,
      },
    ]);
    f.journal += "\n" + journal([{ c: "verdicts", v: { ...verdict, verifierTx: verifyHash } }]);
    const response = {
      submissionId: "sub_01",
      outcome: "OBSERVED",
      pass: true,
      gates: [],
      failedGates: [],
      extraction: {},
      workerMessage: "synthetic",
      model: { provider: "fixture", id: "fixture", latencyMs: 0 },
      cached: false,
    };
    f.verify = JSON.stringify({
      version: 1,
      receipts: [
        {
          key: "verify:sub_01",
          txHash: verifyHash,
          verdict: response,
          receipt: { transaction: verifyHash, network: "cardano:preprod" },
        },
      ],
      uncertain: [],
      pending: [],
    });
    expect(auditConsistency(f).discrepancies).toEqual([]);
    f.verify = f.verify.replaceAll(verifyHash, "f".repeat(64));
    expect(auditConsistency(f).discrepancies.map((d) => d.code)).toContain("verify_double");
  });
});
