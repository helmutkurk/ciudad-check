// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrandApp } from "./brand/BrandApp.js";
import {
  FakeEventSource,
  PAYOUT_ADDRESS,
  catalogFixture,
  configFixture,
  errorResponse,
  h,
  healthFixture,
  jobFixture,
  makeDeps,
  renderWithDeps,
} from "./testing.js";
import type { FetchRoutes } from "./testing.js";

// Synthetic brand: the code and profile are placeholders, not real credentials.
const CODE = "synthetic-brand-code";
const BRAND_NAME = "Synthetic Brand";

beforeEach(() => {
  FakeEventSource.reset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(cleanup);

const profile = (over: Record<string, unknown> = {}) => ({
  brandId: "synthetic-brand",
  name: BRAND_NAME,
  walletAddress: PAYOUT_ADDRESS,
  creditsReservedToday: 2,
  dailyCreditCap: 500,
  maxCreditsPerTask: 100,
  maxStores: 5,
  fake: true,
  ...over,
});

const brandRoutes = (over: FetchRoutes = {}): FetchRoutes => ({
  "GET /api/brand/me": profile(),
  "GET /api/config": {
    ...configFixture(),
    orders: { fake: true, enabled: true, realReady: false, maxStores: 5, maxCreditsPerTask: 100 },
  },
  "GET /api/health": healthFixture(),
  "GET /api/catalog": catalogFixture(),
  "GET /api/orders": { orders: [] },
  "GET /api/brand/summary": {
    credits: { spent: 100, refunded: 50, unpricedChecks: 1 },
    checks: { passed: 1, failed: 1, timedOut: 2, open: 0 },
  },
  "GET /api/brand/transactions": {
    transactions: [
      {
        orderId: "ord_01",
        storeId: "s1",
        jobId: "job_01",
        kind: "escrow_lock",
        txHash: "a".repeat(64),
        explorerUrl: `https://preprod.cardanoscan.io/transaction/${"a".repeat(64)}`,
      },
      {
        orderId: "ord_01",
        storeId: "s2",
        jobId: "job_02",
        kind: "refund",
        txHash: "b".repeat(64),
      },
    ],
  },
  "GET /api/jobs/job_01": jobFixture(),
  "GET /api/ledger": { entries: [] },
  "GET /api/payouts": { payouts: [] },
  ...over,
});

// Two requests of this brand, newest first (the order the engine returns them in).
const brandOrders = () => ({
  orders: [
    {
      orderId: "ord_02",
      productEan: "4000000000000",
      createdAt: "2026-10-30T11:00:00Z",
      fake: true,
      jobs: [{ storeId: "s2", sokosumiTaskId: "fake-task-2", jobId: null, status: "SETTLED" }],
    },
    {
      orderId: "ord_01",
      productEan: "4000000000000",
      createdAt: "2026-10-30T10:00:00Z",
      fake: true,
      jobs: [
        { storeId: "s1", sokosumiTaskId: "fake-task-1", jobId: "job_01", status: "COLLECTING" },
        { storeId: "s2", sokosumiTaskId: null, jobId: null, status: "AWAITING_SHELL" },
      ],
    },
  ],
});

async function signIn(code = CODE) {
  fireEvent.change(await screen.findByLabelText("Brand access code"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("button", { name: "Sign out" });
}

const tileValue = (label: string) =>
  within(screen.getByRole("region", { name: "Counts" }))
    .getByText(label)
    .parentElement?.querySelector(".tile-value")?.textContent;

describe("brand sign-in", () => {
  it("a valid brand access code signs in and sends it as X-Brand-Token only", async () => {
    const { deps, calls } = makeDeps({ routes: brandRoutes() });
    renderWithDeps(h(BrandApp), deps);
    await signIn();
    expect(screen.getByRole("button", { name: BRAND_NAME })).toBeTruthy();
    const me = calls.find((c) => c.path === "/api/brand/me");
    expect(me?.headers["X-Brand-Token"]).toBe(CODE);
    expect(me?.headers["X-Admin-Token"]).toBeUndefined();
  });

  it("a refused code shows the error and stays on the sign-in screen", async () => {
    const { deps } = makeDeps({
      routes: brandRoutes({
        "GET /api/brand/me": () =>
          errorResponse("brand_token_invalid", "Brand access code was not accepted.", 401),
      }),
    });
    renderWithDeps(h(BrandApp), deps);
    fireEvent.change(await screen.findByLabelText("Brand access code"), {
      target: { value: "wrong-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("That brand access code was not accepted.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});

describe("brand overview", () => {
  it("zero orders: only the large + (no tiles or containers); the + opens the new-request form", async () => {
    const { deps } = makeDeps({ routes: brandRoutes() });
    renderWithDeps(h(BrandApp), deps);
    await signIn();
    const plus = await screen.findByRole("button", { name: "New shelf request" });
    expect(document.querySelector(".tile")).toBeNull();
    expect(screen.queryByRole("region", { name: "Counts" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Recent shelf requests" })).toBeNull();
    fireEvent.click(plus);
    expect(await screen.findByRole("heading", { name: "New shelf request" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Place order" })).toBeTruthy();
    expect(screen.queryByLabelText("Brand access code")).toBeNull();
  });

  it("with orders: counts and recent rows from the brand's orders only; a row opens its job", async () => {
    const { deps, calls } = makeDeps({
      routes: brandRoutes({ "GET /api/orders": () => brandOrders() }),
    });
    renderWithDeps(h(BrandApp), deps);
    await signIn();
    await screen.findByRole("region", { name: "Counts" });
    expect(tileValue("Shelf requests")).toBe("2");
    expect(tileValue("Stores requested")).toBe("3");
    expect(tileValue("Delivered or settled")).toBe("1");
    expect(tileValue("Refunded or withheld")).toBe("0");

    // Only rows with a job are buttons; the job opens in Orders with its timeline.
    fireEvent.click(screen.getByRole("button", { name: /Example Pale Ale 0\.33 l/ }));
    expect(await screen.findByText("Waiting for a worker.")).toBeTruthy();

    // The brand app never fetches the global jobs list, and never sends the operator token.
    expect(calls.some((c) => c.path === "/api/jobs")).toBe(false);
    expect(calls.some((c) => c.headers["X-Admin-Token"] !== undefined)).toBe(false);
  });
});

describe("brand price, spend, results and transactions (B-17)", () => {
  it("the order form shows the ceiling per store and in total, refunds and test credits", async () => {
    const { deps } = makeDeps({ routes: brandRoutes() });
    renderWithDeps(h(BrandApp), deps);
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "Orders" }));
    const note = await screen.findByLabelText("Order price");
    expect(within(note).getByText(/up to 100 credits per store/)).toBeTruthy();
    expect(within(note).getByText(/test credits, not money|no credits are charged/)).toBeTruthy();
    expect(screen.getByText(/refunded through the escrow/)).toBeTruthy();
  });

  it("overview shows credits paid and refunded and the check counts from the summary", async () => {
    const { deps, calls } = makeDeps({
      routes: brandRoutes({ "GET /api/orders": () => brandOrders() }),
    });
    renderWithDeps(h(BrandApp), deps);
    await signIn();
    const card = await screen.findByRole("region", { name: "Spend and checks" });
    await within(card).findByText("Credits paid");
    const value = (label: string) =>
      within(card).getByText(label).parentElement?.querySelector(".tile-value")?.textContent;
    expect(value("Credits paid")).toBe("100");
    expect(value("Credits refunded")).toBe("50");
    expect(value("Checks failed")).toBe("1");
    expect(value("Checks timed out")).toBe("2");
    expect(within(card).getByText(/1 finished check has no recorded price/)).toBeTruthy();
    expect(calls.find((c) => c.path === "/api/brand/summary")?.headers["X-Brand-Token"]).toBe(CODE);
  });

  it("orders show each store's outcome and the brand's transactions with explorer links", async () => {
    const orders = brandOrders();
    orders.orders[0]!.jobs = [
      {
        storeId: "s2",
        sokosumiTaskId: "t2",
        jobId: "job_02",
        status: "REFUNDED",
        credits: 40,
        result: { outcome: "timed_out", reportReady: false },
      },
    ] as never;
    orders.orders[1]!.jobs[0] = {
      storeId: "s1",
      sokosumiTaskId: "t1",
      jobId: "job_01",
      status: "SETTLED",
      credits: 40,
      result: { outcome: "passed", priceEur: 2.49, reportReady: true },
    } as never;
    const { deps } = makeDeps({ routes: brandRoutes({ "GET /api/orders": () => orders }) });
    renderWithDeps(h(BrandApp), deps);
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "Orders" }));
    expect(await screen.findByText("Timed out, refunded")).toBeTruthy();
    expect(screen.getByText("Passed")).toBeTruthy();
    expect(screen.getByText(/Price on the shelf: .*2\.49/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Photo report and timeline/ })).toBeTruthy();
    const list = await screen.findByRole("region", { name: "Transactions" });
    await within(list).findByText("Escrow lock");
    expect(within(list).getByText("Refund")).toBeTruthy();
    const link = within(list).getAllByRole("link", { name: "View on explorer" })[0];
    expect(link?.getAttribute("href")).toContain(`/transaction/${"a".repeat(64)}`);
  });

  it("a failing summary or transactions read leaves the console usable", async () => {
    const { deps } = makeDeps({
      routes: brandRoutes({
        "GET /api/orders": () => brandOrders(),
        "GET /api/brand/summary": () => errorResponse("not_found", "Missing", 404),
        "GET /api/brand/transactions": () => errorResponse("not_found", "Missing", 404),
      }),
    });
    renderWithDeps(h(BrandApp), deps);
    await signIn();
    const card = await screen.findByRole("region", { name: "Spend and checks" });
    expect(within(card).getByText(/Spend is not available/)).toBeTruthy();
  });
});

describe("brand profile", () => {
  it("shows name, brand id, wallet, credit caps and the demo line", async () => {
    const { deps } = makeDeps({ routes: brandRoutes() });
    renderWithDeps(h(BrandApp), deps);
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: BRAND_NAME }));
    const panel = await screen.findByRole("region", { name: "Brand profile" });
    expect(within(panel).getByText("synthetic-brand")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: /Copy wallet address/ })).toBeTruthy();
    expect(within(panel).getByText("2 of 500 daily cap")).toBeTruthy();
    expect(within(panel).getByText("100")).toBeTruthy();
    expect(within(panel).getByText("5")).toBeTruthy();
    expect(within(panel).getByText("Demo: fake Sokosumi")).toBeTruthy();
    expect(
      within(panel).getByText(/places the Sokosumi Task and pays the Masumi escrow/),
    ).toBeTruthy();
  });

  it("a brand without a wallet says so", async () => {
    const { deps } = makeDeps({
      routes: brandRoutes({ "GET /api/brand/me": profile({ walletAddress: null, fake: false }) }),
    });
    renderWithDeps(h(BrandApp), deps);
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: BRAND_NAME }));
    const panel = await screen.findByRole("region", { name: "Brand profile" });
    expect(within(panel).getByText("No wallet on file")).toBeTruthy();
    expect(within(panel).queryByText("Demo: fake Sokosumi")).toBeNull();
  });
});

describe("brand access code storage", () => {
  it("is never written to storage, the URL or the page; sign out clears it", async () => {
    const code = "synthetic-brand-code-xyz";
    const { deps } = makeDeps({ routes: brandRoutes() });
    renderWithDeps(h(BrandApp), deps);
    await signIn(code);
    fireEvent.click(screen.getByRole("button", { name: "Orders" }));
    await screen.findByRole("button", { name: "Place order" });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.href).not.toContain(code);
    expect(document.cookie).not.toContain(code);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const field = await screen.findByLabelText<HTMLInputElement>("Brand access code");
    expect(field.value).toBe("");
    expect(document.body.innerHTML).not.toContain(code);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
