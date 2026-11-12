// Small synthetic fixtures only; no real addresses, hashes, photos or credentials.
import { entryHash, GENESIS_HASH } from "@shelfie/evidence";
import type { LedgerEvent } from "@shelfie/core";

export const ts = "2026-10-30T12:00:00.000Z";
export const hash = "a".repeat(64);
export const address = `addr_test1${"a".repeat(30)}`;
export function ledger(rows: Partial<LedgerEvent>[]): string {
  let prevHash = GENESIS_HASH;
  return rows
    .map((row, i) => {
      const e: LedgerEvent = {
        seq: i + 1,
        ts,
        kind: "ADMIN_ACTION",
        refs: {},
        payloadHash: "b".repeat(64),
        prevHash,
        note: "",
        flags: {},
        ...row,
      };
      prevHash = entryHash(e);
      return JSON.stringify(e);
    })
    .join("\n");
}
export const job = {
  id: "job_01",
  packId: "shelf-check",
  input: { productEan: "12345678", stores: [{ id: "store" }] },
  source: "demo",
  externalRef: "test",
  k: 1,
  n: 1,
  windowEndsAt: ts,
  state: "DELIVERABLE",
  decision: "DELIVER",
  reportMd: "synthetic",
  createdAt: ts,
};
export const task = {
  id: "tsk_01",
  jobId: "job_01",
  spec: { storeId: "store", productEan: "12345678" },
  state: "PAID",
  attempts: 1,
  maxAttempts: 3,
  currentClaimId: "clm_01",
  acceptedSubmissionId: "sub_01",
  acceptedOutcome: "OBSERVED",
  payoutAmount: "3000000",
};
export const submission = {
  id: "sub_01",
  taskId: "tsk_01",
  claimId: "clm_01",
  receivedAt: ts,
  outcome: "OBSERVED",
  imageSha256: hash,
  imageRef: "synthetic",
  clientMeta: { captureMode: "getUserMedia" },
  captureLocation: null,
  verifyIdempotencyKey: "verify:sub_01",
  state: "PASSED",
};
export const claim = {
  id: "clm_01",
  taskId: "tsk_01",
  workerId: "wrk_01",
  payoutAddress: address,
  challengeCode: "ABC-DEF",
  issuedAt: ts,
  expiresAt: ts,
  state: "USED",
  cityMatch: true,
  locationSource: "browser",
  locationTries: 0,
};
export const verdict = {
  id: "vrd_01",
  submissionId: "sub_01",
  pass: true,
  gates: [],
  failedGates: [],
  extraction: { code: null, productName: null, ean: null, price: null, currency: null },
  outcome: "OBSERVED",
  workerMessage: "synthetic",
  verifierTx: null,
  source: "GATE",
  overrideReason: null,
  modelId: null,
  latencyMs: null,
  supersedesVerdictId: null,
  createdAt: ts,
};
export const payout = {
  id: "pay_01",
  taskId: "tsk_01",
  idempotencyKey: "payout:tsk_01",
  toAddress: address,
  amount: "3000000",
  state: "CONFIRMED",
  txHash: hash,
  metadataTag: "shelfie:pay_01",
  attempts: 1,
  lastError: null,
  walletId: "pay-1",
  sendingSince: ts,
};
export const journal = (records: { c: string; v?: unknown; op?: string }[]): string =>
  records.map((r) => JSON.stringify(r)).join("\n");
export function fixture() {
  return {
    ledger: ledger([
      { kind: "JOB_CREATED", refs: { jobId: "job_01" } },
      { kind: "JOB_DECIDED", refs: { jobId: "job_01" }, note: "DELIVER passed=1 k=1 n=1" },
      {
        kind: "PAYOUT_SUBMITTED",
        refs: { jobId: "job_01", taskId: "tsk_01", payoutId: "pay_01" },
        txHash: hash,
      },
      {
        kind: "PAYOUT_CONFIRMED",
        refs: { jobId: "job_01", taskId: "tsk_01", payoutId: "pay_01" },
        txHash: hash,
      },
    ]),
    journal: journal([
      { c: "jobs", v: job },
      { c: "tasks", v: task },
      { c: "claims", v: claim },
      { c: "submissions", v: submission },
      { c: "verdicts", v: verdict },
      { c: "payouts", v: payout },
    ]),
    payouts: JSON.stringify([payout]),
    verify: JSON.stringify({ version: 1, receipts: [], uncertain: [], pending: [] }),
    documented: "| Tx hash |\n|---|\n",
    payoutLovelace: "3000000",
    verifyPriceLovelace: "1000000",
    now: "2026-10-30T13:00:00.000Z",
  };
}
