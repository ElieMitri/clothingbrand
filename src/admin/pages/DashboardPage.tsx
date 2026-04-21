import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { TrendChart } from "../components/TrendChart";
import { setupChecklist } from "../data/adminConstants";
import { useAdminLiveData } from "../hooks/useAdminLiveData";
import { useToast } from "../hooks/useToast";
import { db } from "../../lib/firebase";
import { toDate } from "../../lib/storefront";
import type { ChecklistItem } from "../types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

export function DashboardPage() {
  const { showToast } = useToast();
  const { loading, dashboardKpis, orders, products, ordersRaw } = useAdminLiveData();
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(setupChecklist);
  const [isChecklistLoading, setIsChecklistLoading] = useState(true);
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newChecklistDescription, setNewChecklistDescription] = useState("");

  const checklistRef = useMemo(
    () => doc(db, "site_settings", "admin_setup_checklist"),
    []
  );

  useEffect(() => {
    const unsub = onSnapshot(
      checklistRef,
      (snap) => {
        if (!snap.exists()) {
          setChecklistItems(setupChecklist);
          setIsChecklistLoading(false);
          return;
        }

        const data = snap.data() as { items?: unknown[] };
        const normalized = Array.isArray(data.items)
          ? data.items
              .map((entry, index) => {
                if (!entry || typeof entry !== "object") return null;
                const candidate = entry as Partial<ChecklistItem>;
                const id = String(candidate.id || `task-${index + 1}`).trim();
                const title = String(candidate.title || "").trim();
                const description = String(candidate.description || "").trim();
                if (!id || !title) return null;
                return {
                  id,
                  title,
                  description,
                  done: Boolean(candidate.done),
                } as ChecklistItem;
              })
              .filter((item: ChecklistItem | null): item is ChecklistItem => item !== null)
          : [];

        setChecklistItems(normalized);
        setIsChecklistLoading(false);
      },
      () => {
        setChecklistItems(setupChecklist);
        setIsChecklistLoading(false);
      }
    );

    return () => unsub();
  }, [checklistRef]);

  const persistChecklist = async (nextItems: ChecklistItem[]) => {
    setChecklistItems(nextItems);
    await setDoc(
      checklistRef,
      {
        items: nextItems.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          done: item.done,
        })),
        updated_at: Timestamp.now(),
      },
      { merge: true }
    );
  };

  const addChecklistItem = async () => {
    const title = newChecklistTitle.trim();
    const description = newChecklistDescription.trim();
    if (!title) {
      showToast({ title: "Checklist title is required" });
      return;
    }

    const nextItem: ChecklistItem = {
      id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
      done: false,
    };

    try {
      await persistChecklist([nextItem, ...checklistItems]);
      setNewChecklistTitle("");
      setNewChecklistDescription("");
      showToast({ title: "Checklist item added" });
    } catch (error) {
      console.error("Failed to add checklist item", error);
      showToast({ title: "Failed to add checklist item" });
    }
  };

  const toggleChecklistItem = async (id: string) => {
    const nextItems = checklistItems.map((item) =>
      item.id === id ? { ...item, done: !item.done } : item
    );
    try {
      await persistChecklist(nextItems);
    } catch (error) {
      console.error("Failed to update checklist item", error);
      showToast({ title: "Failed to update checklist item" });
    }
  };

  const deleteChecklistItem = async (id: string) => {
    const nextItems = checklistItems.filter((item) => item.id !== id);
    try {
      await persistChecklist(nextItems);
      showToast({ title: "Checklist item deleted" });
    } catch (error) {
      console.error("Failed to delete checklist item", error);
      showToast({ title: "Failed to delete checklist item" });
    }
  };

  const topProducts = [...products]
    .sort((a, b) => b.inventory - a.inventory)
    .slice(0, 4);
  const trendPoints = (() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 13);

    const byDay = new Map<string, number>();
    ordersRaw
      .filter((order) => order.status !== "cancelled")
      .forEach((order) => {
        const date = toDate(order.created_at);
        if (date < start) return;
        const key = dayKey(date);
        byDay.set(key, Number(byDay.get(key) || 0) + Number(order.total || 0));
      });

    return Array.from({ length: 14 }).map((_, offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      return {
        label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: Number(byDay.get(dayKey(date)) || 0),
      };
    });
  })();

  return (
    <div className="adm-page">
      <PageHeader
        title="Business overview"
        breadcrumbs={[{ label: "Admin", href: "/admin/overview" }, { label: "Overview" }]}
        description="Monitor performance, operations, and growth signals in one place."
        primaryAction={
          <Link to="/admin/campaigns" className="adm-button adm-button--primary">
            <Plus size={16} />
            Create campaign
          </Link>
        }
      />

      <section className="adm-grid adm-grid--kpi">
        {dashboardKpis.map((kpi) => (
          <StatCard key={kpi.label} {...kpi} />
        ))}
      </section>

      <section className="adm-grid adm-grid--two">
        <article className="adm-card adm-panel">
          <header className="adm-panel__header">
            <h3>Sales and traffic</h3>
            <button type="button" className="adm-button adm-button--ghost">
              View report
            </button>
          </header>
          <TrendChart points={trendPoints} ariaLabel="14-day sales trend graph" />
          <div className="adm-breakdown-grid">
            <div>
              <p className="adm-muted">Orders in feed</p>
              <strong>{orders.length}</strong>
            </div>
            <div>
              <p className="adm-muted">Products in catalog</p>
              <strong>{products.length}</strong>
            </div>
            <div>
              <p className="adm-muted">Data source</p>
              <strong>Firestore live</strong>
            </div>
          </div>
        </article>

        <article className="adm-card adm-panel">
          <header className="adm-panel__header">
            <h3>Setup checklist</h3>
            <span className="adm-muted">
              {checklistItems.filter((item) => item.done).length}/{checklistItems.length} complete
            </span>
          </header>
          <div className="adm-checklist-form">
            <input
              className="adm-input"
              placeholder="Checklist title"
              value={newChecklistTitle}
              onChange={(event) => setNewChecklistTitle(event.target.value)}
            />
            <input
              className="adm-input"
              placeholder="Checklist description (optional)"
              value={newChecklistDescription}
              onChange={(event) => setNewChecklistDescription(event.target.value)}
            />
            <button type="button" className="adm-button adm-button--primary" onClick={addChecklistItem}>
              Add item
            </button>
          </div>
          {isChecklistLoading ? (
            <p className="adm-muted">Loading checklist...</p>
          ) : checklistItems.length === 0 ? (
            <EmptyState
              title="No checklist items"
              description="Add your first setup checklist item above."
            />
          ) : (
            <ul className="adm-checklist">
              {checklistItems.map((item) => (
                <li key={item.id} className={item.done ? "is-done" : ""}>
                  <button
                    type="button"
                    className="adm-checklist__toggle"
                    onClick={() => {
                      void toggleChecklistItem(item.id);
                    }}
                    aria-label={item.done ? "Mark item as not done" : "Mark item as done"}
                  >
                    <CheckCircle2 size={18} aria-hidden="true" />
                  </button>
                  <div className="adm-checklist__content">
                    <p>{item.title}</p>
                    {item.description ? <p className="adm-muted">{item.description}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="adm-checklist__delete"
                    onClick={() => {
                      void deleteChecklistItem(item.id);
                    }}
                    aria-label="Delete checklist item"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="adm-grid adm-grid--two">
        <article className="adm-card adm-panel">
          <header className="adm-panel__header">
            <h3>Recent orders</h3>
            <Link to="/admin/orders" className="adm-inline-link">
              Open orders <ArrowUpRight size={14} />
            </Link>
          </header>
          {loading ? <p className="adm-muted">Loading orders...</p> : null}
          {!loading && orders.length === 0 ? (
            <EmptyState title="No orders yet" description="Orders from Firestore will appear here in real time." />
          ) : null}
          {!loading && orders.length > 0 ? (
            <div className="adm-mini-table">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="adm-mini-table__row">
                  <div>
                    <p>{order.orderNumber}</p>
                    <p className="adm-muted">{order.customer}</p>
                  </div>
                  <StatusBadge
                    tone={
                      order.paymentStatus === "paid"
                        ? "success"
                        : order.paymentStatus === "pending"
                        ? "warning"
                        : "danger"
                    }
                  >
                    {order.paymentStatus}
                  </StatusBadge>
                  <strong>{money.format(order.total)}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </article>

        <article className="adm-card adm-panel">
          <header className="adm-panel__header">
            <h3>Top products</h3>
            <Link to="/admin/products" className="adm-inline-link">
              Manage catalog <ArrowUpRight size={14} />
            </Link>
          </header>
          {loading ? <p className="adm-muted">Loading products...</p> : null}
          {!loading && topProducts.length === 0 ? (
            <EmptyState title="No products yet" description="Products from Firestore will appear here in real time." />
          ) : null}
          {!loading && topProducts.length > 0 ? (
            <div className="adm-mini-table">
              {topProducts.map((product, index) => (
                <div key={product.id} className="adm-mini-table__row">
                  <div className="adm-product-cell">
                    <img src={product.thumbnail} alt={product.title} loading="lazy" />
                    <div>
                      <p>{product.title}</p>
                      <p className="adm-muted">{product.inventory} in stock</p>
                    </div>
                  </div>
                  <strong>#{index + 1}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
}
