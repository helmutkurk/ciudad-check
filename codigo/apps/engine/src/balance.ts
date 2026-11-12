import type { EngineEnv } from "@shelfie/core";

const BLOCKFROST_PREPROD = "https://cardano-preprod.blockfrost.io/api/v0";
const TIMEOUT_MS = 5_000;
const CACHE_MS = 60_000;

/**
 * Read-only lovelace balance of W-VBUY's public address (`WALLET_ADDRESS_VBUY`) through Blockfrost
 * preprod. Resolves null when unknown (no address or project id, failed lookup) so health never
 * reports a wallet as empty by guess. Cached for 60 s; the project id is only sent as a header
 * and never logged.
 */
export function createAddressBalanceProbe(
  env: Pick<EngineEnv, "WALLET_ADDRESS_VBUY" | "BLOCKFROST_PROJECT_ID">,
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
): () => Promise<string | null> {
  const address = env.WALLET_ADDRESS_VBUY;
  const projectId = env.BLOCKFROST_PROJECT_ID;
  let cached: { at: number; value: string | null } | undefined;
  return async () => {
    if (!address || !projectId || !/^addr_test1[a-z0-9]+$/.test(address)) return null;
    if (cached && now() - cached.at < CACHE_MS) return cached.value;
    let value: string | null = null;
    try {
      const res = await fetchFn(`${BLOCKFROST_PREPROD}/addresses/${address}`, {
        headers: { project_id: projectId },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) {
        value = "0"; // address never used
      } else if (res.ok) {
        const body = (await res.json()) as { amount?: { unit?: unknown; quantity?: unknown }[] };
        const total = (Array.isArray(body.amount) ? body.amount : [])
          .filter((a) => a.unit === "lovelace" && typeof a.quantity === "string")
          .filter((a) => /^\d{1,20}$/.test(a.quantity as string))
          .reduce((sum, a) => sum + BigInt(a.quantity as string), 0n);
        value = total.toString();
      }
    } catch {
      value = null;
    }
    cached = { at: now(), value };
    return value;
  };
}
