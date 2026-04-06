import { db } from "./firebase";
import { Timestamp, collection, doc, runTransaction } from "firebase/firestore";

export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface OrderLineItem {
  product_id: string;
  product_name?: string;
  product_image?: string;
  category?: string;
  size?: string;
  quantity: number;
  price: number;
}

interface PlaceOrderInput {
  userId?: string | null;
  userEmail?: string | null;
  items: OrderLineItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  cartDocIds?: string[];
}

interface UpdateOrderStatusInput {
  orderId: string;
  userId?: string;
  items: OrderLineItem[];
  newStatus: OrderStatus;
  statusNote?: string;
  extraFields?: Record<string, unknown>;
}

interface ProcessOrderExchangeInput {
  orderId: string;
  userId?: string;
  items: OrderLineItem[];
  statusNote?: string;
}

interface ReconcileOrderItemInventoryInput {
  previousItems: OrderLineItem[];
  nextItems: OrderLineItem[];
}

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["pending", "processing", "shipped", "delivered", "cancelled"],
  processing: ["pending", "processing", "shipped", "delivered", "cancelled"],
  shipped: ["pending", "processing", "shipped", "delivered", "cancelled"],
  delivered: ["pending", "processing", "shipped", "delivered", "cancelled"],
  cancelled: ["pending", "processing", "shipped", "delivered", "cancelled"],
};

export async function placeOrderWithInventory({
  userId,
  userEmail,
  items,
  subtotal,
  shipping,
  tax,
  total,
  cartDocIds,
}: PlaceOrderInput): Promise<string> {
  const orderRef = doc(collection(db, "orders"));
  const normalizedUserId = String(userId || "").trim();
  const userOrderRef = normalizedUserId
    ? doc(db, "users", normalizedUserId, "orders", orderRef.id)
    : null;
  const now = Timestamp.now();

  await runTransaction(db, async (transaction) => {
    const orderData = {
      user_id: normalizedUserId || null,
      user_email: userEmail || null,
      items,
      subtotal,
      shipping,
      tax,
      total,
      status: "pending" as OrderStatus,
      created_at: now,
      updated_at: now,
    };

    transaction.set(orderRef, orderData);
    if (userOrderRef) {
      transaction.set(userOrderRef, orderData);
    }

    (cartDocIds || []).forEach((cartDocId) => {
      transaction.delete(doc(db, "carts", cartDocId));
    });
  });

  return orderRef.id;
}

export async function updateOrderStatusWithInventory({
  orderId,
  userId,
  newStatus,
  statusNote,
  extraFields,
}: UpdateOrderStatusInput): Promise<void> {
  const orderRef = doc(db, "orders", orderId);
  const userOrderRef = userId ? doc(db, "users", userId, "orders", orderId) : null;

  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error("Order not found.");
    }

    const orderData = orderSnap.data();
    const currentStatus = (orderData.status || "pending") as OrderStatus;
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition from "${currentStatus}" to "${newStatus}".`
      );
    }

    const patch: Record<string, unknown> = {
      status: newStatus,
      updated_at: Timestamp.now(),
    };

    if (statusNote) {
      patch.status_note = statusNote;
    }
    if (extraFields && typeof extraFields === "object") {
      Object.assign(patch, extraFields);
    }

    transaction.set(orderRef, patch, { merge: true });
    if (userOrderRef) {
      transaction.set(userOrderRef, patch, { merge: true });
    }
  });
}

export async function processOrderExchangeRestock({
  orderId,
  userId,
  statusNote,
}: ProcessOrderExchangeInput): Promise<void> {
  const orderRef = doc(db, "orders", orderId);
  const userOrderRef = userId ? doc(db, "users", userId, "orders", orderId) : null;
  const patch: Record<string, unknown> = {
    exchange_processed_at: Timestamp.now(),
    updated_at: Timestamp.now(),
    status_note: statusNote || "Exchange processed by admin.",
  };

  await runTransaction(db, async (transaction) => {
    transaction.set(orderRef, patch, { merge: true });
    if (userOrderRef) {
      transaction.set(userOrderRef, patch, { merge: true });
    }
  });
}

export async function reconcileOrderItemInventory({
  previousItems,
  nextItems,
}: ReconcileOrderItemInventoryInput): Promise<void> {
  void previousItems;
  void nextItems;
}
