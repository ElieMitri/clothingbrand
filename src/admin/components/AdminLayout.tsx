import {
  BarChart3,
  Layers3,
  LayoutDashboard,
  Menu,
  Megaphone,
  Percent,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAdminLiveData } from "../hooks/useAdminLiveData";
import { SidebarNav } from "./SidebarNav";
import type { NavItem } from "../types";

const navItems: NavItem[] = [
  { key: "dashboard", label: "Overview", icon: LayoutDashboard, href: "/admin/overview" },
  { key: "orders", label: "Orders", icon: ShoppingCart, href: "/admin/orders" },
  { key: "products", label: "Products", icon: ShoppingBag, href: "/admin/products" },
  { key: "customers", label: "Customers", icon: Users, href: "/admin/customers" },
  { key: "collections", label: "Collections", icon: Layers3, href: "/admin/collections" },
  { key: "analytics", label: "Analytics", icon: BarChart3, href: "/admin/analytics" },
  { key: "sales", label: "Sales", icon: Percent, href: "/admin/sales" },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, href: "/admin/campaigns" },
  { key: "settings", label: "Settings", icon: Settings, href: "/admin/settings" },
];

export function AdminLayout() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false
  );
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 900 : true
  );
  const location = useLocation();
  const { storeSettings } = useAdminLiveData();
  const storeName = storeSettings?.store_name || "LB Athletes";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 900px)");
    const syncViewport = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      setSidebarOpen((previous) => (mobile ? false : previous));
    };

    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    setSidebarOpen(false);
  }, [isMobile, location.pathname]);

  const shellClassName = useMemo(
    () =>
      `adm-shell ${sidebarOpen ? "adm-shell--sidebar-open" : ""} ${
        sidebarOpen || isMobile ? "" : "adm-shell--collapsed"
      }`.trim(),
    [isMobile, sidebarOpen]
  );

  return (
    <div className={shellClassName}>
      <SidebarNav
        items={navItems}
        collapsed={!sidebarOpen && !isMobile}
        storeName={storeName}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
        onNavigateItem={() => {
          if (isMobile) setSidebarOpen(false);
        }}
      />
      <button
        type="button"
        className="adm-sidebar-backdrop"
        onClick={() => setSidebarOpen(false)}
        aria-label="Close sidebar"
      />
      <div className="adm-main">
        {isMobile && !sidebarOpen ? (
          <button
            type="button"
            className="adm-mobile-launcher"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>
        ) : null}
        <main className="adm-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
