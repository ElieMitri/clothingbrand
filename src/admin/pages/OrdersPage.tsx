import { useEffect, useMemo, useState } from "react";
import { Timestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { Download, Filter, Plus } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { orderSavedViews } from "../data/adminConstants";
import type { OrderRow } from "../types";
import { useToast } from "../hooks/useToast";
import { useAdminLiveData } from "../hooks/useAdminLiveData";
import {
  getUnitProfitFromOrderItemDoc,
  type AdminOrderItemDoc,
} from "../utils/transforms";
import { updateOrderStatusWithInventory, type OrderStatus } from "../../lib/orderLogic";
import { db } from "../../lib/firebase";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const paymentTone: Record<OrderRow["paymentStatus"], "success" | "warning" | "danger"> = {
  paid: "success",
  pending: "warning",
  refunded: "danger",
};

const fulfillmentTone: Record<OrderRow["fulfillmentStatus"], "success" | "warning" | "neutral"> = {
  fulfilled: "success",
  processing: "warning",
  unfulfilled: "neutral",
};
export function OrdersPage() {
  const { showToast } = useToast();
  const { loading, orders, ordersRaw, productsRaw } = useAdminLiveData();
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [activeView, setActiveView] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [savingStatusOrderId, setSavingStatusOrderId] = useState<string>("");
  const [savingFulfillmentOrderId, setSavingFulfillmentOrderId] = useState<string>("");
  const [savingPaymentOrderId, setSavingPaymentOrderId] = useState<string>("");
  const [savingDetailsOrderId, setSavingDetailsOrderId] = useState<string>("");
  const [deletingOrderId, setDeletingOrderId] = useState<string>("");
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [addProductSearchQuery, setAddProductSearchQuery] = useState("");
  const [orderEditor, setOrderEditor] = useState({
    customer_name: "",
    user_email: "",
    phone: "",
    address: "",
    directions: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
    shipping_address: "",
    payment_method: "",
    payment_status: "",
    status_note: "",
    subtotal: 0,
    shipping: 0,
    tax: 0,
    total: 0,
  });
  const [orderItemsEditor, setOrderItemsEditor] = useState<AdminOrderItemDoc[]>([]);
  const query = searchParams.get("q") || "";

  const allStatuses: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];

  const filteredRows = useMemo(() => {
    return orders.filter((order) => {
      if (activeView !== "all" && order.shipmentStatus !== activeView) return false;
      if (statusFilter !== "all" && order.paymentStatus !== statusFilter) return false;
      if (
        query &&
        !`${order.orderNumber} ${order.customer} ${order.email}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [activeView, orders, query, statusFilter]);

  const productById = useMemo(() => {
    const byId = new Map<string, (typeof productsRaw)[number]>();
    productsRaw.forEach((product) => {
      const id = String(product.id || "").trim();
      if (!id) return;
      byId.set(id, product);
    });
    return byId;
  }, [productsRaw]);

  const focusedOrder = useMemo(() => {
    if (!orderId) return null;
    return orders.find((entry) => entry.id === orderId) || null;
  }, [orderId, orders]);
  const isDetailView = Boolean(orderId);

  const focusedRawOrder = useMemo(() => {
    if (!focusedOrder) return null;
    return ordersRaw.find((entry) => entry.id === focusedOrder.id) || null;
  }, [focusedOrder, ordersRaw]);

  useEffect(() => {
    if (!focusedRawOrder) return;
    setOrderEditor({
      customer_name: String(focusedRawOrder.customer_name || focusedOrder?.customer || "").trim(),
      user_email: String(focusedRawOrder.user_email || focusedOrder?.email || "").trim(),
      phone: String(focusedRawOrder.phone || "").trim(),
      address: String(focusedRawOrder.address || "").trim(),
      directions: String(focusedRawOrder.directions || "").trim(),
      city: String(focusedRawOrder.city || "").trim(),
      state: String(focusedRawOrder.state || "").trim(),
      zipCode: String(focusedRawOrder.zipCode || "").trim(),
      country: String(focusedRawOrder.country || "").trim(),
      shipping_address: String(
        focusedRawOrder.shipping_address || focusedRawOrder.address || ""
      ).trim(),
      payment_method: String(focusedRawOrder.payment_method || "").trim(),
      payment_status: String(focusedRawOrder.payment_status || "").trim(),
      status_note: String(focusedRawOrder.status_note || "").trim(),
      subtotal: Number(focusedRawOrder.subtotal || 0),
      shipping: Number(focusedRawOrder.shipping || 0),
      tax: Number(focusedRawOrder.tax || 0),
      total: Number(focusedRawOrder.total || focusedOrder?.total || 0),
    });
    setOrderItemsEditor(
      Array.isArray(focusedRawOrder.items)
        ? focusedRawOrder.items.map((item) => ({
            product_id: String(item?.product_id || "").trim() || undefined,
            product_name: String(item?.product_name || "").trim() || undefined,
            product_image: String(item?.product_image || "").trim() || undefined,
            size: String(item?.size || "").trim() || undefined,
            quantity: Math.max(1, Number(item?.quantity || 1)),
            price: Math.max(0, Number(item?.price ?? item?.unitPrice ?? 0)),
            unitPrice: Math.max(0, Number(item?.price ?? item?.unitPrice ?? 0)),
            retail_price:
              Number(item?.retail_price) > 0
                ? Math.max(0, Number(item?.retail_price))
                : undefined,
            cost_price:
              Number(item?.cost_price) > 0 ? Math.max(0, Number(item?.cost_price)) : undefined,
            commission_percentage:
              Number(item?.commission_percentage) > 0
                ? Math.max(0, Number(item?.commission_percentage))
                : undefined,
            unit_profit: (() => {
              const rawManualUnitProfit = item?.unit_profit;
              if (
                rawManualUnitProfit === undefined ||
                rawManualUnitProfit === null ||
                String(rawManualUnitProfit).trim() === ""
              ) {
                return undefined;
              }
              const parsedManualUnitProfit = Number(rawManualUnitProfit);
              if (!Number.isFinite(parsedManualUnitProfit) || parsedManualUnitProfit <= 0) {
                return undefined;
              }
              return parsedManualUnitProfit;
            })(),
          }))
        : []
    );
  }, [focusedOrder?.customer, focusedOrder?.email, focusedOrder?.total, focusedRawOrder]);

  const focusedOrderItems = useMemo(() => {
    if (!Array.isArray(orderItemsEditor)) return [];
    return orderItemsEditor.map((item, index) => {
      const productId = String(item?.product_id || "").trim();
      const productDoc = productById.get(productId);
      const quantity = Math.max(1, Number(item?.quantity || 0) || 1);
      const unitPrice = Math.max(0, Number(item?.price ?? item?.unitPrice ?? 0));
      const lineTotal = unitPrice * quantity;
      const unitProfit = getUnitProfitFromOrderItemDoc(item, productDoc, unitPrice);
      const lineProfit = unitProfit * quantity;
      const displayName =
        String(item?.product_name || "").trim() ||
        String(productDoc?.name || "").trim() ||
        "Product";
      const size = String(item?.size || "").trim();
      const imageUrl = String(item?.product_image || "").trim();
      return {
        id: `${productId || "item"}-${index}`,
        displayName,
        productId,
        size,
        quantity,
        unitPrice,
        unitProfit,
        lineTotal,
        lineProfit,
        imageUrl,
      };
    });
  }, [orderItemsEditor, productById]);

  const focusedOrderProfit = useMemo(() => {
    return focusedOrderItems.reduce((sum, item) => sum + item.lineProfit, 0);
  }, [focusedOrderItems]);

  const addableProducts = useMemo(() => {
    const queryText = addProductSearchQuery.trim().toLowerCase();
    if (!queryText) return productsRaw;
    return productsRaw.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const sku = String(product.sku || "").toLowerCase();
      const category = String(product.category || "").toLowerCase();
      const productType = String(product.product_type || "").toLowerCase();
      return (
        name.includes(queryText) ||
        sku.includes(queryText) ||
        category.includes(queryText) ||
        productType.includes(queryText)
      );
    });
  }, [addProductSearchQuery, productsRaw]);

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

  const editedOrderSubtotal = useMemo(
    () => focusedOrderItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [focusedOrderItems]
  );

  const editedOrderTotal = useMemo(
    () =>
      editedOrderSubtotal +
      Math.max(0, Number(orderEditor.shipping || 0)) +
      Math.max(0, Number(orderEditor.tax || 0)),
    [editedOrderSubtotal, orderEditor.shipping, orderEditor.tax]
  );

  const updateOrderItemEditor = <K extends keyof AdminOrderItemDoc>(
    index: number,
    key: K,
    value: AdminOrderItemDoc[K]
  ) => {
    setOrderItemsEditor((prev) =>
      prev.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry;
        return { ...entry, [key]: value };
      })
    );
  };

  const removeOrderItemEditor = (index: number) => {
    setOrderItemsEditor((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const columns: DataTableColumn<OrderRow>[] = [
    {
      key: "order",
      header: "Order",
      width: "16%",
      render: (row) => (
        <div>
          <p>{row.orderNumber}</p>
          <p className="adm-muted">{row.date}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      width: "24%",
      render: (row) => (
        <div>
          <p>{row.customer}</p>
          <p className="adm-muted">{row.email}</p>
        </div>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (row) => row.location,
    },
    {
      key: "payment",
      header: "Payment",
      render: (row) => <StatusBadge tone={paymentTone[row.paymentStatus]}>{row.paymentStatus}</StatusBadge>,
    },
    {
      key: "shipment",
      header: "Shipment",
      render: (row) => (
        <select
          value={row.shipmentStatus}
          onClick={(event) => event.stopPropagation()}
          onChange={async (event) => {
            await updateStatus(row.id, event.target.value as OrderStatus);
          }}
          className="adm-input"
          style={{ minHeight: 32, width: "auto", minWidth: 120, fontSize: 12, padding: "4px 8px" }}
          disabled={savingStatusOrderId === row.id}
        >
          {allStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "paymentToggle",
      header: "Paid",
      render: (row) => (
        <button
          type="button"
          className="adm-button adm-button--ghost"
          onClick={(event) => {
            event.stopPropagation();
            void togglePaymentStatus(row.id);
          }}
          disabled={savingPaymentOrderId === row.id}
          style={{ height: 32, padding: "0 10px", textTransform: "capitalize" }}
        >
          {savingPaymentOrderId === row.id
            ? "Saving..."
            : row.paymentStatus === "paid"
            ? "Paid"
            : "Not paid"}
        </button>
      ),
    },
    {
      key: "total",
      header: "Total",
      render: (row) => <strong>{money.format(row.total)}</strong>,
    },
  ];

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const toggleVisibleRows = () => {
    const visibleIds = filteredRows.slice((page - 1) * 8, page * 8).map((row) => row.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => {
      if (allSelected) return prev.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const clearSelection = () => setSelectedIds([]);

  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const downloadOrderReceipt = (row: OrderRow) => {
    const rawOrder = ordersRaw.find((entry) => entry.id === row.id);
    if (!rawOrder) {
      showToast({ title: "Order not found", description: "Could not load order details for receipt." });
      return;
    }

    const items = Array.isArray(rawOrder.items) ? rawOrder.items : [];
    const subtotal =
      Number(rawOrder.subtotal) > 0
        ? Number(rawOrder.subtotal)
        : items.reduce((sum, item) => {
            const qty = Math.max(1, Number(item?.quantity || 1));
            const unit = Math.max(0, Number(item?.price ?? item?.unitPrice ?? 0));
            return sum + qty * unit;
          }, 0);
    const shipping = Math.max(0, Number(rawOrder.shipping || 0));
    const tax = Math.max(0, Number(rawOrder.tax || 0));
    const total = Math.max(0, Number(rawOrder.total || row.total || subtotal + shipping + tax));
    const customerName = String(rawOrder.customer_name || row.customer || "Customer").trim();
    const email = String(rawOrder.user_email || row.email || "").trim();
    const phone = String(rawOrder.phone || "").trim() || "-";
    const orderDate =
      rawOrder.created_at instanceof Timestamp
        ? rawOrder.created_at.toDate().toLocaleString()
        : row.date || "-";

    const itemsHtml =
      items.length === 0
        ? `<tr><td colspan="3" class="muted center">No items</td></tr>`
        : items
            .map((item) => {
              const name = escapeHtml(String(item?.product_name || "Product").trim() || "Product");
              const qty = Math.max(1, Number(item?.quantity || 1));
              const unit = Math.max(0, Number(item?.price ?? item?.unitPrice ?? 0));
              const line = unit * qty;
              return `
                <tr>
                  <td>${name}</td>
                  <td>${qty}</td>
                  <td class="right">${money.format(line)}</td>
                </tr>
              `;
            })
            .join("");

    const logoUrl = `${window.location.origin}/logo-modified.png`;

    const receiptHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt ${escapeHtml(row.orderNumber)}</title>
          <style>
            body {
              margin: 0;
              padding: 24px;
              background: #f5f7fb;
              font-family: "Helvetica Neue", Arial, sans-serif;
              color: #0f172a;
            }
            .receipt {
              width: min(420px, 100%);
              margin: 0 auto;
              background: #fff;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 18px;
              box-shadow: 0 14px 36px rgba(15, 23, 42, 0.1);
            }
            .logo {
              width: 92px;
              height: auto;
              display: block;
              margin: 0 auto 10px;
            }
            h1 {
              margin: 0;
              text-align: center;
              font-size: 18px;
              letter-spacing: 0.4px;
            }
            .sub {
              margin: 4px 0 12px;
              text-align: center;
              color: #64748b;
              font-size: 12px;
            }
            .sep {
              border-top: 1px dashed #cbd5e1;
              margin: 12px 0;
            }
            .row {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin: 4px 0;
              font-size: 13px;
            }
            .label {
              color: #64748b;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
              font-size: 12px;
            }
            th, td {
              padding: 6px 4px;
              border-bottom: 1px solid #e2e8f0;
              text-align: left;
            }
            th {
              color: #64748b;
              font-weight: 600;
            }
            .right {
              text-align: right;
            }
            .center {
              text-align: center;
            }
            .muted {
              color: #94a3b8;
            }
            .totals .row {
              margin: 6px 0;
            }
            .totals .grand {
              font-weight: 700;
              font-size: 15px;
            }
            @media print {
              body {
                background: #fff;
                padding: 0;
              }
              .receipt {
                border: 0;
                border-radius: 0;
                box-shadow: none;
                width: 100%;
                margin: 0;
              }
            }
          </style>
        </head>
        <body>
          <article class="receipt">
            <img src="${logoUrl}" alt="Logo" class="logo" />
            <h1>Order Receipt</h1>
            <p class="sub">Thank you for your order</p>

            <div class="row"><span class="label">Order #</span><strong>${escapeHtml(
              row.orderNumber
            )}</strong></div>
            <div class="row"><span class="label">Date</span><span>${escapeHtml(orderDate)}</span></div>
            <div class="row"><span class="label">Payment</span><span>${escapeHtml(
              row.paymentStatus
            )}</span></div>

            <div class="sep"></div>

            <div class="row"><span class="label">Name</span><span>${escapeHtml(customerName)}</span></div>
            <div class="row"><span class="label">Email</span><span>${escapeHtml(email || "-")}</span></div>
            <div class="row"><span class="label">Phone</span><span>${escapeHtml(phone)}</span></div>

            <div class="sep"></div>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th class="right">Total</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>

            <div class="sep"></div>

            <div class="totals">
              <div class="row"><span class="label">Subtotal</span><span>${money.format(subtotal)}</span></div>
              <div class="row"><span class="label">Shipping</span><span>${money.format(shipping)}</span></div>
              <div class="row"><span class="label">Tax</span><span>${money.format(tax)}</span></div>
              <div class="row grand"><span>Total</span><span>${money.format(total)}</span></div>
            </div>
          </article>
        </body>
      </html>
    `;

    const fileNameSafeOrder = String(row.orderNumber || row.id || "receipt")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const blob = new Blob([receiptHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileNameSafeOrder || "receipt"}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast({
      title: "Receipt downloaded",
      description: `Saved as ${fileNameSafeOrder || "receipt"}.html`,
    });
  };

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    const rawOrder = ordersRaw.find((entry) => entry.id === orderId);
    if (!rawOrder) {
      showToast({ title: "Order not found", description: "Could not resolve selected order." });
      return;
    }
    setSavingStatusOrderId(orderId);
    try {
      await updateOrderStatusWithInventory({
        orderId,
        userId: rawOrder.user_id,
        items: [],
        newStatus: status,
        statusNote: "Updated from admin orders page",
      });
      showToast({ title: "Order updated", description: `Order moved to ${status}.` });
    } catch (error) {
      console.error("Failed to update order status", error);
      showToast({
        title: "Status update failed",
        description: error instanceof Error ? error.message : "Could not update order status.",
      });
    } finally {
      setSavingStatusOrderId("");
    }
  };

  const toggleFulfillment = async (orderId: string) => {
    const rawOrder = ordersRaw.find((entry) => entry.id === orderId);
    if (!rawOrder) {
      showToast({ title: "Order not found", description: "Could not resolve selected order." });
      return;
    }

    const currentFulfillment =
      rawOrder.fulfillment_status === "fulfilled" ||
      rawOrder.fulfillment_status === "processing" ||
      rawOrder.fulfillment_status === "unfulfilled"
        ? rawOrder.fulfillment_status
        : rawOrder.status === "shipped" || rawOrder.status === "delivered"
        ? "fulfilled"
        : rawOrder.status === "processing"
        ? "processing"
        : "unfulfilled";

    const nextFulfillment =
      currentFulfillment === "fulfilled" ? "unfulfilled" : "fulfilled";

    setSavingFulfillmentOrderId(orderId);
    try {
      await updateDoc(doc(db, "orders", orderId), {
        fulfillment_status: nextFulfillment,
      });

      const userId = String(rawOrder.user_id || "").trim();
      if (userId) {
        try {
          await updateDoc(doc(db, "users", userId, "orders", orderId), {
            fulfillment_status: nextFulfillment,
          });
        } catch {
          // Skip if mirror doc is missing.
        }
      }

      showToast({
        title: "Fulfillment updated",
        description: `Order marked as ${nextFulfillment}.`,
      });
    } catch (error) {
      console.error("Failed to update fulfillment", error);
      showToast({
        title: "Fulfillment update failed",
        description:
          error instanceof Error ? error.message : "Could not update fulfillment.",
      });
    } finally {
      setSavingFulfillmentOrderId("");
    }
  };

  const togglePaymentStatus = async (orderId: string) => {
    const rawOrder = ordersRaw.find((entry) => entry.id === orderId);
    if (!rawOrder) {
      showToast({ title: "Order not found", description: "Could not resolve selected order." });
      return;
    }

    const currentStatus = String(rawOrder.payment_status || "")
      .trim()
      .toLowerCase();
    const nextPaymentStatus = currentStatus === "paid" ? "pending" : "paid";

    setSavingPaymentOrderId(orderId);
    try {
      await updateDoc(doc(db, "orders", orderId), {
        payment_status: nextPaymentStatus,
      });

      const userId = String(rawOrder.user_id || "").trim();
      if (userId) {
        try {
          await updateDoc(doc(db, "users", userId, "orders", orderId), {
            payment_status: nextPaymentStatus,
          });
        } catch {
          // Skip if mirror doc is missing.
        }
      }

      showToast({
        title: "Payment updated",
        description: `Order marked as ${nextPaymentStatus === "paid" ? "paid" : "not paid"}.`,
      });
    } catch (error) {
      console.error("Failed to update payment status", error);
      showToast({
        title: "Payment update failed",
        description:
          error instanceof Error ? error.message : "Could not update payment status.",
      });
    } finally {
      setSavingPaymentOrderId("");
    }
  };

  const deleteOrder = async (order: OrderRow) => {
    const rawOrder = ordersRaw.find((entry) => entry.id === order.id);
    if (!rawOrder) {
      showToast({ title: "Order not found", description: "Could not resolve selected order." });
      return;
    }

    const confirmed = window.confirm(
      `Delete ${order.orderNumber}? This permanently removes the order and updates revenue metrics.`
    );
    if (!confirmed) return;

    setDeletingOrderId(order.id);
    try {
      await deleteDoc(doc(db, "orders", order.id));

      const userId = String(rawOrder.user_id || "").trim();
      if (userId) {
        try {
          await deleteDoc(doc(db, "users", userId, "orders", order.id));
        } catch {
          // Skip silently if user-order mirror doesn't exist.
        }
      }

      if (focusedOrder?.id === order.id) {
        navigate("/admin/orders");
      }

      showToast({
        title: "Order deleted",
        description: `${order.orderNumber} was removed successfully.`,
      });
    } catch (error) {
      console.error("Failed to delete order", error);
      showToast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not delete order.",
      });
    } finally {
      setDeletingOrderId("");
    }
  };

  const saveOrderDetails = async () => {
    if (!focusedOrder || !focusedRawOrder) return;

    const normalizedEmail = String(orderEditor.user_email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      showToast({ title: "Email is required", description: "Please enter a customer email." });
      return;
    }

    const normalizedPaymentStatus = String(orderEditor.payment_status || "")
      .trim()
      .toLowerCase();

    const patch = {
      customer_name: String(orderEditor.customer_name || "").trim() || null,
      user_email: normalizedEmail,
      phone: String(orderEditor.phone || "").trim() || null,
      address: String(orderEditor.address || "").trim() || null,
      directions: String(orderEditor.directions || "").trim() || null,
      city: String(orderEditor.city || "").trim() || null,
      state: String(orderEditor.state || "").trim() || null,
      zipCode: String(orderEditor.zipCode || "").trim() || null,
      country: String(orderEditor.country || "").trim() || null,
      shipping_address: String(orderEditor.shipping_address || "").trim() || null,
      payment_method: String(orderEditor.payment_method || "").trim() || null,
      payment_status:
        normalizedPaymentStatus === "paid" || normalizedPaymentStatus === "pending"
          ? normalizedPaymentStatus
          : null,
      status_note: String(orderEditor.status_note || "").trim() || null,
      subtotal: Math.max(0, Number(orderEditor.subtotal || 0)),
      shipping: Math.max(0, Number(orderEditor.shipping || 0)),
      tax: Math.max(0, Number(orderEditor.tax || 0)),
      total: Math.max(0, Number(orderEditor.total || 0)),
      updated_at: Timestamp.now(),
    };

    setSavingDetailsOrderId(focusedOrder.id);
    try {
      await updateDoc(doc(db, "orders", focusedOrder.id), patch);

      const userId = String(focusedRawOrder.user_id || "").trim();
      if (userId) {
        try {
          await updateDoc(doc(db, "users", userId, "orders", focusedOrder.id), patch);
        } catch {
          // Skip if user mirror document is missing.
        }
      }

      showToast({
        title: "Order details saved",
        description: `${focusedOrder.orderNumber} was updated.`,
      });
    } catch (error) {
      console.error("Failed to save order details", error);
      showToast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save order details.",
      });
    } finally {
      setSavingDetailsOrderId("");
    }
  };

  const saveOrderItems = async () => {
    if (!focusedOrder || !focusedRawOrder) return;

    const sanitizedItems = orderItemsEditor.map((item) => {
      const quantity = Math.max(1, Number(item?.quantity || 1));
      const price = Math.max(0, Number(item?.price ?? item?.unitPrice ?? 0));
      const retail = Number(item?.retail_price);
      const cost = Number(item?.cost_price);
      const commission = Number(item?.commission_percentage);
      const manualProfit = Number(item?.unit_profit);
      return {
        product_id: String(item?.product_id || "").trim() || null,
        product_name: String(item?.product_name || "").trim() || null,
        product_image: String(item?.product_image || "").trim() || null,
        size: String(item?.size || "").trim() || null,
        quantity,
        price,
        unitPrice: price,
        retail_price: Number.isFinite(retail) && retail > 0 ? Math.max(0, retail) : null,
        cost_price: Number.isFinite(cost) && cost > 0 ? Math.max(0, cost) : null,
        commission_percentage:
          Number.isFinite(commission) && commission > 0 ? Math.max(0, commission) : null,
        unit_profit:
          Number.isFinite(manualProfit) && manualProfit > 0 ? Math.max(0, manualProfit) : null,
      };
    });

    const recomputedSubtotal = sanitizedItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
    const recomputedProfit = sanitizedItems.reduce((sum, item) => {
      const quantity = Math.max(1, Number(item.quantity || 1));
      const unitSalePrice = Math.max(0, Number(item.price || item.unitPrice || 0));
      const productId = String(item.product_id || "").trim();
      const productDoc = productById.get(productId);
      const unitProfit = getUnitProfitFromOrderItemDoc(item, productDoc, unitSalePrice);
      return sum + unitProfit * quantity;
    }, 0);
    const shippingAmount = Math.max(0, Number(orderEditor.shipping || 0));
    const taxAmount = Math.max(0, Number(orderEditor.tax || 0));
    const recomputedTotal = recomputedSubtotal + shippingAmount + taxAmount;

    const patch = {
      items: sanitizedItems,
      subtotal: recomputedSubtotal,
      total: recomputedTotal,
      profit: recomputedProfit,
      updated_at: Timestamp.now(),
    };

    setSavingDetailsOrderId(focusedOrder.id);
    try {
      await updateDoc(doc(db, "orders", focusedOrder.id), patch);
      const userId = String(focusedRawOrder.user_id || "").trim();
      if (userId) {
        try {
          await updateDoc(doc(db, "users", userId, "orders", focusedOrder.id), patch);
        } catch {
          // Skip if user mirror document is missing.
        }
      }

      setOrderEditor((prev) => ({ ...prev, subtotal: recomputedSubtotal, total: recomputedTotal }));
      showToast({
        title: "Order items saved",
        description: `${focusedOrder.orderNumber} line items were updated.`,
      });
    } catch (error) {
      console.error("Failed to save order items", error);
      showToast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save order items.",
      });
    } finally {
      setSavingDetailsOrderId("");
    }
  };

  const addProductToOrderEditor = (productId: string) => {
    const product = productsRaw.find((entry) => String(entry.id || "").trim() === productId);
    if (!product) return;

    const normalizedSizes = Array.isArray(product.sizes)
      ? product.sizes.map((size) => String(size || "").trim()).filter(Boolean)
      : [];
    const soldOutSizes = new Set(
      Array.isArray(product.sold_out_sizes)
        ? product.sold_out_sizes.map((size) => String(size || "").trim()).filter(Boolean)
        : []
    );
    const defaultSize =
      normalizedSizes.find((size) => !soldOutSizes.has(size)) || normalizedSizes[0] || "";
    const salePrice = Math.max(0, Number(product.price || 0));
    const retailPrice = Math.max(0, Number(product.original_price || product.price || 0));
    const costPrice = Math.max(0, Number(product.cost_price || 0));
    const commission = Math.max(0, Number(product.commission_percentage || 0));

    setOrderItemsEditor((prev) => [
      ...prev,
      {
        product_id: String(product.id || "").trim(),
        product_name: String(product.name || "Product").trim(),
        product_image: String(product.image_url || "").trim() || undefined,
        size: defaultSize || undefined,
        quantity: 1,
        price: salePrice,
        unitPrice: salePrice,
        retail_price: retailPrice > 0 ? retailPrice : undefined,
        cost_price: costPrice > 0 ? costPrice : undefined,
        commission_percentage: commission > 0 ? commission : undefined,
      },
    ]);
    setIsAddProductModalOpen(false);
    setAddProductSearchQuery("");
  };

  return (
    <div className="adm-page">
      <PageHeader
        title={focusedOrder ? focusedOrder.orderNumber : "Orders"}
        breadcrumbs={
          focusedOrder
            ? [
                { label: "Admin", href: "/admin/overview" },
                { label: "Orders", href: "/admin/orders" },
                { label: focusedOrder.orderNumber },
              ]
            : [{ label: "Admin", href: "/admin/overview" }, { label: "Orders" }]
        }
        description={
          focusedOrder
            ? "Full-screen order detail and editing view."
            : "Track payments, fulfillment, and customer requests from one workflow."
        }
        primaryAction={
          focusedOrder ? (
            <button
              type="button"
              className="adm-button adm-button--ghost"
              onClick={() => navigate("/admin/orders")}
            >
              Back to orders
            </button>
          ) : (
            <button type="button" className="adm-button adm-button--primary">
              <Plus size={16} />
              Create order
            </button>
          )
        }
        secondaryActions={
          focusedOrder ? null : (
            <button type="button" className="adm-button adm-button--ghost">
              <Download size={16} />
              Export
            </button>
          )
        }
      />

      {!isDetailView ? (
        <>
          <FilterBar savedViews={orderSavedViews} activeView={activeView} onViewChange={setActiveView}>
            <label className="adm-inline-field">
              <Filter size={15} />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All payment statuses</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
              </select>
            </label>
            <input
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                const next = new URLSearchParams(searchParams);
                if (value.trim()) next.set("q", value);
                else next.delete("q");
                setSearchParams(next, { replace: true });
              }}
              className="adm-input"
              placeholder="Search by order #, customer, email"
              aria-label="Search orders"
            />
          </FilterBar>

          {selectedIds.length > 0 ? (
            <div className="adm-bulk-toolbar" role="status">
              <strong>{selectedIds.length} selected</strong>
              <div>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() =>
                    showToast({
                      title: "Bulk action queued",
                      description: "Selected rows were queued for fulfillment.",
                    })
                  }
                >
                  Mark fulfilled
                </button>
                <button type="button" className="adm-button adm-button--ghost" onClick={clearSelection}>
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          <section className="adm-card adm-panel adm-orders-panel">
            {loading ? <p className="adm-muted">Loading orders from Firestore...</p> : null}
            {!loading && filteredRows.length === 0 ? (
              <EmptyState
                title="No matching orders"
                description="Try adjusting filters or wait for new Firestore orders to arrive."
              />
            ) : null}
            {!loading && filteredRows.length > 0 ? (
              <DataTable
                rows={filteredRows}
                columns={columns}
                selectedIds={selectedIds}
                onToggleRow={toggleRow}
                onTogglePage={toggleVisibleRows}
                page={page}
                pageSize={8}
                onPageChange={setPage}
                onRowClick={(row) => navigate(`/admin/orders/${row.id}`)}
                rowActions={[
                  {
                    label: "Download receipt",
                    onClick: (row) => {
                      downloadOrderReceipt(row);
                    },
                  },
                  {
                    label: "Send invoice",
                    onClick: (row) =>
                      showToast({
                        title: "Invoice sent",
                        description: `Invoice sent to ${row.email}.`,
                      }),
                  },
                  {
                    label: "Delete order",
                    onClick: (row) => {
                      void deleteOrder(row);
                    },
                  },
                ]}
              />
            ) : null}
          </section>

          <section>
            <article className="adm-card adm-panel">
              <header className="adm-panel__header">
                <h3>Recent orders</h3>
              </header>
              {loading ? <p className="adm-muted">Loading recent orders...</p> : null}
              {!loading && recentOrders.length === 0 ? (
                <EmptyState title="No orders yet" description="Recent orders will appear here." />
              ) : null}
              {!loading && recentOrders.length > 0 ? (
                <div className="adm-mini-table">
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="adm-mini-table__row"
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/admin/orders/${order.id}`)}
                    >
                      <div>
                        <p>{order.orderNumber}</p>
                        <p className="adm-muted">{order.customer}</p>
                      </div>
                      <StatusBadge
                        tone={
                          order.paymentStatus === "paid"
                            ? "success"
                            : order.paymentStatus === "pending"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {order.paymentStatus}
                      </StatusBadge>
                      <strong>{money.format(order.total)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          </section>
        </>
      ) : null}

      {focusedOrder ? (
          <section className="adm-card adm-panel adm-orders-panel" aria-label="Order detail page">
            <header>
              <div>
                <h3>{focusedOrder.orderNumber}</h3>
                <p className="adm-muted">Detailed order breakdown</p>
              </div>
              <button
                type="button"
                className="adm-button adm-button--ghost"
                onClick={() => navigate("/admin/orders")}
              >
                Back to orders
              </button>
            </header>
            <dl className="adm-order-meta">
              <div>
                <dt>Customer</dt>
                <dd>{focusedOrder.customer}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{focusedOrder.email}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{focusedOrder.location}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>
                  <StatusBadge tone={paymentTone[focusedOrder.paymentStatus]}>{focusedOrder.paymentStatus}</StatusBadge>
                </dd>
              </div>
              <div>
                <dt>Shipment</dt>
                <dd>
                  <select
                    value={focusedOrder.shipmentStatus}
                    onChange={async (event) => {
                      await updateStatus(focusedOrder.id, event.target.value as OrderStatus);
                    }}
                    className="adm-input"
                    disabled={savingStatusOrderId === focusedOrder.id}
                  >
                    {allStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
              <div>
                <dt>Fulfillment</dt>
                <dd className="adm-order-meta__fulfillment">
                  <StatusBadge tone={fulfillmentTone[focusedOrder.fulfillmentStatus]}>
                    {focusedOrder.fulfillmentStatus}
                  </StatusBadge>
                  <button
                    type="button"
                    className="adm-button adm-button--ghost"
                    onClick={() => {
                      void toggleFulfillment(focusedOrder.id);
                    }}
                    disabled={savingFulfillmentOrderId === focusedOrder.id}
                  >
                    {savingFulfillmentOrderId === focusedOrder.id
                      ? "Saving..."
                      : focusedOrder.fulfillmentStatus === "fulfilled"
                      ? "Mark unfulfilled"
                      : "Mark fulfilled"}
                  </button>
                </dd>
              </div>
            </dl>
            <section className="adm-card adm-panel" style={{ marginTop: 12 }}>
              <header className="adm-panel__header">
                <h4>Edit order details</h4>
                <button
                  type="button"
                  className="adm-button adm-button--primary"
                  onClick={() => {
                    void saveOrderDetails();
                  }}
                  disabled={savingDetailsOrderId === focusedOrder.id}
                >
                  {savingDetailsOrderId === focusedOrder.id ? "Saving..." : "Save order details"}
                </button>
              </header>
              <div className="adm-form-grid">
                <label>
                  Customer name
                  <input
                    className="adm-input"
                    value={orderEditor.customer_name}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, customer_name: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Email
                  <input
                    className="adm-input"
                    value={orderEditor.user_email}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, user_email: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Phone
                  <input
                    className="adm-input"
                    value={orderEditor.phone}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, phone: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Payment method
                  <input
                    className="adm-input"
                    value={orderEditor.payment_method}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, payment_method: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Payment status
                  <select
                    className="adm-input"
                    value={orderEditor.payment_status}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, payment_status: event.target.value }))
                    }
                  >
                    <option value="">Select status</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </label>
                <label>
                  City
                  <input
                    className="adm-input"
                    value={orderEditor.city}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, city: event.target.value }))
                    }
                  />
                </label>
                <label>
                  State
                  <input
                    className="adm-input"
                    value={orderEditor.state}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, state: event.target.value }))
                    }
                  />
                </label>
                <label>
                  ZIP
                  <input
                    className="adm-input"
                    value={orderEditor.zipCode}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, zipCode: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Country
                  <input
                    className="adm-input"
                    value={orderEditor.country}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, country: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Subtotal
                  <input
                    className="adm-input"
                    type="number"
                    value={orderEditor.subtotal}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, subtotal: Number(event.target.value || 0) }))
                    }
                  />
                </label>
                <label>
                  Shipping
                  <input
                    className="adm-input"
                    type="number"
                    value={orderEditor.shipping}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, shipping: Number(event.target.value || 0) }))
                    }
                  />
                </label>
                <label>
                  Tax
                  <input
                    className="adm-input"
                    type="number"
                    value={orderEditor.tax}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, tax: Number(event.target.value || 0) }))
                    }
                  />
                </label>
                <label>
                  Total
                  <input
                    className="adm-input"
                    type="number"
                    value={orderEditor.total}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, total: Number(event.target.value || 0) }))
                    }
                  />
                </label>
                <label className="adm-form-grid__full">
                  Address
                  <input
                    className="adm-input"
                    value={orderEditor.address}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, address: event.target.value }))
                    }
                  />
                </label>
                <label className="adm-form-grid__full">
                  Shipping address
                  <input
                    className="adm-input"
                    value={orderEditor.shipping_address}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, shipping_address: event.target.value }))
                    }
                  />
                </label>
                <label className="adm-form-grid__full">
                  Directions
                  <input
                    className="adm-input"
                    value={orderEditor.directions}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, directions: event.target.value }))
                    }
                  />
                </label>
                <label className="adm-form-grid__full">
                  Status note
                  <input
                    className="adm-input"
                    value={orderEditor.status_note}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, status_note: event.target.value }))
                    }
                  />
                </label>
              </div>
            </section>
            <section className="adm-order-items">
              <div className="adm-order-items__header">
                <div>
                  <h4>Order items</h4>
                  <p className="adm-muted">{focusedOrderItems.length} line items</p>
                </div>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() => setIsAddProductModalOpen(true)}
                >
                  <Plus size={14} />
                  Add product
                </button>
              </div>
              {focusedOrderItems.length === 0 ? (
                <p className="adm-muted">No items were found for this order.</p>
              ) : (
                <div className="adm-mini-table">
                  {focusedOrderItems.map((item, index) => (
                    <div key={item.id} className="adm-mini-table__row adm-mini-table__row--order-item">
                      <div className="adm-product-cell">
                        {item.imageUrl ? <img src={item.imageUrl} alt={item.displayName} /> : null}
                        <div>
                          <input
                            className="adm-input"
                            value={String(orderItemsEditor[index]?.product_name || item.displayName)}
                            onChange={(event) =>
                              updateOrderItemEditor(index, "product_name", event.target.value)
                            }
                          />
                          <p className="adm-muted">
                            {item.productId ? `ID: ${item.productId}` : "ID: -"} ·{" "}
                            {item.size ? `Size: ${item.size}` : "Size: -"} · Qty {item.quantity}
                          </p>
                          <div className="adm-form-grid" style={{ marginTop: 8 }}>
                            <label>
                              Size
                              <input
                                className="adm-input"
                                value={String(orderItemsEditor[index]?.size || "")}
                                onChange={(event) =>
                                  updateOrderItemEditor(index, "size", event.target.value)
                                }
                              />
                            </label>
                            <label>
                              Quantity
                              <input
                                className="adm-input"
                                type="number"
                                value={Number(orderItemsEditor[index]?.quantity || 1)}
                                onChange={(event) =>
                                  updateOrderItemEditor(
                                    index,
                                    "quantity",
                                    Math.max(1, Number(event.target.value || 1))
                                  )
                                }
                              />
                            </label>
                            <label>
                              Sale price
                              <input
                                className="adm-input"
                                type="number"
                                value={Number(orderItemsEditor[index]?.price || 0)}
                                onChange={(event) => {
                                  const next = Math.max(0, Number(event.target.value || 0));
                                  updateOrderItemEditor(index, "price", next);
                                  updateOrderItemEditor(index, "unitPrice", next);
                                }}
                              />
                            </label>
                            <label>
                              Retail price
                              <input
                                className="adm-input"
                                type="number"
                                value={Number(orderItemsEditor[index]?.retail_price || 0)}
                                onChange={(event) =>
                                  updateOrderItemEditor(
                                    index,
                                    "retail_price",
                                    Math.max(0, Number(event.target.value || 0))
                                  )
                                }
                              />
                            </label>
                            <label>
                              Cost price
                              <input
                                className="adm-input"
                                type="number"
                                value={Number(orderItemsEditor[index]?.cost_price || 0)}
                                onChange={(event) =>
                                  updateOrderItemEditor(
                                    index,
                                    "cost_price",
                                    Math.max(0, Number(event.target.value || 0))
                                  )
                                }
                              />
                            </label>
                            <label>
                              Commission (%)
                              <input
                                className="adm-input"
                                type="number"
                                value={Number(orderItemsEditor[index]?.commission_percentage || 0)}
                                onChange={(event) =>
                                  updateOrderItemEditor(
                                    index,
                                    "commission_percentage",
                                    Math.max(0, Number(event.target.value || 0))
                                  )
                                }
                              />
                            </label>
                            <label>
                              Manual unit profit
                              <input
                                className="adm-input"
                                type="number"
                                value={
                                  orderItemsEditor[index]?.unit_profit === undefined
                                    ? ""
                                    : Number(orderItemsEditor[index]?.unit_profit)
                                }
                                onChange={(event) => {
                                  const rawValue = event.target.value;
                                  if (!rawValue.trim()) {
                                    updateOrderItemEditor(index, "unit_profit", undefined);
                                    return;
                                  }
                                  const parsed = Number(rawValue);
                                  if (!Number.isFinite(parsed) || parsed <= 0) {
                                    updateOrderItemEditor(index, "unit_profit", undefined);
                                    return;
                                  }
                                  updateOrderItemEditor(
                                    index,
                                    "unit_profit",
                                    parsed
                                  );
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="adm-order-item__money">
                        <p className="adm-muted">{money.format(item.unitPrice)} each</p>
                        <p className="adm-muted">Profit/item {money.format(item.unitProfit)}</p>
                        <p>{money.format(item.lineTotal)}</p>
                        <p className="adm-order-item__profit">Profit {money.format(item.lineProfit)}</p>
                        <button
                          type="button"
                          className="adm-button adm-button--ghost"
                          onClick={() => removeOrderItemEditor(index)}
                          style={{ marginTop: 8 }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <button
                  type="button"
                  className="adm-button adm-button--primary"
                  onClick={() => {
                    void saveOrderItems();
                  }}
                  disabled={savingDetailsOrderId === focusedOrder.id}
                >
                  {savingDetailsOrderId === focusedOrder.id ? "Saving..." : "Save order items"}
                </button>
              </div>
              <div className="adm-order-summary">
                <div>
                  <span>Subtotal</span>
                  <strong>{money.format(editedOrderSubtotal)}</strong>
                </div>
                <div>
                  <span>Estimated profit</span>
                  <strong>{money.format(focusedOrderProfit)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{money.format(editedOrderTotal)}</strong>
                </div>
              </div>
            </section>
            <div className="adm-order-actions">
              <button
                type="button"
                className="adm-button adm-button--primary"
                onClick={() =>
                  showToast({
                    title: "Customer notified",
                    description: `Update sent for ${focusedOrder.orderNumber}.`,
                  })
                }
              >
                Send update
              </button>
              <button
                type="button"
                className="adm-button adm-button--ghost"
                onClick={() => {
                  void deleteOrder(focusedOrder);
                }}
                disabled={deletingOrderId === focusedOrder.id}
              >
                {deletingOrderId === focusedOrder.id ? "Deleting..." : "Delete order"}
              </button>
            </div>
            <Modal
              open={isAddProductModalOpen}
              title="Add product to order"
              onClose={() => {
                setIsAddProductModalOpen(false);
                setAddProductSearchQuery("");
              }}
              footer={
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() => {
                    setIsAddProductModalOpen(false);
                    setAddProductSearchQuery("");
                  }}
                >
                  Close
                </button>
              }
            >
              <div className="adm-order-product-picker">
                <input
                  className="adm-input"
                  placeholder="Search products by name, SKU, category, or type"
                  value={addProductSearchQuery}
                  onChange={(event) => setAddProductSearchQuery(event.target.value)}
                  aria-label="Search products"
                />
                <div className="adm-order-product-picker__list">
                  {addableProducts.length === 0 ? (
                    <p className="adm-muted">No products match this search.</p>
                  ) : (
                    addableProducts.map((product) => {
                      const productId = String(product.id || "").trim();
                      const name = String(product.name || "Untitled product").trim();
                      const sku = String(product.sku || "").trim() || "-";
                      const price = Math.max(0, Number(product.price || 0));
                      const imageUrl = String(product.image_url || "").trim();
                      return (
                        <div key={productId} className="adm-order-product-picker__row">
                          <div className="adm-product-cell">
                            {imageUrl ? <img src={imageUrl} alt={name} /> : null}
                            <div>
                              <p>{name}</p>
                              <p className="adm-muted">
                                SKU: {sku} · {String(product.category || "Uncategorized")}
                              </p>
                            </div>
                          </div>
                          <div className="adm-order-product-picker__actions">
                            <strong>{money.format(price)}</strong>
                            <button
                              type="button"
                              className="adm-button adm-button--primary"
                              onClick={() => addProductToOrderEditor(productId)}
                              disabled={!productId}
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </Modal>
          </section>
      ) : isDetailView ? (
        <section className="adm-card adm-panel adm-orders-panel">
          <EmptyState
            title="Order not found"
            description="This order might have been deleted or is no longer available."
          />
          <button
            type="button"
            className="adm-button adm-button--ghost"
            onClick={() => navigate("/admin/orders")}
          >
            Back to orders
          </button>
        </section>
      ) : null}
    </div>
  );
}
