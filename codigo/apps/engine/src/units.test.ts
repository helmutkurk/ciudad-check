/* eslint-disable @typescript-eslint/no-unsafe-member-access -- test and smoke code reads untyped JSON responses */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHALLENGE_ALPHABET, makeChallengeCode } from "@shelfie/core";
import type { Job } from "@shelfie/core";
import { describe, expect, it } from "vitest";
import { haversineM, precheckLocation, resolveCity } from "./geo.js";
import { cleanJpeg, decodeBase64Strict, DEFAULT_IMAGE_LIMITS } from "./jpeg.js";
import { MemoryStore } from "./store.js";
import { EAN, makeJpeg, makeRig } from "./testkit.js";

const limits = { ...DEFAULT_IMAGE_LIMITS, maxBytes: 2_000_000 };
const LIMITS = { defaultGeofenceM: 150, accuracyCapM: 100, maxAccuracyM: 300, maxFixAgeMs: 30000 };
const store = { lat: 48.1255, lon: 11.6109, geofenceRadiusM: 150 };

describe("geo", () => {
  it("haversine is about right (0.001 deg lat = ~111 m)", () => {
    const d = haversineM({ lat: 48, lon: 11 }, { lat: 48.001, lon: 11 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it("precheck: inside, outside, accuracy cap, stale fix, inaccurate fix", () => {
    const at = { ...store, accuracyM: 10, fixAgeMs: 100 };
    expect(precheckLocation(at, store, LIMITS).ok).toBe(true);
    const north200 = { lat: store.lat + 0.0018, lon: store.lon };
    expect(precheckLocation({ ...north200, accuracyM: 10, fixAgeMs: 0 }, store, LIMITS).ok).toBe(
      false,
    );
    expect(precheckLocation({ ...north200, accuracyM: 100, fixAgeMs: 0 }, store, LIMITS).ok).toBe(
      true,
    );
    // accuracy 300 is accepted but only credited up to the cap (100)
    const r = precheckLocation({ ...north200, accuracyM: 300, fixAgeMs: 0 }, store, LIMITS);
    expect(r.allowedM).toBe(250);
    const stale = precheckLocation({ ...at, fixAgeMs: 30001 }, store, LIMITS);
    expect(!stale.ok && stale.code).toBe("location_inaccurate");
    const vague = precheckLocation({ ...at, accuracyM: 301 }, store, LIMITS);
    expect(!vague.ok && vague.code).toBe("location_inaccurate");
    const far = precheckLocation(
      { lat: 48.2, lon: 11.7, accuracyM: 5, fixAgeMs: 0 },
      store,
      LIMITS,
    );
    expect(!far.ok && far.code).toBe("location_mismatch");
  });

  it("default radius applies when the store has none; city boxes", () => {
    const r = precheckLocation(
      { ...store, accuracyM: 0, fixAgeMs: 0 },
      { lat: store.lat, lon: store.lon },
      LIMITS,
    );
    expect(r.allowedM).toBe(150);
    expect(resolveCity({ lat: 48.137, lon: 11.575 })?.id).toBe("munich");
    expect(resolveCity({ lat: 52.5, lon: 13.4 })).toBeUndefined();
  });
});

describe("challenge generator (domain-model 5)", () => {
  it("uses the confusable-free alphabet, XXX-XXX format, and does not repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = makeChallengeCode((n) => Math.floor(Math.random() * n));
      expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
      for (const ch of code.replace("-", "")) expect(CHALLENGE_ALPHABET).toContain(ch);
      expect(code).not.toMatch(/[01OIL]/);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(495);
  });

  it("two active claims never share a code (engine retries on collision)", async () => {
    let n = 0;
    const rig = await makeRig();
    // deterministic generator that repeats the first code for 6 draws, then moves on
    const seq = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    rig.engine["rand"] = (m: number) => (seq[n++ % seq.length] ?? 0) % m;
    const j1 = await rig.createJob();
    const j2 = await rig.createJob();
    const a = await rig.claim(j1.json.tasks[0].id as string, "A");
    const b = await rig.claim(j2.json.tasks[0].id as string, "B");
    expect(a.json.challenge.code).not.toBe(b.json.challenge.code);
    await rig.close();
  });
});

describe("jpeg pipeline", () => {
  it("cleans and hashes; the hash is of the cleaned bytes", () => {
    const raw = makeJpeg({ exif: true, trailing: true, tag: "a" });
    const out = cleanJpeg(raw, limits);
    expect(out.exifPresent).toBe(true);
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
    expect(out.bytes.length).toBeLessThan(raw.length);
    expect(out.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(out.bytes.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    const again = cleanJpeg(makeJpeg({ tag: "a" }), limits);
    expect(again.sha256).toBe(out.sha256); // EXIF/COM/trailing do not change the identity
  });

  it("accepts portrait phone shots, rejects tiny, huge and non-JPEG", () => {
    expect(cleanJpeg(makeJpeg({ width: 1200, height: 1600 }), limits).width).toBe(1200);
    expect(() => cleanJpeg(makeJpeg({ width: 640, height: 480 }), limits)).toThrow();
    expect(() => cleanJpeg(makeJpeg({ width: 5000, height: 4000 }), limits)).toThrow();
    expect(() => cleanJpeg(Buffer.from("GIF89a....."), limits)).toThrow();
    expect(() => cleanJpeg(makeJpeg().subarray(0, 40), limits)).toThrow();
  });

  it("base64 is strict and size-checked before decoding", () => {
    expect(decodeBase64Strict(Buffer.from("hello").toString("base64"), 100).toString()).toBe(
      "hello",
    );
    expect(() => decodeBase64Strict("data:image/jpeg;base64,AAAA", 100)).toThrow();
    expect(() => decodeBase64Strict("AAA", 100)).toThrow();
    expect(() => decodeBase64Strict(Buffer.alloc(500).toString("base64"), 100)).toThrow(
      /too large/,
    );
  });
});

describe("store journal", () => {
  const job = (id: string): Job => ({
    id: id as Job["id"],
    packId: "shelf-check",
    input: { productEan: EAN, stores: [{ id: "s1" }], k: 1 },
    source: "demo",
    externalRef: id,
    k: 1,
    n: 1,
    windowEndsAt: "2026-10-30T10:00:00.000Z",
    state: "COLLECTING",
    decision: null,
    reportMd: null,
    createdAt: "2026-10-30T09:00:00.000Z",
  });

  it("replays puts (last write wins) and a clear marker", () => {
    const path = join(mkdtempSync(join(tmpdir(), "journal-")), "events.jsonl");
    const a = new MemoryStore(path);
    a.jobs.put(job("job_01"));
    a.jobs.put({ ...job("job_01"), state: "WITHHELD" });
    a.jobs.put(job("job_02"));
    const b = new MemoryStore(path);
    expect(b.jobs.all()).toHaveLength(2);
    expect(b.jobs.get("job_01")?.state).toBe("WITHHELD");
    b.clear();
    expect(new MemoryStore(path).jobs.all()).toHaveLength(0);
    expect(readFileSync(path, "utf8").trim().split("\n").length).toBe(4); // append-only
  });

  it("refuses a corrupt or schema-invalid journal", () => {
    const path = join(mkdtempSync(join(tmpdir(), "journal-")), "events.jsonl");
    writeFileSync(path, '{"c":"jobs","v":{"id":"job_01"}}\n');
    expect(() => new MemoryStore(path)).toThrow(/schema/);
    writeFileSync(path, "garbage\n");
    expect(() => new MemoryStore(path)).toThrow(/corrupt/);
  });
});
