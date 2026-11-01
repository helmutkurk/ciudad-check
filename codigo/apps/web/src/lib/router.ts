import { useSyncExternalStore } from "react";

// A tiny router: three apps, no nested routes. Customer routes beyond /b are not in
// contracts.md, so the brand and operator apps keep their views in component state.

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener("shelfie:navigate", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("shelfie:navigate", listener);
  };
}
const getPath = () => window.location.pathname;

export function usePath(): string {
  return useSyncExternalStore(subscribe, getPath, () => "/");
}

export function navigate(to: string): void {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new Event("shelfie:navigate"));
}

export type AppName = "worker" | "dashboard" | "brand";

/** `/dashboard` is the operator app, `/b` the brand app (ADR-21), everything else the worker app. */
export function appForPath(path: string): AppName {
  if (path === "/dashboard" || path.startsWith("/dashboard/")) return "dashboard";
  if (path === "/b" || path.startsWith("/b/")) return "brand";
  return "worker";
}
