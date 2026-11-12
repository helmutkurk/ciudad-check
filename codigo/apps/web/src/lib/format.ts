import { txUrl } from "@shelfie/evidence/explorer";
export { shortAddress, DEFAULT_EXPLORER_TX_BASE } from "@shelfie/evidence/explorer";
import { lovelaceToAdaString } from "@shelfie/core/browser";

const NBSP = " ";

/** "3 tADA" with a non-breaking space. Never a EUR equivalent (ui-design.md section 5). */
export function formatAda(lovelace: string): string {
  return `${lovelaceToAdaString(lovelace)}${NBSP}tADA`;
}

/** A health wallet balance; "Unknown" when the engine could not read it (never shown as 0). */
export function formatWalletBalance(wallet: {
  balanceLovelace: string;
  unknown?: boolean | undefined;
}): string {
  return wallet.unknown === true ? "Unknown" : formatAda(wallet.balanceLovelace);
}

/** `1a2b...9f` style: first 6 and last 4 characters. */
export function shortHash(hash: string): string {
  return hash.length <= 14 ? hash : `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

/** mm:ss, never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

export function minutesLeft(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 60000));
}

/** Explorer link for a tx: prefer the engine's `explorerUrl`; else build from the config base. */
export function txLink(
  hash: string,
  explorerUrl: string | null | undefined,
  base: string,
): string | undefined {
  if (explorerUrl) return explorerUrl;
  return txUrl(hash, base);
}

/** Randomise ids in the browser; injectable through Deps for tests. */
export function randomHexId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
