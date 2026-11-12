// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DashboardApp } from "./dashboard/DashboardApp.js";
import { JobDetail } from "./dashboard/JobDetail.js";
import {
  FakeEventSource,
  TX_HASH,
  catalogFixture,
  configFixture,
  errorResponse,
  h,
  healthFixture,
  jobFixture,
  ledgerFixture,
  makeDeps,
  renderWithDeps,
  unlockDashboard,
} from "./testing.js";
import type { FetchRoutes } from "./testing.js";

beforeEach(() => FakeEventSource.reset());
afterEach(cleanup);

const baseRoutes = (over: FetchRoutes = {}): FetchRoutes => ({
  "GET /api/admin/ping": { ok: true },
  "GET /api/config": configFixture(),
  "GET /api/health": healthFixture(),
  "GET /api/catalog": catalogFixture(),
  "GET /api/jobs": { jobs: [jobFixture().job] },
  "GET /api/jobs/job_01": jobFixture(),
  "GET /api/ledger": { entries: [] },
  "GET /api/payouts": { payouts: [] },
  ...over,
});

describe("dashboard banners", () => {
  it("shows the FAKE PAYMENTS and verifier stub banners when the engine reports fakes", async () => {
    const { deps } = makeDeps({
      routes: baseRoutes({ "GET /api/health": healthFixture({ payments: true, verifier: true }) }),
    });
    renderWithDeps(h(DashboardApp), deps);
    await unlockDashboard();
    expect(await screen.findByText("Fake payments.")).toBeTruthy();
    expect(screen.getByText("Verifier stub.")).toBeTruthy();
  });

  it("shows no fake banner on a real run", async () => {
    const { deps } = makeDeps({ routes: baseRoutes() });
    renderWithDeps(h(DashboardApp), deps);
    await unlockDashboard();
    await screen.findByRole("button", { name: /Example Pale Ale 0.33 l/ });
    expect(screen.queryByText("Fake payments.")).toBeNull();
  });

  it("shows the operator override badge when the engine enables it", async () => {
    const { deps } = makeDeps({ routes: baseRoutes({ "GET /api/config": configFixture(true) }) });
    renderWithDeps(h(DashboardApp), deps);
    await unlockDashboard();
    expect(await screen.findByText("Operator override enabled.")).toBeTruthy();
  });

  it("says when the engine is not reachable", async () => {
    const { deps } = makeDeps({ routes: { "GET /api/admin/ping": { ok: true } } });
    renderWithDeps(h(DashboardApp), deps);
    await unlockDashboard();
    expect(await screen.findByText("Engine not reachable.")).toBeTruthy();
  });
});

describe("overview", () => {
  it("labels counts with their coverage and marks the active section", async () => {
    const { deps } = makeDeps({ routes: baseRoutes() });
    renderWithDeps(h(DashboardApp), deps);
    await unlockDashboard();
    fireEvent.click(await screen.findByRole("button", { name: "Overview" }));
    expect(screen.getByRole("button", { name: "Overview" }).getAttribute("aria-current")).toBe(
      "page",
    );
    // The orders detail placeholder repeats these counts while hidden; scope to the overview.
    const counts = screen.getByRole("region", { name: "Counts" });
    expect(await within(counts).findByText("Counts cover all 1 loaded request.")).toBeTruthy();
    expect(within(counts).getByText("Active requests")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});

describe("job list and detail", () => {
  it("lists jobs with product, store and live counts, then opens the detail", async () => {
    const { deps } = makeDeps({ routes: baseRoutes() });
    renderWithDeps(h(DashboardApp), deps);
    await unlockDashboard();
    expect(await screen.findByRole("button", { name: /Example Pale Ale 0.33 l/ })).toBeTruthy();
    expect(screen.getByText(/Passed 0 of 1, open 1, failed 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Example Pale Ale 0.33 l/ }));
    expect(await screen.findByText("Waiting for a worker.")).toBeTruthy();
  });

  it("job detail: decided job shows the report and receipts as explorer links", async () => {
    const routes = baseRoutes({
      "GET /api/jobs/job_01": jobFixture("DELIVERED", { passed: 1, failed: 0, open: 0 }),
      "GET /api/payouts": {
        payouts: [
          {
            id: "pay_01",
            taskId: "tsk_01",
            state: "CONFIRMED",
            amount: "3000000",
            txHash: TX_HASH,
            explorerUrl: null,
          },
        ],
      },
    });
    const { deps } = makeDeps({ routes });
    renderWithDeps(
      h(JobDetail, {
        jobId: "job_01",
        catalog: catalogFixture(),
        ledger: [
          ledgerFixture(1, "VERIFY_PAID", { txHash: "cd".repeat(32) }),
          ledgerFixture(2, "VERDICT", { note: "PASS: price 2.49 EUR" }),
          ledgerFixture(3, "OVERRIDE", { note: "manual pass", flags: { demoOverride: true } }),
        ],
        onBack: () => undefined,
      }),
      deps,
    );
    expect(await screen.findByText("Delivered.")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Price 2.49 EUR/)).toBeTruthy());
    expect(screen.getByText("PASS: price 2.49 EUR")).toBeTruthy();
    expect(screen.getAllByText("Override").length).toBeGreaterThan(0);
    const links = await screen.findAllByRole<HTMLAnchorElement>("link", {
      name: "View on explorer",
    });
    const hrefs = links.map((l) => l.href);
    expect(hrefs).toContain(`https://preprod.cardanoscan.io/transaction/${TX_HASH}`);
    expect(hrefs).toContain(`https://preprod.cardanoscan.io/transaction/${"cd".repeat(32)}`);
    expect(screen.getByText("Verification payment")).toBeTruthy();
  });
});

describe("ledger view", () => {
  it("renders entries as a real table and merges streamed entries", async () => {
    const { deps } = makeDeps({
      routes: baseRoutes({ "GET /api/ledger": { entries: [ledgerFixture(1, "JOB_CREATED")] } }),
    });
    renderWithDeps(h(DashboardApp), deps);
    await unlockDashboard();
    fireEvent.click(await screen.findByRole("button", { name: "Ledger" }));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(await screen.findByText("JOB_CREATED")).toBeTruthy();
    FakeEventSource.last("/api/ledger/stream")?.emit("entry", ledgerFixture(2, "TASK_OPENED"));
    expect(await screen.findByText("TASK_OPENED")).toBeTruthy();
  });
});

describe("operator gate", () => {
  it("refuses a wrong operator token and loads no operator data", async () => {
    const { deps, calls } = makeDeps({
      routes: baseRoutes({
        "GET /api/admin/ping": () => errorResponse("unauthorized", "Unauthorized", 401),
      }),
    });
    renderWithDeps(h(DashboardApp), deps);
    fireEvent.change(await screen.findByLabelText("Operator token"), {
      target: { value: "wrong-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("The operator token was not accepted.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull();
    expect(calls.some((c) => c.path === "/api/jobs" || c.path === "/api/ledger")).toBe(false);
    expect(calls.find((c) => c.path === "/api/admin/ping")?.headers["X-Admin-Token"]).toBe(
      "wrong-token",
    );
  });

  it("after unlock: no brand order form, and operator tools send the gate token", async () => {
    const { deps, calls } = makeDeps({
      routes: baseRoutes({
        "POST /api/jobs": () =>
          Response.json(
            {
              job: {
                id: "job_01",
                state: "RECEIVED",
                n: 1,
                k: 1,
                windowEndsAt: "2026-10-30T10:15:00Z",
              },
              tasks: [],
            },
            { status: 201 },
          ),
      }),
    });
    renderWithDeps(h(DashboardApp), deps);
    await unlockDashboard("synthetic-operator-token");
    await screen.findByRole("button", { name: /Example Pale Ale/ });
    expect(screen.queryByLabelText("Brand access code")).toBeNull();
    expect(screen.queryByRole("button", { name: "Place order" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New order" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Operator" }));
    const create = await screen.findByRole("button", { name: "Create test job" });
    // Defaults to the first entries when the demo shelf is not in the catalog; the operator picks.
    expect(screen.getByLabelText<HTMLSelectElement>("Store").value).toBe("s1");
    fireEvent.change(screen.getByLabelText("Chain"), { target: { value: "Chain Y" } });
    expect(screen.getByLabelText<HTMLSelectElement>("Store").value).toBe("s2");
    fireEvent.click(create);
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path === "/api/jobs")).toBe(true),
    );
    const demo = calls.find((c) => c.method === "POST");
    expect(demo?.body).toMatchObject({
      source: "demo",
      input: { productEan: "4000000000000", stores: [{ id: "s2" }] },
    });
    expect(demo?.headers["X-Admin-Token"]).toBe("synthetic-operator-token");
    expect(demo?.headers["X-Brand-Token"]).toBeUndefined();
  });
});
