import { appForPath, usePath } from "./lib/router.js";
import { useEffect } from "react";
import { BrandApp } from "./brand/BrandApp.js";
import { DashboardApp } from "./dashboard/DashboardApp.js";
import { WorkerApp } from "./worker/WorkerApp.js";

/**
 * `/b` is the brand app (sign in with a brand access code); `/dashboard` is the operator app
 * (operator token gate); everything else is the worker app (`/w`). The site root opens the
 * static story page (`public/story/`), which links back to the apps.
 */
export function App() {
  const path = usePath();
  useEffect(() => {
    if (path === "/") window.location.replace("/story/index.html");
  }, [path]);
  switch (appForPath(path)) {
    case "dashboard":
      return <DashboardApp />;
    case "brand":
      return <BrandApp />;
    default:
      return <WorkerApp />;
  }
}
