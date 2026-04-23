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
  use_manual_profit?: boolean;
  profit_per_unit?: number;
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
  product_id?: string;
  product_name?: string;
  product_image?: string;
  size?: string;
  price?: number;
  unitPrice?: number;
  quantity?: number;
  retail_price?: number;
  cost_price?: number;
  commission_percentage?: number;
  unit_profit?: number;
}

export interface AdminOrderDoc {
  id: string;
  user_id?: string;
  user_email?: string;
  customer_name?: string;
  phone?: string;
  address?: string;
  directions?: string;
  zipCode?: string;
  shipping_address?: string;
  payment_method?: string;
  payment_status?: string;
  status_note?: string;
  created_at?: unknown;
  status?: OrderStatus;
  fulfillment_status?: "unfulfilled" | "processing" | "fulfilled";
  city?: string;
  state?: string;
  country?: string;
  total?: number;
  subtotal?: number;
  shipping?: number;
  tax?: number;
  profit?: number;
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
  fulfillmentStatus: AdminOrderDoc["fulfillment_status"] | undefined,
  status: OrderStatus | undefined
): OrderRow["fulfillmentStatus"] => {
  if (
    fulfillmentStatus === "fulfilled" ||
    fulfillmentStatus === "processing" ||
    fulfillmentStatus === "unfulfilled"
  ) {
    return fulfillmentStatus;
  }
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

const buildProductById = (products: AdminProductDoc[]) => {
  const byId = new Map<string, AdminProductDoc>();
  products.forEach((product) => {
    const id = String(product.id || "").trim();
    if (!id) return;
    byId.set(id, product);
  });
  return byId;
};

const getOrderLocationLabel = (order: AdminOrderDoc) => {
  const location = [order.city, order.state, order.country]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
  return location || "-";
};

const getEffectiveSalePrice = (salePrice: number, product?: AdminProductDoc) => {
  const requested = Math.max(0, Number(salePrice || 0));
  if (requested > 0) return requested;
  return Math.max(0, Number(product?.price || 0));
};

const normalizeCommissionPercent = (value: unknown) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  if (parsed <= 1) return parsed * 100;
  return parsed;
};

export const getUnitProfitFromProductDoc = (
  product: AdminProductDoc | undefined,
  salePrice: number
) => {
  const effectiveSalePrice = getEffectiveSalePrice(salePrice, product);
  const useManualProfit = Boolean(product?.use_manual_profit);
  const manualProfit = Number(product?.profit_per_unit);
  if (useManualProfit && Number.isFinite(manualProfit)) {
    return Math.max(0, manualProfit);
  }

  const commission = Math.max(0, normalizeCommissionPercent(product?.commission_percentage));
  const costPrice = Math.max(0, Number(product?.cost_price || 0));
  const retailPrice = Math.max(
    0,
    Number(product?.original_price || product?.price || effectiveSalePrice)
  );

  if (retailPrice > 0 && costPrice > 0) {
    // Explicit retail/cost model: margin based on retail - cost.
    return retailPrice - costPrice;
  }

  if (commission > 0) {
    // Commission model: margin is commission percent of sale price.
    return effectiveSalePrice * (commission / 100);
  }

  if (costPrice > 0) {
    return effectiveSalePrice - costPrice;
  }

  return 0;
};

const getOrderProfit = (
  order: AdminOrderDoc,
  productById: Map<string, AdminProductDoc>
) => {
  const persistedProfit = Number(order?.profit);
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

export const getUnitProfitFromOrderItemDoc = (
  item: AdminOrderItemDoc | undefined,
  product: AdminProductDoc | undefined,
  salePrice: number
) => {
  const rawManualUnitProfit = item?.unit_profit;
  const parsedManualUnitProfit = Number(rawManualUnitProfit);
  const hasManualUnitProfit =
    rawManualUnitProfit !== undefined &&
    rawManualUnitProfit !== null &&
    String(rawManualUnitProfit).trim() !== "" &&
    Number.isFinite(parsedManualUnitProfit) &&
    parsedManualUnitProfit > 0;
  if (hasManualUnitProfit) {
    return parsedManualUnitProfit;
  }

  const effectiveSalePrice = Math.max(0, Number(salePrice || 0));
  const commission = Math.max(0, normalizeCommissionPercent(item?.commission_percentage));
  const costPrice = Math.max(0, Number(item?.cost_price || 0));
  const retailPrice = Math.max(
    0,
    Number(item?.retail_price || effectiveSalePrice || 0)
  );

  if (retailPrice > 0 && costPrice > 0) {
    return retailPrice - costPrice;
  }
  if (commission > 0) {
    return effectiveSalePrice * (commission / 100);
  }
  if (costPrice > 0) {
    return effectiveSalePrice - costPrice;
  }

  return getUnitProfitFromProductDoc(product, effectiveSalePrice);
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
    const explicitName = String(order.customer_name || "").trim();
    const dateValue = toDate(order.created_at);
    return {
      id: order.id,
      orderNumber: `#${order.id.slice(0, 6).toUpperCase()}`,
      customer: explicitName || (email ? customerNameFromEmail(email) : "Guest"),
      email: email || "-",
      date: dateValue.toLocaleDateString(),
      paymentStatus: derivePaymentStatus(order.status),
      fulfillmentStatus: deriveFulfillmentStatus(order.fulfillment_status, order.status),
      shipmentStatus: deriveShipmentStatus(order.status),
      location: getOrderLocationLabel(order),
      total: Number(order.total || 0),
      tags: [String(order.status || "pending")],
    };
  });
};

export const mapCustomers = (
  users: AdminUserDoc[],
  orders: AdminOrderDoc[]
): CustomerRow[] => {
  const usersById = new Map<string, AdminUserDoc>();
  const usersByEmail = new Map<string, AdminUserDoc>();

  users.forEach((entry) => {
    const id = String(entry.id || "").trim();
    const email = String(entry.email || "").trim().toLowerCase();
    if (id) usersById.set(id, entry);
    if (email) usersByEmail.set(email, entry);
  });

  const rowsByKey = new Map<
    string,
    {
      id: string;
      name: string;
      email: string;
      location: string;
      spend: number;
      orderCount: number;
      hasAccount: boolean;
    }
  >();

  const nameFromUser = (user: AdminUserDoc | undefined, fallbackEmail: string, fallbackName: string) => {
    const profileName = String(
      `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
        user?.displayName ||
        ""
    ).trim();
    if (profileName) return profileName;
    if (fallbackName) return fallbackName;
    if (fallbackEmail) return customerNameFromEmail(fallbackEmail);
    return "Guest";
  };

  orders.forEach((order) => {
    const normalizedEmail = String(order.user_email || "").trim().toLowerCase();
    const normalizedUserId = String(order.user_id || "").trim();
    const matchedUser =
      (normalizedUserId && usersById.get(normalizedUserId)) ||
      (normalizedEmail ? usersByEmail.get(normalizedEmail) : undefined);
    const hasAccount = Boolean(matchedUser || normalizedUserId);
    const key = hasAccount
      ? `account:${String(matchedUser?.id || normalizedUserId || normalizedEmail)}`
      : normalizedEmail
        ? `guest-email:${normalizedEmail}`
        : `guest-order:${order.id}`;

    const fallbackName = String(order.customer_name || "").trim();
    const name = nameFromUser(matchedUser, normalizedEmail, fallbackName);
    const profileLocation = [matchedUser?.city, matchedUser?.state, matchedUser?.country]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(", ");
    const orderLocation = getOrderLocationLabel(order);
    const location = profileLocation || (orderLocation !== "-" ? orderLocation : "-");
    const amount = Number(order.total || 0);

    const existing = rowsByKey.get(key);
    if (existing) {
      existing.spend += amount;
      existing.orderCount += 1;
      if (existing.location === "-" && location !== "-") existing.location = location;
      return;
    }

    rowsByKey.set(key, {
      id: String(matchedUser?.id || key),
      name,
      email: normalizedEmail || String(matchedUser?.email || "").trim().toLowerCase() || "-",
      location,
      spend: amount,
      orderCount: 1,
      hasAccount,
    });
  });

  users.forEach((entry) => {
    const id = String(entry.id || "").trim();
    if (!id) return;
    const exists = Array.from(rowsByKey.values()).some((row) => row.id === id);
    if (exists) return;

    const email = String(entry.email || "").trim().toLowerCase();
    const name = nameFromUser(entry, email, "");
    const profileLocation = [entry.city, entry.state, entry.country]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(", ");

    rowsByKey.set(`account:${id}`, {
      id,
      name,
      email: email || "-",
      location: profileLocation || "-",
      spend: 0,
      orderCount: 0,
      hasAccount: true,
    });
  });

  return Array.from(rowsByKey.values())
    .sort((a, b) => b.spend - a.spend)
    .map((row) => ({
      ...row,
      tags: [row.hasAccount ? "Has account" : "No account"],
    }));
};

export const buildDashboardKpis = (
  orders: AdminOrderDoc[],
  products: AdminProductDoc[]
): KpiMetric[] => {
  const activeOrders = orders.filter((order) => order.status !== "cancelled");
  const grossSales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const netRevenue = activeOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const productById = buildProductById(products);
  const estimatedProfit = activeOrders.reduce(
    (sum, order) => sum + getOrderProfit(order, productById),
    0
  );
  const profitMargin = netRevenue > 0 ? (estimatedProfit / netRevenue) * 100 : 0;

  return [
    {
      label: "Gross sales",
      value: numberFormatter.format(grossSales),
      delta: `${orders.length} total orders`,
      trend: grossSales > 0 ? "up" : "down",
    },
    {
      label: "Net revenue",
      value: numberFormatter.format(netRevenue),
      delta: `${activeOrders.length} non-cancelled orders`,
      trend: netRevenue > 0 ? "up" : "down",
    },
    {
      label: "Estimated profit",
      value: numberFormatter.format(estimatedProfit),
      delta: `${percentageFormatter.format(profitMargin)}% margin`,
      trend: estimatedProfit > 0 ? "up" : "down",
    },
    {
      label: "Orders",
      value: String(orders.length),
      delta: `${products.length} products in catalog`,
      trend: orders.length > 0 ? "up" : "down",
    },
  ];
};
