import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../../lib/firebase";
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
import { OrderStatus, updateOrderStatusWithInventory } from "../../lib/orderLogic";
import { toFastImageUrl } from "../../lib/image";

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
  user_id?: string;
}

interface MyOrdersSectionProps {
  userId: string;
  userEmail?: string | null;
}

export function MyOrdersSection({ userId, userEmail }: MyOrdersSectionProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState("");

  useEffect(() => {
    const userOrdersRef = collection(db, "users", userId, "orders");
    const q = query(userOrdersRef, orderBy("created_at", "desc"));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const ordersData = await Promise.all(
          snapshot.docs.map(async (orderDoc) => {
            const data = orderDoc.data();
            const itemsWithDetails = await Promise.all(
              data.items.map(async (item: OrderItem) => {
                if (item.product_name) return item;
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
                } catch {
                  return item;
                }
              })
            );

            return {
              id: orderDoc.id,
              items: itemsWithDetails,
              total: Number(data.total || 0),
              status: (data.status || "pending") as OrderStatus,
              created_at: data.created_at,
              user_id: data.user_id,
            } as Order;
          })
        );

        setOrders(ordersData);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsubscribe();
  }, [userId]);

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
    reason?: string
  ) => {
    try {
      setStatusUpdating(order.id);
      await updateOrderStatusWithInventory({
        orderId: order.id,
        userId: userId || order.user_id,
        items: order.items,
        newStatus,
        statusNote: reason,
        extraFields:
          newStatus === "cancelled"
            ? {
                cancel_reason: reason || "",
                cancelled_at: Timestamp.now(),
                cancelled_by: "customer",
              }
            : undefined,
      });

      if (newStatus === "cancelled") {
        await fetch("/api/send-order-status-discord", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancelled",
            orderId: order.id,
            userEmail: userEmail || "",
            total: Number(order.total || 0),
            itemCount: Array.isArray(order.items)
              ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
              : 0,
            items: order.items.map((item) => ({
              name: item.product_name || "Item",
              size: item.size,
              quantity: item.quantity,
              unitPrice: item.price,
            })),
            reason: reason || "",
          }),
        }).catch(() => undefined);
      }

      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update order status.");
      return false;
    } finally {
      setStatusUpdating(null);
    }
  };

  const submitCancelOrder = async () => {
    if (!cancelModalOrder) return;
    const reason = cancelReasonInput.trim();
    if (!reason) {
      alert("Please tell us why you cancelled the order.");
      return;
    }
    const ok = await requestStatusChange(cancelModalOrder, "cancelled", reason);
    if (ok) {
      setCancelModalOrder(null);
      setCancelReasonInput("");
    }
  };

  if (loading) {
    return <p className="text-gray-600">Loading orders...</p>;
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Package className="text-gray-400" size={48} />
          </div>
          <h2 className="text-2xl font-light mb-4">No orders yet</h2>
          <p className="text-gray-600 mb-8">
            You haven't placed any orders. Start shopping to see your orders here.
          </p>
          <Link to="/shop" className="inline-block px-8 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors">
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="bg-white rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md">
            <div className="p-4 sm:p-6 border-b border-gray-100">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(order.status)}
                    <div>
                      <p className="text-sm text-gray-500">Order ID</p>
                      <p className="font-semibold">#{order.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="hidden md:block w-px h-12 bg-gray-200" />
                  <div className="hidden md:block">
                    <p className="text-sm text-gray-500">Order Date</p>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-gray-400" />
                      <p className="font-medium">{formatOrderDate(order.created_at)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className={`px-4 py-2 rounded-full text-sm font-medium border ${getStatusColor(order.status)}`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                  {order.status === "pending" ? (
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
                  ) : null}
                  <button
                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {expandedOrder === order.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              </div>
            </div>

            {expandedOrder === order.id ? (
              <div className="p-4 sm:p-6 bg-gray-50">
                <div className="mb-6">
                  <h3 className="font-semibold text-lg mb-4">Order Items</h3>
                  <div className="space-y-4">
                    {order.items.map((item, index) => (
                      <div key={index} className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl">
                        {item.product_image ? (
                          <div className="w-20 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                            <img
                              src={toFastImageUrl(item.product_image, 320)}
                              alt={item.product_name || "Product"}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : null}
                        <div className="flex-1">
                          <h4 className="font-medium mb-1">{item.product_name || "Product"}</h4>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                            <span className="px-2 py-1 bg-gray-100 rounded">Size: {item.size}</span>
                            <span>Qty: {item.quantity}</span>
                          </div>
                          <p className="font-semibold">${item.price.toFixed(2)} each</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-sm text-gray-500 mb-1">Item Total</p>
                          <p className="font-bold text-lg">${(item.price * item.quantity).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6">
                  <h3 className="font-semibold text-lg mb-4">Order Status</h3>
                  {(() => {
                    const timelineSteps = getTimelineSteps(order.status);
                    return (
                      <div className="relative">
                        {timelineSteps.length > 1 ? (
                          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                        ) : null}
                        <div className="space-y-6 relative">
                          {timelineSteps.map((step) => (
                            <div key={step.key} className={`flex items-center gap-4 ${step.completed ? "" : "opacity-50"}`}>
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                                  step.key === "cancelled" ? "bg-red-500" : step.completed ? "bg-green-500" : "bg-gray-300"
                                }`}
                              >
                                {step.key === "cancelled" ? (
                                  <XCircle className="text-white" size={16} />
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
            ) : null}
          </div>
        ))}
      </div>

      {cancelModalOrder ? (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-xl p-5">
            <h3 className="text-lg font-semibold mb-2">Why did you cancel?</h3>
            <p className="text-sm text-gray-600 mb-3">This reason will be shared with the admin team.</p>
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
                {statusUpdating === cancelModalOrder.id ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
