import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

export const GUEST_CART_STORAGE_KEY = "guest_cart_items_v1";

export interface GuestCartEntry {
  product_id: string;
  size: string;
  quantity: number;
}

export const readGuestCart = (): GuestCartEntry[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(GUEST_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => ({
        product_id: String(entry?.product_id || "").trim(),
        size: String(entry?.size || "").trim(),
        quantity: Number(entry?.quantity || 0),
      }))
      .filter((entry) => entry.product_id && entry.size && entry.quantity > 0);
  } catch {
    return [];
  }
};

export const writeGuestCart = (items: GuestCartEntry[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("guest-cart-updated"));
};

export const addGuestCartItem = (
  productId: string,
  size: string,
  quantity = 1
): GuestCartEntry[] => {
  const current = readGuestCart();
  const index = current.findIndex(
    (entry) => entry.product_id === productId && entry.size === size
  );

  if (index >= 0) {
    current[index] = {
      ...current[index],
      quantity: current[index].quantity + quantity,
    };
  } else {
    current.push({ product_id: productId, size, quantity });
  }

  writeGuestCart(current);
  return current;
};

export const getGuestCartCount = () => {
  return readGuestCart().reduce((sum, entry) => sum + entry.quantity, 0);
};

export const addItemToUserCart = async (
  userId: string,
  productId: string,
  size: string,
  quantity = 1
) => {
  const cartsRef = collection(db, "carts");
  const existingQuery = query(
    cartsRef,
    where("user_id", "==", userId),
    where("product_id", "==", productId),
    where("size", "==", size)
  );
  const existingSnap = await getDocs(existingQuery);

  if (!existingSnap.empty) {
    const existing = existingSnap.docs[0];
    const currentQty = Number(existing.data().quantity || 0);
    await updateDoc(doc(db, "carts", existing.id), {
      quantity: currentQty + quantity,
    });
    return;
  }

  await addDoc(cartsRef, {
    user_id: userId,
    product_id: productId,
    size,
    quantity,
    created_at: new Date(),
  });
};
