import { useState } from "react";
import type { CatalogResponse, LedgerEvent } from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { describeError } from "../lib/messages.js";
import { Button, Select } from "../ui/index.js";

const TEST_STORE_ID = "demo-hoc-friedenstrasse-24";
const TEST_PRODUCT_EAN = "9002490100070"; // Red Bull Energy Drink 250 ml

/** The first id that is in the list: the operator's choice, then the default, then the first entry. */
function pick(ids: readonly string[], ...preferred: string[]): string {
  return preferred.find((id) => id !== "" && ids.includes(id)) ?? ids[0] ?? "";
}

export function OperatorTools(props: {
  catalog: CatalogResponse | undefined;
  packId: string;
  enabledOverride: boolean;
  ledger: readonly LedgerEvent[];
  /** The operator token from the dashboard gate (memory only); it is checked before this renders. */
  adminToken: string;
  onCreated: (jobId: string) => void;
}) {
  const { api, newId } = useDeps();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submissionId, setSubmissionId] = useState("");
  // Catalog dropdowns as in the brand form, one store per job (ADR-16). Until the operator picks,
  // the demo shelf at House of Communication with the Red Bull we keep there is selected.
  const [chosenEan, setChosenEan] = useState("");
  const [chain, setChain] = useState("");
  const [chosenStoreId, setChosenStoreId] = useState("");
  const city = props.catalog?.cities.find((c) => c.id === "munich");
  const products = city?.products ?? [];
  const stores = city?.stores ?? [];
  const chains = [...new Set(stores.map((s) => s.chain))].sort();
  const visible = chain ? stores.filter((s) => s.chain === chain) : stores;
  const ean = pick(
    products.map((p) => p.ean),
    chosenEan,
    TEST_PRODUCT_EAN,
  );
  const storeId = pick(
    visible.map((s) => s.id),
    chosenStoreId,
    TEST_STORE_ID,
  );
  const demo = async () => {
    const store = stores.find((s) => s.id === storeId);
    const product = products.find((p) => p.ean === ean);
    if (!store || !product) return;
    setBusy(true);
    setError(null);
    try {
      const job = await api.createJob(
        {
          packId: props.packId,
          source: "demo",
          externalRef: `demo-${newId("req")}`,
          input: { productEan: product.ean, stores: [{ id: store.id }] },
        },
        props.adminToken,
      );
      props.onCreated(job.job.id);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  const override = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.override(submissionId, props.adminToken);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  const submissions = [
    ...new Set(
      props.ledger
        .filter((e) => e.kind === "VERDICT" && e.note.toUpperCase().startsWith("FAIL"))
        .flatMap((e) => (e.refs["submissionId"] ? [e.refs["submissionId"]] : [])),
    ),
  ];
  return (
    <section className="dcard operator" aria-label="Operator tools">
      <h2 className="dh2">Test job</h2>
      <p className="dsub">
        Creates a job directly in the engine, without a Sokosumi Task or Masumi escrow: use it to
        test the worker app, the verifier and the worker payout. The verifier fee (x402) and the
        payout for a passing photo are real preprod payments; no brand fee is charged or refunded.
        Real brand orders come from /b. Pick the product and store from the catalog, as a brand
        does; the demo shelf at House of Communication with Red Bull 250 ml is preselected.
      </p>
      <Select
        label="Product"
        value={ean}
        placeholder="Select a product"
        options={products.map((p) => ({ value: p.ean, label: p.name }))}
        disabled={busy}
        onChange={setChosenEan}
      />
      <Select
        label="Chain"
        value={chain}
        placeholder="All chains"
        options={chains.map((c) => ({ value: c, label: c }))}
        disabled={busy}
        onChange={setChain}
      />
      <Select
        label="Store"
        value={storeId}
        placeholder="Select a store"
        options={visible.map((s) => ({ value: s.id, label: `${s.name}, ${s.address}` }))}
        disabled={busy}
        onChange={setChosenStoreId}
      />
      <Button
        variant="plain"
        disabled={busy || !props.catalog || ean === "" || storeId === ""}
        onClick={() => void demo()}
      >
        Create test job
      </Button>
      <h2 className="dh2">Override</h2>
      {props.enabledOverride ? (
        <>
          <Select
            label="Rejected submission"
            value={submissionId}
            placeholder="Select a submission"
            options={submissions.map((id) => ({ value: id, label: id }))}
            onChange={setSubmissionId}
          />
          <Button variant="plain" disabled={busy || !submissionId} onClick={() => void override()}>
            Override to pass
          </Button>
        </>
      ) : (
        <p className="footnote">Override is disabled on this engine.</p>
      )}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
