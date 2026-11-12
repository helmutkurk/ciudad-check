# packages/evidence (@shelfie/evidence)

Status: implemented (depends only on `@shelfie/core`). Canonical design: `diseno/contracts.md` section 1.4 and `diseno/domain-model.md` (EvidenceEntry).

## Purpose
Hash-chained, append-only JSONL ledger (writer, reader, verifier) and preprod explorer URL helpers.

## API
- `new Ledger({ path, clock?, explorer? })`: loads and verifies an existing file (throws, leaving the file untouched, if it fails verification). `append({ kind, refs, txHash?, note?, flags?, payload? })` returns `{ entry, appended }`; the same `(kind, refs, txHash)` again is a **no-op** (`appended: false`, existing entry returned). `read(afterSeq, limit)`, `all()`, `size()`, `headHash()`, `subscribe(fn)` (for SSE).
- Entry: `LedgerEvent` from `@shelfie/core`. `seq` starts at 1; `prevHash` is the sha256 of the canonical JSON of the previous entry (genesis `0`x64); `payloadHash` is the sha256 of the canonical body (kind, refs, txHash, note, flags and the optional payload, which is hashed but not stored).
- `verifyLedger(path)` returns `{ ok, entries, headHash, failure? }` (`failure.reason`: `unparseable_line`, `schema_violation`, `seq_gap`, `prev_hash_mismatch`, `duplicate_natural_key`). A missing file is an empty valid ledger. `verifyLedgerText(text)` is the pure form.
- Browser entry point: `@shelfie/evidence/explorer` exposes only explorer helpers, without ledger/fs imports.
- Explorer: `txUrl(hash, base?)` and `addressUrl(addr, base?)` return `undefined` for anything that is not a 64-hex hash or an `addr_test1...` address (fake hashes get no link), `shortAddress()` (first 12, last 6), `DEFAULT_EXPLORER`.
- The file is only ever opened for append (`flag: "a"`, mode 600). Nothing truncates, rewrites or resets it. The last entry is covered only by the next one: publish `headHash` (for example in `docs/evidence/`) to anchor it.

## Run
```
cd codigo
npm run verify-ledger -w @shelfie/evidence -- path/to/ledger.jsonl    # exit 0 intact, 1 broken
```
Run it before submission and save a snapshot in `docs/evidence/`.

## Tests
`src/evidence.test.ts`: chain verification, tamper detection (modified entry, removed entry, garbage, schema), refusal to open a broken ledger, duplicate no-op (also after reload), reader paging and subscription, explorer helpers.

## Do not
- Never reset or rewrite the evidence ledger file.
- Do not store secrets, coordinates, display names or image bytes in entries.
