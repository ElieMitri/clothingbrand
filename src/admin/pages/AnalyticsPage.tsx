import { useMemo, useState } from "react";
import { toDate } from "../../lib/storefront";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { TrendChart } from "../components/TrendChart";
import { useAdminLiveData } from "../hooks/useAdminLiveData";
import { getUnitProfitFromProductDoc } from "../utils/transforms";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type RangeOption = "7" | "30" | "90";
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

export function AnalyticsPage() {
  const { loading, ordersRaw, productsRaw, customers, subscribersCount, analyticsEventsRaw, presenceRaw } =
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
    const productById = new Map<string, (typeof productsRaw)[number]>();
    productsRaw.forEach((product) => {
      const productId = String(product.id || "").trim();
      if (!productId) return;
      productById.set(productId, product);
    });

    const grossSales = inRange.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const revenue = nonCancelled.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const profit = nonCancelled.reduce((sum, order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const orderProfit = items.reduce((itemSum, item) => {
        const quantity = Number(item?.quantity || 0);
        if (quantity <= 0) return itemSum;
        const unitSalePrice = Number(item?.price ?? item?.unitPrice ?? 0);
        const productId = String(item?.product_id || "").trim();
        const product = productById.get(productId);
        const unitProfit = getUnitProfitFromProductDoc(product, unitSalePrice);
        return itemSum + unitProfit * quantity;
      }, 0);
      return sum + orderProfit;
    }, 0);
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
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
      .map(([city, value]) => ({
        city,
        visitors: value.visitors.size,
        views: value.views,
      }))
      .sort((a, b) => {
        if (b.visitors !== a.visitors) return b.visitors - a.visitors;
        return b.views - a.views;
      })
      .slice(0, 8);

    const onlineCutoffMs = Date.now() - 2 * 60 * 1000;
    const activePresence = presenceRaw.filter((entry) => {
      const seenAt = toDate(entry.last_seen).getTime();
      return seenAt >= onlineCutoffMs;
    });
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
      onlineVisitors,
      onlineSessions,
      avgPagesPerSession: uniqueSessions > 0 ? pageViewCount / uniqueSessions : 0,
      topPages,
      topCities,
      topOnlineCities,
    };

    return {
      grossSales,
      revenue,
      profit,
      profitMargin,
      totalOrders,
      completionRate,
      avgOrderValue,
      chart,
      channelBreakdown,
    };
  }, [analyticsEventsRaw, customers, ordersRaw, productsRaw, range, subscribersCount]);

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
          label="Net revenue"
          value={money.format(analytics.revenue)}
          delta={`Live window: ${range} days`}
          trend={analytics.revenue > 0 ? "up" : "down"}
        />
        <StatCard
          label="Gross sales"
          value={money.format(analytics.grossSales)}
          delta={`${analytics.totalOrders} total orders`}
          trend={analytics.grossSales > 0 ? "up" : "down"}
        />
        <StatCard
          label="Estimated profit"
          value={money.format(analytics.profit)}
          delta={`${analytics.profitMargin.toFixed(1)}% margin`}
          trend={analytics.profit > 0 ? "up" : "down"}
        />
        <StatCard
          label="Online now"
          value={String(analytics.channelBreakdown.onlineVisitors)}
          delta={`${analytics.channelBreakdown.onlineSessions} active sessions (includes guests)`}
          trend={analytics.channelBreakdown.onlineVisitors > 0 ? "up" : "down"}
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

          <div className="adm-top-pages">
            <p className="adm-muted">Visitors by city ({range} days)</p>
            {analytics.channelBreakdown.topCities.length === 0 ? (
              <p className="adm-muted">No city data yet. New visits will populate this list.</p>
            ) : (
              <ul>
                {analytics.channelBreakdown.topCities.map((entry) => (
                  <li key={entry.city}>
                    <code>{entry.city}</code>
                    <strong>{entry.visitors} visitors · {entry.views} views</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="adm-top-pages">
            <p className="adm-muted">Online visitors by city (last 2 min)</p>
            {analytics.channelBreakdown.topOnlineCities.length === 0 ? (
              <p className="adm-muted">No one is currently online.</p>
            ) : (
              <ul>
                {analytics.channelBreakdown.topOnlineCities.map((entry) => (
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
    </div>
  );
}
