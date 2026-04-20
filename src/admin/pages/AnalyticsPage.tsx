import { useMemo, useState } from "react";
import { toDate } from "../../lib/storefront";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { TrendChart } from "../components/TrendChart";
import { useAdminLiveData } from "../hooks/useAdminLiveData";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type RangeOption = "7" | "30" | "90";
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

export function AnalyticsPage() {
  const { loading, ordersRaw, productsRaw, customers, subscribersCount, analyticsEventsRaw } =
    useAdminLiveData();
  const [range, setRange] = useState<RangeOption>("30");

  const analytics = useMemo(() => {
    const rangeDays = Number(range);
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - rangeDays);

    const inRange = ordersRaw.filter((order) => {
      const createdAt = toDate(order.created_at);
      return createdAt >= startDate;
    });

    const nonCancelled = inRange.filter((order) => order.status !== "cancelled");
    const revenue = nonCancelled.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const totalOrders = inRange.length;
    const fulfilledOrders = nonCancelled.filter(
      (order) => order.status === "shipped" || order.status === "delivered"
    ).length;
    const completionRate = totalOrders > 0 ? (fulfilledOrders / totalOrders) * 100 : 0;
    const avgOrderValue = nonCancelled.length > 0 ? revenue / nonCancelled.length : 0;

    const revenueByDay = new Map<string, number>();
    nonCancelled.forEach((order) => {
      const date = toDate(order.created_at);
      const key = dayKey(date);
      revenueByDay.set(key, Number(revenueByDay.get(key) || 0) + Number(order.total || 0));
    });

    const chart = Array.from({ length: rangeDays + 1 }).map((_, offset) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + offset);
      const key = dayKey(date);
      return {
        label:
          rangeDays <= 7
            ? date.toLocaleDateString("en-US", { weekday: "short" })
            : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: Number(revenueByDay.get(key) || 0),
      };
    });

    const inRangeEvents = analyticsEventsRaw.filter((event) => {
      if (event.event_type !== "page_view") return false;
      const createdAt = toDate(event.created_at);
      return createdAt >= startDate;
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

    const channelBreakdown = {
      returningRate:
        customers.length > 0
          ? (customers.filter((customer) => customer.orderCount > 1).length / customers.length) * 100
          : 0,
      productCoverage: productsRaw.length,
      subscribers: subscribersCount,
      cancelled: inRange.filter((order) => order.status === "cancelled").length,
      pageViewCount,
      uniqueVisitors,
      uniqueSessions,
      avgPagesPerSession: uniqueSessions > 0 ? pageViewCount / uniqueSessions : 0,
      topPages,
    };

    return {
      revenue,
      totalOrders,
      completionRate,
      avgOrderValue,
      chart,
      channelBreakdown,
    };
  }, [analyticsEventsRaw, customers, ordersRaw, productsRaw.length, range, subscribersCount]);

  return (
    <div className="adm-page">
      <PageHeader
        title="Analytics"
        breadcrumbs={[{ label: "Admin", href: "/admin/overview" }, { label: "Analytics" }]}
        description="Live performance across revenue, visitors, sessions, and customer behavior."
        secondaryActions={
          <label className="adm-inline-field">
            Date range
            <select value={range} onChange={(event) => setRange(event.target.value as RangeOption)}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
        }
      />

      <section className="adm-grid adm-grid--kpi">
        <StatCard
          label="Revenue"
          value={money.format(analytics.revenue)}
          delta={`Live window: ${range} days`}
          trend={analytics.revenue > 0 ? "up" : "down"}
        />
        <StatCard
          label="Orders"
          value={String(analytics.totalOrders)}
          delta={`${analytics.channelBreakdown.cancelled} cancelled`}
          trend={analytics.totalOrders > 0 ? "up" : "down"}
        />
        <StatCard
          label="Website visitors"
          value={String(analytics.channelBreakdown.uniqueVisitors)}
          delta={`${analytics.channelBreakdown.pageViewCount} page views`}
          trend={analytics.channelBreakdown.uniqueVisitors > 0 ? "up" : "down"}
        />
        <StatCard
          label="Sessions"
          value={String(analytics.channelBreakdown.uniqueSessions)}
          delta={`${analytics.channelBreakdown.avgPagesPerSession.toFixed(2)} pages/session`}
          trend={analytics.channelBreakdown.uniqueSessions > 0 ? "up" : "down"}
        />
      </section>

      <section className="adm-grid adm-grid--two">
        <article className="adm-card adm-panel">
          <h3>Revenue trend</h3>
          {loading ? <p className="adm-muted">Loading analytics...</p> : null}
          {!loading && analytics.chart.length === 0 ? (
            <p className="adm-muted">No order data in this range yet.</p>
          ) : null}
          {!loading && analytics.chart.length > 0 ? (
            <TrendChart points={analytics.chart} ariaLabel="Revenue trend graph" />
          ) : null}
        </article>

        <article className="adm-card adm-panel">
          <h3>Commerce + traffic breakdown</h3>
          <div className="adm-breakdown-grid">
            <div>
              <p className="adm-muted">Returning customers</p>
              <strong>{analytics.channelBreakdown.returningRate.toFixed(1)}%</strong>
            </div>
            <div>
              <p className="adm-muted">Catalog size</p>
              <strong>{analytics.channelBreakdown.productCoverage} products</strong>
            </div>
            <div>
              <p className="adm-muted">Subscribers</p>
              <strong>{analytics.channelBreakdown.subscribers}</strong>
            </div>
            <div>
              <p className="adm-muted">Fulfillment completion</p>
              <strong>{analytics.completionRate.toFixed(1)}%</strong>
            </div>
            <div>
              <p className="adm-muted">Average order value</p>
              <strong>{money.format(analytics.avgOrderValue)}</strong>
            </div>
            <div>
              <p className="adm-muted">Cancelled orders</p>
              <strong>{analytics.channelBreakdown.cancelled}</strong>
            </div>
          </div>

          <div className="adm-top-pages">
            <p className="adm-muted">Top pages by views</p>
            {analytics.channelBreakdown.topPages.length === 0 ? (
              <p className="adm-muted">No page view data yet. Visit the storefront to generate analytics.</p>
            ) : (
              <ul>
                {analytics.channelBreakdown.topPages.map((entry) => (
                  <li key={entry.path}>
                    <code>{entry.path}</code>
                    <strong>{entry.count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
