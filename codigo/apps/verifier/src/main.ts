import { bootVerifier } from "./boot.js";

// Entry point: `npm run dev -w @shelfie/verifier`. Binds 127.0.0.1 only (the tunnel never
// forwards the verifier).
const { app, env, logger } = bootVerifier();
app.listen(env.VERIFIER_PORT, "127.0.0.1", () => {
  logger.info("verifier listening", { host: "127.0.0.1", port: env.VERIFIER_PORT });
});
