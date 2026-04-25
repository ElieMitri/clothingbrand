import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, Timestamp, updateDoc, writeBatch } from "firebase/firestore";
import { Link2, Plus, Save, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { db } from "../../lib/firebase";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { FormSection } from "../components/FormSection";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { productSavedViews } from "../data/adminConstants";
import { useToast } from "../hooks/useToast";
import type { ProductRow } from "../types";
import { useAdminLiveData } from "../hooks/useAdminLiveData";
import { getDefaultSizesByCategory } from "../../lib/productSizing";
import { parseExcelProducts } from "../utils/excelProductImport";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const productTone: Record<ProductRow["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  draft: "warning",
  archived: "neutral",
};

interface ProductEditorState {
  name: string;
  brand: string;
  product_type: string;
  sku: string;
  category: string;
  subcategory: string;
  audience: string;
  authenticity: string;
  description: string;
  image_url: string;
  images: string;
  colors: string;
  sizes: string;
  sold_out: boolean;
  sold_out_sizes: string;
  stock: number;
  price: number;
  cost_price: number;
  original_price: number;
  commission_percentage: number;
  discount_percentage: number;
  use_manual_profit: boolean;
  profit_per_unit: number;
  material: string;
  care_instructions: string;
  tags: string;
  flavor: string;
  net_weight: string;
  is_featured: boolean;
  is_new_arrival: boolean;
}

const emptyEditor: ProductEditorState = {
  name: "",
  brand: "",
  product_type: "",
  sku: "",
  category: "Men",
  subcategory: "",
  audience: "men",
  authenticity: "original",
  description: "",
  image_url: "",
  images: "",
  colors: "",
  sizes: "",
  sold_out: false,
  sold_out_sizes: "",
  stock: 0,
  price: 0,
  cost_price: 0,
  original_price: 0,
  commission_percentage: 0,
  discount_percentage: 0,
  use_manual_profit: false,
  profit_per_unit: 0,
  material: "",
  care_instructions: "",
  tags: "",
  flavor: "",
  net_weight: "",
  is_featured: false,
  is_new_arrival: false,
};

const parseList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeCommissionPercent = (value: unknown) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  if (parsed <= 1) return parsed * 100;
  return parsed;
};

interface ImportedLinkProduct {
  name?: string;
  description?: string;
  brand?: string;
  sku?: string;
  category?: string;
  product_type?: string;
  image_url?: string;
  images?: string[];
  colors?: string[];
  sizes?: string[];
  price?: number;
  original_price?: number;
  stock?: number;
  source_url?: string;
  commission_percentage?: number;
}

interface ImageFetchEntry {
  image_url?: string;
}

export function ProductsPage() {
  const { showToast } = useToast();
  const { loading, products, productsRaw } = useAdminLiveData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState("all");
  const [page, setPage] = useState(1);
  const [editorTab, setEditorTab] = useState<
    "details" | "pricing" | "inventory" | "shipping" | "merchandising"
  >("details");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importingFromUrl, setImportingFromUrl] = useState(false);
  const [importingFromExcel, setImportingFromExcel] = useState(false);
  const [importQueue, setImportQueue] = useState<ImportedLinkProduct[]>([]);
  const [selectedImportIndexes, setSelectedImportIndexes] = useState<number[]>([]);
  const [importQueueSourceUrl, setImportQueueSourceUrl] = useState("");
  const [committingImportSelection, setCommittingImportSelection] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [updatingSelectedCategory, setUpdatingSelectedCategory] = useState(false);
  const [focusedProductId, setFocusedProductId] = useState<string>("");
  const [bulkCategoryValue, setBulkCategoryValue] = useState("");
  const [bulkSubcategoryValue, setBulkSubcategoryValue] = useState("");
  const [editor, setEditor] = useState<ProductEditorState>(emptyEditor);
  const query = searchParams.get("q") || "";

  const updateImportQueueEntry = (
    index: number,
    patch: Partial<ImportedLinkProduct>
  ) => {
    setImportQueue((prev) =>
      prev.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry;
        return { ...entry, ...patch };
      })
    );
  };

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((product) => {
      if (activeView === "active" && product.status !== "active") return false;
      if (activeView === "draft" && product.status !== "draft") return false;
      if (activeView === "low" && product.inventory > 15) return false;
      if (!normalizedQuery) return true;

      const raw = productsRaw.find((entry) => entry.id === product.id);
      const haystack = [
        product.title,
        product.sku,
        product.category,
        raw?.brand,
        raw?.subcategory,
        raw?.product_type,
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");

      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
      return true;
    });
  }, [activeView, products, productsRaw, query]);

  const visibleRowIds = useMemo(() => {
    const pageSize = 8;
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize).map((row) => row.id);
  }, [filteredRows, page]);

  const filteredRowIds = useMemo(() => filteredRows.map((row) => row.id), [filteredRows]);
  const allFilteredSelected =
    filteredRowIds.length > 0 && filteredRowIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    if (!focusedProductId && products.length > 0) {
      setFocusedProductId(products[0].id);
    }
  }, [focusedProductId, products]);

  const focusedProduct = useMemo(
    () => products.find((product) => product.id === focusedProductId) ?? null,
    [focusedProductId, products]
  );
  const existingCategories = useMemo(
    () =>
      Array.from(
        new Set(
          productsRaw
            .map((entry) => String(entry.category || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [productsRaw]
  );
  const existingSubcategories = useMemo(
    () =>
      Array.from(
        new Set(
          productsRaw
            .map((entry) => String(entry.subcategory || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [productsRaw]
  );

  useEffect(() => {
    if (!focusedProduct) {
      setEditor(emptyEditor);
      return;
    }

    const raw = productsRaw.find((entry) => entry.id === focusedProduct.id);
    setEditor({
      name: String(raw?.name || focusedProduct.title || ""),
      brand: String(raw?.brand || ""),
      product_type: String(raw?.product_type || ""),
      sku: String(raw?.sku || focusedProduct.sku || ""),
      category: String(raw?.category || focusedProduct.category || ""),
      subcategory: String(raw?.subcategory || ""),
      audience: String(raw?.audience || "men"),
      authenticity: String(raw?.authenticity || "original"),
      description: String(raw?.description || ""),
      image_url: String(raw?.image_url || ""),
      images: Array.isArray(raw?.images) ? raw.images.join(", ") : "",
      colors: Array.isArray(raw?.colors) ? raw.colors.join(", ") : "",
      sizes: Array.isArray(raw?.sizes) ? raw.sizes.join(", ") : "",
      sold_out: Boolean(raw?.sold_out),
      sold_out_sizes: Array.isArray(raw?.sold_out_sizes) ? raw.sold_out_sizes.join(", ") : "",
      stock: Number(raw?.stock || focusedProduct.inventory || 0),
      price: Number(raw?.price || focusedProduct.price || 0),
      cost_price: Number(raw?.cost_price || 0),
      original_price: Number(raw?.original_price || raw?.price || focusedProduct.price || 0),
      commission_percentage: normalizeCommissionPercent(raw?.commission_percentage),
      discount_percentage: Number(raw?.discount_percentage || 0),
      use_manual_profit: Boolean(raw?.use_manual_profit),
      profit_per_unit: Number(raw?.profit_per_unit || 0),
      material: String(raw?.material || ""),
      care_instructions: String(raw?.care_instructions || ""),
      tags: Array.isArray(raw?.tags) ? raw.tags.join(", ") : "",
      flavor: String(raw?.flavor || ""),
      net_weight: String(raw?.net_weight || ""),
      is_featured: Boolean(raw?.is_featured),
      is_new_arrival: Boolean(raw?.is_new_arrival),
    });
  }, [focusedProduct, productsRaw]);

  const columns: DataTableColumn<ProductRow>[] = [
    {
      key: "product",
      header: "Product",
      width: "38%",
      render: (row) => (
        <div className="adm-product-cell">
          <img src={row.thumbnail} alt={row.title} loading="lazy" />
          <div>
            <p>{row.title}</p>
            <p className="adm-muted">{row.sku}</p>
          </div>
        </div>
      ),
    },
    { key: "inventory", header: "Inventory", render: (row) => row.inventory },
    { key: "price", header: "Price", render: (row) => money.format(row.price) },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge tone={productTone[row.status]}>{row.status}</StatusBadge>,
    },
  ];

  const updateEditor = <K extends keyof ProductEditorState>(key: K, value: ProductEditorState[K]) => {
    setEditor((prev) => ({ ...prev, [key]: value }));
  };

  const automaticProfitPerUnit = useMemo(() => {
    const salePrice = Math.max(0, Number(editor.price || 0));
    const commission = Math.max(0, normalizeCommissionPercent(editor.commission_percentage));
    const costPrice = Math.max(0, Number(editor.cost_price || 0));
    const retailPrice = Math.max(0, Number(editor.original_price || editor.price || 0));

    if (retailPrice > 0 && costPrice > 0) {
      return retailPrice - costPrice;
    }
    if (commission > 0) {
      return salePrice * (commission / 100);
    }
    if (costPrice > 0) {
      return salePrice - costPrice;
    }
    return 0;
  }, [editor.commission_percentage, editor.cost_price, editor.original_price, editor.price]);

  const effectiveProfitPerUnit = editor.use_manual_profit
    ? Math.max(0, Number(editor.profit_per_unit || 0))
    : automaticProfitPerUnit;

  const payloadFromEditor = () => ({
    name: editor.name,
    brand: editor.brand || null,
    product_type: editor.product_type || null,
    sku: editor.sku || null,
    category: editor.category || null,
    subcategory: editor.subcategory || null,
    audience: editor.audience || null,
    authenticity: editor.authenticity || null,
    description: editor.description || null,
    image_url: editor.image_url || null,
    images: parseList(editor.images),
    colors: parseList(editor.colors),
    sizes: parseList(editor.sizes),
    sold_out: Boolean(editor.sold_out),
    sold_out_sizes: parseList(editor.sold_out_sizes),
    stock: Number(editor.stock || 0),
    price: Number(editor.price || 0),
    cost_price: Number(editor.cost_price || 0),
    original_price: Number(editor.original_price || editor.price || 0),
    commission_percentage: normalizeCommissionPercent(editor.commission_percentage),
    discount_percentage: Number(editor.discount_percentage || 0),
    use_manual_profit: Boolean(editor.use_manual_profit),
    profit_per_unit: Number(editor.profit_per_unit || 0),
    material: editor.material || null,
    care_instructions: editor.care_instructions || null,
    tags: parseList(editor.tags),
    flavor: editor.flavor || null,
    net_weight: editor.net_weight || null,
    is_featured: Boolean(editor.is_featured),
    is_new_arrival: Boolean(editor.is_new_arrival),
  });

  const saveProduct = async () => {
    if (!focusedProduct) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "products", focusedProduct.id), {
        ...payloadFromEditor(),
        updated_at: Timestamp.now(),
      });
      showToast({ title: "Product saved", description: `${editor.name} synced to Firestore.` });
    } catch (error) {
      console.error("Failed to save product", error);
      showToast({ title: "Save failed", description: "Could not update this product." });
    } finally {
      setIsSaving(false);
    }
  };

  const createProduct = async () => {
    if (!editor.name.trim()) {
      showToast({ title: "Product name is required" });
      return;
    }

    setIsSaving(true);
    try {
      await addDoc(collection(db, "products"), {
        ...payloadFromEditor(),
        created_at: Timestamp.now(),
      });
      setIsCreateOpen(false);
      showToast({ title: "Product created", description: "New product added to Firestore." });
      setEditor(emptyEditor);
    } catch (error) {
      console.error("Failed to create product", error);
      showToast({ title: "Create failed", description: "Could not create product." });
    } finally {
      setIsSaving(false);
    }
  };

  const importProductsFromUrl = async (rawUrl?: string) => {
    const sourceUrl = String(rawUrl ?? importUrl).trim();
    if (!sourceUrl) {
      showToast({ title: "Paste a product or collection URL first" });
      return;
    }

    setImportingFromUrl(true);
    try {
      const response = await fetch("/api/import-products-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || `HTTP ${response.status}`));
      }

      const importedProducts = Array.isArray(payload?.products)
        ? (payload.products as ImportedLinkProduct[])
        : [];

      if (importedProducts.length === 0) {
        throw new Error("No products were detected at this URL.");
      }

      setImportQueue(importedProducts);
      setSelectedImportIndexes(importedProducts.map((_, index) => index));
      setImportQueueSourceUrl(sourceUrl);
      setImportUrl(sourceUrl);
      showToast({
        title: "Products ready to import",
        description: `Choose which ${importedProducts.length} item${
          importedProducts.length === 1 ? "" : "s"
        } to import.`,
      });
    } catch (error) {
      console.error("Import from URL failed", error);
      showToast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Could not import from this URL.",
      });
    } finally {
      setImportingFromUrl(false);
    }
  };

  const commitSelectedImports = async () => {
    if (selectedImportIndexes.length === 0) {
      showToast({ title: "Select at least one product to import" });
      return;
    }

    const selectedEntries = selectedImportIndexes
      .map((index) => importQueue[index])
      .filter((entry): entry is ImportedLinkProduct => Boolean(entry));

    if (selectedEntries.length === 0) {
      showToast({ title: "Selected products are no longer available in preview" });
      return;
    }

    setCommittingImportSelection(true);
    try {
      let committed = 0;
      for (let index = 0; index < selectedEntries.length; index += 400) {
        const chunk = selectedEntries.slice(index, index + 400);
        const batch = writeBatch(db);
        chunk.forEach((entry) => {
          const name = String(entry.name || "").trim();
          if (!name) return;
          const category = String(entry.category || "").trim();
          const productType = String(entry.product_type || "").trim();
          const inferredSizes =
            Array.isArray(entry.sizes) && entry.sizes.length > 0
              ? entry.sizes.map((value) => String(value).trim()).filter(Boolean)
              : getDefaultSizesByCategory(`${category} ${productType} ${name}`);
          const price = Number(entry.price || 0);
          const compareAt = Number(entry.original_price || price || 0);
          const docRef = doc(collection(db, "products"));
          batch.set(docRef, {
            name,
            description: String(entry.description || "").trim() || null,
            brand: String(entry.brand || "").trim() || null,
            sku: String(entry.sku || "").trim() || null,
            category: category || null,
            product_type: productType || null,
            image_url: String(entry.image_url || "").trim() || null,
            images: Array.isArray(entry.images)
              ? entry.images.map((value) => String(value).trim()).filter(Boolean)
              : [],
            colors: Array.isArray(entry.colors)
              ? entry.colors.map((value) => String(value).trim()).filter(Boolean)
              : [],
            sizes: inferredSizes,
            stock: Math.max(0, Number(entry.stock || 0)),
            sold_out: false,
            sold_out_sizes: [],
            price: Number.isFinite(price) ? Math.max(0, price) : 0,
            original_price: Number.isFinite(compareAt)
              ? Math.max(compareAt, price)
              : Math.max(0, price),
            commission_percentage: normalizeCommissionPercent(entry.commission_percentage),
            source_url: String(entry.source_url || importQueueSourceUrl).trim(),
            is_featured: false,
            is_new_arrival: false,
            created_at: Timestamp.now(),
            updated_at: Timestamp.now(),
          });
          committed += 1;
        });
        await batch.commit();
      }

      setImportQueue([]);
      setSelectedImportIndexes([]);
      setImportQueueSourceUrl("");
      setImportUrl("");
      showToast({
        title: "Import complete",
        description: `${committed} product${committed === 1 ? "" : "s"} imported.`,
      });
    } catch (error) {
      console.error("Import commit failed", error);
      showToast({
        title: "Import failed",
        description:
          error instanceof Error ? error.message : "Could not import selected products.",
      });
    } finally {
      setCommittingImportSelection(false);
    }
  };

  const importFromClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const urlFromClipboard = String(clipboardText || "").trim();
      if (!urlFromClipboard) {
        showToast({ title: "Clipboard is empty" });
        return;
      }
      setImportUrl(urlFromClipboard);
      await importProductsFromUrl(urlFromClipboard);
    } catch {
      showToast({ title: "Clipboard access denied", description: "Paste the URL manually and import." });
    }
  };

  const importProductsFromExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingFromExcel(true);
    try {
      const importedProducts = await parseExcelProducts(file);
      if (importedProducts.length === 0) {
        throw new Error("No products found in this Excel sheet.");
      }

      let withImages: ImportedLinkProduct[] = importedProducts;
      try {
        const imageResponse = await fetch("/api/fetch-product-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            products: importedProducts.map((entry) => ({
              name: entry.name,
              category: entry.category,
            })),
          }),
        });
        const imagePayload = await imageResponse.json().catch(() => ({}));
        if (imageResponse.ok && Array.isArray(imagePayload?.images)) {
          const images = imagePayload.images as ImageFetchEntry[];
          withImages = importedProducts.map((entry, index) => {
            const imageUrl = String(images[index]?.image_url || "").trim();
            return {
              ...entry,
              image_url: imageUrl || undefined,
              images: imageUrl ? [imageUrl] : [],
            };
          });
        }
      } catch (error) {
        console.error("Image lookup failed for Excel import", error);
      }

      setImportQueue(withImages);
      setSelectedImportIndexes(withImages.map((_, index) => index));
      setImportQueueSourceUrl(file.name);
      setImportUrl("");
      showToast({
        title: "Excel ready to import",
        description: `${withImages.length} item${
          withImages.length === 1 ? "" : "s"
        } loaded, image search completed. Review and press Import selected.`,
      });
    } catch (error) {
      console.error("Import from Excel failed", error);
      showToast({
        title: "Excel import failed",
        description:
          error instanceof Error ? error.message : "Could not parse this Excel workbook.",
      });
    } finally {
      event.target.value = "";
      setImportingFromExcel(false);
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const toggleVisibleRows = () => {
    const allSelected = visibleRowIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => {
      if (allSelected) return prev.filter((id) => !visibleRowIds.includes(id));
      return Array.from(new Set([...prev, ...visibleRowIds]));
    });
  };

  const toggleSelectAllFilteredRows = () => {
    if (filteredRowIds.length === 0) return;
    setSelectedIds((prev) => {
      if (allFilteredSelected) return prev.filter((id) => !filteredRowIds.includes(id));
      return Array.from(new Set([...prev, ...filteredRowIds]));
    });
  };

  const deleteSelectedProducts = async () => {
    if (selectedIds.length === 0) {
      showToast({ title: "Select products to delete first" });
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedIds.length} selected product${
        selectedIds.length === 1 ? "" : "s"
      }? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingSelected(true);
    try {
      for (let index = 0; index < selectedIds.length; index += 400) {
        const chunk = selectedIds.slice(index, index + 400);
        const batch = writeBatch(db);
        chunk.forEach((productId) => {
          batch.delete(doc(db, "products", productId));
        });
        await batch.commit();
      }

      const deletedIds = new Set(selectedIds);
      setSelectedIds([]);
      if (deletedIds.has(focusedProductId)) {
        setFocusedProductId("");
      }

      showToast({
        title: "Products deleted",
        description: `${deletedIds.size} product${deletedIds.size === 1 ? "" : "s"} removed.`,
      });
    } catch (error) {
      console.error("Bulk delete failed", error);
      showToast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not delete selected products.",
      });
    } finally {
      setDeletingSelected(false);
    }
  };

  const bulkUpdateSelectedCategory = async () => {
    if (selectedIds.length === 0) {
      showToast({ title: "Select products first" });
      return;
    }
    const nextCategory = String(bulkCategoryValue || "").trim();
    if (!nextCategory) {
      showToast({ title: "Category is required", description: "Enter a category to apply." });
      return;
    }

    setUpdatingSelectedCategory(true);
    try {
      for (let index = 0; index < selectedIds.length; index += 400) {
        const chunk = selectedIds.slice(index, index + 400);
        const batch = writeBatch(db);
        chunk.forEach((productId) => {
          batch.update(doc(db, "products", productId), {
            category: nextCategory,
            updated_at: Timestamp.now(),
          });
        });
        await batch.commit();
      }

      showToast({
        title: "Category updated",
        description: `Applied "${nextCategory}" to ${selectedIds.length} product${
          selectedIds.length === 1 ? "" : "s"
        }.`,
      });
    } catch (error) {
      console.error("Bulk category update failed", error);
      showToast({
        title: "Category update failed",
        description:
          error instanceof Error ? error.message : "Could not update selected products.",
      });
    } finally {
      setUpdatingSelectedCategory(false);
    }
  };

  const bulkUpdateSelectedSubcategory = async () => {
    if (selectedIds.length === 0) {
      showToast({ title: "Select products first" });
      return;
    }
    const nextSubcategory = String(bulkSubcategoryValue || "").trim();
    if (!nextSubcategory) {
      showToast({ title: "Subcategory is required", description: "Enter a subcategory to apply." });
      return;
    }

    setUpdatingSelectedCategory(true);
    try {
      for (let index = 0; index < selectedIds.length; index += 400) {
        const chunk = selectedIds.slice(index, index + 400);
        const batch = writeBatch(db);
        chunk.forEach((productId) => {
          batch.update(doc(db, "products", productId), {
            subcategory: nextSubcategory,
            updated_at: Timestamp.now(),
          });
        });
        await batch.commit();
      }

      showToast({
        title: "Subcategory updated",
        description: `Applied "${nextSubcategory}" to ${selectedIds.length} product${
          selectedIds.length === 1 ? "" : "s"
        }.`,
      });
    } catch (error) {
      console.error("Bulk subcategory update failed", error);
      showToast({
        title: "Subcategory update failed",
        description:
          error instanceof Error ? error.message : "Could not update selected products.",
      });
    } finally {
      setUpdatingSelectedCategory(false);
    }
  };

  return (
    <div className="adm-page">
      <PageHeader
        title="Products"
        breadcrumbs={[{ label: "Admin", href: "/admin/overview" }, { label: "Products" }]}
        description="Manage catalog quality, inventory depth, and merchandising readiness."
        primaryAction={
          <button
            type="button"
            className="adm-button adm-button--primary"
            onClick={() => {
              setEditor(emptyEditor);
              setIsCreateOpen(true);
            }}
          >
            <Plus size={16} />
            Add product
          </button>
        }
      />

      <FilterBar savedViews={productSavedViews} activeView={activeView} onViewChange={setActiveView}>
        <label className="adm-inline-field" style={{ minWidth: 320, flex: 1 }}>
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              const next = new URLSearchParams(searchParams);
              if (value.trim()) next.set("q", value);
              else next.delete("q");
              setSearchParams(next, { replace: true });
            }}
            placeholder="Search title, SKU, brand, category..."
            aria-label="Search products"
          />
          {query ? (
            <button
              type="button"
              className="adm-icon-button"
              style={{ width: 28, height: 28 }}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("q");
                setSearchParams(next, { replace: true });
              }}
              aria-label="Clear product search"
            >
              <X size={14} />
            </button>
          ) : null}
        </label>
      </FilterBar>

      <section className="adm-card adm-panel">
        <header className="adm-panel__header">
          <h3>Import from link</h3>
          <span className="adm-muted">Paste any product or collection URL and import directly</span>
        </header>
        <div className="adm-form-grid">
          <label className="adm-form-grid__full">
            Source URL
            <input
              className="adm-input"
              placeholder="https://example.com/product or /collections/new-arrivals"
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
            />
          </label>
          <label className="adm-form-grid__full" style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="adm-button adm-button--primary"
              onClick={() => importProductsFromUrl()}
              disabled={importingFromUrl}
            >
              <Link2 size={16} />
              {importingFromUrl ? "Importing..." : "Import now"}
            </button>
            <button
              type="button"
              className="adm-button adm-button--ghost"
              onClick={importFromClipboard}
              disabled={importingFromUrl}
            >
              Import from clipboard
            </button>
          </label>
        </div>
      </section>

      <section className="adm-card adm-panel">
        <header className="adm-panel__header">
          <h3>Import from Excel</h3>
          <span className="adm-muted">Upload .xlsx/.xls file and review before saving</span>
        </header>
        <div className="adm-form-grid">
          <label className="adm-form-grid__full" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={importProductsFromExcel}
              disabled={importingFromExcel}
            />
            <span className="adm-muted">
              {importingFromExcel
                ? "Reading Excel file..."
                : "Expected headers: item name, selling price, commission"}
            </span>
          </label>
        </div>
      </section>

      {importQueue.length > 0 ? (
        <section className="adm-card adm-panel">
          <header className="adm-panel__header">
            <h3>Choose products to import</h3>
            <span className="adm-muted">
              {selectedImportIndexes.length}/{importQueue.length} selected
            </span>
          </header>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              type="button"
              className="adm-button adm-button--ghost"
              onClick={() => setSelectedImportIndexes(importQueue.map((_, index) => index))}
            >
              Select all
            </button>
            <button
              type="button"
              className="adm-button adm-button--ghost"
              onClick={() => setSelectedImportIndexes([])}
            >
              Clear
            </button>
            <button
              type="button"
              className="adm-button adm-button--primary"
              onClick={commitSelectedImports}
              disabled={committingImportSelection}
            >
              {committingImportSelection ? "Importing..." : "Import selected"}
            </button>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Product</th>
                  <th>Brand</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Commission</th>
                  <th>Image URL</th>
                </tr>
              </thead>
              <tbody>
                {importQueue.map((entry, index) => {
                  const selected = selectedImportIndexes.includes(index);
                  return (
                    <tr key={`${entry.name || "import"}-${index}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            setSelectedImportIndexes((prev) =>
                              prev.includes(index)
                                ? prev.filter((value) => value !== index)
                                : [...prev, index]
                            )
                          }
                          aria-label={`Select imported product ${entry.name || index + 1}`}
                        />
                      </td>
                      <td>{String(entry.name || "Untitled product")}</td>
                      <td>{String(entry.brand || "-")}</td>
                      <td>{String(entry.category || "-")}</td>
                      <td>{money.format(Number(entry.price || 0))}</td>
                      <td>{`${Math.round(normalizeCommissionPercent(entry.commission_percentage))}%`}</td>
                      <td style={{ minWidth: 280 }}>
                        <input
                          className="adm-input"
                          placeholder="https://..."
                          value={String(entry.image_url || "")}
                          onChange={(event) => {
                            const nextImageUrl = event.target.value;
                            updateImportQueueEntry(index, {
                              image_url: nextImageUrl,
                              images: nextImageUrl.trim() ? [nextImageUrl.trim()] : [],
                            });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {filteredRows.length > 0 ? (
        <div className="adm-bulk-toolbar" role="status">
          <strong>{selectedIds.length} selected</strong>
          <div>
            <button
              type="button"
              className="adm-button adm-button--ghost"
              onClick={toggleSelectAllFilteredRows}
            >
              {allFilteredSelected
                ? "Unselect all products"
                : `Select all products (${filteredRows.length})`}
            </button>
            {selectedIds.length > 0 ? (
              <>
                <input
                  className="adm-input"
                  style={{ minWidth: 180 }}
                  placeholder="New category"
                  value={bulkCategoryValue}
                  onChange={(event) => setBulkCategoryValue(event.target.value)}
                  list="product-bulk-categories"
                />
                <datalist id="product-bulk-categories">
                  {existingCategories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={bulkUpdateSelectedCategory}
                  disabled={updatingSelectedCategory}
                >
                  {updatingSelectedCategory ? "Applying..." : "Apply category"}
                </button>
                <input
                  className="adm-input"
                  style={{ minWidth: 180 }}
                  placeholder="New subcategory"
                  value={bulkSubcategoryValue}
                  onChange={(event) => setBulkSubcategoryValue(event.target.value)}
                  list="product-bulk-subcategories"
                />
                <datalist id="product-bulk-subcategories">
                  {existingSubcategories.map((subcategory) => (
                    <option key={subcategory} value={subcategory} />
                  ))}
                </datalist>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={bulkUpdateSelectedSubcategory}
                  disabled={updatingSelectedCategory}
                >
                  {updatingSelectedCategory ? "Applying..." : "Apply subcategory"}
                </button>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={deleteSelectedProducts}
                  disabled={deletingSelected}
                >
                  {deletingSelected ? "Deleting..." : "Delete selected"}
                </button>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() => setSelectedIds([])}
                >
                  Clear
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="adm-grid adm-grid--editor">
        <article className="adm-card adm-panel">
          {loading ? <p className="adm-muted">Loading products from Firestore...</p> : null}
          {!loading && filteredRows.length === 0 ? (
            <EmptyState title="No matching products" description="Try another filter or add a new product." />
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
              onRowClick={(row) => setFocusedProductId(row.id)}
              rowActions={[
                {
                  label: "Duplicate",
                  onClick: (row) => showToast({ title: `${row.title} duplicated` }),
                },
                {
                  label: "Archive",
                  onClick: (row) => showToast({ title: `${row.title} archived` }),
                },
              ]}
            />
          ) : null}
        </article>

        <article className="adm-panel-stack">
          {focusedProduct ? (
            <>
              <div className="adm-card adm-panel">
                <header className="adm-panel__header">
                  <h3>{focusedProduct.title}</h3>
                  <button
                    type="button"
                    className="adm-button adm-button--primary"
                    onClick={saveProduct}
                    disabled={isSaving}
                  >
                    <Save size={16} />
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </header>
                <div className="adm-tabs" role="tablist" aria-label="Product editor tabs">
                  {(["details", "pricing", "inventory", "shipping", "merchandising"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`adm-tab ${editorTab === tab ? "is-active" : ""}`}
                      role="tab"
                      aria-selected={editorTab === tab}
                      onClick={() => setEditorTab(tab)}
                    >
                      {tab[0].toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {editorTab === "details" ? (
                <FormSection title="Product details" description="Core content used in search and listing surfaces.">
                  <label>
                    Name
                    <input className="adm-input" value={editor.name} onChange={(event) => updateEditor("name", event.target.value)} />
                  </label>
                  <label>
                    Brand
                    <input className="adm-input" value={editor.brand} onChange={(event) => updateEditor("brand", event.target.value)} />
                  </label>
                  <label>
                    Category
                    <input className="adm-input" value={editor.category} onChange={(event) => updateEditor("category", event.target.value)} />
                  </label>
                  <label>
                    Subcategory
                    <input className="adm-input" value={editor.subcategory} onChange={(event) => updateEditor("subcategory", event.target.value)} />
                  </label>
                  <label>
                    Product type
                    <input className="adm-input" value={editor.product_type} onChange={(event) => updateEditor("product_type", event.target.value)} />
                  </label>
                  <label>
                    SKU
                    <input className="adm-input" value={editor.sku} onChange={(event) => updateEditor("sku", event.target.value)} />
                  </label>
                  <label className="adm-form-grid__full">
                    Description
                    <textarea className="adm-input" rows={4} value={editor.description} onChange={(event) => updateEditor("description", event.target.value)} />
                  </label>
                </FormSection>
              ) : null}

              {editorTab === "pricing" ? (
                <FormSection title="Pricing" description="Retail, cost, compare-at, and sale percentages.">
                  <label>
                    Cost price
                    <input className="adm-input" type="number" value={editor.cost_price} onChange={(event) => updateEditor("cost_price", Number(event.target.value || 0))} />
                  </label>
                  <label>
                    Retail price
                    <input className="adm-input" type="number" value={editor.price} onChange={(event) => updateEditor("price", Number(event.target.value || 0))} />
                  </label>
                  <label>
                    Compare-at price
                    <input className="adm-input" type="number" value={editor.original_price} onChange={(event) => updateEditor("original_price", Number(event.target.value || 0))} />
                  </label>
                  <label>
                    Commission (%)
                    <input className="adm-input" type="number" value={editor.commission_percentage} onChange={(event) => updateEditor("commission_percentage", Number(event.target.value || 0))} />
                  </label>
                  <label>
                    Discount (%)
                    <input className="adm-input" type="number" value={editor.discount_percentage} onChange={(event) => updateEditor("discount_percentage", Number(event.target.value || 0))} />
                  </label>
                  <label>
                    Automatic profit (per item)
                    <input className="adm-input" type="number" value={Number(automaticProfitPerUnit.toFixed(2))} readOnly />
                  </label>
                  <label className="adm-toggle">
                    <input
                      type="checkbox"
                      checked={editor.use_manual_profit}
                      onChange={(event) => updateEditor("use_manual_profit", event.target.checked)}
                    />
                    Use manual profit override
                  </label>
                  <label>
                    Manual profit (per item)
                    <input
                      className="adm-input"
                      type="number"
                      value={editor.profit_per_unit}
                      disabled={!editor.use_manual_profit}
                      onChange={(event) => updateEditor("profit_per_unit", Number(event.target.value || 0))}
                    />
                  </label>
                  <label>
                    Active profit used
                    <input className="adm-input" type="number" value={Number(effectiveProfitPerUnit.toFixed(2))} readOnly />
                  </label>
                </FormSection>
              ) : null}

              {editorTab === "inventory" ? (
                <FormSection title="Inventory" description="Stock levels, size matrix, and sold-out control.">
                  <label>
                    Total stock
                    <input className="adm-input" type="number" value={editor.stock} onChange={(event) => updateEditor("stock", Number(event.target.value || 0))} />
                  </label>
                  <label>
                    Sizes (comma-separated)
                    <input className="adm-input" value={editor.sizes} onChange={(event) => updateEditor("sizes", event.target.value)} />
                  </label>
                  <label className="adm-toggle">
                    <input type="checkbox" checked={editor.sold_out} onChange={(event) => updateEditor("sold_out", event.target.checked)} />
                    Mark fully sold out
                  </label>
                  <label className="adm-form-grid__full">
                    Sold out sizes (comma-separated)
                    <input className="adm-input" value={editor.sold_out_sizes} onChange={(event) => updateEditor("sold_out_sizes", event.target.value)} />
                  </label>
                </FormSection>
              ) : null}

              {editorTab === "shipping" ? (
                <FormSection title="Shipping & media" description="Primary media and physical product metadata.">
                  <label className="adm-form-grid__full">
                    Main image URL
                    <input className="adm-input" value={editor.image_url} onChange={(event) => updateEditor("image_url", event.target.value)} />
                  </label>
                  <label className="adm-form-grid__full">
                    Additional image URLs (comma-separated)
                    <input className="adm-input" value={editor.images} onChange={(event) => updateEditor("images", event.target.value)} />
                  </label>
                  <label>
                    Colors (comma-separated)
                    <input className="adm-input" value={editor.colors} onChange={(event) => updateEditor("colors", event.target.value)} />
                  </label>
                  <label>
                    Net weight
                    <input className="adm-input" value={editor.net_weight} onChange={(event) => updateEditor("net_weight", event.target.value)} />
                  </label>
                  <label>
                    Material
                    <input className="adm-input" value={editor.material} onChange={(event) => updateEditor("material", event.target.value)} />
                  </label>
                  <label className="adm-form-grid__full">
                    Care instructions
                    <textarea className="adm-input" rows={3} value={editor.care_instructions} onChange={(event) => updateEditor("care_instructions", event.target.value)} />
                  </label>
                </FormSection>
              ) : null}

              {editorTab === "merchandising" ? (
                <FormSection title="Merchandising" description="Audience, authenticity, tags, and storefront boosts.">
                  <label>
                    Audience
                    <select className="adm-input" value={editor.audience} onChange={(event) => updateEditor("audience", event.target.value)}>
                      <option value="men">Men</option>
                      <option value="women">Women</option>
                      <option value="kids">Kids</option>
                      <option value="unisex">Unisex</option>
                    </select>
                  </label>
                  <label>
                    Authenticity
                    <select className="adm-input" value={editor.authenticity} onChange={(event) => updateEditor("authenticity", event.target.value)}>
                      <option value="original">Original</option>
                      <option value="master_copy">Master copy</option>
                      <option value="replica">Replica</option>
                    </select>
                  </label>
                  <label>
                    Flavor
                    <input className="adm-input" value={editor.flavor} onChange={(event) => updateEditor("flavor", event.target.value)} />
                  </label>
                  <label className="adm-form-grid__full">
                    Tags (comma-separated)
                    <input className="adm-input" value={editor.tags} onChange={(event) => updateEditor("tags", event.target.value)} />
                  </label>
                  <label className="adm-toggle">
                    <input type="checkbox" checked={editor.is_featured} onChange={(event) => updateEditor("is_featured", event.target.checked)} />
                    Featured product
                  </label>
                  <label className="adm-toggle">
                    <input type="checkbox" checked={editor.is_new_arrival} onChange={(event) => updateEditor("is_new_arrival", event.target.checked)} />
                    New arrival
                  </label>
                </FormSection>
              ) : null}
            </>
          ) : (
            <section className="adm-card adm-panel">
              <EmptyState
                title="Choose a product"
                description="Select a row to edit full product data synced with Firestore."
              />
            </section>
          )}
        </article>
      </section>

      <Modal
        open={isCreateOpen}
        title="Add product"
        onClose={() => setIsCreateOpen(false)}
        footer={
          <>
            <button type="button" className="adm-button adm-button--ghost" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </button>
            <button type="button" className="adm-button adm-button--primary" onClick={createProduct}>
              {isSaving ? "Creating..." : "Create product"}
            </button>
          </>
        }
      >
        <div className="adm-form-grid">
          <label>
            Name
            <input className="adm-input" value={editor.name} onChange={(event) => updateEditor("name", event.target.value)} />
          </label>
          <label>
            Brand
            <input className="adm-input" value={editor.brand} onChange={(event) => updateEditor("brand", event.target.value)} />
          </label>
          <label>
            Category
            <input className="adm-input" value={editor.category} onChange={(event) => updateEditor("category", event.target.value)} />
          </label>
          <label>
            Product type
            <input className="adm-input" value={editor.product_type} onChange={(event) => updateEditor("product_type", event.target.value)} />
          </label>
          <label>
            SKU
            <input className="adm-input" value={editor.sku} onChange={(event) => updateEditor("sku", event.target.value)} />
          </label>
          <label>
            Price
            <input className="adm-input" type="number" value={editor.price} onChange={(event) => updateEditor("price", Number(event.target.value || 0))} />
          </label>
          <label>
            Cost price
            <input className="adm-input" type="number" value={editor.cost_price} onChange={(event) => updateEditor("cost_price", Number(event.target.value || 0))} />
          </label>
          <label>
            Discount (%)
            <input className="adm-input" type="number" value={editor.discount_percentage} onChange={(event) => updateEditor("discount_percentage", Number(event.target.value || 0))} />
          </label>
          <label>
            Commission (%)
            <input className="adm-input" type="number" value={editor.commission_percentage} onChange={(event) => updateEditor("commission_percentage", Number(event.target.value || 0))} />
          </label>
          <label className="adm-toggle">
            <input type="checkbox" checked={editor.use_manual_profit} onChange={(event) => updateEditor("use_manual_profit", event.target.checked)} />
            Use manual profit
          </label>
          <label>
            Manual profit (per item)
            <input className="adm-input" type="number" value={editor.profit_per_unit} disabled={!editor.use_manual_profit} onChange={(event) => updateEditor("profit_per_unit", Number(event.target.value || 0))} />
          </label>
          <label className="adm-form-grid__full">
            Main image URL
            <input className="adm-input" value={editor.image_url} onChange={(event) => updateEditor("image_url", event.target.value)} />
          </label>
          <label className="adm-form-grid__full">
            Colors (comma-separated)
            <input className="adm-input" value={editor.colors} onChange={(event) => updateEditor("colors", event.target.value)} />
          </label>
          <label className="adm-form-grid__full">
            Sizes (comma-separated)
            <input className="adm-input" value={editor.sizes} onChange={(event) => updateEditor("sizes", event.target.value)} />
          </label>
          <label className="adm-form-grid__full">
            Description
            <textarea className="adm-input" rows={4} value={editor.description} onChange={(event) => updateEditor("description", event.target.value)} />
          </label>
          <label className="adm-toggle">
            <input type="checkbox" checked={editor.is_featured} onChange={(event) => updateEditor("is_featured", event.target.checked)} />
            Featured
          </label>
          <label className="adm-toggle">
            <input type="checkbox" checked={editor.is_new_arrival} onChange={(event) => updateEditor("is_new_arrival", event.target.checked)} />
            New arrival
          </label>
        </div>
      </Modal>
    </div>
  );
}
