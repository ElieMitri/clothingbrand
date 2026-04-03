import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  Tag,
  Truck,
  Shield,
  ChevronLeft,
} from "lucide-react";
import { db } from "../lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { placeOrderWithInventory } from "../lib/orderLogic";

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
    stock?: number;
    size_stock?: Record<string, number>;
  };
}

interface RawCartItem {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  product: {
    name: string;
    price: number;
    image_url: string;
    category?: string;
    stock?: number;
    size_stock?: Record<string, number>;
  };
}

export function Cart() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    fullName: "",
    phone: "",
    address: "",
    directions: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
  });

  useEffect(() => {
    if (user) {
      loadCart();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadCart = async () => {
    try {
      if (!user) return;

      const cartsRef = collection(db, "carts");
      const q = query(cartsRef, where("user_id", "==", user.uid));
      const querySnapshot = await getDocs(q);

      const items = await Promise.all(
        querySnapshot.docs.map(async (cartDoc) => {
          const cartData = cartDoc.data();

          // Fetch the product details
          const productRef = doc(db, "products", cartData.product_id);
          const productSnap = await getDoc(productRef);

          if (productSnap.exists()) {
            const productData = productSnap.data();
            const sizeStockMap = (productData.size_stock ||
              {}) as Record<string, number>;
            const hasSizeStock = Object.keys(sizeStockMap).length > 0;
            const sizeKey = String(cartData.size || "");
            const availableStock = hasSizeStock
              ? Number(sizeStockMap[sizeKey] || 0)
              : Number(productData.stock || 0);
            const mappedItem: RawCartItem = {
              id: cartDoc.id,
              product_id: cartData.product_id,
              size: cartData.size,
              quantity: cartData.quantity,
              product: {
                name: productData.name,
                price: productData.price,
                image_url: productData.image_url,
                category: productData.category,
                stock: availableStock,
                size_stock: hasSizeStock ? sizeStockMap : undefined,
              },
            };
            return mappedItem;
          }
          return null;
        })
      );

      // Filter out any null values (in case a product doesn't exist)
      setCartItems(items.filter((item): item is RawCartItem => item !== null));
    } catch (error) {
      console.error("Error loading cart:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;

    try {
      const currentItem = cartItems.find((item) => item.id === itemId);
      const availableStock = Number(currentItem?.product.stock || 0);

      if (availableStock > 0 && newQuantity > availableStock) {
        alert(`Only ${availableStock} units are currently in stock.`);
        return;
      }

      setUpdating(itemId);
      const cartRef = doc(db, "carts", itemId);
      await updateDoc(cartRef, { quantity: newQuantity });

      setCartItems(
        cartItems.map((item) =>
          item.id === itemId ? { ...item, quantity: newQuantity } : item
        )
      );
    } catch (error) {
      console.error("Error updating quantity:", error);
    } finally {
      setUpdating(null);
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      setUpdating(itemId);
      const cartRef = doc(db, "carts", itemId);
      await deleteDoc(cartRef);

      setCartItems(cartItems.filter((item) => item.id !== itemId));
    } catch (error) {
      console.error("Error removing item:", error);
    } finally {
      setUpdating(null);
    }
  };

  const openCheckoutForm = () => {
    if (!user || cartItems.length === 0) return;
    setCheckoutForm((prev) => ({
      ...prev,
      fullName: prev.fullName || user.displayName || "",
    }));
    setShowCheckoutForm(true);
  };

  const checkout = async () => {
    if (!user || cartItems.length === 0) return;

    const fullName = checkoutForm.fullName.trim();
    const phone = checkoutForm.phone.trim();
    const address = checkoutForm.address.trim();
    const directions = checkoutForm.directions.trim() || "-";
    const city = checkoutForm.city.trim();
    const state = checkoutForm.state.trim();
    const zipCode = checkoutForm.zipCode.trim();
    const country = checkoutForm.country.trim();

    if (!fullName || !phone || !address || !city || !state || !zipCode || !country) {
      alert("Please fill in all required shipping fields.");
      return;
    }

    try {
      setLoading(true);

      // Include product names and images for admin visibility
      const orderItems = cartItems.map((item) => ({
        product_id: item.product_id,
        product_name: item.product.name,
        product_image: item.product.image_url,
        category: item.product.category || "Uncategorized",
        size: item.size,
        quantity: item.quantity,
        price: item.product.price,
      }));

      const subtotal = cartItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
      );

      const shipping = subtotal > 100 ? 0 : 10;
      const tax = subtotal * 0.08;
      const total = subtotal + shipping + tax;

      const cartDocIds = cartItems.map((item) => item.id);

      const orderId = await placeOrderWithInventory({
        userId: user.uid,
        userEmail: user.email,
        items: orderItems,
        subtotal,
        shipping,
        tax,
        total,
        cartDocIds,
      });

      const email = String(user.email || "Not provided");
      let notificationType: "success" | "error" = "success";
      let notificationText = "Order placed. Discord notification queued.";

      try {
        const notificationPayload = {
          orderId,
          orderedAt: new Date().toISOString(),
          name: fullName,
          email,
          address,
          phone,
          directions,
          city,
          state,
          zipCode,
          country,
          subtotal,
          shipping,
          tax,
          total,
          items: orderItems.map((item) => ({
            name: item.product_name,
            size: item.size,
            quantity: item.quantity,
            unitPrice: item.price,
          })),
        };

        try {
          const response = await fetch("/api/send-order-discord", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(notificationPayload),
          });

          if (!response.ok) {
            const reason = await response.text();
            throw new Error(reason || `HTTP ${response.status}`);
          }
          notificationType = "success";
          notificationText = "Order placed. Discord notification sent.";
        } catch (endpointError) {
          const failureReason =
            endpointError instanceof Error
              ? endpointError.message
              : "Request error";
          console.error(
            "Failed to send Discord order notification via API:",
            failureReason
          );
          notificationType = "error";
          notificationText =
            "Order placed, but Discord notification failed to send.";
        }
      } catch (notificationError) {
        console.error("Discord order notification request failed:", notificationError);
        notificationType = "error";
        notificationText =
          "Order placed, but Discord notification request failed.";
      }

      setCheckoutNotice({ type: notificationType, text: notificationText });
      setShowCheckoutForm(false);
      setCheckoutForm({
        fullName: "",
        phone: "",
        address: "",
        directions: "",
        city: "",
        state: "",
        zipCode: "",
        country: "",
      });
      setTimeout(() => navigate("/orders"), 1300);
    } catch (error) {
      console.error("Error placing order:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to place order. Please try again.";
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const shipping = subtotal > 100 ? 0 : 10;
  const tax = subtotal * 0.08;
  const total = subtotal + shipping + tax;

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-300 mx-auto mb-4"></div>
          <p className="text-slate-300">Loading your cart...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShoppingBag className="text-gray-400" size={40} />
          </div>
          <h2 className="text-2xl font-light mb-4">
            Sign in to view your cart
          </h2>
          <p className="text-gray-600 mb-8">
            Please sign in to access your shopping cart and checkout.
          </p>
          <Link
            to="/login"
            className="inline-block px-8 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-3 sm:px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-black transition-colors mb-4"
          >
            <ChevronLeft size={20} />
            Continue Shopping
          </Link>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-wide">
            Shopping Cart
          </h1>
          <p className="text-gray-600 mt-2">
            {cartItems.length} {cartItems.length === 1 ? "item" : "items"} in
            your cart
          </p>
        </div>

        {checkoutNotice ? (
          <div
            className={`mb-6 rounded-xl px-4 py-3 text-sm ${
              checkoutNotice.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : "bg-rose-50 border border-rose-200 text-rose-700"
            }`}
          >
            {checkoutNotice.text}
          </div>
        ) : null}

        {cartItems.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShoppingBag className="text-gray-400" size={48} />
              </div>
              <h2 className="text-2xl font-light mb-4">Your cart is empty</h2>
              <p className="text-gray-600 mb-8">
                Looks like you haven't added anything to your cart yet.
              </p>
              <Link
                to="/shop"
                className="inline-flex items-center gap-2 px-8 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors"
              >
                Start Shopping
                <ArrowRight size={20} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-5 sm:gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {cartItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 transition-all hover:shadow-md"
                >
                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                    {/* Product Image */}
                    <Link
                      to={`/product/${item.product_id}`}
                      className="w-full sm:w-28 h-48 sm:h-36 bg-gray-100 rounded-xl flex-shrink-0 overflow-hidden group"
                    >
                      <img
                        src={item.product.image_url}
                        alt={item.product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </Link>

                    {/* Product Info */}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <Link
                              to={`/product/${item.product_id}`}
                            className="font-medium text-base sm:text-lg hover:text-gray-600 transition-colors break-words"
                            >
                              {item.product.name}
                            </Link>
                            {item.product.category && (
                              <p className="text-sm text-gray-500 mt-1">
                                {item.product.category}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            disabled={updating === item.id}
                            className="text-gray-400 hover:text-red-600 transition-colors p-2 disabled:opacity-50"
                            title="Remove item"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                          <span className="px-3 py-1 bg-gray-100 rounded-lg">
                            Size: {item.size}
                          </span>
                        </div>

                        <p className="text-xl font-semibold text-gray-900">
                          ${item.product.price.toFixed(2)}
                        </p>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-sm text-gray-600">
                            Quantity:
                          </span>
                          <div className="flex items-center border-2 border-gray-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() =>
                                updateQuantity(item.id, item.quantity - 1)
                              }
                              disabled={
                                updating === item.id || item.quantity <= 1
                              }
                              className="p-2 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="w-12 text-center font-medium">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(item.id, item.quantity + 1)
                              }
                              disabled={
                                updating === item.id ||
                                (item.product.stock || 0) <= item.quantity
                              }
                              className="p-2 hover:bg-gray-100 transition-colors disabled:opacity-50"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                          <span className="text-xs text-gray-500">
                            Stock: {item.product.stock || 0}
                          </span>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-sm text-gray-500">Item Total</p>
                          <p className="text-lg font-bold">
                            ${(item.product.price * item.quantity).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 lg:sticky lg:top-24">
                <h2 className="text-xl font-semibold mb-6">Order Summary</h2>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal ({cartItems.length} items)</span>
                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-gray-600">
                    <span>Shipping</span>
                    <span className="font-medium">
                      {shipping === 0 ? (
                        <span className="text-green-600">FREE</span>
                      ) : (
                        `$${shipping.toFixed(2)}`
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-gray-600">
                    <span>Tax (8%)</span>
                    <span className="font-medium">${tax.toFixed(2)}</span>
                  </div>

                  {subtotal < 100 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                      <p className="text-blue-800">
                        Add ${(100 - subtotal).toFixed(2)} more to get FREE
                        shipping!
                      </p>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold">Total</span>
                    <span className="text-2xl font-bold">
                      ${total.toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={openCheckoutForm}
                  disabled={loading}
                  className="w-full bg-black text-white py-4 px-6 rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium mb-4"
                >
                  {loading ? "Processing..." : "Proceed to Checkout"}
                </button>

                <Link
                  to="/shop"
                  className="block w-full text-center py-3 px-6 border-2 border-gray-200 rounded-xl hover:border-black transition-colors font-medium"
                >
                  Continue Shopping
                </Link>

                {/* Trust Badges */}
                <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Truck size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Free Shipping</p>
                      <p className="text-xs">On orders over $100</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Shield size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        Secure Checkout
                      </p>
                      <p className="text-xs">Your data is protected</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Tag size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Easy Returns</p>
                      <p className="text-xs">7-day return policy</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCheckoutForm ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Shipping Details</h2>
              <p className="text-sm text-gray-600 mt-1">
                Enter delivery information for this order.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={checkoutForm.fullName}
                    onChange={(e) =>
                      setCheckoutForm((prev) => ({ ...prev, fullName: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-black"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={checkoutForm.phone}
                    onChange={(e) =>
                      setCheckoutForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-black"
                    placeholder="+961 70 123 456"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address *
                </label>
                <input
                  type="text"
                  value={checkoutForm.address}
                  onChange={(e) =>
                    setCheckoutForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-black"
                  placeholder="Street, building, floor..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Directions (optional)
                </label>
                <textarea
                  value={checkoutForm.directions}
                  onChange={(e) =>
                    setCheckoutForm((prev) => ({ ...prev, directions: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-black"
                  placeholder="Landmark or delivery notes..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    value={checkoutForm.city}
                    onChange={(e) =>
                      setCheckoutForm((prev) => ({ ...prev, city: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-black"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State *
                  </label>
                  <input
                    type="text"
                    value={checkoutForm.state}
                    onChange={(e) =>
                      setCheckoutForm((prev) => ({ ...prev, state: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-black"
                    placeholder="State"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ZIP Code *
                  </label>
                  <input
                    type="text"
                    value={checkoutForm.zipCode}
                    onChange={(e) =>
                      setCheckoutForm((prev) => ({ ...prev, zipCode: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-black"
                    placeholder="ZIP Code"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country *
                  </label>
                  <input
                    type="text"
                    value={checkoutForm.country}
                    onChange={(e) =>
                      setCheckoutForm((prev) => ({ ...prev, country: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-black"
                    placeholder="Country"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setShowCheckoutForm(false)}
                className="px-5 py-2.5 rounded-xl border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={checkout}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-black text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Place Order"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
