// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DashboardApp } from "./dashboard/DashboardApp.js";
import { openRequestsByStore } from "./dashboard/Locations.js";
import {
  FakeEventSource,
  catalogFixture,
  configFixture,
  h,
  healthFixture,
  jobFixture,
  makeDeps,
  renderWithDeps,
  unlockDashboard,
} from "./testing.js";
import type { FetchRoutes } from "./testing.js";

beforeEach(() => FakeEventSource.reset());
afterEach(cleanup);

const routes = (over: FetchRoutes = {}): FetchRoutes => ({
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

describe("dashboard Locations", () => {
  it("lists every catalog store on the map and in the table, with open requests", async () => {
    const { deps } = makeDeps({ routes: routes() });
    renderWithDeps(h(DashboardApp), deps);
    await unlockDashboard();
    fireEvent.click(await screen.findByRole("button", { name: "Locations" }));

    const section = await screen.findByRole("region", { name: "Locations" });
    // job_01 is COLLECTING and targets store s1, so it counts once for Store A.
    expect(
      await within(section).findByRole("button", { name: "Store A: 1 open request" }),
    ).toBeTruthy();
    expect(within(section).getByRole("button", { name: "Store B: 0 open requests" })).toBeTruthy();

    const table = within(section).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Chain X")).toBeTruthy();
    expect(within(rows[0]!).getByText("Street 1, 80331 Munich")).toBeTruthy();
    expect(within(rows[1]!).getByText("Store B")).toBeTruthy();
    expect(within(rows[1]!).getByText("0")).toBeTruthy();
  });

  it("is read only: no add, edit or delete controls", async () => {
    const { deps } = makeDeps({ routes: routes() });
    renderWithDeps(h(DashboardApp), deps);
    await unlockDashboard();
    fireEvent.click(await screen.findByRole("button", { name: "Locations" }));
    const section = await screen.findByRole("region", { name: "Locations" });
    expect(
      within(section).queryByRole("button", { name: /add|edit|delete|create|new/i }),
    ).toBeNull();
  });

  it("counts only active requests, per store, over the loaded jobs", () => {
    const counts = openRequestsByStore([jobFixture("COLLECTING"), jobFixture("DELIVERED")]);
    expect(counts.get("s1")).toBe(1);
    expect(counts.has("s2")).toBe(false);
    expect(openRequestsByStore(undefined).size).toBe(0);
  });
});
