// Pure helpers used by the gates: EUR price parser, EAN checksums, token similarity, code
// normalisation. No I/O, no clock.

export interface ParsedPrice {
  ok: boolean;
  /** Euro amount with at most 2 decimals, or null. */
  value: number | null;
  /** "EUR" when a euro marker was seen, another ISO-like code when a foreign marker was seen. */
  currency: string | null;
  /** A per-unit line ("1 kg = 6,64 EUR") is recorded but never used as the shelf price. */
  unitPrice: { value: number; unit: string | null } | null;
  /** More than one distinct shelf-price candidate; the first one is used. */
  ambiguous: boolean;
  issue: "no_price" | "too_many_decimals" | "only_unit_price" | null;
}

const NUMBER_TOKEN = /\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?(?!\d)|\d[\d.,]*\d|\d/g;
const UNIT_WORDS = "kg|g|mg|l|ml|cl|dl|stk|st|stueck|stück|x|er|m|cm|mm|qm|piece|pcs";

/** Returns cents, or an issue when the token cannot be a shelf price. */
function tokenToCents(raw: string): { cents: number } | { issue: "too_many_decimals" } | null {
  const token = raw.replace(/\s+/g, ""); // "1 299,00" -> "1299,00"
  if (!/^\d[\d.,]*$/.test(token)) return null;
  const lastDot = token.lastIndexOf(".");
  const lastComma = token.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);
  if (lastSep < 0) return { cents: Number(token) * 100 };
  const intPart = token.slice(0, lastSep).replace(/[.,]/g, "");
  const frac = token.slice(lastSep + 1);
  const hasBoth = lastDot >= 0 && lastComma >= 0;
  const sepCount = (token.match(/[.,]/g) ?? []).length;
  if (frac.length > 2) {
    // "1.234" or "1,234": thousands separator when it is the only kind and groups of 3 follow
    if (!hasBoth && frac.length === 3 && sepCount >= 1 && /^\d{1,3}([.,]\d{3})+$/.test(token)) {
      return { issue: "too_many_decimals" }; // ambiguous for a shelf price: reject as format
    }
    return { issue: "too_many_decimals" };
  }
  if (frac.length === 0) return null;
  const cents = Number(intPart || "0") * 100 + Number(frac.padEnd(2, "0"));
  return { cents };
}

/** Parse the price text of a German shelf label ("1,99", "1.99 €", "€1,99", "2,49 EUR"). */
export function parsePriceEur(text: string | null | undefined): ParsedPrice {
  const empty: ParsedPrice = {
    ok: false,
    value: null,
    currency: null,
    unitPrice: null,
    ambiguous: false,
    issue: "no_price",
  };
  if (text === null || text === undefined) return empty;
  const src = text.replace(/ /g, " ").trim();
  if (src === "") return empty;

  let currency: string | null = null;
  if (/€|\beur(?:o|os)?\b/i.test(src)) currency = "EUR";
  else if (/\$|\busd\b/i.test(src)) currency = "USD";
  else if (/£|\bgbp\b/i.test(src)) currency = "GBP";
  else if (/\bchf\b/i.test(src)) currency = "CHF";

  const candidates: number[] = [];
  let unitPrice: ParsedPrice["unitPrice"] = null;
  let sawDecimalIssue = false;

  for (const m of src.matchAll(NUMBER_TOKEN)) {
    const raw = m[0].replace(/\s+$/, "");
    const start = m.index ?? 0;
    const end = start + raw.length;
    const before = src.slice(Math.max(0, start - 24), start);
    const after = src.slice(end, end + 24);

    const isQuantity = new RegExp(`^\\s*(?:${UNIT_WORDS})\\b`, "i").test(after);
    const unitAfter = new RegExp(
      `^\\s*(?:€|eur(?:o)?)?\\s*(?:\\/|je\\s|pro\\s|per\\s)\\s*(?:\\d+\\s*)?(?:${UNIT_WORDS})\\b`,
      "i",
    ).test(after);
    const unitBefore =
      /=\s*(?:€|eur(?:o)?)?\s*$/i.test(before) ||
      /(?:grundpreis|kg-preis|literpreis|unit price|einzelpreis)[^\d]{0,14}$/i.test(before);

    if (isQuantity && !/=\s*$/.test(before)) continue; // "0,33 l", "500 g", "1 kg ="
    const parsed = tokenToCents(raw);
    if (parsed === null) continue;
    if ("issue" in parsed) {
      if (unitAfter || unitBefore) continue; // a malformed unit price does not matter
      sawDecimalIssue = true;
      continue;
    }
    const value = parsed.cents / 100;
    if (unitAfter || unitBefore) {
      unitPrice ??= { value, unit: unitLabel(src, start, end) };
      continue;
    }
    candidates.push(value);
  }

  if (candidates.length === 0) {
    if (sawDecimalIssue) return { ...empty, currency, issue: "too_many_decimals" };
    if (unitPrice) return { ...empty, currency, unitPrice, issue: "only_unit_price" };
    return { ...empty, currency };
  }
  const first = candidates[0] as number;
  const distinct = new Set(candidates);
  return {
    ok: true,
    value: first,
    currency,
    unitPrice,
    ambiguous: distinct.size > 1,
    issue: null,
  };
}

function unitLabel(src: string, start: number, end: number): string | null {
  const around = `${src.slice(Math.max(0, start - 24), start)} ${src.slice(end, end + 24)}`;
  const m = new RegExp(`(\\d*\\s*(?:${UNIT_WORDS}))\\b`, "i").exec(around);
  return m ? m[1]!.replace(/\s+/g, "") : null;
}

// ---------------------------------------------------------------- EAN
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

function gtinChecksumOk(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;
  let sum = 0;
  const body = digits.slice(0, -1);
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** EAN-13: exactly 13 digits and a valid check digit. */
export function isValidEan13(digits: string | null | undefined): boolean {
  const d = digitsOnly(digits);
  return d.length === 13 && gtinChecksumOk(d);
}

/** Any GTIN length used on German shelves (8, 12, 13, 14) with a valid check digit. */
export function isValidGtin(digits: string | null | undefined): boolean {
  const d = digitsOnly(digits);
  return [8, 12, 13, 14].includes(d.length) && gtinChecksumOk(d);
}

/** Compare two GTINs ignoring leading zeros (EAN-13 vs GTIN-14 padding). */
export function sameGtin(a: string, b: string): boolean {
  return digitsOnly(a).replace(/^0+/, "") === digitsOnly(b).replace(/^0+/, "");
}

// ---------------------------------------------------------------- challenge code
export function normalizeCode(code: string | null | undefined): string {
  return (code ?? "").toUpperCase().replace(/[\s\-_]+/g, "");
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
    }
    prev = cur;
  }
  return prev[b.length] as number;
}

// ---------------------------------------------------------------- product names
const STOP_WORDS = new Set([
  "der", "die", "das", "den", "dem", "und", "mit", "von", "im", "in", "the", "and", "of", "with",
]);
const UNIT_TOKENS = new Set(UNIT_WORDS.split("|").concat(["liter", "litre", "gramm", "flasche", "dose", "packung", "pack"]));

export function foldText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Normalised tokens: lowercase, accents/umlauts folded, punctuation split, pack sizes dropped. */
export function productTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  let s = foldText(text);
  // drop pack sizes ("0,33 l", "500g", "6x0,33l", "10er") and bare decimals
  s = s.replace(/\b\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:ml|cl|l|g|kg)\b/g, " ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|liter|litre|g|kg|stk|er)\b/g, " ");
  s = s.replace(/\b\d+[.,]\d+\b/g, " ");
  const raw = s.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return raw.filter((t) => !STOP_WORDS.has(t) && !UNIT_TOKENS.has(t));
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5) return editDistance(a, b) <= 1;
  return false;
}

/**
 * Token-set similarity in [0, 1]: Dice coefficient over normalised tokens, where tokens of
 * length >= 5 also match at edit distance 1 (OCR slips). 1 = same token set.
 */
export function tokenSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = [...new Set(productTokens(a))];
  const tb = [...new Set(productTokens(b))];
  if (ta.length === 0 || tb.length === 0) return 0;
  const used = new Set<number>();
  let common = 0;
  for (const x of ta) {
    const idx = tb.findIndex((y, i) => !used.has(i) && tokensMatch(x, y));
    if (idx >= 0) {
      used.add(idx);
      common++;
    }
  }
  return (2 * common) / (ta.length + tb.length);
}

/** Best similarity of `text` against the product name and every alias. */
export function bestNameSimilarity(
  text: string | null | undefined,
  product: { name: string; aliases?: readonly string[] },
): number {
  return Math.max(
    tokenSimilarity(text, product.name),
    ...(product.aliases ?? []).map((a) => tokenSimilarity(text, a)),
  );
}
