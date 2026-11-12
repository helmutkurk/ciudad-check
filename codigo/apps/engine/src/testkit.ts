/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- test and smoke code reads untyped JSON responses */
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EngineEnvSchema,
  FakeClock,
  SequentialIdGenerator,
  createLogger,
  loadEnv,
} from "@shelfie/core";
import type { EngineEnv, Logger, PayoutQueue } from "@shelfie/core";
import type { PayoutQueueAdmin } from "./seams.js";
import { Ledger } from "@shelfie/evidence";
import { makeCatalog } from "./catalog.js";
import { Engine } from "./engine.js";
import { FakePayoutQueue } from "./fakes/payout-queue.js";
import { FakeVerifyClient } from "./fakes/verify-client.js";
import { createApp } from "./http/app.js";
import type { AppOptions } from "./http/app.js";
import { defaultShelfPack } from "./pack.js";
import { MemoryStore } from "./store.js";

export const ADMIN = "dev-admin-token";
export const SHELL = "dev-shell-token";
export const ADDR_A = `addr_test1${"q".repeat(50)}`;
export const ADDR_B = `addr_test1${"p".repeat(50)}`;
export const EAN = "4000000000000";
export const STORE_ID = "s1";

export const STORE_POS = { lat: 48.1255, lon: 11.6109 };
/** About 200 m north of the store. */
export const NEAR_POS = { lat: 48.1273, lon: 11.6109 };
/** City centre, not at the store. */
export const CENTRE = { lat: 48.137, lon: 11.575 };
export const BERLIN = { lat: 52.52, lon: 13.405 };

const stores = [
  {
    id: "s1",
    chain: "Chain X",
    name: "Store A",
    address: "Street 1, 80331 Munich",
    city: "Munich",
    ...STORE_POS,
    geofenceRadiusM: 150,
  },
  {
    id: "s2",
    chain: "Chain X",
    name: "Store B",
    address: "Street 2, 80331 Munich",
    city: "Munich",
    lat: 48.14,
    lon: 11.57,
    geofenceRadiusM: 150,
  },
  {
    id: "b1",
    chain: "Chain Y",
    name: "Store Berlin",
    address: "Strasse 3, 10115 Berlin",
    city: "Berlin",
    lat: 52.52,
    lon: 13.4,
    geofenceRadiusM: 150,
  },
];
const products = [
  {
    ean: EAN,
    name: "Example Pale Ale 0.33l",
    aliases: ["example pale ale"],
    priceMinEur: 1,
    priceMaxEur: 4,
  },
];
export const testCatalog = (): ReturnType<typeof makeCatalog> => makeCatalog(stores, products);

// ---------------------------------------------------------------- synthetic JPEG
const u16 = (n: number): Buffer => Buffer.from([(n >> 8) & 0xff, n & 0xff]);

export interface JpegOpts {
  width?: number;
  height?: number;
  /** Adds an APP1 Exif segment with a fake GPS marker string. */
  exif?: boolean;
  /** Entropy-data text: makes the bytes unique and drives FakeVerifyClient markers. */
  tag?: string;
  trailing?: boolean;
}

/** A structurally valid JPEG (SOI, SOF0, SOS, EOI) with no real pixels: enough for the engine pipeline. */
export function makeJpeg(o: JpegOpts = {}): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  if (o.exif) {
    const payload = Buffer.concat([
      Buffer.from("Exif\0\0", "latin1"),
      Buffer.from("GPSLatitude=48.1 camera=PhoneX", "latin1"),
    ]);
    parts.push(Buffer.from([0xff, 0xe1]), u16(payload.length + 2), payload);
  }
  parts.push(Buffer.from([0xff, 0xfe]), u16(2 + 7), Buffer.from("comment", "latin1"));
  parts.push(
    Buffer.from([0xff, 0xc0]),
    u16(17),
    Buffer.from([8]),
    u16(o.height ?? 1200),
    u16(o.width ?? 1600),
    Buffer.from([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
  );
  parts.push(
    Buffer.from([0xff, 0xda]),
    u16(12),
    Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]),
  );
  parts.push(Buffer.from(`ENTROPY ${o.tag ?? "plain"} ${"x".repeat(64)}`, "latin1"));
  parts.push(Buffer.from([0xff, 0xd9]));
  if (o.trailing) parts.push(Buffer.from("TRAILING-SECRET-DATA", "latin1"));
  return Buffer.concat(parts);
}

let uniq = 0;
/** Unique valid JPEG as base64; pass a marker such as `STUB_VERDICT=FAIL_CODE` in `tag`. */
export function photoB64(tag = "", extra: JpegOpts = {}): string {
  uniq += 1;
  return makeJpeg({ ...extra, tag: `${tag} #${uniq}` }).toString("base64");
}

// ---------------------------------------------------------------- rig
export interface RigOptions {
  env?: Record<string, string>;
  app?: Partial<AppOptions>;
  journalPath?: string;
  /** Replace the in-engine fake payout queue (for example with the @shelfie/payments queue). */
  payoutQueue?: (deps: {
    ids: SequentialIdGenerator;
    clock: FakeClock;
    logger: Logger;
  }) => PayoutQueueAdmin & PayoutQueue;
}

export interface Rig {
  clock: FakeClock;
  ids: SequentialIdGenerator;
  env: EngineEnv;
  engine: Engine;
  store: MemoryStore;
  ledger: Ledger;
  ledgerPath: string;
  imageDir: string;
  verify: FakeVerifyClient;
  payouts: FakePayoutQueue;
  server: Server;
  base: string;
  logs: string[];
  close(): Promise<void>;
  call(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; json: any; headers: Headers }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  admin(method: string, path: string, body?: unknown): ReturnType<Rig["call"]>;
  shell(method: string, path: string, body?: unknown): ReturnType<Rig["call"]>;
  createJob(over?: Record<string, unknown>): Promise<{ status: number; json: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  claim(
    taskId: string,
    worker?: "A" | "B",
    location?: { lat: number; lon: number } | null,
  ): ReturnType<Rig["call"]>;
  submit(taskId: string, claimId: string, over?: Record<string, unknown>): ReturnType<Rig["call"]>;
  /** createJob + claim + good submission, returns ids. Awaits background work. */
  flow(opts?: {
    tag?: string;
    outcome?: "OBSERVED" | "OUT_OF_STOCK";
  }): Promise<{ jobId: string; taskId: string; claimId: string; subId: string }>;
}

export async function makeRig(opts: RigOptions = {}): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "engine-"));
  const clock = new FakeClock();
  const ids = new SequentialIdGenerator();
  const env = loadEnv(EngineEnvSchema, {
    FAKE_PAYMENTS: "1",
    VERIFIER_PAYMENT: "off",
    ...opts.env,
  });
  const logs: string[] = [];
  const logger = createLogger({ level: "debug", clock, sink: (l) => logs.push(l) });
  const ledgerPath = join(dir, "ledger.jsonl");
  const ledger = new Ledger({ path: ledgerPath, clock });
  const store = new MemoryStore(opts.journalPath);
  const verify = new FakeVerifyClient();
  const payouts = new FakePayoutQueue(ids, clock);
  const queue = opts.payoutQueue ? opts.payoutQueue({ ids, clock, logger }) : payouts;
  const imageDir = join(dir, "images");
  const engine = new Engine({
    env,
    clock,
    ids,
    logger,
    store,
    ledger,
    catalog: testCatalog(),
    pack: defaultShelfPack({
      payoutLovelace: env.PAYOUT_LOVELACE,
      maxAttempts: env.MAX_ATTEMPTS,
      claimTtlSec: env.CLAIM_TTL_SEC,
    }),
    verifyClient: verify,
    payoutQueue: queue,
    probe: {
      payBalanceLovelace: () => Promise.resolve("100000000"),
      vbuyBalanceLovelace: () => Promise.resolve("100000000"),
      payQueueDepth: () => payouts.queueDepth(),
      verifierUp: () => Promise.resolve(true),
    },
    imageDir,
    fakes: { payments: true, verifier: true },
    sleep: () => Promise.resolve(),
    payoutPollMs: 0,
    verifyBackoffMs: [0, 0],
  });
  const app = createApp({
    engine,
    env,
    logger,
    clock,
    limits: { worker: null, claim: null, submit: null },
    ...opts.app,
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call: Rig["call"] = async (method, path, body, headers = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined
        ? { body: typeof body === "string" ? body : JSON.stringify(body) }
        : {}),
    });
    const text = await res.text();
    let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      json = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  };
  const admin: Rig["admin"] = (m, p, b) => call(m, p, b, { "x-admin-token": ADMIN });
  const shell: Rig["shell"] = (m, p, b) => call(m, p, b, { "x-shell-token": SHELL });
  let n = 0;
  const createJob: Rig["createJob"] = (over = {}) => {
    n += 1;
    return shell("POST", "/api/jobs", {
      packId: "shelf-check",
      source: "demo",
      externalRef: `demo-${n}`,
      input: { productEan: EAN, stores: [{ id: STORE_ID }], k: 1 },
      ...over,
    });
  };
  const claim: Rig["claim"] = (taskId, who = "A", location = CENTRE) =>
    call("POST", `/api/tasks/${taskId}/claim`, {
      workerId: who === "A" ? "wrk_aaa" : "wrk_bbb",
      displayName: who === "A" ? "Anna" : "Ben",
      payoutAddress: who === "A" ? ADDR_A : ADDR_B,
      ...(location ? { location: { ...location, accuracyM: 800 } } : {}),
    });
  const submit: Rig["submit"] = (taskId, claimId, over = {}) =>
    call("POST", `/api/tasks/${taskId}/submissions`, {
      claimId,
      outcome: "OBSERVED",
      imageBase64: photoB64(),
      mimeType: "image/jpeg",
      location: { ...STORE_POS, accuracyM: 18, fixAgeMs: 1200 },
      clientMeta: {
        captureMode: "getUserMedia",
        width: 1600,
        height: 1200,
        streamStartedToShutterMs: 8400,
        deviceLabelPresent: true,
      },
      ...over,
    });
  const flow: Rig["flow"] = async (o = {}) => {
    const job = await createJob();
    const taskId = job.json.tasks[0].id as string;
    const c = await claim(taskId);
    const claimId = c.json.claim.id as string;
    const s = await submit(taskId, claimId, {
      outcome: o.outcome ?? "OBSERVED",
      imageBase64: photoB64(o.tag ?? ""),
    });
    await engine.idle();
    return {
      jobId: job.json.job.id as string,
      taskId,
      claimId,
      subId: s.json.submission.id as string,
    };
  };

  return {
    clock,
    ids,
    env,
    engine,
    store,
    ledger,
    ledgerPath,
    imageDir,
    verify,
    payouts,
    server,
    base,
    logs,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
    call,
    admin,
    shell,
    createJob,
    claim,
    submit,
    flow,
  };
}
