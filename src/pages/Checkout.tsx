import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { Truck, Wallet } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { readGuestCart, writeGuestCart } from "../lib/cart";
import { formatPrice } from "../lib/storefront";
import { toFastImageUrl } from "../lib/image";
import { Button } from "../components/storefront/Button";
import { placeOrderWithInventory } from "../lib/orderLogic";
import type { PaymentMethod } from "../lib/orderLogic";

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

export function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartEntries, setCartEntries] = useState<CartEntry[]>([]);
  const [productsById, setProductsById] = useState<Map<string, CartItem["product"]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("cash_on_delivery");
  const [checkoutForm, setCheckoutForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    directions: "",
    details: "",
    city: "",
  });

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
        return { ...entry, product } as CartItem;
      })
      .filter((item): item is CartItem => item !== null);
    setItems(nextItems);
  }, [cartEntries, productsById]);

  useEffect(() => {
    if (!user) return;
    const unsubscribeUser = onSnapshot(
      doc(db, "users", user.uid),
      (userSnap) => {
        const data = userSnap.exists() ? userSnap.data() : {};
        setCheckoutForm((prev) => ({
          ...prev,
          name: String(
            `${data?.firstName || ""} ${data?.lastName || ""}`.trim() ||
              user.displayName ||
              prev.name
          ),
          email: String(user.email || prev.email),
          phone: String(
            `${data?.countryCode || ""} ${data?.phone || ""}`.trim() || prev.phone
          ),
          address: String(data?.address || prev.address),
          directions: String(data?.directions || prev.directions),
          details: String(data?.addressDetails || prev.details),
          city: String(data?.city || prev.city),
        }));
      },
      () => {
        setCheckoutForm((prev) => ({
          ...prev,
          email: String(user.email || prev.email),
        }));
      }
    );
    return () => unsubscribeUser();
  }, [user]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [items]
  );
  const shipping = subtotal > 120 || items.length === 0 ? 0 : 4;
  const total = subtotal + shipping;
  const canPlaceOrder = useMemo(() => {
    if (items.length === 0) return false;
    const requiredFields: Array<keyof typeof checkoutForm> = [
      "name",
      "email",
      "phone",
      "address",
      "directions",
      "city",
    ];
    const hasAllRequired = requiredFields.every((field) =>
      String(checkoutForm[field] || "").trim()
    );
    if (!hasAllRequired) return false;
    const normalizedEmail = String(checkoutForm.email || "").trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  }, [checkoutForm, items.length]);

  const handlePlaceOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (items.length === 0) {
      setCheckoutError("Your cart is empty.");
      return;
    }

    const requiredChecks: Array<[keyof typeof checkoutForm, string]> = [
      ["name", "Name is required."],
      ["email", "Email is required."],
      ["phone", "Phone is required."],
      ["address", "Street is required."],
      ["directions", "Apartment, suite, etc. is required."],
      ["city", "City is required."],
    ];
    for (const [field, message] of requiredChecks) {
      if (!String(checkoutForm[field] || "").trim()) {
        setCheckoutError(message);
        return;
      }
    }

    const normalizedEmail = String(checkoutForm.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setCheckoutError("Please enter a valid email address.");
      return;
    }

    try {
      setPlacingOrder(true);
      setCheckoutError("");
      const apartmentLine = checkoutForm.directions.trim();
      const detailsLine = checkoutForm.details.trim();
      const directionsForOrder = detailsLine
        ? `${apartmentLine}\nDetails: ${detailsLine}`
        : apartmentLine;

      const orderItems = items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product.name,
        product_image: item.product.image_url,
        category: item.product.category || "",
        size: item.size,
        quantity: item.quantity,
        price: Number(item.product.price || 0),
      }));

      const orderId = await placeOrderWithInventory({
        userId: user?.uid || null,
        userEmail: normalizedEmail,
        customerName: checkoutForm.name.trim(),
        phone: checkoutForm.phone.trim(),
        address: checkoutForm.address.trim(),
        directions: directionsForOrder,
        city: checkoutForm.city.trim(),
        country: "Lebanon",
        shippingAddress: checkoutForm.address.trim(),
        items: orderItems,
        subtotal,
        shipping,
        tax: 0,
        total,
        cartDocIds: user ? items.map((item) => item.id) : [],
        paymentMethod,
        paymentStatus: "pending",
      });

      const payload = {
        orderId,
        name: checkoutForm.name.trim(),
        email: normalizedEmail,
        phone: checkoutForm.phone.trim(),
        address: checkoutForm.address.trim(),
        directions: directionsForOrder,
        details: detailsLine,
        city: checkoutForm.city.trim(),
        country: "Lebanon",
        subtotal,
        shipping,
        tax: 0,
        total,
        items: orderItems.map((item) => ({
          name: item.product_name,
          size: item.size,
          quantity: item.quantity,
          unitPrice: item.price,
        })),
        orderedAt: new Date().toISOString(),
      };

      await Promise.allSettled([
        fetch("/api/send-order-discord", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        fetch("/api/send-order-confirmation-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      ]);

      if (!user) {
        writeGuestCart([]);
      }

      navigate(user ? "/profile#my-orders" : "/shop");
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Failed to place order."
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="store-container py-10">
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-[var(--sf-radius-lg)] bg-[var(--sf-bg-soft)]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="store-container py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-[var(--sf-text)]">
          Your cart is empty
        </h1>
        <p className="mt-2 text-sm text-[var(--sf-text-muted)]">
          Add products before continuing to checkout.
        </p>
        <Link
          to="/shop"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-[10px] bg-[var(--sf-accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--sf-accent-hover)]"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="store-container pb-10 pt-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-text-muted)]">
            Secure Checkout
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-[var(--sf-text)] md:text-4xl">
            Shipping & Payment
          </h1>
        </div>
        <Link
          to="/cart"
          className="rounded-[10px] border border-[var(--sf-line)] px-3.5 py-2 text-sm text-[var(--sf-text)] hover:bg-[var(--sf-bg-soft)]"
        >
          Back to Cart
        </Link>
      </div>

      <form onSubmit={handlePlaceOrder} className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <section className="rounded-[12px] border border-[var(--sf-line)] bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--sf-text-muted)]">
              Contact Information
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--sf-text-muted)]">Full name</span>
                <input
                  className="w-full rounded-[10px] border border-[var(--sf-line)] px-3 py-2.5 text-sm"
                  value={checkoutForm.name}
                  onChange={(e) =>
                    setCheckoutForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--sf-text-muted)]">Email</span>
                <input
                  type="email"
                  className="w-full rounded-[10px] border border-[var(--sf-line)] px-3 py-2.5 text-sm"
                  value={checkoutForm.email}
                  onChange={(e) =>
                    setCheckoutForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="text-[var(--sf-text-muted)]">Phone</span>
                <input
                  className="w-full rounded-[10px] border border-[var(--sf-line)] px-3 py-2.5 text-sm"
                  value={checkoutForm.phone}
                  onChange={(e) =>
                    setCheckoutForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  required
                />
              </label>
            </div>
          </section>

          <section className="rounded-[12px] border border-[var(--sf-line)] bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--sf-text-muted)]">
              Shipping Address
            </h2>
            <div className="mt-3 space-y-3">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--sf-text-muted)]">Street</span>
                <input
                  className="w-full rounded-[10px] border border-[var(--sf-line)] px-3 py-2.5 text-sm"
                  value={checkoutForm.address}
                  onChange={(e) =>
                    setCheckoutForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--sf-text-muted)]">Apartment, suite, etc.</span>
                <input
                  className="w-full rounded-[10px] border border-[var(--sf-line)] px-3 py-2.5 text-sm"
                  value={checkoutForm.directions}
                  onChange={(e) =>
                    setCheckoutForm((prev) => ({ ...prev, directions: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--sf-text-muted)]">Details (optional)</span>
                <input
                  className="w-full rounded-[10px] border border-[var(--sf-line)] px-3 py-2.5 text-sm"
                  value={checkoutForm.details}
                  onChange={(e) =>
                    setCheckoutForm((prev) => ({ ...prev, details: e.target.value }))
                  }
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--sf-text-muted)]">City</span>
                  <input
                    className="w-full rounded-[10px] border border-[var(--sf-line)] px-3 py-2.5 text-sm"
                    value={checkoutForm.city}
                    onChange={(e) =>
                      setCheckoutForm((prev) => ({ ...prev, city: e.target.value }))
                    }
                    required
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-[12px] border border-[var(--sf-line)] bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--sf-text-muted)]">
              Shipping Method
            </h2>
            <div className="mt-3 flex items-center justify-between rounded-[10px] border border-[var(--sf-line)] bg-[var(--sf-bg-soft)] p-3">
              <div className="flex items-center gap-3">
                <Truck size={16} className="text-[var(--sf-accent)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--sf-text)]">Standard Delivery</p>
                  <p className="text-xs text-[var(--sf-text-muted)]">1-3 business days</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-[var(--sf-text)]">{formatPrice(shipping)}</p>
            </div>
          </section>

          <section className="rounded-[12px] border border-[var(--sf-line)] bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--sf-text-muted)]">
              Payment Method
            </h2>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("cash_on_delivery")}
                className={`flex items-center justify-between rounded-[10px] border p-3 text-left ${
                  paymentMethod === "cash_on_delivery"
                    ? "border-[var(--sf-accent)] bg-[var(--sf-bg-soft)]"
                    : "border-[var(--sf-line)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wallet size={16} className="text-[var(--sf-accent)]" />
                  <span className="text-sm font-semibold text-[var(--sf-text)]">Cash on Delivery</span>
                </div>
                <span className="text-xs text-[var(--sf-text-muted)]">Default</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("whish_money")}
                className={`flex items-center justify-between rounded-[10px] border p-3 text-left ${
                  paymentMethod === "whish_money"
                    ? "border-[var(--sf-accent)] bg-[var(--sf-bg-soft)]"
                    : "border-[var(--sf-line)]"
                }`}
              >
                <span className="text-sm font-semibold text-[var(--sf-text)]">Whish Money</span>
                <span className="text-xs text-[var(--sf-text-muted)]">Pay on confirmation</span>
              </button>
            </div>
          </section>
        </div>

        <aside className="h-fit space-y-4 rounded-[12px] border border-[var(--sf-line)] bg-white p-4 lg:sticky lg:top-28">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--sf-text-muted)]">
            Order Summary
          </h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <img
                  src={toFastImageUrl(item.product.image_url, 240)}
                  alt={item.product.name}
                  className="h-14 w-12 rounded-[8px] border border-[var(--sf-line)] object-cover"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--sf-text)]">{item.product.name}</p>
                  <p className="text-xs text-[var(--sf-text-muted)]">{item.size} · Qty {item.quantity}</p>
                </div>
                <p className="text-sm font-semibold text-[var(--sf-text)]">
                  {formatPrice(item.product.price * item.quantity)}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-1 border-t border-[var(--sf-line)] pt-3 text-sm">
            <div className="flex items-center justify-between text-[var(--sf-text-muted)]">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-[var(--sf-text-muted)]">
              <span>Shipping</span>
              <span>{formatPrice(shipping)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-base font-semibold text-[var(--sf-text)]">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>

          {checkoutError ? (
            <p className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {checkoutError}
            </p>
          ) : null}

          <p className="text-xs leading-5 text-[var(--sf-text-muted)]">
            By placing your order, you agree to our terms and acknowledge that we may
            contact you to confirm delivery.
          </p>

          <Button type="submit" fullWidth size="lg" disabled={placingOrder || !canPlaceOrder}>
            {placingOrder ? "Placing order..." : "Place Order"}
          </Button>
        </aside>
      </form>
    </div>
  );
}
