import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { TrendChart } from "../components/TrendChart";
import { setupChecklist } from "../data/adminConstants";
import { useAdminLiveData } from "../hooks/useAdminLiveData";
import { useToast } from "../hooks/useToast";
import { db } from "../../lib/firebase";
import { toDate } from "../../lib/storefront";
import { getUnitProfitFromOrderItemDoc } from "../utils/transforms";
import type { ChecklistItem } from "../types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function DashboardPage() {
  const { showToast } = useToast();
  const {
    dashboardKpis,
    productsRaw,
    ordersRaw,
    customers,
    subscribersCount,
    analyticsEventsRaw,
    presenceRaw,
  } = useAdminLiveData();
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(setupChecklist);
  const [isChecklistLoading, setIsChecklistLoading] = useState(true);
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newChecklistDescription, setNewChecklistDescription] = useState("");
  const [kpiOverrides, setKpiOverrides] = useState<
    Record<string, { enabled: boolean; value: string; delta: string }>
  >({});
  const [editingKpiLabel, setEditingKpiLabel] = useState("");
  const [kpiDraft, setKpiDraft] = useState<{ enabled: boolean; value: string; delta: string }>({
    enabled: true,
    value: "",
    delta: "",
  });
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<"all" | number>("all");

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

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const dataYears = Array.from(
      new Set(
        ordersRaw
          .map((order) => toDate(order.created_at).getFullYear())
          .filter((year) => Number.isFinite(year) && year > 2000)
      )
    );

    const latestDataYear = dataYears.length > 0 ? Math.max(...dataYears) : currentYear;
    const earliestDataYear = dataYears.length > 0 ? Math.min(...dataYears) : currentYear - 1;

    // Always keep at least the previous year selectable (e.g., 2027 -> includes 2026).
    const startYear = Math.min(earliestDataYear, currentYear - 1);
    const endYear = Math.max(currentYear, latestDataYear);

    const years: number[] = [];
    for (let year = endYear; year >= startYear; year -= 1) {
      years.push(year);
    }
    return years;
  }, [ordersRaw]);

  useEffect(() => {
    if (availableYears.includes(selectedYear)) return;
    setSelectedYear(availableYears[0]);
  }, [availableYears, selectedYear]);

  const kpiTrendPoints = useMemo(() => {
    const start = new Date(selectedYear, selectedMonth === "all" ? 0 : selectedMonth, 1);
    const end =
      selectedMonth === "all"
        ? new Date(selectedYear + 1, 0, 1)
        : new Date(selectedYear, selectedMonth + 1, 1);

    const productById = new Map<string, (typeof productsRaw)[number]>();
    productsRaw.forEach((product) => {
      const productId = String(product.id || "").trim();
      if (!productId) return;
      productById.set(productId, product);
    });

    const getOrderProfit = (order: (typeof ordersRaw)[number]) => {
      const persistedProfit = Number(order.profit);
      if (Number.isFinite(persistedProfit) && persistedProfit >= 0) {
        return persistedProfit;
      }

      const items = Array.isArray(order.items) ? order.items : [];
      return items.reduce((sum, item) => {
        const quantity = Number(item?.quantity || 0);
        if (quantity <= 0) return sum;
        const unitSalePrice = Number(item?.price ?? item?.unitPrice ?? 0);
        const productId = String(item?.product_id || "").trim();
        const product = productById.get(productId);
        const unitProfit = getUnitProfitFromOrderItemDoc(item, product, unitSalePrice);
        return sum + unitProfit * quantity;
      }, 0);
    };

    const grossByBucket = new Map<number, number>();
    const revenueByBucket = new Map<number, number>();
    const profitByBucket = new Map<number, number>();
    const ordersByBucket = new Map<number, number>();

    ordersRaw.forEach((order) => {
      const date = toDate(order.created_at);
      if (date < start || date >= end) return;
      const bucket = selectedMonth === "all" ? date.getMonth() : date.getDate() - 1;
      const total = Math.max(0, Number(order.total || 0));

      grossByBucket.set(bucket, Number(grossByBucket.get(bucket) || 0) + total);
      ordersByBucket.set(bucket, Number(ordersByBucket.get(bucket) || 0) + 1);

      if (order.status === "cancelled") return;
      revenueByBucket.set(bucket, Number(revenueByBucket.get(bucket) || 0) + total);
      profitByBucket.set(bucket, Number(profitByBucket.get(bucket) || 0) + getOrderProfit(order));
    });

    const bucketCount =
      selectedMonth === "all"
        ? 12
        : new Date(selectedYear, selectedMonth + 1, 0).getDate();

    const points = Array.from({ length: bucketCount }).map((_, index) => {
      const label =
        selectedMonth === "all"
          ? monthLabels[index]
          : String(index + 1);
      return {
        label,
        grossSales: Number(grossByBucket.get(index) || 0),
        revenue: Number(revenueByBucket.get(index) || 0),
        estimatedProfit: Number(profitByBucket.get(index) || 0),
        orders: Number(ordersByBucket.get(index) || 0),
      };
    });

    return {
      grossSales: points.map((point) => ({ label: point.label, value: point.grossSales })),
      revenue: points.map((point) => ({ label: point.label, value: point.revenue })),
      estimatedProfit: points.map((point) => ({ label: point.label, value: point.estimatedProfit })),
      orders: points.map((point) => ({ label: point.label, value: point.orders })),
    };
  }, [ordersRaw, productsRaw, selectedMonth, selectedYear]);

  const trendPeriodLabel =
    selectedMonth === "all"
      ? `Monthly view for ${selectedYear}`
      : `Daily view for ${monthLabels[selectedMonth]} ${selectedYear}`;

  const analyticsSnapshot = useMemo(() => {
    const start = new Date(selectedYear, selectedMonth === "all" ? 0 : selectedMonth, 1);
    const end =
      selectedMonth === "all"
        ? new Date(selectedYear + 1, 0, 1)
        : new Date(selectedYear, selectedMonth + 1, 1);

    const inRange = ordersRaw.filter((order) => {
      const createdAt = toDate(order.created_at);
      return createdAt >= start && createdAt < end;
    });

    const nonCancelled = inRange.filter((order) => order.status !== "cancelled");

    const inRangeEvents = analyticsEventsRaw.filter((event) => {
      if (event.event_type !== "page_view") return false;
      const createdAt = toDate(event.created_at);
      return createdAt >= start && createdAt < end;
    });

    const uniqueVisitors = new Set(
      inRangeEvents.map((event) => String(event.visitor_id || "").trim()).filter(Boolean)
    ).size;
    const uniqueSessions = new Set(
      inRangeEvents.map((event) => String(event.session_id || "").trim()).filter(Boolean)
    ).size;
    const pageViewCount = inRangeEvents.length;

    const pathCounter = new Map<string, number>();
    inRangeEvents.forEach((event) => {
      const path = String(event.full_path || event.path || "/").trim() || "/";
      pathCounter.set(path, Number(pathCounter.get(path) || 0) + 1);
    });
    const topPages = Array.from(pathCounter.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([path, count]) => ({ path, count }));

    const cityBuckets = new Map<string, { visitors: Set<string>; views: number }>();
    inRangeEvents.forEach((event) => {
      const cityName = String(event.city || "").trim();
      const countryName = String(event.country || "").trim();
      const label = cityName || countryName || "Unknown";
      const visitorKey = String(event.visitor_id || event.session_id || event.id).trim();
      const bucket = cityBuckets.get(label) || { visitors: new Set<string>(), views: 0 };
      if (visitorKey) bucket.visitors.add(visitorKey);
      bucket.views += 1;
      cityBuckets.set(label, bucket);
    });
    const topCities = Array.from(cityBuckets.entries())
      .map(([city, value]) => ({ city, visitors: value.visitors.size, views: value.views }))
      .sort((a, b) => (b.visitors !== a.visitors ? b.visitors - a.visitors : b.views - a.views))
      .slice(0, 8);

    const onlineCutoffMs = Date.now() - 2 * 60 * 1000;
    const activePresence = presenceRaw.filter((entry) => toDate(entry.last_seen).getTime() >= onlineCutoffMs);
    const onlineSessions = activePresence.length;
    const onlineVisitors = new Set(
      activePresence
        .map((entry) => String(entry.visitor_id || entry.session_id || entry.id).trim())
        .filter(Boolean)
    ).size;
    const onlineCityBuckets = new Map<string, Set<string>>();
    activePresence.forEach((entry) => {
      const cityName = String(entry.city || "").trim();
      const countryName = String(entry.country || "").trim();
      const label = cityName || countryName || "Unknown";
      const visitorKey = String(entry.visitor_id || entry.session_id || entry.id).trim();
      if (!visitorKey) return;
      const visitors = onlineCityBuckets.get(label) || new Set<string>();
      visitors.add(visitorKey);
      onlineCityBuckets.set(label, visitors);
    });
    const topOnlineCities = Array.from(onlineCityBuckets.entries())
      .map(([city, visitors]) => ({ city, onlineVisitors: visitors.size }))
      .sort((a, b) => b.onlineVisitors - a.onlineVisitors)
      .slice(0, 8);

    const revenue = nonCancelled.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const totalOrders = inRange.length;
    const fulfilledOrders = nonCancelled.filter(
      (order) => order.status === "shipped" || order.status === "delivered"
    ).length;

    return {
      returningRate:
        customers.length > 0
          ? (customers.filter((customer) => customer.orderCount > 1).length / customers.length) * 100
          : 0,
      productCoverage: productsRaw.length,
      subscribers: subscribersCount,
      cancelled: inRange.filter((order) => order.status === "cancelled").length,
      completionRate: totalOrders > 0 ? (fulfilledOrders / totalOrders) * 100 : 0,
      avgOrderValue: nonCancelled.length > 0 ? revenue / nonCancelled.length : 0,
      pageViewCount,
      uniqueVisitors,
      uniqueSessions,
      onlineVisitors,
      onlineSessions,
      avgPagesPerSession: uniqueSessions > 0 ? pageViewCount / uniqueSessions : 0,
      topPages,
      topCities,
      topOnlineCities,
    };
  }, [analyticsEventsRaw, customers, ordersRaw, presenceRaw, productsRaw.length, selectedMonth, selectedYear, subscribersCount]);

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

      <section>
        <article className="adm-card adm-panel">
          <header className="adm-panel__header">
            <div>
              <h3>KPI trends</h3>
              <p className="adm-muted">{trendPeriodLabel}</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="adm-inline-field">
                Year
                <select
                  className="adm-input"
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                  aria-label="Select trend year"
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label className="adm-inline-field">
                Month
                <select
                  className="adm-input"
                  value={selectedMonth}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedMonth(value === "all" ? "all" : Number(value));
                  }}
                  aria-label="Select trend month"
                >
                  <option value="all">All months</option>
                  {monthLabels.map((month, index) => (
                    <option key={month} value={index}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </header>
          <div className="adm-kpi-trends-grid">
            <div className="adm-panel" style={{ border: "1px solid var(--adm-border)", borderRadius: 12, padding: 12 }}>
              <p className="adm-muted">Gross sales</p>
              <TrendChart points={kpiTrendPoints.grossSales} ariaLabel="Gross sales trend graph" />
            </div>
            <div className="adm-panel" style={{ border: "1px solid var(--adm-border)", borderRadius: 12, padding: 12 }}>
              <p className="adm-muted">Revenue</p>
              <TrendChart points={kpiTrendPoints.revenue} ariaLabel="Revenue trend graph" />
            </div>
            <div className="adm-panel" style={{ border: "1px solid var(--adm-border)", borderRadius: 12, padding: 12 }}>
              <p className="adm-muted">Estimated profit</p>
              <TrendChart
                points={kpiTrendPoints.estimatedProfit}
                ariaLabel="Estimated profit trend graph"
              />
            </div>
            <div className="adm-panel" style={{ border: "1px solid var(--adm-border)", borderRadius: 12, padding: 12 }}>
              <p className="adm-muted">Orders</p>
              <TrendChart
                points={kpiTrendPoints.orders}
                ariaLabel="Orders trend graph"
                valueFormatter={(value) => `${Math.max(0, Math.round(value))}`}
              />
            </div>
          </div>
        </article>
      </section>

      <section>
        <article className="adm-card adm-panel">
          <h3>Commerce + traffic breakdown</h3>
          <div className="adm-breakdown-grid">
            <div>
              <p className="adm-muted">Returning customers</p>
              <strong>{analyticsSnapshot.returningRate.toFixed(1)}%</strong>
            </div>
            <div>
              <p className="adm-muted">Catalog size</p>
              <strong>{analyticsSnapshot.productCoverage} products</strong>
            </div>
            <div>
              <p className="adm-muted">Subscribers</p>
              <strong>{analyticsSnapshot.subscribers}</strong>
            </div>
            <div>
              <p className="adm-muted">Fulfillment completion</p>
              <strong>{analyticsSnapshot.completionRate.toFixed(1)}%</strong>
            </div>
            <div>
              <p className="adm-muted">Average order value</p>
              <strong>{money.format(analyticsSnapshot.avgOrderValue)}</strong>
            </div>
            <div>
              <p className="adm-muted">Cancelled orders</p>
              <strong>{analyticsSnapshot.cancelled}</strong>
            </div>
            <div>
              <p className="adm-muted">Page views</p>
              <strong>{analyticsSnapshot.pageViewCount}</strong>
            </div>
            <div>
              <p className="adm-muted">Unique visitors</p>
              <strong>{analyticsSnapshot.uniqueVisitors}</strong>
            </div>
            <div>
              <p className="adm-muted">Unique sessions</p>
              <strong>{analyticsSnapshot.uniqueSessions}</strong>
            </div>
            <div>
              <p className="adm-muted">Avg pages/session</p>
              <strong>{analyticsSnapshot.avgPagesPerSession.toFixed(2)}</strong>
            </div>
            <div>
              <p className="adm-muted">Online visitors now</p>
              <strong>{analyticsSnapshot.onlineVisitors}</strong>
            </div>
            <div>
              <p className="adm-muted">Online sessions now</p>
              <strong>{analyticsSnapshot.onlineSessions}</strong>
            </div>
          </div>

          <div className="adm-top-pages">
            <p className="adm-muted">Top pages by views</p>
            {analyticsSnapshot.topPages.length === 0 ? (
              <p className="adm-muted">No page view data yet.</p>
            ) : (
              <ul>
                {analyticsSnapshot.topPages.map((entry) => (
                  <li key={entry.path}>
                    <code>{entry.path}</code>
                    <strong>{entry.count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="adm-top-pages">
            <p className="adm-muted">Visitors by city</p>
            {analyticsSnapshot.topCities.length === 0 ? (
              <p className="adm-muted">No city data yet.</p>
            ) : (
              <ul>
                {analyticsSnapshot.topCities.map((entry) => (
                  <li key={entry.city}>
                    <code>{entry.city}</code>
                    <strong>
                      {entry.visitors} visitors · {entry.views} views
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="adm-top-pages">
            <p className="adm-muted">Online visitors by city (last 2 min)</p>
            {analyticsSnapshot.topOnlineCities.length === 0 ? (
              <p className="adm-muted">No one is currently online.</p>
            ) : (
              <ul>
                {analyticsSnapshot.topOnlineCities.map((entry) => (
                  <li key={entry.city}>
                    <code>{entry.city}</code>
                    <strong>{entry.onlineVisitors} online</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </section>

      <section>
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
