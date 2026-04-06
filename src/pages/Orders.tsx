import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import {
  collection,
  query,
  orderBy,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import {
  Package,
  Clock,
  CheckCircle,
  Truck,
  ChevronDown,
  ChevronUp,
  Calendar,
  XCircle,
} from "lucide-react";
import {
  OrderStatus,
  updateOrderStatusWithInventory,
} from "../lib/orderLogic";

interface OrderItem {
  product_id: string;
  product_name?: string;
  product_image?: string;
  size: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  cancel_reason?: string;
  status_note?: string;
  created_at: Timestamp | Date | string | null | undefined;
  shipping_address?: string;
  tracking_number?: string;
  user_id?: string;
}

const DELIVERY_CHARGE = 2;

export function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const formatOrderDate = (value: Order["created_at"]) => {
    const date =
      value instanceof Timestamp
        ? value.toDate()
        : value instanceof Date
        ? value
        : typeof value === "string"
        ? new Date(value)
        : new Date();

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (user) {
      // Set up real-time listener for orders
      unsubscribe = setupRealtimeListener();
    } else {
      setLoading(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user]);

  const setupRealtimeListener = () => {
    if (!user) return;

    const userOrdersRef = collection(db, "users", user.uid, "orders");
    const q = query(userOrdersRef, orderBy("created_at", "desc"));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const ordersData = await Promise.all(
          snapshot.docs.map(async (orderDoc) => {
            const data = orderDoc.data();

            // Fetch product details for each item if not already included
            const itemsWithDetails = await Promise.all(
              data.items.map(async (item: OrderItem) => {
                // If product_name already exists, just return the item
                if (item.product_name) {
                  return item;
                }

                // Otherwise fetch product details
                try {
                  const productRef = doc(db, "products", item.product_id);
                  const productSnap = await getDoc(productRef);

                  if (productSnap.exists()) {
                    const productData = productSnap.data();
                    return {
                      ...item,
                      product_name: productData.name,
                      product_image: productData.image_url,
                    };
                  }
                  return item;
                } catch (error) {
                  console.error("Error fetching product:", error);
                  return item;
                }
              })
            );

            return {
              id: orderDoc.id,
              items: itemsWithDetails,
              total: data.total,
              status: data.status,
              created_at: data.created_at,
              shipping_address: data.shipping_address,
              tracking_number: data.tracking_number,
              user_id: data.user_id,
            } as Order;
          })
        );

        setOrders(ordersData);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading orders:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  };

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case "pending":
        return <Clock className="text-yellow-600" size={20} />;
      case "processing":
        return <Package className="text-blue-600" size={20} />;
      case "shipped":
        return <Truck className="text-purple-600" size={20} />;
      case "delivered":
        return <CheckCircle className="text-green-600" size={20} />;
      case "cancelled":
        return <XCircle className="text-red-600" size={20} />;
      default:
        return <Clock className="text-gray-600" size={20} />;
    }
  };

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "processing":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "shipped":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "delivered":
        return "bg-green-100 text-green-800 border-green-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const statusRank: Record<Exclude<OrderStatus, "cancelled">, number> = {
    pending: 0,
    processing: 1,
    shipped: 2,
    delivered: 3,
  };

  const getTimelineSteps = (status: OrderStatus) => {
    if (status === "cancelled") {
      return [
        {
          key: "cancelled",
          title: "Closed",
          description: "Order cancelled",
          completed: true,
          icon: "cancelled" as const,
        },
      ];
    }

    const currentRank = statusRank[status];
    return [
      {
        key: "pending",
        title: "Order Placed",
        description: "Your order has been received",
        completed: currentRank >= 0,
        icon: "check" as const,
      },
      {
        key: "processing",
        title: "Processing",
        description: "Your order is being processed",
        completed: currentRank >= 1,
        icon: "processing" as const,
      },
      {
        key: "shipped",
        title: "Shipped",
        description: "Your order is on the way",
        completed: currentRank >= 2,
        icon: "shipped" as const,
      },
      {
        key: "delivered",
        title: "Delivered",
        description: "Your order has been delivered",
        completed: currentRank >= 3,
        icon: "check" as const,
      },
    ];
  };

  const requestStatusChange = async (
    order: Order,
    newStatus: OrderStatus,
    confirmText: string,
    reason?: string,
    extraFields?: Record<string, unknown>,
    skipConfirm = false
  ) => {
    if (!skipConfirm && !window.confirm(confirmText)) return false;

    try {
      setStatusUpdating(order.id);
      await updateOrderStatusWithInventory({
        orderId: order.id,
        userId: user?.uid || order.user_id,
        items: order.items,
        newStatus,
        statusNote: reason,
        extraFields,
      });

      if (newStatus === "cancelled") {
        let profileData: Record<string, unknown> = {};
        if (user?.uid) {
          try {
            const profileSnap = await getDoc(doc(db, "users", user.uid));
            if (profileSnap.exists()) {
              profileData = profileSnap.data() as Record<string, unknown>;
            }
          } catch (profileError) {
            console.error("Failed to load user profile for status webhook:", profileError);
          }
        }

        const fullName = String(
          `${profileData.firstName || ""} ${profileData.lastName || ""}`.trim() ||
            profileData.displayName ||
            user?.displayName ||
            "Customer"
        );
        const phone = String(
          `${profileData.countryCode || ""} ${profileData.phone || ""}`.trim() ||
            "Not provided"
        );
        const city = String(profileData.city || "").trim() || "-";
        const state = String(profileData.state || "").trim() || "-";
        const zipCode = String(profileData.zipCode || "").trim() || "-";
        const country = String(profileData.country || "").trim() || "-";
        const subtotal = Number(
          order.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0)
        );
        const shipping = DELIVERY_CHARGE;
        const tax = 0;

        const response = await fetch("/api/send-order-status-discord", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: newStatus,
            orderId: order.id,
            name: fullName,
            userEmail: user?.email || "",
            phone,
            city,
            state,
            zipCode,
            country,
            total: Number(order.total || 0),
            subtotal,
            shipping,
            tax,
            createdAt:
              order.created_at instanceof Timestamp
                ? order.created_at.toDate().toISOString()
                : order.created_at instanceof Date
                ? order.created_at.toISOString()
                : String(order.created_at || ""),
            itemCount: Array.isArray(order.items)
              ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
              : 0,
            items: Array.isArray(order.items)
              ? order.items.map((item) => ({
                  name: item.product_name || "Item",
                  size: item.size,
                  quantity: item.quantity,
                  unitPrice: item.price,
                }))
              : [],
            reason: reason || "",
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Order status webhook failed:", errorText);
        }
      }
    } catch (error) {
      console.error("Error updating order status:", error);
      alert(
        error instanceof Error ? error.message : "Failed to update order status."
      );
      return false;
    } finally {
      setStatusUpdating(null);
    }
    return true;
  };

  const submitCancelOrder = async () => {
    if (!cancelModalOrder) return;
    const reason = cancelReasonInput.trim();
    if (!reason) {
      alert("Please tell us why you cancelled the order.");
      return;
    }

    const ok = await requestStatusChange(
      cancelModalOrder,
      "cancelled",
      "",
      reason,
      {
        cancel_reason: reason,
        cancelled_at: Timestamp.now(),
        cancelled_by: "customer",
      },
      true
    );

    if (ok) {
      setCancelModalOrder(null);
      setCancelReasonInput("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-300 mx-auto mb-4"></div>
          <p className="text-slate-300">Loading your orders...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Package className="text-gray-400" size={40} />
          </div>
          <h2 className="text-2xl font-light mb-4">Sign in to view orders</h2>
          <p className="text-gray-600 mb-8">
            Please sign in to access your order history.
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-wide mb-2">
            My Orders
          </h1>
          <p className="text-gray-600">
            Track and view all your orders in one place
          </p>
        </div>

        {orders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Package className="text-gray-400" size={48} />
              </div>
              <h2 className="text-2xl font-light mb-4">No orders yet</h2>
              <p className="text-gray-600 mb-8">
                You haven't placed any orders. Start shopping to see your orders
                here!
              </p>
              <Link
                to="/shop"
                className="inline-block px-8 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors"
              >
                Start Shopping
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md"
              >
                {/* Order Header */}
                <div className="p-4 sm:p-6 border-b border-gray-100">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(order.status)}
                        <div>
                          <p className="text-sm text-gray-500">Order ID</p>
                          <p className="font-semibold">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </p>
                        </div>
                      </div>

                      <div className="hidden md:block w-px h-12 bg-gray-200" />

                      <div className="hidden md:block">
                        <p className="text-sm text-gray-500">Order Date</p>
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-gray-400" />
                          <p className="font-medium">
                            {formatOrderDate(order.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="hidden md:block w-px h-12 bg-gray-200" />

                      <div className="hidden md:block">
                        <p className="text-sm text-gray-500">Total Amount</p>
                        <p className="font-bold text-lg">
                          ${order.total.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span
                        className={`px-4 py-2 rounded-full text-sm font-medium border ${getStatusColor(
                          order.status
                        )}`}
                      >
                        {order.status.charAt(0).toUpperCase() +
                          order.status.slice(1)}
                      </span>
                      {order.status === "pending" && (
                        <button
                          onClick={() => {
                            setCancelModalOrder(order);
                            setCancelReasonInput("");
                          }}
                          disabled={statusUpdating === order.id}
                          className="px-3 py-2 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          Cancel Order
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setExpandedOrder(
                            expandedOrder === order.id ? null : order.id
                          )
                        }
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        {expandedOrder === order.id ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Mobile view - Total */}
                  <div className="md:hidden mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-gray-600">Total Amount</span>
                    <span className="font-bold text-lg">
                      ${order.total.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Expanded Order Details */}
                {expandedOrder === order.id && (
                  <div className="p-4 sm:p-6 bg-gray-50">
                    {/* Order Items */}
                    <div className="mb-6">
                      <h3 className="font-semibold text-lg mb-4">
                        Order Items
                      </h3>
                      <div className="space-y-4">
                        {order.items.map((item, index) => (
                          <div
                            key={index}
                            className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl"
                          >
                            {item.product_image && (
                              <div className="w-20 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                <img
                                  src={item.product_image}
                                  alt={item.product_name || "Product"}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex-1">
                              <h4 className="font-medium mb-1">
                                {item.product_name || "Product"}
                              </h4>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <span className="px-2 py-1 bg-gray-100 rounded">
                                  Size: {item.size}
                                </span>
                                <span>Qty: {item.quantity}</span>
                              </div>
                              <p className="font-semibold">
                                ${item.price.toFixed(2)} each
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-sm text-gray-500 mb-1">
                                Item Total
                              </p>
                              <p className="font-bold text-lg">
                                ${(item.price * item.quantity).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Order Summary */}
                    <div className="bg-white rounded-xl p-6">
                      <h3 className="font-semibold text-lg mb-4">
                        Order Summary
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between text-gray-600">
                          <span>Subtotal ({order.items.length} items)</span>
                          <span className="font-medium">
                            $
                            {order.items
                              .reduce(
                                (sum, item) => sum + item.price * item.quantity,
                                0
                              )
                              .toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Delivery Charge</span>
                          <span className="font-medium">$2.00</span>
                        </div>
                        <div className="border-t border-gray-200 pt-3">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-lg">Total</span>
                            <span className="font-bold text-2xl">
                              ${order.total.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Order Status Timeline */}
                    <div className="mt-6 bg-white rounded-xl p-6">
                      <h3 className="font-semibold text-lg mb-4">
                        Order Status
                      </h3>
                      {(() => {
                        const timelineSteps = getTimelineSteps(order.status);
                        return (
                          <div className="relative">
                            {timelineSteps.length > 1 && (
                              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                            )}

                            <div className="space-y-6 relative">
                              {timelineSteps.map((step) => (
                                <div
                                  key={step.key}
                                  className={`flex items-center gap-4 ${
                                    step.completed ? "" : "opacity-50"
                                  }`}
                                >
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                                      step.key === "cancelled"
                                        ? "bg-red-500"
                                        : step.completed
                                        ? "bg-green-500"
                                        : "bg-gray-300"
                                    }`}
                                  >
                                    {step.key === "cancelled" ? (
                                      <XCircle className="text-white" size={16} />
                                    ) : step.icon === "processing" && !step.completed ? (
                                      <Clock className="text-white" size={16} />
                                    ) : step.icon === "shipped" && !step.completed ? (
                                      <Truck className="text-white" size={16} />
                                    ) : (
                                      <CheckCircle className="text-white" size={16} />
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-medium">{step.title}</p>
                                    <p className="text-sm text-gray-500">{step.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-xl p-5">
            <h3 className="text-lg font-semibold mb-2">Why did you cancel?</h3>
            <p className="text-sm text-gray-600 mb-3">
              This reason will be shared with the admin team.
            </p>
            <textarea
              value={cancelReasonInput}
              onChange={(e) => setCancelReasonInput(e.target.value)}
              rows={4}
              placeholder="Example: I ordered the wrong size."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setCancelModalOrder(null);
                  setCancelReasonInput("");
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={submitCancelOrder}
                disabled={statusUpdating === cancelModalOrder.id}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {statusUpdating === cancelModalOrder.id
                  ? "Cancelling..."
                  : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
