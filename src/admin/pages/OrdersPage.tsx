import { useMemo, useState } from "react";
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
const shipmentTone: Record<
  OrderRow["shipmentStatus"],
  "neutral" | "warning" | "info" | "success" | "danger"
> = {
  pending: "neutral",
  processing: "warning",
  shipped: "info",
  delivered: "success",
  cancelled: "danger",
};

export function OrdersPage() {
  const { showToast } = useToast();
  const { loading, orders, ordersRaw } = useAdminLiveData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [activeView, setActiveView] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [focusedOrder, setFocusedOrder] = useState<OrderRow | null>(null);
  const [savingStatusOrderId, setSavingStatusOrderId] = useState<string>("");
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
        <StatusBadge tone={fulfillmentTone[row.fulfillmentStatus]}>{row.fulfillmentStatus}</StatusBadge>
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

      <section className="adm-card adm-panel">
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
                label: "Archive",
                onClick: (row) => showToast({ title: `${row.orderNumber} archived` }),
              },
              {
                label: "Send invoice",
                onClick: (row) =>
                  showToast({
                    title: "Invoice sent",
                    description: `Invoice sent to ${row.email}.`,
                  }),
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
            <h3>{focusedOrder.orderNumber}</h3>
            <button type="button" className="adm-button adm-button--ghost" onClick={() => setFocusedOrder(null)}>
              Close
            </button>
          </header>
          <dl>
            <div>
              <dt>Customer</dt>
              <dd>{focusedOrder.customer}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{focusedOrder.email}</dd>
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
              <dd>
                <StatusBadge tone={fulfillmentTone[focusedOrder.fulfillmentStatus]}>
                  {focusedOrder.fulfillmentStatus}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{money.format(focusedOrder.total)}</dd>
            </div>
          </dl>
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
          </aside>
        </>
      ) : null}
    </div>
  );
}
