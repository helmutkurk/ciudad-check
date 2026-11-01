// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RequestForm } from "./dashboard/RequestForm.js";
import { OrderStatus } from "./dashboard/OrderStatus.js";
import { catalogFixture, errorResponse, h, makeDeps, renderWithDeps } from "./testing.js";
import type { FetchRoutes } from "./testing.js";
import { OrderViewSchema } from "@shelfie/core/browser";

afterEach(cleanup);
const order = () =>
  OrderViewSchema.parse({
    orderId: "ord_01",
    productEan: "4000000000000",
    createdAt: "2026-10-30T10:00:00Z",
    fake: true,
    jobs: [
      { storeId: "s1", sokosumiTaskId: "fake-task-1", jobId: "job_01", status: "COLLECTING" },
      { storeId: "s2", sokosumiTaskId: null, jobId: null, status: "AWAITING_SHELL" },
    ],
  });
function setup(routes: FetchRoutes = {}, brandToken = "brand-code") {
  const created: string[] = [];
  const { deps, calls } = makeDeps({ routes });
  renderWithDeps(
    h(RequestForm, {
      catalog: catalogFixture(),
      brandToken,
      onBrandToken: () => undefined,
      onCreated: (o: { orderId: string }) => {
        created.push(o.orderId);
      },
      enabled: true,
      maxStores: 5,
      fake: true,
      maxCreditsPerTask: 100,
    }),
    deps,
  );
  return { created, calls };
}
function pickStores(...ids: string[]) {
  const select = screen.getByLabelText<HTMLSelectElement>("Stores");
  for (const option of select.options) option.selected = ids.includes(option.value);
  fireEvent.change(select);
}
const pickProduct = () =>
  fireEvent.change(screen.getByLabelText("Product"), { target: { value: "4000000000000" } });

describe("new order availability", () => {
  const renderForm = (extra: Record<string, unknown>) => {
    const { deps } = makeDeps({ routes: {} });
    renderWithDeps(
      h(RequestForm, {
        catalog: catalogFixture(),
        brandToken: "brand-code",
        onCreated: () => undefined,
        enabled: true,
        maxStores: 5,
        fake: false,
        maxCreditsPerTask: 100,
        ...extra,
      }),
      deps,
    );
  };
  it("real mode: no fake notice, order button enabled with product and stores", () => {
    renderForm({});
    expect(screen.queryByText(/Fake orders/)).toBeNull();
    pickProduct();
    pickStores("s1");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Place order" }).disabled).toBe(
      false,
    );
  });
  it("disabled real mode explains the missing settings and blocks the button", () => {
    renderForm({ enabled: false });
    expect(screen.getByText(/real Sokosumi settings/)).toBeTruthy();
    pickProduct();
    pickStores("s1");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Place order" }).disabled).toBe(
      true,
    );
  });
});

describe("new order", () => {
  it("uses catalog dropdowns only; access code is outside the order form; no file inputs", () => {
    setup();
    const form = document.querySelector("form.request-form")!;
    expect(form.querySelectorAll("select")).toHaveLength(3);
    expect(form.querySelectorAll("input,textarea")).toHaveLength(0);
    expect(screen.getByLabelText<HTMLInputElement>("Brand access code").type).toBe("password");
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
  it("brand app: no access code field, and the signed-in token is sent", async () => {
    const created: string[] = [];
    const { deps, calls } = makeDeps({ routes: { "POST /api/orders": order() } });
    renderWithDeps(
      h(RequestForm, {
        catalog: catalogFixture(),
        brandToken: "signed-in-code",
        title: "New shelf request",
        onCreated: (o: { orderId: string }) => {
          created.push(o.orderId);
        },
        enabled: true,
        maxStores: 5,
        fake: true,
        maxCreditsPerTask: 100,
      }),
      deps,
    );
    expect(screen.queryByLabelText("Brand access code")).toBeNull();
    expect(screen.getByRole("heading", { name: "New shelf request" })).toBeTruthy();
    pickProduct();
    pickStores("s1");
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(created).toEqual(["ord_01"]));
    expect(calls[0]?.headers["X-Brand-Token"]).toBe("signed-in-code");
  });
  it("filters stores by chain, preserves selected stores and requires code/product/store", () => {
    setup({}, "");
    pickProduct();
    pickStores("s1");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Place order" }).disabled).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText("Chain"), { target: { value: "Chain Y" } });
    expect(screen.getByLabelText<HTMLSelectElement>("Stores").options).toHaveLength(1);
    expect(screen.getByText(/1 store selected/)).toBeTruthy();
  });
  it("posts ids and X-Brand-Token, deduplicates an uncertain retry and shows fake/unknown price", async () => {
    const { calls, created } = setup({ "POST /api/orders": order() });
    pickProduct();
    pickStores("s1", "s2");
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(created).toEqual(["ord_01"]));
    expect(calls[0]?.body).toEqual({ productEan: "4000000000000", storeIds: ["s1", "s2"] });
    expect(calls[0]?.headers["X-Brand-Token"]).toBe("brand-code");
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(screen.getByText(/Fake orders/)).toBeTruthy();
    expect(screen.getByText(/Price not yet quoted/)).toBeTruthy();
  });
  it("retains the request key after a network failure, and opens a partially placed order on 502", async () => {
    let n = 0;
    const { calls, created } = setup({
      "POST /api/orders": () => {
        n++;
        return n === 1
          ? errorResponse("dependency_unavailable", "Cannot reach server", 503)
          : errorResponse("sokosumi_unavailable", "Needs reconciliation", 502, {
              orderId: "ord_01",
            });
      },
    });
    pickProduct();
    pickStores("s1");
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await waitFor(() => expect(created).toEqual(["ord_01"]));
    expect(calls[0]?.headers["Idempotency-Key"]).toBe(calls[1]?.headers["Idempotency-Key"]);
  });
});

describe("order status", () => {
  it("shows each store, shell pickup pending, and opens a linked job timeline", () => {
    const opened: string[] = [];
    const { deps } = makeDeps();
    renderWithDeps(
      h(OrderStatus, {
        order: order(),
        catalog: catalogFixture(),
        onOpenJob: (id: string) => {
          opened.push(id);
        },
      }),
      deps,
    );
    expect(screen.getByText("Store A")).toBeTruthy();
    expect(screen.getByText("Store B")).toBeTruthy();
    expect(screen.getByText("Locking payment in escrow (2-3 min)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Timeline and report/ }));
    expect(opened).toEqual(["job_01"]);
    expect(screen.getByText(/Fake order/)).toBeTruthy();
  });
  it("updates delivery and refund independently per store", () => {
    const { deps } = makeDeps();
    const next = order();
    next.jobs[0]!.status = "SETTLED";
    next.jobs[1]!.status = "REFUNDED";
    renderWithDeps(
      h(OrderStatus, { order: next, catalog: catalogFixture(), onOpenJob: () => undefined }),
      deps,
    );
    expect(screen.getByText("Settled")).toBeTruthy();
    expect(screen.getByText("Refunded")).toBeTruthy();
  });
});
