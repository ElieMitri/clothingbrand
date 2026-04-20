import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import type { CustomerRow } from "../types";
import { useAdminLiveData } from "../hooks/useAdminLiveData";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function CustomersPage() {
  const { loading, customers, orders } = useAdminLiveData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [focusedId, setFocusedId] = useState("");
  const query = (searchParams.get("q") || "").toLowerCase();
  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) =>
        `${customer.name} ${customer.email} ${customer.location}`.toLowerCase().includes(query)
      ),
    [customers, query]
  );

  const focused = useMemo(
    () =>
      filteredCustomers.find((customer) => customer.id === focusedId) ??
      filteredCustomers[0] ??
      null,
    [filteredCustomers, focusedId]
  );

  const customerTimeline = useMemo(() => {
    if (!focused) return [];
    const email = String(focused.email || "").trim().toLowerCase();
    return orders
      .filter((order) => String(order.email || "").trim().toLowerCase() === email)
      .slice(0, 5);
  }, [focused, orders]);

  const columns: DataTableColumn<CustomerRow>[] = [
    {
      key: "name",
      header: "Customer",
      render: (row) => (
        <div>
          <p>{row.name}</p>
          <p className="adm-muted">{row.email}</p>
        </div>
      ),
    },
    { key: "location", header: "Location", render: (row) => row.location },
    { key: "orders", header: "Orders", render: (row) => row.orderCount },
    { key: "spend", header: "Spend", render: (row) => money.format(row.spend) },
  ];

  return (
    <div className="adm-page">
      <PageHeader
        title="Customers"
        breadcrumbs={[{ label: "Admin", href: "/admin/overview" }, { label: "Customers" }]}
        description="Understand buyer behavior, value, and retention opportunities."
      />

      <section className="adm-grid adm-grid--editor">
        <article className="adm-card adm-panel">
          <div className="adm-panel__header">
            <h3>Customer list</h3>
            <input
              className="adm-input"
              placeholder="Search customers"
              value={searchParams.get("q") || ""}
              onChange={(event) => {
                const value = event.target.value;
                const next = new URLSearchParams(searchParams);
                if (value.trim()) next.set("q", value);
                else next.delete("q");
                setSearchParams(next, { replace: true });
              }}
            />
          </div>
          {loading ? <p className="adm-muted">Loading customers from Firestore...</p> : null}
          {!loading && filteredCustomers.length === 0 ? (
            <EmptyState
              title="No customers yet"
              description="Users collection data will appear here in real time."
            />
          ) : null}
          {!loading && filteredCustomers.length > 0 ? (
            <DataTable
              rows={filteredCustomers}
              columns={columns}
              selectedIds={selectedIds}
              onToggleRow={(id) =>
                setSelectedIds((prev) =>
                  prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
                )
              }
              onTogglePage={() =>
                setSelectedIds(filteredCustomers.map((customer) => customer.id))
              }
              page={page}
              pageSize={8}
              onPageChange={setPage}
              onRowClick={(row) => setFocusedId(row.id)}
            />
          ) : null}
        </article>

        <article className="adm-card adm-panel">
          {focused ? (
            <>
              <header className="adm-panel__header">
                <h3>{focused.name}</h3>
                <span className="adm-muted">{focused.location}</span>
              </header>
              <p className="adm-muted">Recent timeline</p>
              {customerTimeline.length === 0 ? (
                <p className="adm-muted">No related orders yet.</p>
              ) : (
                <ul className="adm-timeline">
                  {customerTimeline.map((order) => (
                    <li key={order.id}>
                      <p>
                        Placed {order.orderNumber} for <strong>{money.format(order.total)}</strong>
                      </p>
                      <p className="adm-muted">{order.date}</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <EmptyState
              title="Select a customer"
              description="Choose a row to inspect timeline and order history."
            />
          )}
        </article>
      </section>
    </div>
  );
}
