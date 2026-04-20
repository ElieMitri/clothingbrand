import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { FormSection } from "../components/FormSection";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../hooks/useToast";
import { useAdminLiveData } from "../hooks/useAdminLiveData";
import { toDate } from "../../lib/storefront";

interface DiscountCodeDoc {
  id: string;
  code: string;
  type: "amount" | "percent";
  value: number;
  status: "active" | "scheduled" | "expired";
  usage_count?: number;
  starts_at?: unknown;
  ends_at?: unknown;
}

interface DiscountViewRow {
  id: string;
  code: string;
  type: string;
  usage: string;
  status: "active" | "scheduled" | "expired";
  source: "code" | "product";
}

const tone: Record<DiscountViewRow["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  scheduled: "warning",
  expired: "neutral",
};

export function DiscountsPage() {
  const { showToast } = useToast();
  const { loading, productsRaw, saleSettings } = useAdminLiveData();
  const [discountCodes, setDiscountCodes] = useState<DiscountCodeDoc[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    type: "percent" as "percent" | "amount",
    value: 10,
    status: "active" as "active" | "scheduled" | "expired",
  });
  const [saleForm, setSaleForm] = useState({
    show_sale_link: false,
    sale_title: "SEASONAL SALE",
    sale_headline: "UP TO 70% OFF",
    sale_subtitle: "Limited Time Offer",
    end_at_input: "",
  });

  useEffect(() => {
    return onSnapshot(collection(db, "discount_codes"), (snap) => {
      const rows = snap.docs.map((entry) => ({
        id: entry.id,
        ...(entry.data() as Omit<DiscountCodeDoc, "id">),
      }));
      setDiscountCodes(rows);
    });
  }, []);

  useEffect(() => {
    if (!saleSettings) return;
    const endAt = saleSettings.end_at as { toDate?: () => Date } | string | null | undefined;
    let endAtInput = "";
    if (endAt && typeof endAt === "object" && typeof endAt.toDate === "function") {
      endAtInput = endAt.toDate().toISOString().slice(0, 16);
    } else if (typeof endAt === "string") {
      endAtInput = endAt.slice(0, 16);
    }
    setSaleForm({
      show_sale_link: Boolean(saleSettings.show_sale_link),
      sale_title: String(saleSettings.sale_title || "SEASONAL SALE"),
      sale_headline: String(saleSettings.sale_headline || "UP TO 70% OFF"),
      sale_subtitle: String(saleSettings.sale_subtitle || "Limited Time Offer"),
      end_at_input: endAtInput,
    });
  }, [saleSettings]);

  const productDiscountRows: DiscountViewRow[] = useMemo(() => {
    return productsRaw
      .filter((product) => Number(product.discount_percentage || 0) > 0)
      .map((product) => ({
        id: `product-${product.id}`,
        code: `${String(product.name || "Untitled")} sale`,
        type: `${Number(product.discount_percentage || 0)}% off`,
        usage: "Auto-applied on product",
        status: saleSettings?.show_sale_link ? "active" : "scheduled",
        source: "product",
      }));
  }, [productsRaw, saleSettings?.show_sale_link]);

  const codeRows: DiscountViewRow[] = useMemo(() => {
    const now = new Date();
    return discountCodes.map((entry) => {
      const endAt = entry.ends_at ? toDate(entry.ends_at) : null;
      const startsAt = entry.starts_at ? toDate(entry.starts_at) : null;
      let status = entry.status;
      if (endAt && endAt < now) status = "expired";
      if (startsAt && startsAt > now && status !== "expired") status = "scheduled";

      return {
        id: entry.id,
        code: String(entry.code || "-").toUpperCase(),
        type: entry.type === "percent" ? `${entry.value}% off` : `$${entry.value} off`,
        usage: `${Number(entry.usage_count || 0)} uses`,
        status,
        source: "code",
      };
    });
  }, [discountCodes]);

  const rows = useMemo(() => [...codeRows, ...productDiscountRows], [codeRows, productDiscountRows]);

  const columns: DataTableColumn<DiscountViewRow>[] = [
    {
      key: "code",
      header: "Code",
      render: (row) => (
        <div>
          <p>{row.code}</p>
          <p className="adm-muted">{row.source === "product" ? "Product discount" : "Discount code"}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (row) => row.type },
    { key: "usage", header: "Usage", render: (row) => row.usage },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge tone={tone[row.status]}>{row.status}</StatusBadge>,
    },
  ];

  const createDiscountCode = async () => {
    if (!form.code.trim()) {
      showToast({ title: "Discount code is required" });
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "discount_codes"), {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value || 0),
        status: form.status,
        usage_count: 0,
        starts_at: Timestamp.now(),
        created_at: Timestamp.now(),
      });
      showToast({ title: "Discount created", description: `${form.code.toUpperCase()} is now live.` });
      setForm({ code: "", type: "percent", value: 10, status: "active" });
    } catch (error) {
      console.error("Failed to create discount code", error);
      showToast({ title: "Create failed", description: "Could not create discount code." });
    } finally {
      setSaving(false);
    }
  };

  const archiveSelectedCodes = async () => {
    const codeOnlyIds = selectedIds.filter((id) => !id.startsWith("product-"));
    if (codeOnlyIds.length === 0) {
      showToast({ title: "No discount-code rows selected" });
      return;
    }

    setSaving(true);
    try {
      await Promise.all(
        codeOnlyIds.map((id) =>
          updateDoc(doc(db, "discount_codes", id), {
            status: "expired",
            updated_at: Timestamp.now(),
          })
        )
      );
      setSelectedIds([]);
      showToast({ title: "Selected discounts archived" });
    } catch (error) {
      console.error("Failed to archive discounts", error);
      showToast({ title: "Archive failed", description: "Could not update selected discounts." });
    } finally {
      setSaving(false);
    }
  };

  const saveSaleSettings = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, "site_settings", "sale"),
        {
          show_sale_link: saleForm.show_sale_link,
          sale_title: saleForm.sale_title.trim() || "SEASONAL SALE",
          sale_headline: saleForm.sale_headline.trim() || "UP TO 70% OFF",
          sale_subtitle: saleForm.sale_subtitle.trim() || "Limited Time Offer",
          end_at: saleForm.end_at_input ? new Date(saleForm.end_at_input) : null,
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );
      showToast({ title: "Sale settings saved" });
    } catch (error) {
      console.error("Failed to save sale settings", error);
      showToast({ title: "Save failed", description: "Could not update sale settings." });
    } finally {
      setSaving(false);
    }
  };

  const endSaleNow = async () => {
    setSaving(true);
    try {
      const discounted = await getDocs(
        query(collection(db, "products"), where("discount_percentage", ">", 0))
      );
      const batch = writeBatch(db);
      discounted.docs.forEach((entry) => {
        batch.update(entry.ref, { discount_percentage: 0, updated_at: Timestamp.now() });
      });
      batch.set(
        doc(db, "site_settings", "sale"),
        {
          show_sale_link: false,
          end_at: Timestamp.now(),
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );
      await batch.commit();
      showToast({
        title: "Sale ended",
        description: `Removed discounts from ${discounted.size} product${discounted.size === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      console.error("Failed to end sale", error);
      showToast({ title: "Sale end failed", description: "Could not end active sale." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-page">
      <PageHeader
        title="Discounts"
        breadcrumbs={[{ label: "Admin", href: "/admin/overview" }, { label: "Discounts" }]}
        description="Live promotion data from discount codes and product-level sale rules."
      />

      {selectedIds.length > 0 ? (
        <div className="adm-bulk-toolbar" role="status">
          <strong>{selectedIds.length} selected</strong>
          <div>
            <button type="button" className="adm-button adm-button--ghost" onClick={archiveSelectedCodes}>
              {saving ? "Archiving..." : "Archive selected"}
            </button>
            <button type="button" className="adm-button adm-button--ghost" onClick={() => setSelectedIds([])}>
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <section className="adm-grid adm-grid--editor">
        <article className="adm-card adm-panel">
          {loading ? <p className="adm-muted">Loading discounts...</p> : null}
          {!loading && rows.length === 0 ? (
            <EmptyState
              title="No active discounts"
              description="Create a discount code or apply product discount percentages."
            />
          ) : null}
          {!loading && rows.length > 0 ? (
            <DataTable
              rows={rows}
              columns={columns}
              selectedIds={selectedIds}
              onToggleRow={(id) =>
                setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))
              }
              onTogglePage={() => setSelectedIds(rows.map((row) => row.id))}
              page={page}
              pageSize={8}
              onPageChange={setPage}
            />
          ) : null}
        </article>

        <FormSection title="Create discount code" description="Save to Firestore collection `discount_codes`.">
          <label>
            Code
            <input
              className="adm-input"
              placeholder="SUMMER15"
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
            />
          </label>
          <label>
            Type
            <select
              className="adm-input"
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, type: event.target.value as "percent" | "amount" }))
              }
            >
              <option value="percent">Percentage</option>
              <option value="amount">Fixed amount</option>
            </select>
          </label>
          <label>
            Value
            <input
              className="adm-input"
              type="number"
              value={form.value}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, value: Number(event.target.value || 0) }))
              }
            />
          </label>
          <label>
            Status
            <select
              className="adm-input"
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as "active" | "scheduled" | "expired",
                }))
              }
            >
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label className="adm-form-grid__full">
            <button type="button" className="adm-button adm-button--primary" onClick={createDiscountCode}>
              {saving ? "Saving..." : "Create discount"}
            </button>
          </label>
        </FormSection>
      </section>

      <section className="adm-grid adm-grid--two">
        <FormSection title="Sale controls" description="Legacy sale controls brought into the new UI.">
          <label className="adm-toggle adm-form-grid__full">
            <input
              type="checkbox"
              checked={saleForm.show_sale_link}
              onChange={(event) =>
                setSaleForm((prev) => ({ ...prev, show_sale_link: event.target.checked }))
              }
            />
            Show sale link in storefront
          </label>
          <label>
            Sale title
            <input
              className="adm-input"
              value={saleForm.sale_title}
              onChange={(event) => setSaleForm((prev) => ({ ...prev, sale_title: event.target.value }))}
            />
          </label>
          <label>
            Headline
            <input
              className="adm-input"
              value={saleForm.sale_headline}
              onChange={(event) =>
                setSaleForm((prev) => ({ ...prev, sale_headline: event.target.value }))
              }
            />
          </label>
          <label className="adm-form-grid__full">
            Subtitle
            <input
              className="adm-input"
              value={saleForm.sale_subtitle}
              onChange={(event) =>
                setSaleForm((prev) => ({ ...prev, sale_subtitle: event.target.value }))
              }
            />
          </label>
          <label className="adm-form-grid__full">
            End at
            <input
              className="adm-input"
              type="datetime-local"
              value={saleForm.end_at_input}
              onChange={(event) => setSaleForm((prev) => ({ ...prev, end_at_input: event.target.value }))}
            />
          </label>
          <label className="adm-form-grid__full" style={{ display: "flex", gap: 8 }}>
            <button type="button" className="adm-button adm-button--primary" onClick={saveSaleSettings}>
              {saving ? "Saving..." : "Save sale settings"}
            </button>
            <button type="button" className="adm-button adm-button--ghost" onClick={endSaleNow}>
              End sale now
            </button>
          </label>
        </FormSection>
      </section>
    </div>
  );
}
