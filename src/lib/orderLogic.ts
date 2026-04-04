import { db } from "./firebase";
import {
  Timestamp,
  collection,
  doc,
  runTransaction,
} from "firebase/firestore";

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
  userId: string;
  userEmail?: string | null;
  items: OrderLineItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  cartDocIds: string[];
}

interface UpdateOrderStatusInput {
  orderId: string;
  userId?: string;
  items: OrderLineItem[];
  newStatus: OrderStatus;
  statusNote?: string;
}

const RESTOCK_STATUSES = new Set<OrderStatus>(["cancelled"]);
const STOCK_CONSUMING_STATUSES = new Set<OrderStatus>([
  "pending",
  "processing",
  "shipped",
  "delivered",
]);
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["pending", "processing", "cancelled"],
  processing: ["processing", "shipped"],
  shipped: ["shipped", "delivered"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
};

const normalizeSizeKey = (size?: string) => (size || "").trim();

interface ProductSizeQty {
  productId: string;
  size: string;
  quantity: number;
}

const buildProductSizeQuantities = (items: OrderLineItem[]) => {
  const qtyByKey = new Map<string, ProductSizeQty>();

  items.forEach((item) => {
    const productId = item.product_id;
    const size = normalizeSizeKey(item.size);
    const quantity = Number(item.quantity || 0);
    const key = `${productId}__${size}`;

    const existing = qtyByKey.get(key);
    if (existing) {
      existing.quantity += quantity;
      return;
    }

    qtyByKey.set(key, { productId, size, quantity });
  });

  return Array.from(qtyByKey.values());
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
  const userOrderRef = doc(db, "users", userId, "orders", orderRef.id);
  const productSizeQuantities = buildProductSizeQuantities(items);
  const now = Timestamp.now();

  await runTransaction(db, async (transaction) => {
    for (const entry of productSizeQuantities) {
      const { productId, size, quantity } = entry;
      const productRef = doc(db, "products", productId);
      const productSnap = await transaction.get(productRef);

      if (!productSnap.exists()) {
        throw new Error("One of the products no longer exists.");
      }

      const productData = productSnap.data();
      const sizeStock = (productData.size_stock || {}) as Record<string, unknown>;
      const hasSizeStock = Object.keys(sizeStock).length > 0 && Boolean(size);
      const currentSizeStock = Number(sizeStock[size] || 0);
      const currentStock = Number(productData.stock || 0);

      if (hasSizeStock) {
        if (currentSizeStock < quantity) {
          const productName = String(productData.name || "product");
          throw new Error(
            `Insufficient stock for ${productName} (${size}). Available: ${currentSizeStock}, requested: ${quantity}.`
          );
        }
      } else if (currentStock < quantity) {
        const productName = String(productSnap.data().name || "product");
        throw new Error(
          `Insufficient stock for ${productName}. Available: ${currentStock}, requested: ${quantity}.`
        );
      }

      if (hasSizeStock) {
        const nextSizeStock = {
          ...sizeStock,
          [size]: currentSizeStock - quantity,
        };
        const nextTotalStock = Object.values(nextSizeStock).reduce(
          (sum, value) => sum + Number(value || 0),
          0
        );
        transaction.update(productRef, {
          size_stock: nextSizeStock,
          stock: nextTotalStock,
          updated_at: now,
        });
      } else {
        transaction.update(productRef, {
          stock: currentStock - quantity,
          updated_at: now,
        });
      }
    }

    const orderData = {
      user_id: userId,
      user_email: userEmail || null,
      items,
      subtotal,
      shipping,
      tax,
      total,
      status: "pending" as OrderStatus,
      stock_deducted: true,
      stock_restored: false,
      created_at: now,
      updated_at: now,
    };

    transaction.set(orderRef, orderData);
    transaction.set(userOrderRef, orderData);

    cartDocIds.forEach((cartDocId) => {
      transaction.delete(doc(db, "carts", cartDocId));
    });
  });

  return orderRef.id;
}

export async function updateOrderStatusWithInventory({
  orderId,
  userId,
  items,
  newStatus,
  statusNote,
}: UpdateOrderStatusInput): Promise<void> {
  const orderRef = doc(db, "orders", orderId);
  const userOrderRef = userId ? doc(db, "users", userId, "orders", orderId) : null;
  const productSizeQuantities = buildProductSizeQuantities(items);

  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error("Order not found.");
    }

    const orderData = orderSnap.data();
    const currentStatus = (orderData.status || "pending") as OrderStatus;
    const stockDeducted = Boolean(orderData.stock_deducted);
    const stockRestored = Boolean(orderData.stock_restored);
    const now = Timestamp.now();

    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition from "${currentStatus}" to "${newStatus}".`
      );
    }

    const shouldRestock =
      stockDeducted &&
      !stockRestored &&
      RESTOCK_STATUSES.has(newStatus) &&
      !RESTOCK_STATUSES.has(currentStatus);

    const shouldDeduct =
      STOCK_CONSUMING_STATUSES.has(newStatus) &&
      !RESTOCK_STATUSES.has(newStatus) &&
      (!stockDeducted || stockRestored);

    if (shouldRestock || shouldDeduct) {
      for (const entry of productSizeQuantities) {
        const { productId, size, quantity } = entry;
        const productRef = doc(db, "products", productId);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) continue;

        const productData = productSnap.data();
        const sizeStock = (productData.size_stock || {}) as Record<string, unknown>;
        const hasSizeStock = Object.keys(sizeStock).length > 0 && Boolean(size);
        const currentSizeStock = Number(sizeStock[size] || 0);
        const currentStock = Number(productData.stock || 0);

        if (shouldRestock) {
          if (hasSizeStock) {
            const nextSizeStock = {
              ...sizeStock,
              [size]: currentSizeStock + quantity,
            };
            const nextTotalStock = Object.values(nextSizeStock).reduce(
              (sum, value) => sum + Number(value || 0),
              0
            );
            transaction.update(productRef, {
              size_stock: nextSizeStock,
              stock: nextTotalStock,
              updated_at: now,
            });
          } else {
            transaction.update(productRef, {
              stock: currentStock + quantity,
              updated_at: now,
            });
          }
        }

        if (shouldDeduct) {
          if (hasSizeStock) {
            if (currentSizeStock < quantity) {
              throw new Error(
                `Insufficient stock to reactivate this order for size ${size}.`
              );
            }
            const nextSizeStock = {
              ...sizeStock,
              [size]: currentSizeStock - quantity,
            };
            const nextTotalStock = Object.values(nextSizeStock).reduce(
              (sum, value) => sum + Number(value || 0),
              0
            );
            transaction.update(productRef, {
              size_stock: nextSizeStock,
              stock: nextTotalStock,
              updated_at: now,
            });
          } else {
            if (currentStock < quantity) {
              throw new Error("Insufficient stock to reactivate this order.");
            }
            transaction.update(productRef, {
              stock: currentStock - quantity,
              updated_at: now,
            });
          }
        }
      }
    }

    const patch: Record<string, unknown> = {
      status: newStatus,
      updated_at: now,
    };

    if (statusNote) {
      patch.status_note = statusNote;
    }

    if (shouldRestock) {
      patch.stock_restored = true;
    }

    if (shouldDeduct) {
      patch.stock_deducted = true;
      patch.stock_restored = false;
    }

    transaction.update(orderRef, patch);
    if (userOrderRef) {
      transaction.set(userOrderRef, patch, { merge: true });
    }
  });
}
