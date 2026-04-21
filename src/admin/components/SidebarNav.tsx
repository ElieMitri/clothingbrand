import { Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { NavItem } from "../types";

interface SidebarNavProps {
  items: NavItem[];
  collapsed: boolean;
  storeName: string;
  onToggleSidebar: () => void;
  onNavigateItem: () => void;
}

export function SidebarNav({
  items,
  collapsed,
  storeName,
  onToggleSidebar,
  onNavigateItem,
}: SidebarNavProps) {
  const location = useLocation();
  const initials = storeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "LB";

  return (
    <nav className="adm-sidebar" aria-label="Admin navigation">
      <div className="adm-sidebar__header">
        <button
          type="button"
          className="adm-icon-button adm-sidebar__toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu size={18} />
        </button>
      </div>
      <div className="adm-sidebar__brand">
        <span className="adm-brand-mark" aria-hidden="true">
          {initials}
        </span>
        {!collapsed ? <span className="adm-brand-text">{storeName}</span> : null}
      </div>
      <ul>
        {items.map((item) => {
          const isActive = location.pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                className={`adm-nav-link ${isActive ? "is-active" : ""}`}
                to={item.href}
                onClick={onNavigateItem}
              >
                <Icon size={18} aria-hidden="true" />
                {!collapsed ? <span>{item.label}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
