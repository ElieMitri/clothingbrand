import type { KpiMetric, OrderRow, ProductRow, CustomerRow } from "../types";
import type { OrderStatus } from "../../lib/orderLogic";
import { toDate } from "../../lib/storefront";

export interface AdminProductDoc {
  id: string;
  name?: string;
  brand?: string;
  product_type?: string;
  sku?: string;
  image_url?: string;
  images?: string[];
  description?: string;
  stock?: number;
  size_stock?: Record<string, number>;
  sold_out_sizes?: string[];
  price?: number;
  cost_price?: number;
  original_price?: number;
  commission_percentage?: number;
  discount_percentage?: number;
  category?: string;
  subcategory?: string;
  audience?: string;
  authenticity?: string;
  colors?: string[];
  sizes?: string[];
  material?: string;
  care_instructions?: string;
  tags?: string[];
  flavor?: string;
  net_weight?: string;
  is_featured?: boolean;
  is_new_arrival?: boolean;
  sold_out?: boolean;
  created_at?: unknown;
  updated_at?: unknown;
}

export interface AdminOrderItemDoc {
  quantity?: number;
}

export interface AdminOrderDoc {
  id: string;
  user_id?: string;
  user_email?: string;
  created_at?: unknown;
  status?: OrderStatus;
  total?: number;
  subtotal?: number;
  shipping?: number;
  tax?: number;
  items?: AdminOrderItemDoc[];
}

export interface AdminUserDoc {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  city?: string;
  state?: string;
  country?: string;
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const percentageFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const deriveInventory = (product: AdminProductDoc) => {
  const sizeStock = product.size_stock;
  if (sizeStock && typeof sizeStock === "object") {
    const total = Object.values(sizeStock).reduce(
      (sum, value) => sum + Math.max(0, Number(value || 0)),
      0
    );
    if (total > 0) return total;
  }
  return Math.max(0, Number(product.stock || 0));
};

const deriveProductStatus = (product: AdminProductDoc): ProductRow["status"] => {
  if (product.sold_out) return "archived";
  if (!product.name || Number(product.price || 0) <= 0 || !product.image_url) {
    return "draft";
  }
  return "active";
};

const derivePaymentStatus = (
  status: OrderStatus | undefined
): OrderRow["paymentStatus"] => {
  if (status === "cancelled") return "refunded";
  if (status === "pending") return "pending";
  return "paid";
};

const deriveFulfillmentStatus = (
  status: OrderStatus | undefined
): OrderRow["fulfillmentStatus"] => {
  if (status === "processing") return "processing";
  if (status === "shipped" || status === "delivered") return "fulfilled";
  return "unfulfilled";
};

const deriveShipmentStatus = (
  status: OrderStatus | undefined
): OrderRow["shipmentStatus"] => {
  if (status === "processing") return "processing";
  if (status === "shipped") return "shipped";
  if (status === "delivered") return "delivered";
  if (status === "cancelled") return "cancelled";
  return "pending";
};

const customerNameFromEmail = (email: string) => {
  const localPart = email.split("@")[0] || "customer";
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export const mapProducts = (products: AdminProductDoc[]): ProductRow[] => {
  return products.map((product) => ({
    id: product.id,
    title: String(product.name || "Untitled product"),
    sku: String(product.sku || "-"),
    thumbnail:
      String(product.image_url || "") ||
      (Array.isArray(product.images) && product.images.length > 0
        ? String(product.images[0])
        : "https://via.placeholder.com/80x80?text=IMG"),
    inventory: deriveInventory(product),
    price: Number(product.price || 0),
    status: deriveProductStatus(product),
    category: String(product.category || "Uncategorized"),
    variants: Array.isArray(product.sizes)
      ? product.sizes.map((size) => String(size)).filter(Boolean)
      : [],
  }));
};

export const mapOrders = (orders: AdminOrderDoc[]): OrderRow[] => {
  return orders.map((order) => {
    const email = String(order.user_email || "").trim();
    const dateValue = toDate(order.created_at);
    return {
      id: order.id,
      orderNumber: `#${order.id.slice(0, 6).toUpperCase()}`,
      customer: email ? customerNameFromEmail(email) : "Guest",
      email: email || "-",
      date: dateValue.toLocaleDateString(),
      paymentStatus: derivePaymentStatus(order.status),
      fulfillmentStatus: deriveFulfillmentStatus(order.status),
      shipmentStatus: deriveShipmentStatus(order.status),
      total: Number(order.total || 0),
      tags: [String(order.status || "pending")],
    };
  });
};

export const mapCustomers = (
  users: AdminUserDoc[],
  orders: AdminOrderDoc[]
): CustomerRow[] => {
  return users.map((entry) => {
    const email = String(entry.email || "").trim().toLowerCase();
    const relatedOrders = orders.filter((order) => {
      if (order.user_id && order.user_id === entry.id) return true;
      if (!email) return false;
      return String(order.user_email || "").trim().toLowerCase() === email;
    });

    const spend = relatedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const location = [entry.city, entry.state, entry.country]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(", ");

    const name = String(
      `${entry.firstName || ""} ${entry.lastName || ""}`.trim() ||
        entry.displayName ||
        (email ? customerNameFromEmail(email) : "Customer")
    );

    return {
      id: entry.id,
      name,
      email: email || "-",
      location: location || "-",
      spend,
      orderCount: relatedOrders.length,
      tags: relatedOrders.length > 3 ? ["Returning"] : ["New"],
    };
  });
};

export const buildDashboardKpis = (
  orders: AdminOrderDoc[],
  products: AdminProductDoc[]
): KpiMetric[] => {
  const validOrders = orders.filter((order) => order.status !== "cancelled");
  const sales = validOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const ordersCount = validOrders.length;
  const avgOrderValue = ordersCount > 0 ? sales / ordersCount : 0;
  const totalOrders = orders.length;
  const conversionLike =
    totalOrders > 0 ? (ordersCount / totalOrders) * 100 : 0;

  return [
    {
      label: "Net sales",
      value: numberFormatter.format(sales),
      delta: `${ordersCount} active orders`,
      trend: ordersCount > 0 ? "up" : "down",
    },
    {
      label: "Orders",
      value: String(totalOrders),
      delta: `${products.length} products in catalog`,
      trend: totalOrders > 0 ? "up" : "down",
    },
    {
      label: "Conversion",
      value: `${percentageFormatter.format(conversionLike)}%`,
      delta: "Based on non-cancelled orders",
      trend: conversionLike >= 50 ? "up" : "down",
    },
    {
      label: "Average order value",
      value: numberFormatter.format(avgOrderValue),
      delta: "Live from Firestore",
      trend: avgOrderValue > 0 ? "up" : "down",
    },
  ];
};
