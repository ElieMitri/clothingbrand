import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { readGuestCart, writeGuestCart } from "../lib/cart";
import { formatPrice } from "../lib/storefront";
import { toFastImageUrl } from "../lib/image";
import { Button } from "../components/storefront/Button";

interface CartItem {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  product: {
    name: string;
    price: number;
    image_url: string;
    category?: string;
  };
}

interface CartEntry {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
}

export function Cart() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cartEntries, setCartEntries] = useState<CartEntry[]>([]);
  const [productsById, setProductsById] = useState<Map<string, CartItem["product"]>>(new Map());
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeProducts = onSnapshot(collection(db, "products"), (snapshot) => {
      const map = new Map<string, CartItem["product"]>();
      snapshot.docs.forEach((entry) => {
        const data = entry.data();
        map.set(entry.id, {
          name: String(data.name || "Product"),
          price: Number(data.price || 0),
          image_url: String(data.image_url || ""),
          category: String(data.category || ""),
        });
      });
      setProductsById(map);
    });

    return () => unsubscribeProducts();
  }, []);

  useEffect(() => {
    setLoading(true);
    if (!user) {
      const syncGuestEntries = () => {
        const guestEntries = readGuestCart();
        setCartEntries(
          guestEntries.map((entry) => ({
            id: `${entry.product_id}__${entry.size}`,
            product_id: entry.product_id,
            size: entry.size,
            quantity: entry.quantity,
          }))
        );
        setLoading(false);
      };

      syncGuestEntries();
      window.addEventListener("guest-cart-updated", syncGuestEntries);
      window.addEventListener("storage", syncGuestEntries);
      return () => {
        window.removeEventListener("guest-cart-updated", syncGuestEntries);
        window.removeEventListener("storage", syncGuestEntries);
      };
    }

    const q = query(collection(db, "carts"), where("user_id", "==", user.uid));
    const unsubscribeCarts = onSnapshot(
      q,
      (snapshot) => {
        setCartEntries(
          snapshot.docs.map((entry) => {
            const data = entry.data();
            return {
              id: entry.id,
              product_id: String(data.product_id || ""),
              size: String(data.size || "M"),
              quantity: Number(data.quantity || 1),
            } as CartEntry;
          })
        );
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsubscribeCarts();
  }, [user]);

  useEffect(() => {
    const nextItems = cartEntries
      .map((entry) => {
        const product = productsById.get(entry.product_id);
        if (!product) return null;
        return {
          ...entry,
          product,
        } as CartItem;
      })
      .filter((item): item is CartItem => item !== null);
    setItems(nextItems);
  }, [cartEntries, productsById]);

  const updateQuantity = async (itemId: string, nextQuantity: number) => {
    if (nextQuantity < 1) return;

    setUpdatingId(itemId);
    try {
      if (user) {
        await updateDoc(doc(db, "carts", itemId), { quantity: nextQuantity });
      } else {
        const guestEntries = readGuestCart();
        const updated = guestEntries.map((entry) =>
          `${entry.product_id}__${entry.size}` === itemId
            ? { ...entry, quantity: nextQuantity }
            : entry
        );
        writeGuestCart(updated);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const removeItem = async (itemId: string) => {
    setUpdatingId(itemId);
    try {
      if (user) {
        await deleteDoc(doc(db, "carts", itemId));
      } else {
        const guestEntries = readGuestCart();
        const updated = guestEntries.filter(
          (entry) => `${entry.product_id}__${entry.size}` !== itemId
        );
        writeGuestCart(updated);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [items]
  );
  const shipping = subtotal > 120 || items.length === 0 ? 0 : 4;
  const total = subtotal + shipping;

  if (loading) {
    return (
      <div className="store-container py-10">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[var(--sf-radius-lg)] bg-[var(--sf-bg-soft)]" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="store-container py-20">
        <div className="mx-auto flex max-w-lg flex-col items-center rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-white p-8 text-center shadow-[var(--sf-shadow-sm)]">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--sf-bg-soft)] text-[var(--sf-accent)]">
            <ShoppingBag size={24} />
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold">Your Cart Is Empty</h1>
          <p className="mt-3 text-sm text-[var(--sf-text-muted)]">Start building your premium athletic kit.</p>
          <Link
            to="/shop"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-[10px] bg-[var(--sf-accent)] px-6 text-sm font-semibold text-white hover:bg-[var(--sf-accent-hover)]"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="store-container pb-8 pt-8">
      <h1 className="font-display text-4xl font-bold">Cart</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="store-card flex gap-3 p-3 md:p-4">
              <img
                src={toFastImageUrl(item.product.image_url, 320)}
                alt={item.product.name}
                className="h-24 w-20 rounded-[10px] border border-[var(--sf-line)] object-cover md:h-28 md:w-24"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />

              <div className="flex flex-1 flex-col justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-[var(--sf-text-muted)]">{item.product.category || "Apparel"}</p>
                  <Link to={`/product/${item.product_id}`} className="text-sm font-semibold text-[var(--sf-text)] hover:text-[var(--sf-accent)] md:text-base">
                    {item.product.name}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--sf-text-muted)]">Size: {item.size}</p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center rounded-[10px] border border-[var(--sf-line)]">
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      disabled={updatingId === item.id}
                    >
                      <Minus size={15} />
                    </button>
                    <span className="inline-flex min-w-8 justify-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      disabled={updatingId === item.id}
                    >
                      <Plus size={15} />
                    </button>
                  </div>

                  <div className="flex items-center gap-4">
                    <p className="text-sm font-semibold text-[var(--sf-text)]">
                      {formatPrice(item.product.price * item.quantity)}
                    </p>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--sf-line)] text-[var(--sf-text-muted)] hover:text-[var(--sf-danger)]"
                      onClick={() => removeItem(item.id)}
                      disabled={updatingId === item.id}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>

        <aside className="store-card h-fit p-5 lg:sticky lg:top-28">
          <h2 className="text-lg font-semibold text-[var(--sf-text)]">Order Summary</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between text-[var(--sf-text-muted)]">
              <span>Subtotal</span>
              <span className="text-[var(--sf-text)]">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-[var(--sf-text-muted)]">
              <span>Shipping</span>
              <span className="text-[var(--sf-text)]">{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--sf-line)] pt-3 text-base font-semibold text-[var(--sf-text)]">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>

          <Button
            fullWidth
            size="lg"
            className="mt-5"
            onClick={() => navigate("/checkout")}
          >
            Proceed to Checkout
          </Button>
          <p className="mt-3 text-xs text-[var(--sf-text-muted)]">
            Secure checkout with trusted payment methods.
          </p>
        </aside>
      </div>
    </div>
  );
}
