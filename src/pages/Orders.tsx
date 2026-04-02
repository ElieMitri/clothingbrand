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
  RotateCcw,
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
  created_at: Timestamp | Date | string | null | undefined;
  shipping_address?: string;
  tracking_number?: string;
  user_id?: string;
}

export function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
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
      case "refund_requested":
        return <RotateCcw className="text-orange-600" size={20} />;
      case "refunded":
        return <RotateCcw className="text-cyan-600" size={20} />;
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
      case "refund_requested":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "refunded":
        return "bg-cyan-100 text-cyan-800 border-cyan-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const requestStatusChange = async (
    order: Order,
    newStatus: OrderStatus,
    confirmText: string
  ) => {
    if (!window.confirm(confirmText)) return;

    try {
      setStatusUpdating(order.id);
      await updateOrderStatusWithInventory({
        orderId: order.id,
        userId: user?.uid || order.user_id,
        items: order.items,
        newStatus,
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      alert(
        error instanceof Error ? error.message : "Failed to update order status."
      );
    } finally {
      setStatusUpdating(null);
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
    <div className="min-h-screen pt-24 pb-16 px-4 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-light tracking-wide mb-2">
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
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
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

                    <div className="flex items-center gap-3">
                      <span
                        className={`px-4 py-2 rounded-full text-sm font-medium border ${getStatusColor(
                          order.status
                        )}`}
                      >
                        {order.status.charAt(0).toUpperCase() +
                          order.status.slice(1)}
                      </span>
                      {(order.status === "pending" ||
                        order.status === "processing") && (
                        <button
                          onClick={() =>
                            requestStatusChange(
                              order,
                              "cancelled",
                              "Cancel this order? Stock will be returned to inventory."
                            )
                          }
                          disabled={statusUpdating === order.id}
                          className="px-3 py-2 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          Cancel Order
                        </button>
                      )}
                      {order.status === "delivered" && (
                        <button
                          onClick={() =>
                            requestStatusChange(
                              order,
                              "refund_requested",
                              "Request a refund for this order?"
                            )
                          }
                          disabled={statusUpdating === order.id}
                          className="px-3 py-2 rounded-lg text-xs font-medium border border-orange-200 text-orange-700 hover:bg-orange-50 disabled:opacity-60"
                        >
                          Request Refund
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
                  <div className="p-6 bg-gray-50">
                    {/* Order Items */}
                    <div className="mb-6">
                      <h3 className="font-semibold text-lg mb-4">
                        Order Items
                      </h3>
                      <div className="space-y-4">
                        {order.items.map((item, index) => (
                          <div
                            key={index}
                            className="flex gap-4 bg-white p-4 rounded-xl"
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
                            <div className="text-right">
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
                          <span>Shipping</span>
                          <span className="font-medium">
                            {order.total > 100 ? "FREE" : "$10.00"}
                          </span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Tax</span>
                          <span className="font-medium">
                            ${((order.total * 0.08) / 1.08).toFixed(2)}
                          </span>
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
                      <div className="relative">
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

                        <div className="space-y-6 relative">
                          <div
                            className={`flex items-center gap-4 ${
                              [
                                "pending",
                                "processing",
                                "shipped",
                                "delivered",
                                "cancelled",
                                "refund_requested",
                                "refunded",
                              ].includes(order.status)
                                ? ""
                                : "opacity-50"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                                [
                                  "pending",
                                  "processing",
                                  "shipped",
                                  "delivered",
                                  "cancelled",
                                  "refund_requested",
                                  "refunded",
                                ].includes(order.status)
                                  ? "bg-green-500"
                                  : "bg-gray-300"
                              }`}
                            >
                              <CheckCircle className="text-white" size={16} />
                            </div>
                            <div>
                              <p className="font-medium">Order Placed</p>
                              <p className="text-sm text-gray-500">
                                Your order has been received
                              </p>
                            </div>
                          </div>

                          <div
                            className={`flex items-center gap-4 ${
                              [
                                "processing",
                                "shipped",
                                "delivered",
                                "refund_requested",
                                "refunded",
                              ].includes(
                                order.status
                              )
                                ? ""
                                : "opacity-50"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                                [
                                  "processing",
                                  "shipped",
                                  "delivered",
                                  "refund_requested",
                                  "refunded",
                                ].includes(order.status)
                                  ? "bg-green-500"
                                  : "bg-gray-300"
                              }`}
                            >
                              {[
                                "processing",
                                "shipped",
                                "delivered",
                                "refund_requested",
                                "refunded",
                              ].includes(order.status) ? (
                                <CheckCircle className="text-white" size={16} />
                              ) : (
                                <Clock className="text-white" size={16} />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">Processing</p>
                              <p className="text-sm text-gray-500">
                                We're preparing your items
                              </p>
                            </div>
                          </div>

                          <div
                            className={`flex items-center gap-4 ${
                              [
                                "shipped",
                                "delivered",
                                "refund_requested",
                                "refunded",
                              ].includes(order.status)
                                ? ""
                                : "opacity-50"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                                [
                                  "shipped",
                                  "delivered",
                                  "refund_requested",
                                  "refunded",
                                ].includes(order.status)
                                  ? "bg-green-500"
                                  : "bg-gray-300"
                              }`}
                            >
                              {[
                                "shipped",
                                "delivered",
                                "refund_requested",
                                "refunded",
                              ].includes(order.status) ? (
                                <CheckCircle className="text-white" size={16} />
                              ) : (
                                <Truck className="text-white" size={16} />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">Shipped</p>
                              <p className="text-sm text-gray-500">
                                Your order is on the way
                              </p>
                            </div>
                          </div>

                          <div
                            className={`flex items-center gap-4 ${
                              ["delivered", "refund_requested", "refunded"].includes(
                                order.status
                              )
                                ? ""
                                : "opacity-50"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                                ["delivered", "refund_requested", "refunded"].includes(
                                  order.status
                                )
                                  ? "bg-green-500"
                                  : "bg-gray-300"
                              }`}
                            >
                              <CheckCircle className="text-white" size={16} />
                            </div>
                            <div>
                              <p className="font-medium">Delivered</p>
                              <p className="text-sm text-gray-500">
                                Your order has been delivered
                              </p>
                            </div>
                          </div>

                          <div
                            className={`flex items-center gap-4 ${
                              ["refund_requested", "refunded"].includes(
                                order.status
                              )
                                ? ""
                                : "opacity-50"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                                ["refund_requested", "refunded"].includes(
                                  order.status
                                )
                                  ? "bg-orange-500"
                                  : "bg-gray-300"
                              }`}
                            >
                              <RotateCcw className="text-white" size={16} />
                            </div>
                            <div>
                              <p className="font-medium">Refund Requested</p>
                              <p className="text-sm text-gray-500">
                                Waiting for admin approval
                              </p>
                            </div>
                          </div>

                          <div
                            className={`flex items-center gap-4 ${
                              ["cancelled", "refunded"].includes(order.status)
                                ? ""
                                : "opacity-50"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                                ["cancelled", "refunded"].includes(order.status)
                                  ? "bg-red-500"
                                  : "bg-gray-300"
                              }`}
                            >
                              <XCircle className="text-white" size={16} />
                            </div>
                            <div>
                              <p className="font-medium">Closed</p>
                              <p className="text-sm text-gray-500">
                                Order cancelled or refunded
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
