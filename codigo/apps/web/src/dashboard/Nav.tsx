export type NavSection = "overview" | "orders" | "locations" | "ledger" | "operator";

export interface NavItem<T extends string> {
  value: T;
  label: string;
}

/** Operator dashboard sections (`/dashboard`, after the operator token gate). */
export const DASHBOARD_ITEMS: readonly NavItem<NavSection>[] = [
  { value: "overview", label: "Overview" },
  { value: "orders", label: "Orders" },
  { value: "locations", label: "Locations" },
  { value: "ledger", label: "Ledger" },
  { value: "operator", label: "Operator" },
];

/**
 * Section navigation: a sidebar on wide screens, a top bar on narrow screens. The caller passes
 * its own items (the operator dashboard and the brand app use different sections).
 */
export function DashboardNav<T extends string>(props: {
  items: readonly NavItem<T>[];
  current: T;
  label?: string;
  onSelect: (section: T) => void;
}) {
  return (
    <nav className="dnav" aria-label={props.label ?? "Dashboard sections"}>
      <ul className="dnav-list">
        {props.items.map((item) => {
          const current = props.current === item.value;
          return (
            <li key={item.value}>
              <button
                type="button"
                className={`dnav-item${current ? " selected" : ""}`}
                aria-current={current ? "page" : undefined}
                onClick={() => props.onSelect(item.value)}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
