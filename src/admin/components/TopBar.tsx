import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bell, LogOut, Menu, Search, Settings, ShoppingBag, Store, UserCircle2, Users } from "lucide-react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../../lib/firebase";
import { toDate } from "../../lib/storefront";
import { useAuth } from "../../contexts/AuthContext";

interface TopBarProps {
  onToggleSidebar: () => void;
  storeName: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
}

interface AdminNotification {
  id: string;
  title: string;
  message: string;
  createdAt: unknown;
}

export function TopBar({
  onToggleSidebar,
  storeName,
  searchValue,
  onSearchChange,
  onSearchSubmit,
}: TopBarProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const operationsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "web_notifications"), orderBy("created_at", "desc"), limit(8)),
      (snapshot) => {
        const rows = snapshot.docs.map((entry) => {
          const data = entry.data() as {
            title?: string;
            message?: string;
            body?: string;
            created_at?: unknown;
          };
          return {
            id: entry.id,
            title: String(data.title || "Notification"),
            message: String(data.message || data.body || ""),
            createdAt: data.created_at,
          };
        });
        setNotifications(rows);
      },
      () => setNotifications([])
    );
  }, []);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!notificationsRef.current?.contains(target)) setNotificationsOpen(false);
      if (!operationsRef.current?.contains(target)) setOperationsOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const unreadCount = useMemo(() => notifications.length, [notifications.length]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearchSubmit(searchValue);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login");
    } catch {
      alert("Failed to sign out. Please try again.");
    }
  };

  return (
    <header className="adm-topbar">
      <button type="button" className="adm-icon-button" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <Menu size={18} />
      </button>
      <form className="adm-search" aria-label="Search" onSubmit={handleSearchSubmit}>
        <Search size={16} />
        <input
          type="search"
          placeholder="Search products, orders, customers"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </form>
      <button
        type="button"
        className="adm-top-pill"
        aria-label="Store settings"
        onClick={() => navigate("/admin/settings")}
      >
        <Store size={16} />
        {storeName}
      </button>
      <div className="adm-topbar-popover" ref={notificationsRef}>
        <button
          type="button"
          className="adm-icon-button"
          aria-label="Notifications"
          onClick={() => {
            setNotificationsOpen((prev) => !prev);
            setOperationsOpen(false);
          }}
        >
          <Bell size={16} />
          {unreadCount > 0 ? (
            <span className="adm-notification-dot" aria-hidden="true">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
        {notificationsOpen ? (
          <div className="adm-popover-menu">
            <p className="adm-popover-title">Recent notifications</p>
            {notifications.length === 0 ? (
              <p className="adm-muted">No notifications yet.</p>
            ) : (
              notifications.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className="adm-popover-item"
                  onClick={() => {
                    setNotificationsOpen(false);
                    navigate("/admin/orders");
                  }}
                >
                  <strong>{entry.title}</strong>
                  <span>{entry.message || "Open details"}</span>
                  <small>{toDate(entry.createdAt).toLocaleString()}</small>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="adm-topbar-popover" ref={operationsRef}>
        <button
          type="button"
          className="adm-top-pill"
          aria-label="User menu"
          onClick={() => {
            setOperationsOpen((prev) => !prev);
            setNotificationsOpen(false);
          }}
        >
          <UserCircle2 size={16} />
          Operations
        </button>
        {operationsOpen ? (
          <div className="adm-popover-menu">
            <p className="adm-popover-title">Quick actions</p>
            <button
              type="button"
              className="adm-popover-item adm-popover-item--row"
              onClick={() => navigate("/admin/orders")}
            >
              <ShoppingBag size={15} />
              Orders
            </button>
            <button
              type="button"
              className="adm-popover-item adm-popover-item--row"
              onClick={() => navigate("/admin/customers")}
            >
              <Users size={15} />
              Customers
            </button>
            <button
              type="button"
              className="adm-popover-item adm-popover-item--row"
              onClick={() => navigate("/admin/settings")}
            >
              <Settings size={15} />
              Settings
            </button>
            <button
              type="button"
              className="adm-popover-item adm-popover-item--row adm-popover-item--danger"
              onClick={handleSignOut}
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
