import { AppError } from "@shelfie/core/browser";
import { describe, expect, it } from "vitest";
import { ApiClient } from "./lib/api.js";
import { describeError } from "./lib/messages.js";
import { openStream } from "./lib/sse.js";
import { FakeEventSource, errorResponse, jsonResponse, mockFetch, taskFixture } from "./testing.js";

describe("api client", () => {
  it("parses a response with the core schema", async () => {
    const { fetch: f } = mockFetch({ "GET /api/tasks": { tasks: [taskFixture()] } });
    const api = new ApiClient({ base: "", fetchFn: f });
    const res = await api.tasks({ lat: 48.14, lon: 11.58 });
    expect(res.tasks[0]?.productName).toBe("Example Pale Ale 0.33 l");
  });

  it("turns an error body into an AppError with the stable code", async () => {
    const { fetch: f } = mockFetch({
      "GET /api/tasks": () => errorResponse("location_required", "needs location", 403),
    });
    const err = await new ApiClient({ base: "", fetchFn: f })
      .tasks(undefined)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("location_required");
    expect((err as AppError).status).toBe(403);
  });

  it("rejects a response that does not match the schema", async () => {
    const { fetch: f } = mockFetch({ "GET /api/tasks": { tasks: [{ id: "x" }] } });
    const err = await new ApiClient({ base: "", fetchFn: f })
      .tasks(undefined)
      .catch((e: unknown) => e);
    expect((err as AppError).code).toBe("internal");
  });

  it("maps a network failure to dependency_unavailable", async () => {
    const f = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    const err = await new ApiClient({ base: "", fetchFn: f }).health().catch((e: unknown) => e);
    expect((err as AppError).code).toBe("dependency_unavailable");
  });

  it("falls back to the status when the body is not an error body", async () => {
    const { fetch: f } = mockFetch({ "GET /api/health": () => jsonResponse({ nope: 1 }, 429) });
    const err = await new ApiClient({ base: "", fetchFn: f }).health().catch((e: unknown) => e);
    expect((err as AppError).code).toBe("rate_limited");
    expect(describeError(err)).toBe("Too many requests, wait a moment.");
  });

  it("uses the configured base for same-origin or absolute URLs", () => {
    expect(new ApiClient({ base: "https://x.example/" }).tasksStreamUrl({ lat: 1, lon: 2 })).toBe(
      "https://x.example/api/tasks/stream?lat=1&lon=2",
    );
  });
});

describe("stream", () => {
  it("reconnects after an error and reports status", async () => {
    FakeEventSource.reset();
    const statuses: string[] = [];
    const seen: string[] = [];
    const handle = openStream({
      url: "/s",
      events: ["ping"],
      factory: (u) => new FakeEventSource(u),
      onStatus: (s) => statuses.push(s),
      onEvent: (n) => seen.push(n),
      backoffMs: [5],
    });
    FakeEventSource.instances[0]?.open();
    FakeEventSource.instances[0]?.fail();
    await new Promise((r) => setTimeout(r, 30));
    expect(FakeEventSource.instances).toHaveLength(2);
    FakeEventSource.instances[1]?.open();
    FakeEventSource.instances[1]?.emit("ping", {});
    handle.close();
    expect(seen).toEqual(["ping"]);
    expect(statuses).toEqual([
      "connecting",
      "open",
      "reconnecting",
      "reconnecting",
      "open",
      "closed",
    ]);
    expect(FakeEventSource.instances[1]?.closed).toBe(true);
  });
});
