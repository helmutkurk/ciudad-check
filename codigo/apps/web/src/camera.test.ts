// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CameraSheet } from "./worker/CameraSheet.js";
import { WorkerApp } from "./worker/WorkerApp.js";
import {
  PAYOUT_ADDRESS,
  claimFixture,
  errorResponse,
  h,
  makeDeps,
  renderWithDeps,
  submissionFixture,
  taskFixture,
} from "./testing.js";
import type { DepsOverrides } from "./testing.js";
import type { Outcome } from "@shelfie/core/browser";

afterEach(cleanup);

const noFileInput = () => {
  expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0);
  expect(document.querySelectorAll("input[capture], input[accept]")).toHaveLength(0);
};

function renderSheet(o: DepsOverrides = {}, mode: Outcome = "OBSERVED") {
  const result: { submitted?: string; closed: number; lost: number } = { closed: 0, lost: 0 };
  const { deps, calls } = makeDeps(o);
  renderWithDeps(
    h(CameraSheet, {
      open: true,
      mode,
      onModeChange: () => undefined,
      claim: claimFixture(),
      task: taskFixture(),
      onClose: () => {
        result.closed += 1;
      },
      onSubmitted: (i) => {
        result.submitted = i.submissionId;
      },
      onClaimLost: () => {
        result.lost += 1;
      },
    }),
    deps,
  );
  return { result, calls };
}

describe("camera sheet", () => {
  it("shows the read-only notice without a secure context and offers no upload", () => {
    renderSheet({ secure: false });
    expect(screen.getByText("Open the secure link to take the photo.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Take photo" })).toBeNull();
    noFileInput();
  });

  it("has no file input anywhere in a secure context either", async () => {
    renderSheet();
    await screen.findByRole("button", { name: "Take photo" });
    noFileInput();
  });

  it("shows the code and the location status line", async () => {
    renderSheet();
    expect(screen.getAllByText("K7Q-4XM").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.getByTestId("location-status").textContent).toContain("Location ok"),
    );
  });

  it("disables the shutter when location is off", async () => {
    renderSheet({ geolocation: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } });
    await waitFor(() =>
      expect(screen.getByTestId("location-status").textContent).toContain("Location off"),
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Take photo" }).disabled).toBe(
      true,
    );
  });

  it("explains a blocked camera", async () => {
    renderSheet({
      mediaDevices: {
        getUserMedia: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
      },
    });
    expect(await screen.findByText(/camera is blocked/i)).toBeTruthy();
  });

  it("submits a live capture with location and captureMode getUserMedia", async () => {
    const { result, calls } = renderSheet({
      routes: {
        "POST /api/tasks/tsk_01/submissions": {
          submission: { id: "sub_01", state: "VERIFYING", queuePosition: 1 },
        },
      },
    });
    const shutter = await screen.findByRole("button", { name: "Take photo" });
    await waitFor(() => expect((shutter as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(shutter);
    fireEvent.click(await screen.findByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(result.submitted).toBe("sub_01"));
    const body = calls.find((c) => c.path.endsWith("/submissions"))?.body as Record<
      string,
      unknown
    >;
    expect(body["outcome"]).toBe("OBSERVED");
    expect(body["claimId"]).toBe("clm_01");
    expect(body["imageBase64"]).toBe("QUJD");
    expect((body["clientMeta"] as Record<string, unknown>)["captureMode"]).toBe("getUserMedia");
    expect((body["location"] as Record<string, unknown>)["accuracyM"]).toBe(18);
  });

  it("sends outcome OUT_OF_STOCK from the empty-spot flow", async () => {
    const { result, calls } = renderSheet(
      {
        routes: {
          "POST /api/tasks/tsk_01/submissions": {
            submission: { id: "sub_02", state: "VERIFYING", queuePosition: 1 },
          },
        },
      },
      "OUT_OF_STOCK",
    );
    expect(screen.getByText("Empty shelf spot")).toBeTruthy();
    expect(screen.getByText("Show the shelf label and the empty space above it.")).toBeTruthy();
    const shutter = await screen.findByRole("button", { name: "Take photo" });
    await waitFor(() => expect((shutter as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(shutter);
    fireEvent.click(await screen.findByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(result.submitted).toBe("sub_02"));
    expect(
      (calls.find((c) => c.path.endsWith("/submissions"))?.body as Record<string, unknown>)[
        "outcome"
      ],
    ).toBe("OUT_OF_STOCK");
  });

  it("keeps the sheet open with the distance when the location precheck fails", async () => {
    const { result } = renderSheet({
      routes: {
        "POST /api/tasks/tsk_01/submissions": () =>
          errorResponse("location_mismatch", "x", 422, { distanceM: 240, allowedM: 150 }),
      },
    });
    const shutter = await screen.findByRole("button", { name: "Take photo" });
    await waitFor(() => expect((shutter as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(shutter);
    fireEvent.click(await screen.findByRole("button", { name: "Use photo" }));
    expect(await screen.findByText(/about 240\sm from the store/)).toBeTruthy();
    expect(result.closed).toBe(0);
    expect(result.submitted).toBeUndefined();
  });
});

describe("camera sheet, gesture mode (ADR-19)", () => {
  const gestureClaim = () => ({
    ...claimFixture(),
    challenge: { code: "", mode: "gesture" as const, instruction: "Open the camera." },
  });
  const reveal = {
    claimId: "clm_01",
    gesture: { fingers: 3, side: "left" },
    revealedAt: "2026-10-30T10:00:00.000Z",
    answerWithinSec: 90,
    instruction: "Hold up 3 fingers, hand on the left side.",
  };

  it("reveals the hand sign on open and enables the shutter only then", async () => {
    const { deps, calls } = makeDeps({ routes: { "POST /api/claims/clm_01/challenge": reveal } });
    renderWithDeps(
      h(CameraSheet, {
        open: true,
        mode: "OBSERVED",
        onModeChange: () => undefined,
        claim: gestureClaim(),
        task: taskFixture(),
        onClose: () => undefined,
        onSubmitted: () => undefined,
        onClaimLost: () => undefined,
      }),
      deps,
    );
    const sign = await screen.findByTestId("gesture-sign");
    expect(sign.getAttribute("aria-label")).toBe("Hold up 3 fingers to the left of the price tag");
    expect(calls.some((c) => c.path === "/api/claims/clm_01/challenge")).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>("button", { name: "Take photo" }).disabled).toBe(
        false,
      ),
    );
    expect(screen.queryByText("K7Q-4XM")).toBeNull();
    noFileInput();
  });

  it("keeps the shutter disabled while the sign is not revealed", async () => {
    const { deps } = makeDeps({
      routes: {
        "POST /api/claims/clm_01/challenge": () =>
          errorResponse("dependency_unavailable", "Engine busy.", 503),
      },
    });
    renderWithDeps(
      h(CameraSheet, {
        open: true,
        mode: "OBSERVED",
        onModeChange: () => undefined,
        claim: gestureClaim(),
        task: taskFixture(),
        onClose: () => undefined,
        onSubmitted: () => undefined,
        onClaimLost: () => undefined,
      }),
      deps,
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Take photo" }).disabled).toBe(
      true,
    );
  });
});

describe("worker app", () => {
  it("never renders a file input across onboarding, feed and claimed screens", async () => {
    const { deps } = makeDeps({
      storage: {
        "shelfie.profile": JSON.stringify({ name: "Anna", address: PAYOUT_ADDRESS }),
        "shelfie.consent": "consent-v1",
        "shelfie.locationHint": "1",
      },
      routes: {
        "GET /api/config": { code: 0 },
        "GET /api/tasks": { tasks: [taskFixture()] },
        "POST /api/tasks/tsk_01/claim": claimFixture(),
        "GET /api/submissions/sub_01": submissionFixture("verifying"),
      },
    });
    renderWithDeps(h(WorkerApp), deps);
    noFileInput();
    fireEvent.click(await screen.findByText("Example Pale Ale 0.33 l"));
    noFileInput();
    fireEvent.click(await screen.findByRole("button", { name: "Take this task" }));
    expect(await screen.findByTestId("challenge-code")).toBeTruthy();
    expect(screen.getByTestId("challenge-code").textContent).toBe("K7Q-4XM");
    fireEvent.click(screen.getByRole("button", { name: "Open camera" }));
    await screen.findByRole("button", { name: "Take photo" });
    noFileInput();
  });

  it("starts at onboarding with consent text and a validated address", () => {
    const { deps } = makeDeps();
    renderWithDeps(h(WorkerApp), deps);
    expect(screen.getByText(/Version consent-v1/)).toBeTruthy();
    const next = screen.getByRole<HTMLButtonElement>("button", { name: "Continue" });
    expect(next.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Payout address"), {
      target: { value: PAYOUT_ADDRESS },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(next.disabled).toBe(false);
    noFileInput();
  });
});

describe("camera constraints", () => {
  it("asks for an HD rear camera (a 640x480 default is rejected by the engine)", async () => {
    const { startCamera } = await import("./lib/camera.js");
    let seen: MediaStreamConstraints | undefined;
    await startCamera({
      getUserMedia: (c) => {
        seen = c;
        return Promise.resolve({} as MediaStream);
      },
    });
    const video = seen?.video as MediaTrackConstraints;
    expect(video.facingMode).toEqual({ ideal: "environment" });
    expect(video.width).toEqual({ ideal: 1920 });
    expect(video.height).toEqual({ ideal: 1080 });
  });
});
