import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeClock } from "@shelfie/core";
import { describe, expect, it } from "vitest";
import { addressUrl, shortAddress, txUrl } from "./explorer.js";
import { GENESIS_HASH, Ledger, verifyLedger } from "./ledger.js";

const HASH = "a".repeat(64);

function tmpLedger(): { path: string; ledger: Ledger; clock: FakeClock } {
  const dir = mkdtempSync(join(tmpdir(), "ledger-"));
  const path = join(dir, "ledger.jsonl");
  const clock = new FakeClock();
  return { path, clock, ledger: new Ledger({ path, clock }) };
}

describe("ledger chain", () => {
  it("appends hash-chained entries starting at seq 1 and verifies", () => {
    const { path, ledger, clock } = tmpLedger();
    const a = ledger.append({ kind: "JOB_CREATED", refs: { jobId: "job_01" } });
    clock.advanceSec(1);
    const b = ledger.append({ kind: "TASK_OPENED", refs: { jobId: "job_01", taskId: "tsk_01" } });
    expect(a.entry.seq).toBe(1);
    expect(a.entry.prevHash).toBe(GENESIS_HASH);
    expect(b.entry.seq).toBe(2);
    expect(b.entry.prevHash).not.toBe(GENESIS_HASH);
    const res = verifyLedger(path);
    expect(res.ok).toBe(true);
    expect(res.entries).toBe(2);
    expect(res.headHash).toBe(ledger.headHash());
  });

  it("reload continues the chain without rewriting the file", () => {
    const { path, ledger } = tmpLedger();
    ledger.append({ kind: "JOB_CREATED", refs: { jobId: "job_01" } });
    const before = readFileSync(path, "utf8");
    const again = new Ledger({ path });
    expect(readFileSync(path, "utf8")).toBe(before);
    const e = again.append({ kind: "TASK_OPENED", refs: { taskId: "tsk_01" } });
    expect(e.entry.seq).toBe(2);
    expect(verifyLedger(path).ok).toBe(true);
    expect(readFileSync(path, "utf8").startsWith(before)).toBe(true);
  });

  it("detects a modified entry", () => {
    const { path, ledger } = tmpLedger();
    ledger.append({ kind: "JOB_CREATED", refs: { jobId: "job_01" }, note: "one" });
    ledger.append({ kind: "TASK_OPENED", refs: { taskId: "tsk_01" } });
    ledger.append({ kind: "TASK_CLAIMED", refs: { taskId: "tsk_01" } });
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    lines[0] = (lines[0] ?? "").replace('"note":"one"', '"note":"two"');
    writeFileSync(path, `${lines.join("\n")}\n`);
    const res = verifyLedger(path);
    expect(res.ok).toBe(false);
    expect(res.failure?.reason).toBe("prev_hash_mismatch");
    expect(res.failure?.line).toBe(2);
  });

  it("detects a removed entry and a reordered seq", () => {
    const { path, ledger } = tmpLedger();
    ledger.append({ kind: "JOB_CREATED", refs: { jobId: "job_01" } });
    ledger.append({ kind: "TASK_OPENED", refs: { taskId: "tsk_01" } });
    ledger.append({ kind: "TASK_CLAIMED", refs: { taskId: "tsk_01" } });
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    writeFileSync(path, `${[lines[0], lines[2]].join("\n")}\n`);
    expect(verifyLedger(path).failure?.reason).toBe("seq_gap");
  });

  it("detects garbage and schema violations", () => {
    const { path, ledger } = tmpLedger();
    ledger.append({ kind: "JOB_CREATED", refs: { jobId: "job_01" } });
    appendFileSync(path, "not json\n");
    expect(verifyLedger(path).failure?.reason).toBe("unparseable_line");
    writeFileSync(path, '{"seq":1}\n');
    expect(verifyLedger(path).failure?.reason).toBe("schema_violation");
  });

  it("refuses to open a broken ledger and leaves it untouched", () => {
    const { path, ledger } = tmpLedger();
    ledger.append({ kind: "JOB_CREATED", refs: { jobId: "job_01" } });
    appendFileSync(path, "garbage\n");
    const before = readFileSync(path, "utf8");
    expect(() => new Ledger({ path })).toThrow(/failed verification/);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("a missing file is an empty valid ledger", () => {
    expect(verifyLedger(join(tmpdir(), "does-not-exist-ledger.jsonl")).ok).toBe(true);
  });
});

describe("duplicate events", () => {
  it("writing the same (kind, refs, txHash) twice is a no-op", () => {
    const { path, ledger } = tmpLedger();
    const first = ledger.append({
      kind: "PAYOUT_SUBMITTED",
      refs: { taskId: "tsk_01" },
      txHash: HASH,
    });
    const second = ledger.append({
      kind: "PAYOUT_SUBMITTED",
      refs: { taskId: "tsk_01" },
      txHash: HASH,
    });
    expect(first.appended).toBe(true);
    expect(second.appended).toBe(false);
    expect(second.entry.seq).toBe(first.entry.seq);
    expect(ledger.size()).toBe(1);
    expect(readFileSync(path, "utf8").trimEnd().split("\n")).toHaveLength(1);
  });

  it("different refs or different tx are separate entries", () => {
    const { ledger } = tmpLedger();
    ledger.append({ kind: "LOCATION_CHECKED", refs: { claimId: "clm_01", try: "1" } });
    ledger.append({ kind: "LOCATION_CHECKED", refs: { claimId: "clm_01", try: "2" } });
    expect(ledger.size()).toBe(2);
  });

  it("survives a reload (natural keys are rebuilt)", () => {
    const { path, ledger } = tmpLedger();
    ledger.append({ kind: "JOB_CREATED", refs: { jobId: "job_01" } });
    const again = new Ledger({ path });
    expect(again.append({ kind: "JOB_CREATED", refs: { jobId: "job_01" } }).appended).toBe(false);
  });
});

describe("reader, subscribe and explorer helpers", () => {
  it("read pages by afterSeq and notifies subscribers", () => {
    const { ledger } = tmpLedger();
    const seen: number[] = [];
    const off = ledger.subscribe((e) => seen.push(e.seq));
    for (let i = 1; i <= 5; i++) ledger.append({ kind: "ADMIN_ACTION", refs: { n: String(i) } });
    off();
    ledger.append({ kind: "ADMIN_ACTION", refs: { n: "6" } });
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(ledger.read(2, 2).map((e) => e.seq)).toEqual([3, 4]);
  });

  it("adds an explorer URL only for a real 64-hex hash", () => {
    const { ledger } = tmpLedger();
    const good = ledger.append({ kind: "PAYOUT_CONFIRMED", refs: { p: "1" }, txHash: HASH });
    const fake = ledger.append({ kind: "PAYOUT_CONFIRMED", refs: { p: "2" }, txHash: "fake-tx-1" });
    expect(good.entry.explorerUrl).toBe(`https://preprod.cardanoscan.io/transaction/${HASH}`);
    expect(fake.entry.explorerUrl).toBeUndefined();
  });

  it("builds tx and address URLs and shortens addresses", () => {
    expect(txUrl(HASH, "https://x.test/tx")).toBe(`https://x.test/tx/${HASH}`);
    expect(txUrl("nope")).toBeUndefined();
    const addr = `addr_test1${"q".repeat(40)}`;
    expect(addressUrl(addr)).toBe(`https://preprod.cardanoscan.io/address/${addr}`);
    expect(addressUrl("addr1xyz")).toBeUndefined();
    expect(shortAddress(addr)).toBe(`${addr.slice(0, 12)}...${addr.slice(-6)}`);
  });
});
