// Explorer URL helpers (preprod only). Bases come from EXPLORER_TX_BASE / EXPLORER_ADDRESS_BASE.

export const DEFAULT_EXPLORER_TX_BASE = "https://preprod.cardanoscan.io/transaction/";
export const DEFAULT_EXPLORER_ADDRESS_BASE = "https://preprod.cardanoscan.io/address/";

export interface ExplorerBases {
  txBase: string;
  addressBase: string;
}

export const DEFAULT_EXPLORER: ExplorerBases = {
  txBase: DEFAULT_EXPLORER_TX_BASE,
  addressBase: DEFAULT_EXPLORER_ADDRESS_BASE,
};

const TX_HASH = /^[0-9a-fA-F]{64}$/;
const ADDRESS = /^addr_test1[0-9a-z]+$/;

function join(base: string, id: string): string {
  return base.endsWith("/") ? `${base}${id}` : `${base}/${id}`;
}

/** True for a 64-hex transaction hash. Fake hashes from tests/fakes may not match; see txUrl. */
export function isTxHash(value: string): boolean {
  return TX_HASH.test(value);
}

/** Explorer URL for a transaction, or undefined when `hash` is not a 64-hex hash. */
export function txUrl(hash: string, base: string = DEFAULT_EXPLORER_TX_BASE): string | undefined {
  return TX_HASH.test(hash) ? join(base, hash.toLowerCase()) : undefined;
}

/** Explorer URL for a preprod address, or undefined when it is not an `addr_test1...` address. */
export function addressUrl(
  address: string,
  base: string = DEFAULT_EXPLORER_ADDRESS_BASE,
): string | undefined {
  return ADDRESS.test(address) ? join(base, address) : undefined;
}

/** First 12 and last 6 characters (security.md 4.7: addresses appear shortened in the ledger). */
export function shortAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 12)}...${address.slice(-6)}`;
}
