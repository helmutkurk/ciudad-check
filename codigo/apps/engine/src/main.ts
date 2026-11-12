import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectSecretValues,
  createLogger,
  EngineEnvSchema,
  loadEnv,
  randomIdGenerator,
  systemClock,
} from "@shelfie/core";
import { Ledger } from "@shelfie/evidence";
import { domainShelfCatalog, domainShelfPack } from "./domain-pack.js";
import { Engine } from "./engine.js";
import { createApp } from "./http/app.js";
import { MemoryStore } from "./store.js";
import { Orders } from "./orders.js";
import { wireAdapters, wireSokosumi } from "./wiring.js";

// Entry point: `npm run dev -w @shelfie/engine` (fakes by default) or `npm start -w @shelfie/engine`.
// Binds 127.0.0.1 only; the tunnel forwards this port, nothing else is public.

const HOST = "127.0.0.1";
const DEFAULT_WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

async function main(): Promise<void> {
  const env = loadEnv(EngineEnvSchema, process.env);
  const logger = createLogger({
    level: env.LOG_LEVEL,
    base: { component: "engine" },
    secretValues: collectSecretValues(process.env),
  });

  if (env.NODE_ENV === "production") {
    for (const [name, v] of [
      ["ADMIN_TOKEN", env.ADMIN_TOKEN],
      ["SHELL_TOKEN", env.SHELL_TOKEN],
    ] as const) {
      if (v.length < 32) throw new Error(`${name} must be at least 32 characters in production.`);
    }
    if (env.ALLOW_TEST_UPLOAD) throw new Error("ALLOW_TEST_UPLOAD must be false in production.");
  }

  const clock = systemClock;
  const ids = randomIdGenerator;
  const { catalog, issues: catalogIssues } = domainShelfCatalog(env.CATALOG_DIR);
  const store = new MemoryStore(env.STORE_PATH);
  const ledger = new Ledger({
    path: env.LEDGER_PATH,
    clock,
    explorer: { txBase: env.EXPLORER_TX_BASE, addressBase: env.EXPLORER_ADDRESS_BASE },
  });
  const adapters = await wireAdapters(env, env, {
    clock,
    ids,
    logger,
    ledger,
    jobIdForTask: (taskId) => store.tasks.all().find((t) => t.id === taskId)?.jobId,
  });
  const engine = new Engine({
    env,
    clock,
    ids,
    logger,
    store,
    ledger,
    catalog,
    pack: domainShelfPack(),
    verifyClient: adapters.verifyClient,
    payoutQueue: adapters.payoutQueue,
    probe: adapters.probe,
    imageDir: join(dirname(env.STORE_PATH), "images"),
    fakes: adapters.fakes,
    evidenceRunLocked: env.EVIDENCE_RUN_LOCKED,
  });
  await adapters.payoutQueue.recover?.();
  engine.resume();

  const webDist = env.WEB_DIST ?? (existsSync(DEFAULT_WEB_DIST) ? DEFAULT_WEB_DIST : undefined);
  const app = createApp({
    engine,
    orders: new Orders({ engine, env, store, clock, ids, client: wireSokosumi(env, engine, ids) }),
    env,
    logger,
    clock,
    extraHosts: (env.ALLOWED_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    webDist,
  });

  const server = app.listen(env.ENGINE_PORT, HOST, () => {
    logger.info("engine_listening", {
      url: `http://${HOST}:${env.ENGINE_PORT}`,
      fakePayments: adapters.fakes.payments,
      fakeVerifier: adapters.fakes.verifier,
      locationCheck: env.LOCATION_CHECK,
      stores: catalog.stores.length,
      products: catalog.products.length,
      catalogIssues,
    });
    if (adapters.fakes.payments || adapters.fakes.verifier) {
      logger.warn(
        "FAKE MODE: nothing here is a real payment or verification. Not for evidence runs.",
      );
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 50;

  const timer = setInterval(() => {
    engine.tick();
  }, 1000);
  timer.unref();
  // The real payout queue confirms SUBMITTED payouts only when polled.
  const confirmTimer = setInterval(() => {
    void adapters.payoutQueue.pollConfirmations?.().catch(() => undefined);
  }, 3000);
  confirmTimer.unref();
  const stop = (): void => {
    clearInterval(timer);
    clearInterval(confirmTimer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err: unknown) => {
  // AppError from loadEnv lists variable NAMES only, never values.
  process.stderr.write(
    `engine failed to start: ${err instanceof Error ? err.message : "unknown error"}\n`,
  );
  process.exit(1);
});
