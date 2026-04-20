import type { ChecklistItem, SavedView } from "../types";

export const orderSavedViews: SavedView[] = [
  { id: "all", label: "All orders" },
  { id: "pending", label: "Pending" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
];

export const productSavedViews: SavedView[] = [
  { id: "all", label: "All products" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "low", label: "Low stock" },
];

export const setupChecklist: ChecklistItem[] = [
  {
    id: "task-1",
    title: "Review store policy pages",
    description: "Confirm returns, shipping, and exchange policy copy.",
    done: true,
  },
  {
    id: "task-2",
    title: "Validate shipping profiles",
    description: "Ensure zones and rates are correct for active markets.",
    done: false,
  },
  {
    id: "task-3",
    title: "Audit tracking integrations",
    description: "Check events and ad platform sync health.",
    done: false,
  },
];
