import type {
  ChecklistItem,
  CustomerRow,
  DiscountRow,
  KpiMetric,
  OrderRow,
  ProductRow,
  SavedView,
} from "../types";

export const dashboardKpis: KpiMetric[] = [
  { label: "Net sales", value: "$128,430", delta: "+8.4% vs last period", trend: "up" },
  { label: "Orders", value: "1,254", delta: "+5.1% vs last period", trend: "up" },
  { label: "Conversion", value: "2.86%", delta: "-0.3% vs last period", trend: "down" },
  { label: "Average order value", value: "$102.42", delta: "+2.2% vs last period", trend: "up" },
];

export const orders: OrderRow[] = [
  {
    id: "ord-9012",
    orderNumber: "#9012",
    customer: "Nora Haddad",
    email: "nora@trailmail.com",
    location: "Beirut, Lebanon",
    date: "2026-04-20",
    paymentStatus: "paid",
    fulfillmentStatus: "processing",
    shipmentStatus: "processing",
    total: 189,
    tags: ["VIP", "Express"],
  },
  {
    id: "ord-9011",
    orderNumber: "#9011",
    customer: "Karim Salem",
    email: "karim.salem@example.com",
    location: "Tripoli, Lebanon",
    date: "2026-04-20",
    paymentStatus: "pending",
    fulfillmentStatus: "unfulfilled",
    shipmentStatus: "pending",
    total: 64,
    tags: ["First-order"],
  },
  {
    id: "ord-9010",
    orderNumber: "#9010",
    customer: "Maya Farah",
    email: "maya.farah@example.com",
    location: "Jounieh, Lebanon",
    date: "2026-04-19",
    paymentStatus: "paid",
    fulfillmentStatus: "fulfilled",
    shipmentStatus: "delivered",
    total: 312,
    tags: ["Retail"],
  },
  {
    id: "ord-9009",
    orderNumber: "#9009",
    customer: "Omar Nassar",
    email: "omar.nassar@example.com",
    location: "Saida, Lebanon",
    date: "2026-04-19",
    paymentStatus: "refunded",
    fulfillmentStatus: "fulfilled",
    shipmentStatus: "cancelled",
    total: 110,
    tags: ["Return"],
  },
  {
    id: "ord-9008",
    orderNumber: "#9008",
    customer: "Lea Khoury",
    email: "lea.khoury@example.com",
    location: "Tyre, Lebanon",
    date: "2026-04-18",
    paymentStatus: "paid",
    fulfillmentStatus: "processing",
    shipmentStatus: "processing",
    total: 224,
    tags: ["Bundle"],
  },
  {
    id: "ord-9007",
    orderNumber: "#9007",
    customer: "Rayan Obeid",
    email: "rayan.obeid@example.com",
    location: "Zahle, Lebanon",
    date: "2026-04-18",
    paymentStatus: "paid",
    fulfillmentStatus: "fulfilled",
    shipmentStatus: "shipped",
    total: 76,
    tags: ["Wholesale"],
  },
];

export const products: ProductRow[] = [
  {
    id: "prd-101",
    title: "AeroFlex Performance Tee",
    sku: "AF-TEE-001",
    thumbnail:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=300&q=80",
    inventory: 123,
    price: 48,
    status: "active",
    category: "Tops",
    variants: ["S", "M", "L", "XL"],
  },
  {
    id: "prd-102",
    title: "Velocity Compression Shorts",
    sku: "VC-SHORT-004",
    thumbnail:
      "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=300&q=80",
    inventory: 42,
    price: 56,
    status: "active",
    category: "Bottoms",
    variants: ["S", "M", "L"],
  },
  {
    id: "prd-103",
    title: "Stride Light Windbreaker",
    sku: "SL-WIND-011",
    thumbnail:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&q=80",
    inventory: 9,
    price: 120,
    status: "draft",
    category: "Outerwear",
    variants: ["M", "L", "XL"],
  },
  {
    id: "prd-104",
    title: "Core Motion Hoodie",
    sku: "CM-HOOD-020",
    thumbnail:
      "https://images.unsplash.com/photo-1618354691229-88d47f285158?auto=format&fit=crop&w=300&q=80",
    inventory: 0,
    price: 92,
    status: "archived",
    category: "Outerwear",
    variants: ["S", "M", "L", "XL", "XXL"],
  },
  {
    id: "prd-105",
    title: "Peak Utility Joggers",
    sku: "PU-JOG-015",
    thumbnail:
      "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&w=300&q=80",
    inventory: 67,
    price: 74,
    status: "active",
    category: "Bottoms",
    variants: ["S", "M", "L", "XL"],
  },
];

export const customers: CustomerRow[] = [
  {
    id: "cus-01",
    name: "Lana Rahme",
    email: "lana.rahme@example.com",
    location: "Beirut, LB",
    spend: 820,
    orderCount: 8,
    tags: ["VIP"],
  },
  {
    id: "cus-02",
    name: "Ziad Tohme",
    email: "ziad.tohme@example.com",
    location: "Dubai, AE",
    spend: 364,
    orderCount: 3,
    tags: ["Newsletter"],
  },
  {
    id: "cus-03",
    name: "Hiba Nader",
    email: "hiba.nader@example.com",
    location: "Doha, QA",
    spend: 1_420,
    orderCount: 11,
    tags: ["Loyal"],
  },
];

export const discounts: DiscountRow[] = [
  { id: "dis-01", code: "SPRING20", type: "percent", usage: "124 uses", status: "active" },
  { id: "dis-02", code: "WELCOME10", type: "amount", usage: "66 uses", status: "active" },
  { id: "dis-03", code: "TEAMDROP", type: "percent", usage: "Scheduled", status: "scheduled" },
];

export const setupChecklist: ChecklistItem[] = [
  {
    id: "task-1",
    title: "Add your brand policies",
    description: "Set return, shipping, and exchange policy pages.",
    done: true,
  },
  {
    id: "task-2",
    title: "Configure shipping zones",
    description: "Set local and international shipping profiles.",
    done: false,
  },
  {
    id: "task-3",
    title: "Connect analytics destination",
    description: "Link your ad platform and data warehouse.",
    done: false,
  },
];

export const orderSavedViews: SavedView[] = [
  { id: "all", label: "All orders" },
  { id: "open", label: "Open" },
  { id: "unfulfilled", label: "Needs fulfillment" },
  { id: "returns", label: "Returns" },
];

export const productSavedViews: SavedView[] = [
  { id: "all", label: "All products" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "low", label: "Low stock" },
];
