// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { TaskListItem } from "@shelfie/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerApp } from "./worker/WorkerApp.js";
import { MapTab } from "./worker/MapTab.js";
import { S } from "./lib/messages.js";
import {
  FakeEventSource,
  PAYOUT_ADDRESS,
  catalogFixture,
  configFixture,
  h,
  makeDeps,
  renderWithDeps,
  taskFixture,
} from "./testing.js";
import type { FetchRoutes } from "./testing.js";
import type { GeolocationLike } from "./lib/geo.js";

beforeEach(() => FakeEventSource.reset());
afterEach(cleanup);

const location = { lat: 48.14, lon: 11.58 };
const OWN_DOT = "Your position, shown on this device only";

// Two open tasks at Store A (s1, mapped), one at Store B (s2, mapped), one at a store that is not
// in the catalog (no position: list only).
const openTasks = (): TaskListItem[] => [
  taskFixture("tsk_01", "Example Pale Ale 0.33 l", "s1"),
  taskFixture("tsk_02", "Other Product 0.5 l", "s1"),
  taskFixture("tsk_03", "Third Product 1 l", "s2"),
  taskFixture("tsk_04", "Unlisted Product", "s9"),
];

function routes(tasks: TaskListItem[]): FetchRoutes {
  return {
    "GET /api/tasks": { tasks },
    "GET /api/catalog": catalogFixture(),
    "GET /api/config": configFixture(),
  };
}

function renderMapTab(opts: {
  tasks?: TaskListItem[];
  geolocation?: GeolocationLike;
  onOpen?: (task: TaskListItem) => void;
}) {
  const { deps, calls } = makeDeps({
    routes: routes(opts.tasks ?? openTasks()),
    geolocation: opts.geolocation,
  });
  const onOpen = opts.onOpen ?? (() => undefined);
  renderWithDeps(
    h(MapTab, {
      location,
      locationState: "ok",
      onRequestLocation: () => undefined,
      onOpen,
    }),
    deps,
  );
  return { calls, onOpen };
}

describe("worker map tab", () => {
  it("renders store markers with open-task counts from the feed and the catalog", async () => {
    renderMapTab({});
    expect(await screen.findByRole("button", { name: "Store A: 2 open tasks" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Store B: 1 open task" })).toBeTruthy();
    // The store with no catalog position gets no marker, but its task stays in the list.
    // Exactly two markers: the names of markers end in "open task(s)"; task cards end in "min left".
    expect(screen.getAllByRole("button", { name: /: \d+ open tasks?$/ })).toHaveLength(2);
    const list = screen.getByRole("list", { name: "Open tasks" });
    expect(within(list).getByText("Unlisted Product")).toBeTruthy();
    expect(within(list).getByText("Store position unknown, not shown on the map.")).toBeTruthy();
    expect(screen.getByText("4 open tasks")).toBeTruthy();
  });

  it("opens the task card at a store and the card opens the task", async () => {
    const opened: string[] = [];
    renderMapTab({ onOpen: (t) => opened.push(t.id) });
    fireEvent.click(await screen.findByRole("button", { name: "Store A: 2 open tasks" }));
    const card = screen.getByRole("region", { name: "Tasks at this store" });
    expect(within(card).getByRole("heading", { name: "Store A" })).toBeTruthy();
    expect(within(card).getByText("Other Product 0.5 l")).toBeTruthy();
    expect(within(card).queryByText("Third Product 1 l")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: /Other Product 0.5 l/ }));
    expect(opened).toEqual(["tsk_02"]);
  });

  it("does not touch geolocation until the worker presses Show my location", async () => {
    const getCurrentPosition = vi.fn((success: (p: unknown) => void) =>
      success({ coords: { latitude: 48.1371, longitude: 11.5754, accuracy: 18 }, timestamp: 0 }),
    );
    renderMapTab({ geolocation: { getCurrentPosition } });
    await screen.findByRole("button", { name: "Store A: 2 open tasks" });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: OWN_DOT })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show my location" }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("img", { name: OWN_DOT })).toBeTruthy();
    expect(screen.getByText(/shown on this phone only/)).toBeTruthy();
  });

  it("keeps the map and the list when location is denied", async () => {
    const denied = {
      getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => fail({ code: 1 }),
    } as unknown as GeolocationLike;
    renderMapTab({ geolocation: denied });
    await screen.findByRole("button", { name: "Store A: 2 open tasks" });
    fireEvent.click(screen.getByRole("button", { name: "Show my location" }));
    expect(await screen.findByText(/Location is blocked for this site/)).toBeTruthy();
    expect(screen.queryByRole("img", { name: OWN_DOT })).toBeNull();
    expect(screen.getByRole("button", { name: "Store A: 2 open tasks" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Open tasks" })).toBeTruthy();
  });

  it("shows the empty state when no task is open", async () => {
    renderMapTab({ tasks: [] });
    expect(await screen.findByText(/No tasks in Munich right now/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Map of stores with open tasks" })).toBeNull();
  });
});

describe("worker app: Map tab", () => {
  it("sits between Tasks and Wallet and opens from the bottom bar", async () => {
    const { deps } = makeDeps({
      routes: { ...routes(openTasks()), "GET /api/config": configFixture() },
      storage: {
        "shelfie.profile": JSON.stringify({ name: "Anna", address: PAYOUT_ADDRESS }),
        "shelfie.consent": S.consentVersion,
        "shelfie.locationHint": "1",
      },
    });
    renderWithDeps(h(WorkerApp), deps);

    const labels = (await screen.findByRole("navigation", { name: "Main" })).querySelectorAll(
      ".tab-label",
    );
    expect([...labels].map((el) => el.textContent)).toEqual([
      "Home",
      "Tasks",
      "Map",
      "Wallet",
      "Profile",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(await screen.findByRole("button", { name: "Store A: 2 open tasks" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Store B: 1 open task" }));
    const card = screen.getByRole("region", { name: "Tasks at this store" });
    fireEvent.click(within(card).getByRole("button", { name: /Third Product 1 l/ }));
    // The same claim flow as the task list: the task detail with its claim button.
    expect(await screen.findByRole("button", { name: "Take this task" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Tasks at this store" })).toBeNull(),
    );
  });
});
