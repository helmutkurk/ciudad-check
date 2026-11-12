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
import type { EngineEnv, Logger } from "@shelfie/core";
import { streetPack } from "@shelfie/domain-street";
import type express from "express";
import { createApp } from "./http/app.js";
import { StreetService } from "./street/service.js";
import { StreetStore } from "./street/store.js";
import { FakeStreetVerifier, HttpStreetVerifier } from "./street/verifier.js";

// Entry point: `npm run dev -w @shelfie/engine` (fakes by default) or `npm start -w @shelfie/engine`.
// Binds 127.0.0.1 only; the tunnel forwards this port, nothing else is public.
//
// CiudadCheck street mode is the default. It is selected BEFORE any legacy machinery (catalog,
// journal, evidence ledger, payment adapters, payout recovery, job resume, timers) is constructed
// or even imported. The legacy Shelfie engine starts only with STREET_MODE=0.

const HOST = "127.0.0.1";
const DEFAULT_WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

/** STREET_MODE is read here because the shared env schema (packages/core) is frozen. Default on. */
function streetMode(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "" || v === "1" || v === "true" || v === "on") return true;
  if (v === "0" || v === "false" || v === "off") return false;
  throw new Error("STREET_MODE must be 1 or 0.");
}

function extraHosts(env: EngineEnv): string[] {
  return (env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function listen(
  app: express.Express,
  env: EngineEnv,
  onListening: () => void,
  onStop: () => void = () => undefined,
): void {
  const server = app.listen(env.ENGINE_PORT, HOST, onListening);
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 50;
  const stop = (): void => {
    onStop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

function startStreet(env: EngineEnv, logger: Logger): void {
  // Fake-payment guard: the street flow has no real payout path at all.
  if (!env.FAKE_PAYMENTS) {
    throw new Error("Street mode needs FAKE_PAYMENTS=1: payouts are simulated, no real money.");
  }
  const clock = systemClock;
  const fakeVerifier = (env.VERIFY_CLIENT ?? "fake") === "fake";
  const dataDir = dirname(env.STORE_PATH);
  const service = new StreetService({
    store: new StreetStore(join(dataDir, "street-events.jsonl")),
    verifier: fakeVerifier
      ? new FakeStreetVerifier(streetPack, clock)
      : new HttpStreetVerifier({ baseUrl: env.VERIFIER_URL, engineToken: env.ENGINE_TOKEN }),
    pack: streetPack,
    clock,
    ids: randomIdGenerator,
    logger,
    imageDir: join(dataDir, "images", "street"),
    fakePayments: env.FAKE_PAYMENTS,
  });
  const webDist = env.WEB_DIST ?? (existsSync(DEFAULT_WEB_DIST) ? DEFAULT_WEB_DIST : undefined);
  const app = createApp({
    street: service,
    env,
    logger,
    clock,
    extraHosts: extraHosts(env),
    webDist,
  });
  listen(app, env, () => {
    logger.info("engine_listening", {
      url: `http://${HOST}:${env.ENGINE_PORT}`,
      mode: "street",
      fakePayments: true,
      fakeVerifier,
    });
    logger.warn(
      "SIMULATED MODE: street payouts are ledger records only, no real money." +
        (fakeVerifier ? " The verifier is a fake: not a real verification." : ""),
    );
  });
}

async function startLegacy(env: EngineEnv, logger: Logger): Promise<void> {
  // Dynamic imports: street mode never loads the Shelfie engine, ledger or payment adapters.
  const [{ Ledger }, { domainShelfCatalog, domainShelfPack }, { Engine }, { MemoryStore }] =
    await Promise.all([
      import("@shelfie/evidence"),
      import("./domain-pack.js"),
      import("./engine.js"),
      import("./store.js"),
    ]);
  const [{ Orders }, { wireAdapters, wireSokosumi }] = await Promise.all([
    import("./orders.js"),
    import("./wiring.js"),
  ]);

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
    extraHosts: extraHosts(env),
    webDist,
  });

  const timer = setInterval(() => {
    engine.tick();
  }, 1000);
  timer.unref();
  // The real payout queue confirms SUBMITTED payouts only when polled.
  const confirmTimer = setInterval(() => {
    void adapters.payoutQueue.pollConfirmations?.().catch(() => undefined);
  }, 3000);
  confirmTimer.unref();

  listen(
    app,
    env,
    () => {
      logger.info("engine_listening", {
        url: `http://${HOST}:${env.ENGINE_PORT}`,
        mode: "legacy",
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
    },
    () => {
      clearInterval(timer);
      clearInterval(confirmTimer);
    },
  );
}

async function main(): Promise<void> {
  const street = streetMode(process.env["STREET_MODE"]);
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

  if (street) startStreet(env, logger);
  else await startLegacy(env, logger);
}

main().catch((err: unknown) => {
  // AppError from loadEnv lists variable NAMES only, never values.
  process.stderr.write(
    `engine failed to start: ${err instanceof Error ? err.message : "unknown error"}\n`,
  );
  process.exit(1);
});
