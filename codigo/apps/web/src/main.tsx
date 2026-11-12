import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { createBrowserDeps, DepsProvider } from "./deps.js";
import { readWebEnv } from "./lib/env.js";
import "./styles/tokens.css";
import "./styles/components.css";

// The app has one theme (light). Drop the preference an earlier build stored, so returning
// users are not left with a stale value. Blocked storage: nothing to clear.
try {
  window.localStorage.removeItem("shelfie.theme");
} catch {
  // storage unavailable
}

// Only VITE_ names that are public by design reach the bundle (contracts.md 5.5).
const env = readWebEnv({
  VITE_API_BASE: import.meta.env.VITE_API_BASE,
  VITE_DEMO_BADGES: import.meta.env.VITE_DEMO_BADGES,
});

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <DepsProvider value={createBrowserDeps(env)}>
      <App />
    </DepsProvider>
  </StrictMode>,
);
