import { useRef, useState } from "react";
import { isAppError } from "@shelfie/core/browser";
import type { CatalogResponse, OrderView } from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { describeError } from "../lib/messages.js";
import { Button, Field, Select } from "../ui/index.js";

/**
 * Catalog-only order form. The brand access code is outside it: with `onBrandToken` the form shows
 * the access code field (standalone use); without it the form sends the `brandToken` it is given
 * (the brand app, where sign-in supplies the token). Secrets stay in tab memory.
 */
export function RequestForm(props: {
  catalog: CatalogResponse | undefined;
  brandToken: string;
  onBrandToken?: ((token: string) => void) | undefined;
  onCreated: (order: Pick<OrderView, "orderId">) => void;
  enabled: boolean;
  maxStores: number;
  fake: boolean;
  maxCreditsPerTask: number | undefined;
  /** Price Sokosumi recorded for this brand's latest store check (credits), when known. */
  lastPriceCredits?: number | undefined;
  /** Heading; the brand app says "New shelf request". */
  title?: string | undefined;
}) {
  const deps = useDeps();
  const [ean, setEan] = useState("");
  const [chain, setChain] = useState("");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reuse the purchase key after an uncertain response, even if the form is changed and restored.
  const requestKeys = useRef(new Map<string, string>());
  const pending = useRef(false);
  const city = props.catalog?.cities.find((c) => c.id === "munich");
  const stores = city?.stores ?? [];
  const chains = [...new Set(stores.map((s) => s.chain))].sort();
  const visible = chain ? stores.filter((s) => s.chain === chain) : stores;
  const ready =
    props.enabled &&
    props.brandToken !== "" &&
    ean !== "" &&
    storeIds.length > 0 &&
    storeIds.length <= props.maxStores;
  const send = async () => {
    if (!ready || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const body = { productEan: ean, storeIds: [...storeIds].sort() };
    const fingerprint = JSON.stringify(body);
    const key = requestKeys.current.get(fingerprint) ?? `order-${deps.newId("req")}`;
    requestKeys.current.set(fingerprint, key);
    try {
      const order = await deps.api.createOrder(body, props.brandToken, key);
      requestKeys.current.delete(fingerprint);
      setStoreIds([]);
      props.onCreated(order);
    } catch (err) {
      setError(describeError(err));
      if (
        isAppError(err) &&
        err.code === "sokosumi_unavailable" &&
        typeof err.details["orderId"] === "string"
      ) {
        props.onCreated({ orderId: err.details["orderId"] });
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="dcard dform" aria-label={props.title ?? "New order"}>
      <h2 className="dh2">{props.title ?? "New order"}</h2>
      {props.onBrandToken ? (
        <Field
          label="Brand access code"
          type="password"
          value={props.brandToken}
          onChange={props.onBrandToken}
          autoComplete="off"
          help="Stays in this tab's memory only."
        />
      ) : null}
      <form
        className="request-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Select
          label="Product"
          value={ean}
          placeholder="Select a product"
          options={(city?.products ?? []).map((p) => ({ value: p.ean, label: p.name }))}
          onChange={setEan}
        />
        <Select
          label="Chain"
          value={chain}
          placeholder="All chains"
          options={chains.map((c) => ({ value: c, label: c }))}
          onChange={setChain}
        />
        <label className="field">
          <span className="field-label">Stores</span>
          <select
            multiple
            size={Math.min(6, Math.max(3, visible.length))}
            value={storeIds}
            disabled={busy}
            onChange={(e) => {
              const hidden = storeIds.filter((id) => !visible.some((s) => s.id === id));
              setStoreIds([
                ...hidden,
                ...Array.from(e.currentTarget.selectedOptions, (o) => o.value),
              ]);
            }}
          >
            {visible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}, {s.address}
              </option>
            ))}
          </select>
        </label>
        <p className="footnote">
          {storeIds.length} {storeIds.length === 1 ? "store selected" : "stores selected"}; up to{" "}
          {props.maxStores}. Use your device's multi-select controls.
        </p>
        {storeIds.length ? (
          <ul className="footnote">
            {storeIds.map((id) => (
              <li key={id}>{stores.find((s) => s.id === id)?.name ?? id}</li>
            ))}
          </ul>
        ) : null}
        <PriceNote
          stores={storeIds.length}
          ceiling={props.maxCreditsPerTask}
          last={props.lastPriceCredits}
          fake={props.fake}
        />
        <p className="footnote">
          One shelf check per store. Shelfie places the order on your behalf. Payment uses Masumi
          escrow: a check that fails, or whose result is withheld, is refunded through the escrow.
        </p>
        {props.fake ? (
          <p className="form-error">
            Fake orders: local rehearsal, no Sokosumi purchase or real escrow.
          </p>
        ) : null}
        {!props.enabled ? (
          <p className="footnote" role="status">
            {props.fake
              ? "Orders are not available: fake orders need fake payments and verifier, outside evidence runs."
              : "Orders are not available: the real Sokosumi settings (API token, coworker, organization) or the real payment and verifier settings are missing on this engine."}
          </p>
        ) : null}
        <Button type="submit" disabled={!ready || busy}>
          {busy ? "Placing order…" : "Place order"}
        </Button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Cost of an order before it is placed. The Sokosumi price is only known once the Task exists, so
 * the form shows the ceiling (an order above it is not placed) and, when one is recorded, the price
 * of this brand's latest check. Credits are Sokosumi preprod test credits, not money.
 */
function PriceNote(props: {
  stores: number;
  ceiling: number | undefined;
  last: number | undefined;
  fake: boolean;
}) {
  if (props.ceiling === undefined)
    return (
      <p className="footnote">Price not yet quoted. The Sokosumi quote determines the price.</p>
    );
  const total = props.stores * props.ceiling;
  return (
    <div className="footnote" aria-label="Order price">
      <p>
        Price not yet quoted: up to {props.ceiling} credits per store
        {props.stores > 0
          ? `, so at most ${total} credits for ${props.stores} ${props.stores === 1 ? "store" : "stores"}`
          : ""}
        . The ceiling is a limit: an order whose Sokosumi price is higher is not placed.
      </p>
      {props.last !== undefined ? (
        <p>Latest recorded price: {props.last} credits per store.</p>
      ) : null}
      <p>
        {props.fake
          ? "Fake order: no credits are charged."
          : "These are Sokosumi preprod test credits, not money."}
      </p>
    </div>
  );
}
