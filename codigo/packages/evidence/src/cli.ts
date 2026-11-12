// Usage: npm run verify-ledger -w @shelfie/evidence -- <path-to-ledger.jsonl>
// Read-only. Exit code 0 = chain intact, 1 = broken, 2 = usage.
import { verifyLedger } from "./ledger.js";

const path = process.argv[2];
if (path === undefined) {
  process.stderr.write("usage: verify-ledger <ledger.jsonl>\n");
  process.exit(2);
}
const res = verifyLedger(path);
if (res.ok) {
  process.stdout.write(`ledger OK: ${res.entries} entries, head ${res.headHash}\n`);
} else {
  process.stdout.write(
    `ledger BROKEN: ${res.failure?.reason ?? "unknown"} at line ${res.failure?.line ?? 0} (entries before: ${res.entries})\n`,
  );
  process.exit(1);
}
