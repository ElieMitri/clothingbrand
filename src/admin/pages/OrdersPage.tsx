import { useMemo, useState } from "react";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { Download, Filter, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { orderSavedViews } from "../data/adminConstants";
import type { OrderRow } from "../types";
import { useToast } from "../hooks/useToast";
import { useAdminLiveData } from "../hooks/useAdminLiveData";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [activeView, setActiveView] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [focusedOrder, setFocusedOrder] = useState<OrderRow | null>(null);
  const [savingStatusOrderId, setSavingStatusOrderId] = useState<string>("");
  const [savingFulfillmentOrderId, setSavingFulfillmentOrderId] = useState<string>("");
  const [deletingOrderId, setDeletingOrderId] = useState<string>("");
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

  const productNameById = useMemo(() => {
    const byId = new Map<string, string>();
    productsRaw.forEach((product) => {
      const id = String(product.id || "").trim();
      if (!id) return;
      const name = String(product.name || "").trim();
      if (!name) return;
      byId.set(id, name);
    });
    return byId;
  }, [productsRaw]);

  const focusedRawOrder = useMemo(() => {
    if (!focusedOrder) return null;
    return ordersRaw.find((entry) => entry.id === focusedOrder.id) || null;
  }, [focusedOrder, ordersRaw]);

  const focusedOrderItems = useMemo(() => {
    if (!focusedRawOrder || !Array.isArray(focusedRawOrder.items)) return [];
    return focusedRawOrder.items.map((item, index) => {
      const productId = String(item?.product_id || "").trim();
      const quantity = Math.max(1, Number(item?.quantity || 0) || 1);
      const unitPrice = Math.max(0, Number(item?.price ?? item?.unitPrice ?? 0));
      const lineTotal = unitPrice * quantity;
      const displayName = String(item?.product_name || "").trim() || productNameById.get(productId) || "Product";
      const size = String(item?.size || "").trim();
      const imageUrl = String(item?.product_image || "").trim();
      return {
        id: `${productId || "item"}-${index}`,
        displayName,
        productId,
        size,
        quantity,
        unitPrice,
        lineTotal,
        imageUrl,
      };
    });
  }, [focusedRawOrder, productNameById]);

  const focusedOrderSubtotal = useMemo(() => {
    const explicitSubtotal = Number(focusedRawOrder?.subtotal || 0);
    if (explicitSubtotal > 0) return explicitSubtotal;
    return focusedOrderItems.reduce((sum, item) => sum + item.lineTotal, 0);
  }, [focusedOrderItems, focusedRawOrder]);

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
        setFocusedOrder(null);
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

  return (
    <div className="adm-page">
      <PageHeader
        title="Orders"
        breadcrumbs={[{ label: "Admin", href: "/admin/overview" }, { label: "Orders" }]}
        description="Track payments, fulfillment, and customer requests from one workflow."
        primaryAction={
          <button type="button" className="adm-button adm-button--primary">
            <Plus size={16} />
            Create order
          </button>
        }
        secondaryActions={
          <button type="button" className="adm-button adm-button--ghost">
            <Download size={16} />
            Export
          </button>
        }
      />

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
            onRowClick={setFocusedOrder}
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

      {focusedOrder ? (
        <>
          <div className="adm-overlay" onClick={() => setFocusedOrder(null)} />
          <aside className="adm-drawer adm-drawer--full" aria-label="Order detail panel">
            <header>
              <div>
                <h3>{focusedOrder.orderNumber}</h3>
                <p className="adm-muted">Detailed order breakdown</p>
              </div>
              <button type="button" className="adm-button adm-button--ghost" onClick={() => setFocusedOrder(null)}>
                Close
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
            <section className="adm-order-items">
              <div className="adm-order-items__header">
                <h4>Order items</h4>
                <p className="adm-muted">{focusedOrderItems.length} line items</p>
              </div>
              {focusedOrderItems.length === 0 ? (
                <p className="adm-muted">No items were found for this order.</p>
              ) : (
                <div className="adm-mini-table">
                  {focusedOrderItems.map((item) => (
                    <div key={item.id} className="adm-mini-table__row adm-mini-table__row--order-item">
                      <div className="adm-product-cell">
                        {item.imageUrl ? <img src={item.imageUrl} alt={item.displayName} /> : null}
                        <div>
                          <p className="adm-order-item__title">{item.displayName}</p>
                          <p className="adm-muted">
                            {item.productId ? `ID: ${item.productId}` : "ID: -"} ·{" "}
                            {item.size ? `Size: ${item.size}` : "Size: -"} · Qty {item.quantity}
                          </p>
                        </div>
                      </div>
                      <div className="adm-order-item__money">
                        <p className="adm-muted">{money.format(item.unitPrice)} each</p>
                        <p>{money.format(item.lineTotal)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="adm-order-summary">
                <div>
                  <span>Subtotal</span>
                  <strong>{money.format(focusedOrderSubtotal)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{money.format(focusedOrder.total)}</strong>
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
          </aside>
        </>
      ) : null}
    </div>
  );
}
