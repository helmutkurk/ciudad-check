// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Feed } from "./worker/Feed.js";
import { emptyFeed, feedReducer, parseFeedEvent } from "./lib/hooks.js";
import { FakeEventSource, h, makeDeps, renderWithDeps, taskFixture } from "./testing.js";

beforeEach(() => FakeEventSource.reset());
afterEach(cleanup);

const location = { lat: 48.14, lon: 11.58 };

function renderFeed(onOpen: (id: string) => void = () => undefined) {
  const { deps } = makeDeps({
    routes: {
      "GET /api/tasks": {
        tasks: [taskFixture("tsk_01"), taskFixture("tsk_02", "Other Product 0.5 l")],
      },
    },
  });
  return renderWithDeps(
    h(Feed, {
      location,
      locationState: "ok",
      onRequestLocation: () => undefined,
      onOpen: (task) => onOpen(task.id),
    }),
    deps,
  );
}

describe("live task feed", () => {
  it("lists open tasks with the reward", async () => {
    renderFeed();
    expect(await screen.findByText("Example Pale Ale 0.33 l")).toBeTruthy();
    expect(screen.getByText("Other Product 0.5 l")).toBeTruthy();
    const rewards = [...document.querySelectorAll(".task-reward-amount")].map((e) => e.textContent);
    expect(rewards).toEqual(["3\u00a0tADA", "3\u00a0tADA"]);
  });

  it("removes a task when task_closed arrives", async () => {
    renderFeed();
    await screen.findByText("Example Pale Ale 0.33 l");
    const es = FakeEventSource.last("/api/tasks/stream");
    expect(es).toBeDefined();
    es?.open();
    es?.emit("task_closed", { taskId: "tsk_01", reason: "claimed" });
    await waitFor(() => expect(screen.queryByText("Example Pale Ale 0.33 l")).toBeNull());
    expect(screen.getByText("Other Product 0.5 l")).toBeTruthy();
  });

  it("adds a task on task_opened", async () => {
    renderFeed();
    await screen.findByText("Example Pale Ale 0.33 l");
    FakeEventSource.last("/api/tasks/stream")?.emit("task_opened", {
      task: taskFixture("tsk_03", "Third Product 1 l"),
    });
    expect(await screen.findByText("Third Product 1 l")).toBeTruthy();
  });

  it("opens the task detail on tap", async () => {
    let opened = "";
    renderFeed((id) => {
      opened = id;
    });
    fireEvent.click(await screen.findByText("Example Pale Ale 0.33 l"));
    expect(opened).toBe("tsk_01");
  });

  it("shows the empty state", async () => {
    const { deps } = makeDeps({ routes: { "GET /api/tasks": { tasks: [] } } });
    renderWithDeps(
      h(Feed, {
        location,
        locationState: "ok",
        onRequestLocation: () => undefined,
        onOpen: () => undefined,
      }),
      deps,
    );
    expect(await screen.findByText(/No tasks in Munich right now/)).toBeTruthy();
  });

  it("asks for location on a button press when it is off", () => {
    const { deps } = makeDeps();
    let asked = 0;
    renderWithDeps(
      h(Feed, {
        location: undefined,
        locationState: "idle",
        onRequestLocation: () => void asked++,
        onOpen: () => undefined,
      }),
      deps,
    );
    fireEvent.click(screen.getByRole("button", { name: "Allow location" }));
    expect(asked).toBe(1);
  });
});

describe("feed reducer", () => {
  const a = taskFixture("tsk_01");
  const b = taskFixture("tsk_02");

  it("buffers new tasks while the list is scrolled and merges them on flush", () => {
    let s = feedReducer(emptyFeed, { type: "replace", tasks: [a] });
    s = feedReducer(s, { type: "event", event: { type: "task_opened", task: b }, atTop: false });
    expect(s.rows.map((r) => r.task.id)).toEqual(["tsk_01"]);
    expect(s.pending).toHaveLength(1);
    s = feedReducer(s, { type: "flush" });
    expect(s.rows.map((r) => r.task.id)).toEqual(["tsk_02", "tsk_01"]);
  });

  it("marks a closed task as leaving, then removes it", () => {
    let s = feedReducer(emptyFeed, { type: "replace", tasks: [a, b] });
    s = feedReducer(s, {
      type: "event",
      event: { type: "task_closed", taskId: a.id, reason: "claimed" },
      atTop: true,
    });
    expect(s.rows[0]?.leaving).toBe(true);
    s = feedReducer(s, { type: "remove", taskId: a.id });
    expect(s.rows.map((r) => r.task.id)).toEqual(["tsk_02"]);
  });

  it("parses wire events and rejects garbage", () => {
    expect(parseFeedEvent("ping", "")?.type).toBe("ping");
    expect(parseFeedEvent("task_closed", '{"taskId":"tsk_01","reason":"done"}')?.type).toBe(
      "task_closed",
    );
    expect(parseFeedEvent("task_closed", "not json")).toBeNull();
    expect(parseFeedEvent("task_closed", '{"taskId":"nope"}')).toBeNull();
  });
});

describe("feed reconcile while the stream is open", () => {
  it("re-reads the list periodically even when SSE reports open", async () => {
    const { deps, calls } = makeDeps({
      routes: { "GET /api/tasks": { tasks: [taskFixture("tsk_01")] } },
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderWithDeps(
        h(Feed, {
          location,
          locationState: "ok",
          onRequestLocation: () => undefined,
          onOpen: () => undefined,
        }),
        deps,
      );
      await screen.findByText("Example Pale Ale 0.33 l");
      FakeEventSource.last("/api/tasks/stream")?.open();
      const before = calls.filter((c) => c.path === "/api/tasks").length;
      await vi.advanceTimersByTimeAsync(16_000);
      const after = calls.filter((c) => c.path === "/api/tasks").length;
      expect(after).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
