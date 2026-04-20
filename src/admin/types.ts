import type { LucideIcon } from "lucide-react";

export type NavKey =
  | "dashboard"
  | "orders"
  | "products"
  | "customers"
  | "collections"
  | "analytics"
  | "sales"
  | "campaigns"
  | "discounts"
  | "settings";

export interface NavItem {
  key: NavKey;
  label: string;
  icon: LucideIcon;
  href: string;
}

export type OrderPaymentStatus = "paid" | "pending" | "refunded";
export type OrderFulfillmentStatus = "fulfilled" | "processing" | "unfulfilled";
export type OrderShipmentStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface OrderRow {
  id: string;
  orderNumber: string;
  customer: string;
  email: string;
  date: string;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  shipmentStatus: OrderShipmentStatus;
  total: number;
  tags: string[];
}

export type ProductStatus = "active" | "draft" | "archived";

export interface ProductRow {
  id: string;
  title: string;
  sku: string;
  thumbnail: string;
  inventory: number;
  price: number;
  status: ProductStatus;
  category: string;
  variants: string[];
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  location: string;
  spend: number;
  orderCount: number;
  tags: string[];
}

export interface DiscountRow {
  id: string;
  code: string;
  type: "amount" | "percent";
  usage: string;
  status: "active" | "scheduled" | "expired";
}

export interface KpiMetric {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  done: boolean;
}

export interface SavedView {
  id: string;
  label: string;
}
