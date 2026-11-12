import { createElement } from "react";
import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  CatalogResponseSchema,
  ClaimResponseSchema,
  ConfigResponseSchema,
  HealthResponseSchema,
  JobViewSchema,
  LedgerEventSchema,
  SubmissionViewSchema,
  TaskListItemSchema,
} from "@shelfie/core/browser";
import { ApiClient } from "./lib/api.js";
import { DepsProvider } from "./deps.js";
import type { Deps } from "./deps.js";
import type { CapturedPhoto } from "./lib/camera.js";
import type { EventSourceLike, MessageEventLike } from "./lib/sse.js";
import { createMemoryStorage } from "./lib/storage.js";

// Test helpers: no network, no camera, no GPS. Imported by *.test.ts only.

export const NOW = new Date("2026-10-30T10:00:00Z");
// Synthetic placeholders that only satisfy the shape checks; not real addresses or hashes.
export const PAYOUT_ADDRESS = `addr_test1${"q".repeat(60)}`;
export const TX_HASH = "ab".repeat(32);

// ------------------------------------------------------------------ fixtures
export const taskFixture = (id = "tsk_01", product = "Example Pale Ale 0.33 l", storeId = "s1") =>
  TaskListItemSchema.parse({
    id,
    jobId: "job_01",
    storeId,
    storeName: storeId === "s2" ? "Store B" : storeId === "s1" ? "Store A" : "Unlisted store",
    storeAddress: storeId === "s2" ? "Street 2, 80333 Munich" : "Street 1, 80331 Munich",
    productName: product,
    payoutAmount: "3000000",
    windowEndsAt: "2026-10-30T10:12:00Z",
  });

export const claimFixture = () =>
  ClaimResponseSchema.parse({
    claim: { id: "clm_01", taskId: "tsk_01", expiresAt: "2026-10-30T10:05:00Z", ttlSec: 300 },
    challenge: {
      code: "K7Q-4XM",
      mode: "handwritten",
      instruction: "Write this code on paper and hold it next to the price tag.",
    },
    task: { product: "Example Pale Ale 0.33 l", store: "Store A" },
  });

export const submissionFixture = (
  kind: "pass" | "oos" | "fail" | "verifying" | "pending-payout",
) => {
  const base = { id: "sub_01", task: { id: "tsk_01", state: "PAID", attemptsLeft: 2 } };
  switch (kind) {
    case "pass":
      return SubmissionViewSchema.parse({
        ...base,
        state: "PASSED",
        verdict: {
          outcome: "OBSERVED",
          pass: true,
          failedGates: [],
          workerMessage: "Verified.",
          extraction: { price: { text: "2.49", value: 2.49, currency: "EUR", confidence: 0.9 } },
        },
        payout: {
          state: "CONFIRMED",
          txHash: TX_HASH,
          explorerUrl: `https://preprod.cardanoscan.io/transaction/${TX_HASH}`,
        },
      });
    case "pending-payout":
      return SubmissionViewSchema.parse({
        ...base,
        state: "PASSED",
        verdict: { outcome: "OBSERVED", pass: true, failedGates: [], workerMessage: "Verified." },
        payout: { state: "SENDING", txHash: null, explorerUrl: null },
      });
    case "oos":
      return SubmissionViewSchema.parse({
        ...base,
        state: "PASSED",
        verdict: {
          outcome: "OUT_OF_STOCK",
          pass: true,
          failedGates: [],
          workerMessage: "Verified.",
          extraction: {
            label: { visible: true, text: "Example Pale Ale", productText: "Example Pale Ale" },
          },
        },
        payout: { state: "QUEUED", txHash: null, explorerUrl: null },
      });
    case "fail":
      return SubmissionViewSchema.parse({
        ...base,
        state: "REJECTED",
        verdict: {
          outcome: "OBSERVED",
          pass: false,
          failedGates: ["code_match"],
          workerMessage:
            "We could not read the code K7Q-4XM in your photo. Hold the paper closer and try again.",
        },
        task: { id: "tsk_01", state: "OPEN", attemptsLeft: 2 },
        payout: null,
      });
    case "verifying":
      return SubmissionViewSchema.parse({
        ...base,
        state: "VERIFYING",
        verdict: null,
        payout: null,
      });
  }
};

export const healthFixture = (fakes = { payments: false, verifier: false }) =>
  HealthResponseSchema.parse({
    ok: true,
    packId: "shelf-check",
    network: "preprod",
    wallets: {
      vbuy: { balanceLovelace: "48000000" },
      pay: { balanceLovelace: "120000000", queueDepth: 0 },
    },
    verifier: "up",
    fakes,
  });

export const configFixture = (demoOverrideEnabled = false) =>
  ConfigResponseSchema.parse({
    packId: "shelf-check",
    ui: {},
    explorerTxBase: "https://preprod.cardanoscan.io/transaction/",
    explorerAddressBase: "https://preprod.cardanoscan.io/address/",
    challengeMode: "handwritten",
    secureContext: true,
    demoOverrideEnabled,
  });

export const catalogFixture = () =>
  CatalogResponseSchema.parse({
    cities: [
      {
        id: "munich",
        name: "Munich",
        stores: [
          {
            id: "s1",
            name: "Store A",
            chain: "Chain X",
            address: "Street 1, 80331 Munich",
            lat: 48.1255,
            lon: 11.6109,
          },
          {
            id: "s2",
            name: "Store B",
            chain: "Chain Y",
            address: "Street 2, 80333 Munich",
            lat: 48.14,
            lon: 11.57,
          },
        ],
        products: [{ ean: "4000000000000", name: "Example Pale Ale 0.33 l" }],
      },
    ],
  });

export const jobFixture = (state = "COLLECTING", counts = { passed: 0, failed: 1, open: 1 }) =>
  JobViewSchema.parse({
    job: {
      id: "job_01",
      packId: "shelf-check",
      source: "demo",
      externalRef: "demo-1",
      state,
      n: 1,
      k: 1,
      windowEndsAt: "2026-10-30T10:15:00Z",
      createdAt: "2026-10-30T10:00:00Z",
      reportMd: state === "DELIVERED" ? "# Shelf check\n\nPrice 2.49 EUR" : null,
    },
    tasks: [
      {
        id: "tsk_01",
        state: state === "DELIVERED" ? "PAID" : "OPEN",
        spec: { storeId: "s1", productEan: "4000000000000" },
        attempts: 1,
        acceptedOutcome: state === "DELIVERED" ? "OBSERVED" : null,
      },
    ],
    counts,
    decision: state === "DELIVERED" ? "DELIVER" : null,
    settlement: null,
  });

export const ledgerFixture = (seq: number, kind: string, extra: Record<string, unknown> = {}) =>
  LedgerEventSchema.parse({
    seq,
    ts: "2026-10-30T10:01:00Z",
    kind,
    refs: { jobId: "job_01", taskId: "tsk_01" },
    payloadHash: "0".repeat(64),
    prevHash: "0".repeat(64),
    note: "",
    flags: {},
    ...extra,
  });

// ------------------------------------------------------------------ fetch mock
export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}
type Handler = object | ((call: RecordedCall) => unknown);
export type FetchRoutes = Record<string, Handler>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
export function errorResponse(
  code: string,
  message: string,
  status: number,
  details: Record<string, unknown> = {},
) {
  return jsonResponse({ error: { code, message, details } }, status);
}

/** Routes are keyed "METHOD /path" (query string ignored). A function result may be a Response. */
export function mockFetch(routes: FetchRoutes): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const impl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      "http://localhost",
    );
    const method = init?.method ?? "GET";
    const call: RecordedCall = {
      method,
      path: url.pathname,
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const handler = routes[`${method} ${url.pathname}`];
    if (handler === undefined) {
      return Promise.resolve(
        errorResponse("not_found", `no mock for ${method} ${url.pathname}`, 404),
      );
    }
    const result =
      typeof handler === "function" ? (handler as (c: RecordedCall) => unknown)(call) : handler;
    return Promise.resolve(result instanceof Response ? result : jsonResponse(result));
  };
  return { fetch: impl, calls };
}

// ------------------------------------------------------------------ SSE fake
export class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, ((e: MessageEventLike) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (e: MessageEventLike) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.(new Event("open"));
  }
  fail(): void {
    this.onerror?.(new Event("error"));
  }
  emit(type: string, data: unknown): void {
    for (const l of this.listeners.get(type) ?? []) l({ data: JSON.stringify(data) });
  }
  static reset(): void {
    FakeEventSource.instances = [];
  }
  static last(urlPart: string): FakeEventSource | undefined {
    return [...FakeEventSource.instances].reverse().find((i) => i.url.includes(urlPart));
  }
}

// ------------------------------------------------------------------ deps
export interface DepsOverrides {
  routes?: FetchRoutes;
  secure?: boolean;
  geolocation?: Deps["geolocation"];
  mediaDevices?: Deps["mediaDevices"];
  storage?: Record<string, string>;
  capturePhoto?: Deps["capturePhoto"];
}

export const goodGeolocation: NonNullable<Deps["geolocation"]> = {
  getCurrentPosition(success) {
    success({
      coords: { latitude: 48.1371, longitude: 11.5754, accuracy: 18 },
      timestamp: NOW.getTime() - 1200,
    });
  },
};

export const fakeMediaDevices: NonNullable<Deps["mediaDevices"]> = {
  getUserMedia: () =>
    Promise.resolve({
      getTracks: () => [{ stop: () => undefined }],
      getVideoTracks: () => [{ label: "Back camera", stop: () => undefined }],
    } as unknown as MediaStream),
};

export const fakePhoto: CapturedPhoto = {
  base64: "QUJD",
  mimeType: "image/jpeg",
  width: 1600,
  height: 1200,
  previewUrl: "blob:fake",
};

export function makeDeps(o: DepsOverrides = {}): { deps: Deps; calls: RecordedCall[] } {
  const { fetch: fetchFn, calls } = mockFetch(o.routes ?? {});
  let n = 0;
  const deps: Deps = {
    api: new ApiClient({ base: "", fetchFn }),
    env: { VITE_API_BASE: "", VITE_DEMO_BADGES: false },
    createEventSource: (url) => new FakeEventSource(url),
    now: () => NOW,
    newId: (prefix) => `${prefix}_${(++n).toString().padStart(2, "0")}`,
    geolocation: o.geolocation ?? goodGeolocation,
    mediaDevices: o.mediaDevices ?? fakeMediaDevices,
    isSecureContext: () => o.secure ?? true,
    capturePhoto: o.capturePhoto ?? (() => Promise.resolve(fakePhoto)),
    storage: createMemoryStorage(o.storage ?? {}),
  };
  return { deps, calls };
}

export function renderWithDeps(ui: ReactElement, deps: Deps) {
  return render(createElement(DepsProvider, { value: deps }, ui));
}

export const h = createElement;

/** Passes the /dashboard operator gate: types the token and waits for the sections to load. */
export async function unlockDashboard(token = "operator-token"): Promise<void> {
  fireEvent.change(await screen.findByLabelText("Operator token"), { target: { value: token } });
  fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
  await screen.findByRole("button", { name: "Overview" });
}
