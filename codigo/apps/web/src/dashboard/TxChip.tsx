import { createContext, useContext, useState } from "react";
import { DEFAULT_EXPLORER_TX_BASE, shortHash, txLink } from "../lib/format.js";

/** Explorer base for the dashboard chips; provided by DashboardApp from /api/config. */
export const TxBaseContext = createContext<string>(DEFAULT_EXPLORER_TX_BASE);

/**
 * Monospace hash chip. A real hash links to the preprod explorer; a fake hash (no link) stays
 * plain text with a "fake" marker. Copy copies the full hash.
 */
export function TxChip(props: { hash: string; explorerUrl?: string | null | undefined }) {
  const base = useContext(TxBaseContext);
  const href = txLink(props.hash, props.explorerUrl, base);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(props.hash)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };
  return (
    <span className="txc-group">
      {href ? (
        <a
          className="txc txc-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View on explorer"
          title={props.hash}
          translate="no"
        >
          {shortHash(props.hash)}
          <span aria-hidden="true"> ↗</span>
        </a>
      ) : (
        <span className="txc" title={props.hash} translate="no">
          {shortHash(props.hash)}
          <span className="txc-note"> fake, no explorer page</span>
        </span>
      )}
      <button type="button" className="txc-copy" onClick={copy} aria-label="Copy hash">
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
