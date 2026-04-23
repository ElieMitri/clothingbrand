import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { doc, onSnapshot, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
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

const normalizeCommissionPercent = (value: unknown) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  if (parsed <= 1) return parsed * 100;
  return parsed;
};

interface OverviewPricingEditor {
  price: number;
  cost_price: number;
  original_price: number;
  commission_percentage: number;
  use_manual_profit: boolean;
  profit_per_unit: number;
}

const computeAutomaticProfit = (editor: OverviewPricingEditor) => {
  const salePrice = Math.max(0, Number(editor.price || 0));
  const commission = Math.max(0, normalizeCommissionPercent(editor.commission_percentage));
  const costPrice = Math.max(0, Number(editor.cost_price || 0));
  const retailPrice = Math.max(0, Number(editor.original_price || editor.price || 0));

  if (retailPrice > 0 && costPrice > 0) return retailPrice - costPrice;
  if (commission > 0) return salePrice * (commission / 100);
  if (costPrice > 0) return salePrice - costPrice;
  return 0;
};

export function DashboardPage() {
  const { showToast } = useToast();
  const { loading, dashboardKpis, orders, products, productsRaw, ordersRaw } = useAdminLiveData();
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(setupChecklist);
  const [isChecklistLoading, setIsChecklistLoading] = useState(true);
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newChecklistDescription, setNewChecklistDescription] = useState("");
  const [overviewEditors, setOverviewEditors] = useState<Record<string, OverviewPricingEditor>>({});
  const [savingOverviewProductId, setSavingOverviewProductId] = useState<string>("");
  const [kpiOverrides, setKpiOverrides] = useState<
    Record<string, { enabled: boolean; value: string; delta: string }>
  >({});
  const [editingKpiLabel, setEditingKpiLabel] = useState("");
  const [kpiDraft, setKpiDraft] = useState<{ enabled: boolean; value: string; delta: string }>({
    enabled: true,
    value: "",
    delta: "",
  });

  const checklistRef = useMemo(
    () => doc(db, "site_settings", "admin_setup_checklist"),
    []
  );
  const kpiOverridesRef = useMemo(() => doc(db, "site_settings", "dashboard_kpi_overrides"), []);

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

  useEffect(() => {
    const unsub = onSnapshot(
      kpiOverridesRef,
      (snap) => {
        if (!snap.exists()) {
          setKpiOverrides({});
          return;
        }
        const data = snap.data() as { overrides?: Record<string, unknown> };
        const normalized: Record<string, { enabled: boolean; value: string; delta: string }> = {};
        Object.entries(data.overrides || {}).forEach(([label, entry]) => {
          if (!entry || typeof entry !== "object") return;
          const candidate = entry as Partial<{ enabled: boolean; value: string; delta: string }>;
          normalized[label] = {
            enabled: Boolean(candidate.enabled),
            value: String(candidate.value || ""),
            delta: String(candidate.delta || ""),
          };
        });
        setKpiOverrides(normalized);
      },
      () => setKpiOverrides({})
    );

    return () => unsub();
  }, [kpiOverridesRef]);

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

  const persistKpiOverride = async (
    label: string,
    next: { enabled: boolean; value: string; delta: string }
  ) => {
    const nextOverrides = {
      ...kpiOverrides,
      [label]: next,
    };
    setKpiOverrides(nextOverrides);
    await setDoc(
      kpiOverridesRef,
      {
        overrides: nextOverrides,
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

  const topProducts = useMemo(
    () => [...products].sort((a, b) => b.inventory - a.inventory).slice(0, 4),
    [products]
  );

  useEffect(() => {
    const topProductIds = new Set(topProducts.map((product) => product.id));
    if (topProductIds.size === 0) return;

    setOverviewEditors((prev) => {
      const next = { ...prev };
      topProducts.forEach((product) => {
        const raw = productsRaw.find((entry) => entry.id === product.id);
        if (!raw) return;
        next[product.id] = {
          price: Number(raw.price || product.price || 0),
          cost_price: Number(raw.cost_price || 0),
          original_price: Number(raw.original_price || raw.price || product.price || 0),
          commission_percentage: normalizeCommissionPercent(raw.commission_percentage),
          use_manual_profit: Boolean(raw.use_manual_profit),
          profit_per_unit: Number(raw.profit_per_unit || 0),
        };
      });

      Object.keys(next).forEach((id) => {
        if (!topProductIds.has(id)) delete next[id];
      });
      return next;
    });
  }, [productsRaw, topProducts]);

  const updateOverviewEditor = <K extends keyof OverviewPricingEditor>(
    productId: string,
    key: K,
    value: OverviewPricingEditor[K]
  ) => {
    setOverviewEditors((prev) => {
      const current = prev[productId];
      if (!current) return prev;
      return {
        ...prev,
        [productId]: {
          ...current,
          [key]: value,
        },
      };
    });
  };

  const saveOverviewPricing = async (productId: string) => {
    const editor = overviewEditors[productId];
    if (!editor) return;

    setSavingOverviewProductId(productId);
    try {
      await updateDoc(doc(db, "products", productId), {
        price: Math.max(0, Number(editor.price || 0)),
        cost_price: Math.max(0, Number(editor.cost_price || 0)),
        original_price: Math.max(0, Number(editor.original_price || editor.price || 0)),
        commission_percentage: normalizeCommissionPercent(editor.commission_percentage),
        use_manual_profit: Boolean(editor.use_manual_profit),
        profit_per_unit: Math.max(0, Number(editor.profit_per_unit || 0)),
        updated_at: Timestamp.now(),
      });
      showToast({ title: "Overview pricing saved" });
    } catch (error) {
      console.error("Failed to save overview pricing", error);
      showToast({ title: "Failed to save overview pricing" });
    } finally {
      setSavingOverviewProductId("");
    }
  };
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

  const renderedKpis = useMemo(
    () =>
      dashboardKpis.map((kpi) => {
        const override = kpiOverrides[kpi.label];
        if (!override?.enabled) return kpi;
        return {
          ...kpi,
          value: override.value || kpi.value,
          delta: override.delta || kpi.delta,
        };
      }),
    [dashboardKpis, kpiOverrides]
  );

  const openKpiEditor = (label: string) => {
    const source = renderedKpis.find((kpi) => kpi.label === label);
    const override = kpiOverrides[label];
    setKpiDraft({
      enabled: override?.enabled ?? true,
      value: override?.value || source?.value || "",
      delta: override?.delta || source?.delta || "",
    });
    setEditingKpiLabel(label);
  };

  const closeKpiEditor = () => {
    setEditingKpiLabel("");
  };

  const saveKpiEditor = async () => {
    if (!editingKpiLabel) return;
    try {
      await persistKpiOverride(editingKpiLabel, {
        enabled: Boolean(kpiDraft.enabled),
        value: String(kpiDraft.value || "").trim(),
        delta: String(kpiDraft.delta || "").trim(),
      });
      showToast({ title: "KPI override saved" });
      closeKpiEditor();
    } catch (error) {
      console.error("Failed to save KPI override", error);
      showToast({ title: "Failed to save KPI override" });
    }
  };

  const resetKpiEditor = async () => {
    if (!editingKpiLabel) return;
    try {
      await persistKpiOverride(editingKpiLabel, {
        enabled: false,
        value: "",
        delta: "",
      });
      showToast({ title: "KPI reset to automatic" });
      closeKpiEditor();
    } catch (error) {
      console.error("Failed to reset KPI override", error);
      showToast({ title: "Failed to reset KPI override" });
    }
  };

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
        {renderedKpis.map((kpi) => (
          <StatCard
            key={kpi.label}
            {...kpi}
            action={
              <button
                type="button"
                className="adm-icon-button"
                aria-label={`Edit ${kpi.label}`}
                onClick={() => openKpiEditor(kpi.label)}
              >
                <Pencil size={14} />
              </button>
            }
          />
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
              {topProducts.map((product, index) => {
                const editor = overviewEditors[product.id];
                const automaticProfit = editor ? computeAutomaticProfit(editor) : 0;
                const activeProfit =
                  editor && editor.use_manual_profit
                    ? Math.max(0, Number(editor.profit_per_unit || 0))
                    : automaticProfit;

                return (
                  <div key={product.id} className="adm-mini-table__row" style={{ alignItems: "flex-start" }}>
                    <div className="adm-product-cell">
                      <img src={product.thumbnail} alt={product.title} loading="lazy" />
                      <div>
                        <p>{product.title}</p>
                        <p className="adm-muted">{product.inventory} in stock</p>
                      </div>
                    </div>
                    <strong>#{index + 1}</strong>
                    {editor ? (
                      <div
                        style={{
                          marginLeft: "auto",
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(90px, 1fr))",
                          gap: 8,
                          width: "100%",
                          maxWidth: 420,
                        }}
                      >
                        <label>
                          <span className="adm-muted">Sale</span>
                          <input
                            className="adm-input"
                            type="number"
                            value={editor.price}
                            onChange={(event) =>
                              updateOverviewEditor(product.id, "price", Number(event.target.value || 0))
                            }
                          />
                        </label>
                        <label>
                          <span className="adm-muted">Cost</span>
                          <input
                            className="adm-input"
                            type="number"
                            value={editor.cost_price}
                            onChange={(event) =>
                              updateOverviewEditor(product.id, "cost_price", Number(event.target.value || 0))
                            }
                          />
                        </label>
                        <label>
                          <span className="adm-muted">Compare</span>
                          <input
                            className="adm-input"
                            type="number"
                            value={editor.original_price}
                            onChange={(event) =>
                              updateOverviewEditor(
                                product.id,
                                "original_price",
                                Number(event.target.value || 0)
                              )
                            }
                          />
                        </label>
                        <label>
                          <span className="adm-muted">Commission %</span>
                          <input
                            className="adm-input"
                            type="number"
                            value={editor.commission_percentage}
                            onChange={(event) =>
                              updateOverviewEditor(
                                product.id,
                                "commission_percentage",
                                Number(event.target.value || 0)
                              )
                            }
                          />
                        </label>
                        <label>
                          <span className="adm-muted">Manual profit</span>
                          <input
                            className="adm-input"
                            type="number"
                            disabled={!editor.use_manual_profit}
                            value={editor.profit_per_unit}
                            onChange={(event) =>
                              updateOverviewEditor(
                                product.id,
                                "profit_per_unit",
                                Number(event.target.value || 0)
                              )
                            }
                          />
                        </label>
                        <label className="adm-toggle" style={{ alignSelf: "end" }}>
                          <input
                            type="checkbox"
                            checked={editor.use_manual_profit}
                            onChange={(event) =>
                              updateOverviewEditor(product.id, "use_manual_profit", event.target.checked)
                            }
                          />
                          Manual
                        </label>
                        <div className="adm-muted" style={{ gridColumn: "1 / span 2" }}>
                          Auto: {money.format(automaticProfit)} | Active: {money.format(activeProfit)}
                        </div>
                        <button
                          type="button"
                          className="adm-button adm-button--primary"
                          disabled={savingOverviewProductId === product.id}
                          onClick={() => {
                            void saveOverviewPricing(product.id);
                          }}
                        >
                          {savingOverviewProductId === product.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </article>
      </section>

      <Modal
        open={Boolean(editingKpiLabel)}
        title={editingKpiLabel ? `Edit ${editingKpiLabel}` : "Edit KPI"}
        onClose={closeKpiEditor}
        footer={
          <>
            <button type="button" className="adm-button adm-button--ghost" onClick={closeKpiEditor}>
              Cancel
            </button>
            <button type="button" className="adm-button adm-button--ghost" onClick={() => void resetKpiEditor()}>
              Reset automatic
            </button>
            <button type="button" className="adm-button adm-button--primary" onClick={() => void saveKpiEditor()}>
              Save
            </button>
          </>
        }
      >
        <div className="adm-form-grid">
          <label className="adm-toggle adm-form-grid__full">
            <input
              type="checkbox"
              checked={kpiDraft.enabled}
              onChange={(event) => setKpiDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
            />
            Enable manual override
          </label>
          <label className="adm-form-grid__full">
            Value
            <input
              className="adm-input"
              value={kpiDraft.value}
              onChange={(event) => setKpiDraft((prev) => ({ ...prev, value: event.target.value }))}
            />
          </label>
          <label className="adm-form-grid__full">
            Subtitle
            <input
              className="adm-input"
              value={kpiDraft.delta}
              onChange={(event) => setKpiDraft((prev) => ({ ...prev, delta: event.target.value }))}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
