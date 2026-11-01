import { Logo } from "../ui/index.js";
import { S } from "../lib/messages.js";

/** Shell header on the tab screens: approved logo (small) and the app name. */
export function AppHeader() {
  return (
    <header className="shell-header">
      <Logo size="sm" />
      <span className="shell-name">{S.appName}</span>
    </header>
  );
}
