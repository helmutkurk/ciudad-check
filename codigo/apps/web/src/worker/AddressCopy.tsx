import { useEffect, useState } from "react";
import { shortAddress } from "../lib/format.js";
import { Icon } from "../ui/index.js";

/** Shortened address with a copy button (copies the full address). `label` names it for screen readers. */
export function AddressCopy(props: { address: string; label?: string | undefined }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  const short = shortAddress(props.address);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(props.address)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };
  return (
    <span className="address-line">
      <code translate="no">{short}</code>
      <button
        type="button"
        className="chip"
        onClick={copy}
        aria-label={`Copy ${props.label ?? "payout address"} ${short}`}
      >
        <Icon name={copied ? "check" : "copy"} size={16} />
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </span>
  );
}
