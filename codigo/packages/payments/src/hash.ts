/** A real Cardano tx hash is 64 hex characters. Fakes and dry runs never look like one. */
export function isRealTxHash(value: string | null | undefined): boolean {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
