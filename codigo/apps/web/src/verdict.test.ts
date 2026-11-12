// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VerdictView, isFinished, readExtraction } from "./worker/Result.js";
import { TX_HASH, h, makeDeps, renderWithDeps, submissionFixture } from "./testing.js";

afterEach(cleanup);

function show(kind: Parameters<typeof submissionFixture>[0], onRetry?: () => void) {
  const { deps } = makeDeps();
  return renderWithDeps(
    h(VerdictView, {
      view: submissionFixture(kind),
      payoutAmount: "3000000",
      queuePosition: 2,
      onNext: () => undefined,
      onRetry,
    }),
    deps,
  );
}

describe("verdict rendering", () => {
  it("PASS: price read, payout and an explorer link to the tx", () => {
    show("pass");
    expect(screen.getByRole("heading", { name: "Verified" })).toBeTruthy();
    expect(screen.getByText("Price read")).toBeTruthy();
    expect(document.body.textContent).toContain("2.49 EUR");
    expect(document.body.textContent).toContain("Payment confirmed");
    const link = screen.getByRole<HTMLAnchorElement>("link", { name: "View on explorer" });
    expect(link.href).toBe(`https://preprod.cardanoscan.io/transaction/${TX_HASH}`);
    expect(link.rel).toContain("noopener");
    expect(link.target).toBe("_blank");
  });

  it("PASS with payout in flight uses neutral wording", () => {
    show("pending-payout");
    expect(document.body.textContent).toContain("Payment pending");
    expect(screen.queryByRole("link", { name: "View on explorer" })).toBeNull();
  });

  it("out of stock: own wording and same payout", () => {
    show("oos");
    expect(screen.getByRole("heading", { name: "Verified: not on the shelf" })).toBeTruthy();
    expect(screen.getByText("Label read")).toBeTruthy();
    expect(screen.getByText("Example Pale Ale")).toBeTruthy();
    expect(screen.getByText("Same as a price photo")).toBeTruthy();
  });

  it("FAIL: the plain-words reason, attempts left and a retry", () => {
    show("fail", () => undefined);
    expect(screen.getByText("Rejected")).toBeTruthy();
    expect(screen.getByText(/We could not read the code K7Q-4XM/)).toBeTruthy();
    expect(screen.getByText("Attempts left")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("VERIFYING shows the queue position", () => {
    show("verifying");
    expect(screen.getByText("Queued for verification, position 2.")).toBeTruthy();
  });

  it("polling stops only when the verdict and the payout are settled", () => {
    expect(isFinished(submissionFixture("verifying"))).toBe(false);
    expect(isFinished(submissionFixture("pending-payout"))).toBe(false);
    expect(isFinished(submissionFixture("pass"))).toBe(true);
    expect(isFinished(submissionFixture("fail"))).toBe(true);
  });

  it("reads flat and nested extraction shapes", () => {
    expect(readExtraction(submissionFixture("pass")).price).toBe("2.49 EUR");
    expect(readExtraction(submissionFixture("oos")).label).toBe("Example Pale Ale");
  });
});
