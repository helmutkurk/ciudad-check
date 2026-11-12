import { WebDevEnvSchema, loadEnv } from "../../packages/core/src/env.js";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev server: 127.0.0.1 by default. For a phone on the same network run
// `npm run dev -w @shelfie/web -- --host` (LAN HTTP is read-only: no camera without a secure
// context; use the HTTPS tunnel for the camera). /api is proxied to the engine so the browser
// stays same-origin and the engine needs no CORS.
const webEnv = loadEnv(WebDevEnvSchema);
const engineUrl = webEnv.VITE_ENGINE_URL ?? `http://127.0.0.1:${webEnv.ENGINE_PORT}`;

const proxy = {
  "/api": {
    target: engineUrl,
    changeOrigin: true,
    // The engine checks Origin on POST against PUBLIC_BASE_URL (security.md E9). // verify Friday
    headers: { Origin: engineUrl },
  },
};

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, proxy },
  preview: { host: "127.0.0.1", port: 4173, proxy },
  build: { sourcemap: false },
});
