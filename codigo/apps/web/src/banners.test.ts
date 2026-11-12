// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { HealthResponseSchema } from "@shelfie/core/browser";
import { Banners } from "./dashboard/Banners.js";

afterEach(cleanup);
const health = (vbuy: Record<string, unknown>) =>
  HealthResponseSchema.parse({
    ok: true,
    packId: "shelf-check",
    network: "preprod",
    wallets: { vbuy, pay: { balanceLovelace: "120000000", queueDepth: 0 } },
    verifier: "up",
    fakes: { payments: false, verifier: false },
  });
const show = (h: ReturnType<typeof health>) =>
  render(
    createElement(Banners, {
      health: h,
      healthError: undefined,
      config: undefined,
      demoBadges: false,
    }),
  );

describe("wallet banner", () => {
  it("flags a known empty W-VBUY wallet", () => {
    show(health({ balanceLovelace: "0" }));
    expect(screen.getByText("A wallet is empty.")).toBeTruthy();
  });
  it("ignores an unknown W-VBUY balance", () => {
    show(health({ balanceLovelace: "0", unknown: true }));
    expect(screen.queryByText("A wallet is empty.")).toBeNull();
  });
});
