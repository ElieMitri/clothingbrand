import {
  BarChart3,
  Layers3,
  LayoutDashboard,
  Megaphone,
  Percent,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAdminLiveData } from "../hooks/useAdminLiveData";
import { SidebarNav } from "./SidebarNav";
import { TopBar } from "./TopBar";
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { storeSettings } = useAdminLiveData();
  const storeName = storeSettings?.store_name || "LB Athletes";
  const searchValue = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("q") || "";
  }, [location.search]);

  const shellClassName = useMemo(
    () => `adm-shell ${sidebarOpen ? "" : "adm-shell--collapsed"}`.trim(),
    [sidebarOpen]
  );

  const handleSearchChange = (value: string) => {
    const params = new URLSearchParams(location.search);
    const next = String(value || "");
    if (next.trim()) params.set("q", next);
    else params.delete("q");

    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
      },
      { replace: true }
    );
  };

  const handleSearchSubmit = () => {
    const params = new URLSearchParams(location.search);
    const query = String(params.get("q") || "").trim();
    if (!query) return;

    const path = location.pathname;
    const searchableSections = ["/admin/products", "/admin/orders", "/admin/customers", "/admin/collections"];
    const isSearchableSection = searchableSections.some((prefix) => path.startsWith(prefix));
    if (!isSearchableSection) {
      navigate(`/admin/products?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div className={shellClassName}>
      <SidebarNav items={navItems} collapsed={!sidebarOpen} storeName={storeName} />
      <div className="adm-main">
        <TopBar
          onToggleSidebar={() => setSidebarOpen((value) => !value)}
          storeName={storeName}
          searchValue={searchValue}
          onSearchChange={handleSearchChange}
          onSearchSubmit={handleSearchSubmit}
        />
        <main className="adm-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
