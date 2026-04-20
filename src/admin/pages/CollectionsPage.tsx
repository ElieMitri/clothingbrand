import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from "firebase/firestore";
import { Plus, Save, Trash2 } from "lucide-react";
import { db } from "../../lib/firebase";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { FormSection } from "../components/FormSection";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../hooks/useToast";
import { useAdminLiveData } from "../hooks/useAdminLiveData";

interface CollectionRow {
  id: string;
  name: string;
  season: string;
  year: number;
  productCount: number;
  isActive: boolean;
  imageUrl: string;
  description: string;
}

const emptyCollection: Omit<CollectionRow, "id"> = {
  name: "",
  season: "Spring",
  year: new Date().getFullYear(),
  productCount: 0,
  isActive: true,
  imageUrl: "",
  description: "",
};

export function CollectionsPage() {
  const { showToast } = useToast();
  const { loading, collectionsRaw } = useAdminLiveData();
  const [selectedId, setSelectedId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editor, setEditor] = useState<Omit<CollectionRow, "id">>(emptyCollection);

  const rows = useMemo<CollectionRow[]>(
    () =>
      collectionsRaw.map((entry) => ({
        id: entry.id,
        name: String(entry.name || "Untitled collection"),
        season: String(entry.season || "-"),
        year: Number(entry.year || new Date().getFullYear()),
        productCount: Number(entry.product_count || 0),
        isActive: Boolean(entry.is_active ?? true),
        imageUrl: String(entry.image_url || ""),
        description: String(entry.description || ""),
      })),
    [collectionsRaw]
  );

  const selectedRow = useMemo(
    () => rows.find((entry) => entry.id === selectedId) || null,
    [rows, selectedId]
  );

  const columns: DataTableColumn<CollectionRow>[] = [
    {
      key: "name",
      header: "Collection",
      render: (row) => (
        <div className="adm-product-cell">
          <img src={row.imageUrl || "https://via.placeholder.com/80x80?text=COLL"} alt={row.name} />
          <div>
            <p>{row.name}</p>
            <p className="adm-muted">
              {row.season} {row.year}
            </p>
          </div>
        </div>
      ),
    },
    { key: "products", header: "Products", render: (row) => row.productCount },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={row.isActive ? "success" : "neutral"}>
          {row.isActive ? "active" : "inactive"}
        </StatusBadge>
      ),
    },
  ];

  const loadForEdit = (row: CollectionRow) => {
    setSelectedId(row.id);
    setCreating(false);
    setEditor({
      name: row.name,
      season: row.season,
      year: row.year,
      productCount: row.productCount,
      isActive: row.isActive,
      imageUrl: row.imageUrl,
      description: row.description,
    });
  };

  const beginCreate = () => {
    setCreating(true);
    setSelectedId("");
    setEditor(emptyCollection);
  };

  const saveCollection = async () => {
    if (!editor.name.trim()) {
      showToast({ title: "Collection name is required" });
      return;
    }
    if (!editor.imageUrl.trim()) {
      showToast({ title: "Collection image URL is required" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: editor.name.trim(),
        season: editor.season.trim() || null,
        year: Number(editor.year || new Date().getFullYear()),
        product_count: Number(editor.productCount || 0),
        is_active: Boolean(editor.isActive),
        image_url: editor.imageUrl.trim(),
        description: editor.description.trim() || null,
        updated_at: Timestamp.now(),
      };

      if (creating) {
        await addDoc(collection(db, "collections"), {
          ...payload,
          created_at: Timestamp.now(),
        });
        showToast({ title: "Collection created", description: `${editor.name} added.` });
      } else if (selectedRow) {
        await updateDoc(doc(db, "collections", selectedRow.id), payload);
        showToast({ title: "Collection saved", description: `${editor.name} updated.` });
      } else {
        showToast({ title: "Select a collection first" });
      }
    } catch (error) {
      console.error("Failed to save collection", error);
      showToast({ title: "Save failed", description: "Could not update collections." });
    } finally {
      setSaving(false);
    }
  };

  const removeCollection = async () => {
    if (!selectedRow) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "collections", selectedRow.id));
      setSelectedId("");
      setEditor(emptyCollection);
      showToast({ title: "Collection deleted", description: `${selectedRow.name} removed.` });
    } catch (error) {
      console.error("Failed to delete collection", error);
      showToast({ title: "Delete failed", description: "Could not delete collection." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-page">
      <PageHeader
        title="Collections"
        breadcrumbs={[{ label: "Admin", href: "/admin/overview" }, { label: "Collections" }]}
        description="Create and manage storefront collections with the new admin UI."
        primaryAction={
          <button type="button" className="adm-button adm-button--primary" onClick={beginCreate}>
            <Plus size={16} />
            Add collection
          </button>
        }
      />

      <section className="adm-grid adm-grid--editor">
        <article className="adm-card adm-panel">
          {loading ? <p className="adm-muted">Loading collections...</p> : null}
          {!loading && rows.length === 0 ? (
            <EmptyState title="No collections yet" description="Create your first collection from this page." />
          ) : null}
          {!loading && rows.length > 0 ? (
            <DataTable
              rows={rows}
              columns={columns}
              selectedIds={selectedId ? [selectedId] : []}
              onToggleRow={(id) => {
                const row = rows.find((entry) => entry.id === id);
                if (row) loadForEdit(row);
              }}
              onTogglePage={() => undefined}
              page={1}
              pageSize={8}
              onPageChange={() => undefined}
              onRowClick={loadForEdit}
            />
          ) : null}
        </article>

        <FormSection
          title={creating ? "Create collection" : "Edit collection"}
          description="Synced to Firestore `collections`."
        >
          <label>
            Name
            <input
              className="adm-input"
              value={editor.name}
              onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            Season
            <input
              className="adm-input"
              value={editor.season}
              onChange={(event) => setEditor((prev) => ({ ...prev, season: event.target.value }))}
            />
          </label>
          <label>
            Year
            <input
              className="adm-input"
              type="number"
              value={editor.year}
              onChange={(event) =>
                setEditor((prev) => ({ ...prev, year: Number(event.target.value || new Date().getFullYear()) }))
              }
            />
          </label>
          <label>
            Product count
            <input
              className="adm-input"
              type="number"
              value={editor.productCount}
              onChange={(event) =>
                setEditor((prev) => ({ ...prev, productCount: Number(event.target.value || 0) }))
              }
            />
          </label>
          <label className="adm-form-grid__full">
            Image URL
            <input
              className="adm-input"
              value={editor.imageUrl}
              onChange={(event) => setEditor((prev) => ({ ...prev, imageUrl: event.target.value }))}
            />
          </label>
          <label className="adm-form-grid__full">
            Description
            <textarea
              className="adm-input"
              rows={4}
              value={editor.description}
              onChange={(event) => setEditor((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <label className="adm-toggle adm-form-grid__full">
            <input
              type="checkbox"
              checked={editor.isActive}
              onChange={(event) => setEditor((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            Active collection
          </label>
          <label className="adm-form-grid__full" style={{ display: "flex", gap: 8 }}>
            <button type="button" className="adm-button adm-button--primary" onClick={saveCollection}>
              <Save size={16} />
              {saving ? "Saving..." : creating ? "Create collection" : "Save collection"}
            </button>
            {!creating && selectedRow ? (
              <button type="button" className="adm-button adm-button--ghost" onClick={removeCollection}>
                <Trash2 size={16} />
                Delete
              </button>
            ) : null}
          </label>
        </FormSection>
      </section>
    </div>
  );
}
