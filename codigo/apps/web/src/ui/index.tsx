import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useDeps } from "../deps.js";
import { DEFAULT_EXPLORER_TX_BASE, formatCountdown, shortHash, txLink } from "../lib/format.js";

// The small shared component set from ui-design.md section 3. Semantic element first.

export type Tone = "success" | "warning" | "error" | "neutral";

export function NavBar(props: {
  title?: string;
  back?: { label: string; onClick: () => void };
  action?: ReactNode;
}) {
  return (
    <header className="navbar">
      <div className="navbar-side">
        {props.back ? (
          <button type="button" className="text-button" onClick={props.back.onClick}>
            <Icon name="back" /> {props.back.label}
          </button>
        ) : null}
      </div>
      <div className="navbar-title">{props.title}</div>
      <div className="navbar-side navbar-side-end">{props.action}</div>
    </header>
  );
}

export function LargeTitle(props: { title: string; subtitle?: string }) {
  return (
    <div className="large-title">
      <h1>{props.title}</h1>
      {props.subtitle ? <p className="subhead">{props.subtitle}</p> : null}
    </div>
  );
}

export function Group(props: { children: ReactNode; footer?: ReactNode; label?: string }) {
  return (
    <section className="group-wrap" aria-label={props.label}>
      <div className="group">{props.children}</div>
      {props.footer ? <p className="footnote group-footer">{props.footer}</p> : null}
    </section>
  );
}

export function Row(props: {
  title: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  trailingSecondary?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <span className="row-main">
        <span className="row-title">{props.title}</span>
        {props.secondary ? <span className="row-secondary">{props.secondary}</span> : null}
      </span>
      {props.trailing || props.trailingSecondary ? (
        <span className="row-trailing">
          {props.trailing ? <span className="row-value">{props.trailing}</span> : null}
          {props.trailingSecondary ? (
            <span className="row-secondary">{props.trailingSecondary}</span>
          ) : null}
        </span>
      ) : null}
      {props.onClick ? <Icon name="chevron" /> : null}
    </>
  );
  const cls = `row ${props.className ?? ""}`.trim();
  return props.onClick ? (
    <button type="button" className={`${cls} row-button`} onClick={props.onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "plain" },
) {
  const { variant = "primary", className, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={`button button-${variant} ${className ?? ""}`.trim()}
    />
  );
}

export function TextButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean },
) {
  const { destructive, className, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={`text-button ${destructive ? "destructive" : ""} ${className ?? ""}`.trim()}
    />
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | undefined;
  help?: string;
  type?: "text" | "password";
  placeholder?: string;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="footnote">
        {props.label}
      </label>
      <input
        id={id}
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete ?? "off"}
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error || props.help ? `${id}-note` : undefined}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlur}
      />
      {props.error || props.help ? (
        <p id={`${id}-note`} className={`footnote ${props.error ? "error-text" : ""}`}>
          {props.error ? <Icon name="alert" /> : null} {props.error ?? props.help}
        </p>
      ) : null}
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

/** Native select: phones show their own picker. The only input type the request form uses. */
export function Select(props: {
  label: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  help?: string | undefined;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="footnote">
        {props.label}
      </label>
      <select
        id={id}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">{props.placeholder}</option>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {props.help ? <p className="footnote">{props.help}</p> : null}
    </div>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={props.value === o.value}
          className={props.value === o.value ? "selected" : ""}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill(props: { tone: Tone; children: ReactNode }) {
  return <span className={`pill pill-${props.tone}`}>{props.children}</span>;
}

export function Banner(props: { tone: "warning" | "error"; title: string; children?: ReactNode }) {
  return (
    <div
      className={`banner banner-${props.tone}`}
      role={props.tone === "error" ? "alert" : "status"}
    >
      <strong>{props.title}</strong>
      {props.children ? <span> {props.children}</span> : null}
    </div>
  );
}

export function EmptyState(props: { text: string; help?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p>{props.text}</p>
      {props.help ? <p className="footnote">{props.help}</p> : null}
      {props.action}
    </div>
  );
}

/** Bottom sheet on a native <dialog>. Content mounts only while open. */
export function Sheet(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  camera?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!props.open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [props.open]);
  return (
    <dialog
      ref={ref}
      className={`sheet ${props.camera ? "sheet-camera" : ""}`}
      aria-label={props.title}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
    >
      {props.open ? props.children : null}
    </dialog>
  );
}

export function Toast(props: { message: string | null; onDone: () => void }) {
  const { message, onDone } = props;
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 4000);
    return () => clearTimeout(id);
  }, [message, onDone]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message ? <div className="toast">{message}</div> : null}
    </div>
  );
}

export function TxLink(props: { hash: string; explorerUrl?: string | null; label?: string }) {
  const { config } = useExplorerBase();
  const href = txLink(props.hash, props.explorerUrl, config);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(props.hash)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };
  return (
    <span className="tx-link">
      {props.label ? <span className="row-secondary">{props.label} </span> : null}
      <code translate="no" title={props.hash}>
        {shortHash(props.hash)}
      </code>{" "}
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          View on explorer
        </a>
      ) : (
        <span className="footnote">No explorer page (fake hash)</span>
      )}{" "}
      <button type="button" className="text-button" onClick={copy} aria-label="Copy hash">
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

const ExplorerContext = createContext<string>(DEFAULT_EXPLORER_TX_BASE);
export const ExplorerProvider = ExplorerContext.Provider;
function useExplorerBase() {
  return { config: useContext(ExplorerContext) };
}

export function Countdown(props: { expiresAt: string; onExpire?: () => void }) {
  const { now } = useDeps();
  const [remaining, setRemaining] = useState(
    () => new Date(props.expiresAt).getTime() - now().getTime(),
  );
  const expired = useRef(false);
  const { onExpire, expiresAt } = props;
  useEffect(() => {
    expired.current = false;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - now().getTime();
      setRemaining(ms);
      if (ms <= 0 && !expired.current) {
        expired.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, now, onExpire]);
  const text = formatCountdown(remaining);
  return (
    <span
      className={`countdown ${remaining < 60_000 ? "warn" : ""}`}
      aria-label={`${text} left`}
      data-testid="countdown"
    >
      {text}
    </span>
  );
}

export type IconName =
  "back" | "chevron" | "alert" | "check" | "pin" | "copy" | "clock" | "close" | "user" | "shelf";
const ICON_PATHS: Record<IconName, string> = {
  back: "M12.5 4 6.5 10l6 6",
  chevron: "m8 4 6 6-6 6",
  alert: "M10 3 2.5 16.5h15L10 3Zm0 5v4m0 2.5v.01",
  check: "m4 10.5 4 4 8-9",
  pin: "M10 18s5.5-5 5.5-9a5.5 5.5 0 1 0-11 0c0 4 5.5 9 5.5 9Zm0-7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  copy: "M7 7V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H13M4.5 7h7A1.5 1.5 0 0 1 13 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 15.5v-7A1.5 1.5 0 0 1 4.5 7Z",
  clock: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-11v4.5l3 1.5",
  close: "m5 5 10 10M15 5 5 15",
  user: "M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.5 7.5c.6-3 3.2-4.5 6.5-4.5s5.9 1.5 6.5 4.5",
  shelf: "M3 5h14M3 10h14M3 15h14",
};

export function Icon(props: { name: IconName; size?: number }) {
  const size = props.size ?? 20;
  return (
    <svg
      className="icon"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICON_PATHS[props.name]} />
    </svg>
  );
}

/** Shelfie wordmark: a small shelf mark plus the name. Inline SVG and text, no external assets. */
export function Wordmark() {
  return (
    <span className="wordmark">
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" className="wordmark-mark">
        <rect width="28" height="28" rx="8" fill="var(--accent-fill)" />
        <path d="M7 9.5h14M7 14h14M7 18.5h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="19" cy="9.5" r="2.2" fill="#fff" />
      </svg>
      <span className="wordmark-text">Shelfie</span>
    </span>
  );
}

/** Live / reconnecting indicator. Word plus dot, never colour alone. */
export function ConnectionStatus(props: {
  status: "connecting" | "open" | "reconnecting" | "closed";
}) {
  const live = props.status === "open";
  const label = live ? "Live" : props.status === "connecting" ? "Connecting" : "Reconnecting";
  return (
    <span className={`conn ${live ? "conn-live" : "conn-wait"}`} role="status">
      <span className="conn-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Placeholder block for loading lists. Hidden from assistive tech; the region sets aria-busy. */
export function Skeleton(props: { lines?: number }) {
  const lines = props.lines ?? 3;
  return (
    <div className="skeleton-card" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={`skeleton-line ${i === 0 ? "skeleton-wide" : ""}`} />
      ))}
    </div>
  );
}

/** Approved Shelfie logo (public/shelfie-logo.png) on a cream tile, on the light page. */
export function Logo(props: { size?: "sm" | "md" }) {
  const size = props.size ?? "sm";
  return (
    <span className={`logo logo-${size}`}>
      <img src="/shelfie-logo.png" alt="Shelfie" width={256} height={288} decoding="async" />
    </span>
  );
}
