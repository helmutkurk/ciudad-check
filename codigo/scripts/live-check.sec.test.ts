// No sockets or credentials: node --import tsx scripts/live-check.sec.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError, LedgerEventSchema } from "@shelfie/core";
import type { LedgerEvent } from "@shelfie/core";
import { cleanJpeg, decodeBase64Strict, DEFAULT_IMAGE_LIMITS } from "../apps/engine/src/jpeg.js";
import { jobActivity, LOCATION_PROBE, readOptions } from "./live-check.js";

// Shape-only fixtures, never used as destinations or sent to a service.
const addresses = ["q", "p", "r"].map((char) => `addr_test1${char.repeat(50)}`);
const settings = {
  ADMIN_TOKEN: "x".repeat(32),
  WORKER_ADDRS: addresses.slice(0, 2).join(","),
};

await test("live settings require an explicit operator token and two distinct preprod addresses", () => {
  assert.throws(() => readOptions([], {}));
  assert.throws(() => readOptions([], { ...settings, ADMIN_TOKEN: "dev-admin-token" }));
  for (const WORKER_ADDRS of [
    "",
    addresses[0],
    [addresses[0], addresses[0]].join(","),
    "invalid,also-invalid",
    addresses.concat(addresses).join(","),
  ]) {
    assert.throws(() => readOptions([], { ...settings, WORKER_ADDRS }));
  }
});

await test("live settings use field-job defaults and allow three repeated --addr flags", () => {
  const defaults = readOptions([], settings);
  assert.equal(defaults.base, "https://api-dev.shelfieapp.fyi");
  assert.equal(defaults.store, "rewe-81671-august-everding-strasse-20");
  assert.equal(defaults.ean, "5449000000439");
  assert.equal(defaults.windowSec, 600);
  const flags = addresses.flatMap((addr) => ["--addr", addr]);
  assert.deepEqual(readOptions(flags, { ADMIN_TOKEN: settings.ADMIN_TOKEN }).addresses, addresses);
});

await test("live settings refuse credential-bearing URLs, redirects via paths, and non-preprod networks", () => {
  for (const ENGINE_URL of [
    "http://localhost:4000",
    "https://user:password@example.test",
    "https://example.test/api",
    "https://example.test/?token=secret",
    "https://example.test/#secret",
  ]) {
    assert.throws(() => readOptions([], { ...settings, ENGINE_URL }));
  }
  assert.throws(() => readOptions([], { ...settings, NETWORK: "other" }));
  assert.equal(
    readOptions([], { ...settings, ENGINE_URL: "https://example.test/" }).base,
    "https://example.test",
  );
});

await test("invalid catalog flags and windows fail before any network request", () => {
  for (const args of [
    ["--store", "../store"],
    ["--ean", "bad"],
    ["--window", "499"],
    ["--window", "3601"],
    ["--window", "NaN"],
    ["--window", "600.5"],
    ["--unknown"],
  ]) {
    assert.throws(() => readOptions(args, settings));
  }
});

await test("the location probe reaches the location gate but cannot become a paid submission", () => {
  const bytes = decodeBase64Strict(LOCATION_PROBE, 2_000_000);
  assert.ok(bytes.length > 0);
  assert.throws(
    () => cleanJpeg(bytes, { ...DEFAULT_IMAGE_LIMITS, maxBytes: 2_000_000 }),
    (error: unknown) => error instanceof AppError && error.code === "image_not_decodable",
  );
});

function entry(kind: LedgerEvent["kind"], refs: Record<string, string>): LedgerEvent {
  return LedgerEventSchema.parse({
    seq: 1,
    ts: "2026-10-31T00:00:00Z",
    kind,
    refs,
    payloadHash: "",
    prevHash: "",
    note: "",
  });
}

await test("unrelated live payments and this job's claim events do not fail the no-payment check", () => {
  assert.deepEqual(
    jobActivity(
      [
        entry("VERIFY_PAID", { jobId: "job_other" }),
        entry("PAYOUT_SUBMITTED", { taskId: "tsk_other" }),
        entry("TASK_CLAIMED", { jobId: "job_test", taskId: "tsk_test" }),
        entry("LOCATION_CHECKED", { claimId: "clm_test" }),
      ],
      "job_test",
      "tsk_test",
    ),
    [],
  );
});

await test("verification attempts and every payout stage for this job/task are detected", () => {
  const activity = (
    [
      "SUBMISSION_RECEIVED",
      "VERIFY_PAID",
      "VERDICT",
      "PAYOUT_QUEUED",
      "PAYOUT_SUBMITTED",
      "PAYOUT_CONFIRMED",
      "PAYOUT_RECONCILED",
      "PAYOUT_MARKED_PAID",
    ] as const
  ).map((kind, i) => entry(kind, i % 2 ? { jobId: "job_test" } : { taskId: "tsk_test" }));
  assert.deepEqual(jobActivity(activity, "job_test", "tsk_test"), activity);
});
