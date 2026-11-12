// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ClaimResponse } from "@shelfie/core/browser";
import { afterEach, describe, expect, it } from "vitest";
import { TaskDetail } from "./worker/TaskDetail.js";
import {
  PAYOUT_ADDRESS,
  claimFixture,
  errorResponse,
  h,
  makeDeps,
  renderWithDeps,
  taskFixture,
} from "./testing.js";
import type { FetchRoutes } from "./testing.js";

afterEach(cleanup);

function setup(routes: FetchRoutes, canClaim = true) {
  const events: { claimed?: ClaimResponse; tooSlow: number } = { tooSlow: 0 };
  const { deps, calls } = makeDeps({ routes });
  renderWithDeps(
    h(TaskDetail, {
      task: taskFixture(),
      profile: { name: "Anna", address: PAYOUT_ADDRESS },
      canClaim,
      onBack: () => undefined,
      onClaimed: (c) => {
        events.claimed = c;
      },
      onTooSlow: () => {
        events.tooSlow += 1;
      },
      onNeedProfile: () => undefined,
    }),
    deps,
  );
  return { events, calls };
}

describe("claim", () => {
  it("claims with coarse location, the payout address and a worker id", async () => {
    const { events, calls } = setup({ "POST /api/tasks/tsk_01/claim": claimFixture() });
    fireEvent.click(screen.getByRole("button", { name: "Take this task" }));
    await waitFor(() => expect(events.claimed?.challenge.code).toBe("K7Q-4XM"));
    const body = calls.find((c) => c.method === "POST")?.body as Record<string, unknown>;
    expect(body["workerId"]).toMatch(/^wrk_/);
    expect(body["payoutAddress"]).toBe(PAYOUT_ADDRESS);
    expect(body["location"]).toEqual({ lat: 48.14, lon: 11.58, accuracyM: 800 }); // rounded to about 1 km
  });

  it("says another worker was faster on 409 task_not_open", async () => {
    const { events } = setup({
      "POST /api/tasks/tsk_01/claim": () =>
        errorResponse("task_not_open", "Another worker was faster.", 409),
    });
    fireEvent.click(screen.getByRole("button", { name: "Take this task" }));
    await waitFor(() => expect(events.tooSlow).toBe(1));
  });

  it("explains a wrong city", async () => {
    setup({
      "POST /api/tasks/tsk_01/claim": () =>
        errorResponse("wrong_city", "x", 403, { storeCity: "Munich" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Take this task" }));
    expect(
      await screen.findByText("This task is in Munich; you appear to be elsewhere."),
    ).toBeTruthy();
  });

  it("asks to allow location when the browser denies it", async () => {
    const { deps } = makeDeps({
      geolocation: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) },
    });
    renderWithDeps(
      h(TaskDetail, {
        task: taskFixture(),
        profile: { name: "", address: PAYOUT_ADDRESS },
        canClaim: true,
        onBack: () => undefined,
        onClaimed: () => undefined,
        onTooSlow: () => undefined,
        onNeedProfile: () => undefined,
      }),
      deps,
    );
    fireEvent.click(screen.getByRole("button", { name: "Take this task" }));
    expect(await screen.findByText(/Allow location \(city level\)/)).toBeTruthy();
  });

  it("keeps the button disabled until the privacy text is accepted", () => {
    setup({}, false);
    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Take this task" });
    expect(button.disabled).toBe(true);
  });
});
