import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc, onSnapshot, Timestamp } from "firebase/firestore";
import { ArrowLeft, Calendar, CheckCircle, Clock, Truck, XCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { OrderStatus, updateOrderStatusWithInventory } from "../lib/orderLogic";
import { toFastImageUrl } from "../lib/image";

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

const statusRank: Record<Exclude<OrderStatus, "cancelled">, number> = {
  pending: 0,
  processing: 1,
  shipped: 2,
  delivered: 3,
};

export function OrderDetails() {
  const { user } = useAuth();
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    if (!user?.uid || !orderId) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    const orderRef = doc(db, "users", user.uid, "orders", orderId);
    const unsubscribe = onSnapshot(
      orderRef,
      async (snap) => {
        if (!snap.exists()) {
          setNotFound(true);
          setOrder(null);
          setLoading(false);
          return;
        }

        const data = snap.data();
        const items = Array.isArray(data.items) ? data.items : [];
        const itemsWithDetails = await Promise.all(
          items.map(async (item: OrderItem) => {
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

        setOrder({
          id: snap.id,
          items: itemsWithDetails,
          total: Number(data.total || 0),
          status: (data.status || "pending") as OrderStatus,
          created_at: data.created_at,
          user_id: data.user_id,
        });
        setNotFound(false);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setNotFound(true);
      }
    );

    return () => unsubscribe();
  }, [orderId, user?.uid]);

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

  const getTimelineSteps = (status: OrderStatus) => {
    if (status === "cancelled") {
      return [
        {
          key: "cancelled",
          title: "Closed",
          description: "Order cancelled",
          completed: true,
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
      },
      {
        key: "processing",
        title: "Processing",
        description: "Your order is being processed",
        completed: currentRank >= 1,
      },
      {
        key: "shipped",
        title: "Shipped",
        description: "Your order is on the way",
        completed: currentRank >= 2,
      },
      {
        key: "delivered",
        title: "Delivered",
        description: "Your order has been delivered",
        completed: currentRank >= 3,
      },
    ];
  };

  const timelineSteps = useMemo(
    () => (order ? getTimelineSteps(order.status) : []),
    [order]
  );

  const cancelOrder = async () => {
    if (!order || !user?.uid) return;
    const reason = cancelReasonInput.trim();
    if (!reason) {
      alert("Please tell us why you cancelled the order.");
      return;
    }

    try {
      setStatusUpdating(true);
      await updateOrderStatusWithInventory({
        orderId: order.id,
        userId: user.uid || order.user_id,
        items: order.items,
        newStatus: "cancelled",
        statusNote: reason,
        extraFields: {
          cancel_reason: reason,
          cancelled_at: Timestamp.now(),
          cancelled_by: "customer",
        },
      });

      await fetch("/api/send-order-status-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancelled",
          orderId: order.id,
          userEmail: user.email || "",
          total: Number(order.total || 0),
          itemCount: order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
          items: order.items.map((item) => ({
            name: item.product_name || "Item",
            size: item.size,
            quantity: item.quantity,
            unitPrice: item.price,
          })),
          reason,
        }),
      }).catch(() => undefined);

      setShowCancelModal(false);
      setCancelReasonInput("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update order status.");
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-300 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8 text-center">
          <h1 className="text-2xl font-semibold mb-2">Order Not Found</h1>
          <p className="text-gray-600 mb-6">
            We could not find that order in your account.
          </p>
          <Link
            to="/profile#my-orders"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 hover:bg-gray-50"
          >
            <ArrowLeft size={16} />
            Back To My Orders
          </Link>
        </div>
      </div>
    );
  }

  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="min-h-screen pt-24 pb-16 px-3 sm:px-4 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <Link
              to="/profile#my-orders"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft size={16} />
              Back to My Orders
            </Link>
            {order.status === "pending" ? (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                disabled={statusUpdating}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Cancel Order
              </button>
            ) : null}
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold mb-4">Order Details</h1>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Order ID</p>
              <p className="font-semibold">#{order.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Order Date</p>
              <p className="font-medium flex items-center gap-2">
                <Calendar size={16} className="text-gray-400" />
                {formatOrderDate(order.created_at)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total</p>
              <p className="font-bold text-lg">${order.total.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
          <h2 className="font-semibold text-lg mb-4">Order Items</h2>
          <div className="space-y-4">
            {order.items.map((item, index) => (
              <div key={index} className="flex flex-col sm:flex-row gap-4 bg-gray-50 p-4 rounded-xl">
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
                  <h3 className="font-medium mb-1">{item.product_name || "Product"}</h3>
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                    <span className="px-2 py-1 bg-white rounded">Size: {item.size}</span>
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

        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
          <h2 className="font-semibold text-lg mb-4">Order Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal ({order.items.length} items)</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Status</span>
              <span className="font-medium capitalize">{order.status}</span>
            </div>
            <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
              <span className="font-semibold text-lg">Total</span>
              <span className="font-bold text-2xl">${order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
          <h2 className="font-semibold text-lg mb-4">Order Status</h2>
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
                    ) : step.key === "processing" && !step.completed ? (
                      <Clock className="text-white" size={16} />
                    ) : step.key === "shipped" && !step.completed ? (
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
        </div>
      </div>

      {showCancelModal ? (
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
                  setShowCancelModal(false);
                  setCancelReasonInput("");
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={cancelOrder}
                disabled={statusUpdating}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {statusUpdating ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
