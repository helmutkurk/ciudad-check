// Field test jobs: creates demo jobs (one store, one product each) with a long window, so a team
// can claim and shoot them on site and also take eval photos (C-03) before they expire.
//   read -rs ADMIN_TOKEN && export ADMIN_TOKEN       (operator token of the target engine, hidden)
//   ENGINE_URL=https://api-dev.shelfieapp.fyi npx tsx scripts/field-jobs.ts [--send]
// Flags: --store <catalog id> (default REWE Hanne-Hiob-Strasse), --ean <ean,...> (default
// Coca-Cola, Nutella, Red Bull, Barilla), --per <n> jobs per product (default 2), --window <sec>
// (default 3600). Without --send it only prints the plan. The token is never printed.
import { loadEnv, SmokeEnvSchema } from "@shelfie/core";

const env = loadEnv(SmokeEnvSchema);
const BASE = env.ENGINE_URL.replace(/\/$/, "");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const STORE = arg("store") ?? "rewe-81671-august-everding-strasse-20";
const EANS = (arg("ean") ?? "5449000000439,4008400402222,9002490100070,8076800195057").split(",");
const PER = Number(arg("per") ?? "2");
const WINDOW_SEC = Number(arg("window") ?? "3600");
const SEND = process.argv.includes("--send");

if (!Number.isInteger(PER) || PER < 1 || PER > 10) throw new Error("--per must be 1-10");
if (!Number.isInteger(WINDOW_SEC) || WINDOW_SEC < 600 || WINDOW_SEC > 4 * 3600) {
  throw new Error("--window must be 600-14400 seconds");
}
if (!/^[a-z0-9-]{1,80}$/.test(STORE)) throw new Error("--store is not a catalog id");
for (const ean of EANS) if (!/^\d{8,14}$/.test(ean)) throw new Error(`bad EAN ${ean}`);

const RUN = Date.now().toString(36);
const plan = EANS.flatMap((ean) =>
  Array.from({ length: PER }, (_, i) => ({ ean, ref: `field-${RUN}-${ean}-${i + 1}` })),
);

process.stdout.write(
  `${SEND ? "Creating" : "Plan (dry, add --send)"}: ${plan.length} jobs at ${STORE}, ` +
    `window ${WINDOW_SEC}s, engine ${BASE}\n`,
);
if (!SEND) {
  for (const p of plan) process.stdout.write(`  ${p.ref}\n`);
  process.exit(0);
}

let failed = 0;
for (const p of plan) {
  const res = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": env.ADMIN_TOKEN },
    body: JSON.stringify({
      packId: "shelf-check",
      source: "demo",
      externalRef: p.ref,
      input: { productEan: p.ean, stores: [{ id: STORE }] },
      windowSec: WINDOW_SEC,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as {
    job?: { id: string; windowEndsAt: string };
    error?: { code?: string };
  } | null;
  if (res.ok && body?.job) {
    process.stdout.write(`OK   ${p.ean} job ${body.job.id} ends ${body.job.windowEndsAt}\n`);
  } else {
    failed++;
    process.stdout.write(`FAIL ${p.ean} HTTP ${res.status} ${body?.error?.code ?? ""}\n`);
    if (res.status === 401 || res.status === 403) {
      process.stdout.write("     token rejected: export the operator token of this engine\n");
      break;
    }
  }
}
process.exit(failed > 0 ? 1 : 0);
