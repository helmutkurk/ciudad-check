/** The five worker tabs. View state only: no URL changes (the app has no routes for them). */
export type Tab = "home" | "tasks" | "map" | "wallet" | "profile";

const TABS: readonly { id: Tab; label: string; path: string }[] = [
  {
    id: "home",
    label: "Home",
    path: "M3 9.5 10 3.5l7 6V16a1 1 0 0 1-1 1h-3.5v-4h-5v4H4a1 1 0 0 1-1-1V9.5Z",
  },
  {
    id: "tasks",
    label: "Tasks",
    path: "M7 4.5H5.5A1.5 1.5 0 0 0 4 6v10.5A1.5 1.5 0 0 0 5.5 18h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H13M7 3.5h6v2H7Z",
  },
  {
    id: "map",
    label: "Map",
    path: "M7 4 3.5 5.5v10.5L7 14.5l6 2 3.5-1.5V4.5L13 6 7 4Zm0 0v10.5m6-8v10.5",
  },
  {
    id: "wallet",
    label: "Wallet",
    path: "M3.5 6.5A1.5 1.5 0 0 1 5 5h10.5v3M3.5 6.5V15A1.5 1.5 0 0 0 5 16.5h11.5V13M3.5 6.5h12.5M14 10.5h3v3h-3a1.5 1.5 0 0 1 0-3Z",
  },
  {
    id: "profile",
    label: "Profile",
    path: "M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.5 7.5c.6-3 3.2-4.5 6.5-4.5s5.9 1.5 6.5 4.5",
  },
];

/** Bottom navigation for the tab screens. Hidden while a claim, the camera or a result is open. */
export function TabBar(props: { current: Tab; onSelect: (tab: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="tab-button"
          aria-current={props.current === t.id ? "page" : undefined}
          onClick={() => props.onSelect(t.id)}
        >
          <span className="tab-icon">
            <svg
              viewBox="0 0 20 20"
              width={22}
              height={22}
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={t.path} />
            </svg>
          </span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
