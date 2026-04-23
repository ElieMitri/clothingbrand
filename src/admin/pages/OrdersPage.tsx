import { useEffect, useMemo, useState } from "react";
import { Timestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { Download, Filter, Plus } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
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
  const [savingDetailsOrderId, setSavingDetailsOrderId] = useState<string>("");
  const [deletingOrderId, setDeletingOrderId] = useState<string>("");
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
      key: "fulfillment",
      header: "Fulfillment",
      render: (row) => (
        <button
          type="button"
          className="adm-button adm-button--ghost"
          onClick={(event) => {
            event.stopPropagation();
            void toggleFulfillment(row.id);
          }}
          disabled={savingFulfillmentOrderId === row.id}
          style={{ height: 32, padding: "0 10px", textTransform: "capitalize" }}
        >
          {savingFulfillmentOrderId === row.id ? "Saving..." : row.fulfillmentStatus}
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
      payment_status: String(orderEditor.payment_status || "").trim() || null,
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
                  <input
                    className="adm-input"
                    value={orderEditor.payment_status}
                    onChange={(event) =>
                      setOrderEditor((prev) => ({ ...prev, payment_status: event.target.value }))
                    }
                  />
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
                <h4>Order items</h4>
                <p className="adm-muted">{focusedOrderItems.length} line items</p>
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
