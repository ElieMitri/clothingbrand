import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { FormSection } from "../components/FormSection";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../hooks/useToast";
import { useAdminLiveData } from "../hooks/useAdminLiveData";

interface StoreSettingsForm {
  store_name: string;
  support_email: string;
  address: string;
  low_stock_alerts: boolean;
  high_risk_alerts: boolean;
  fulfillment_location: string;
  show_sale_link: boolean;
  sale_title: string;
  sale_headline: string;
  sale_subtitle: string;
  sale_end_at_input: string;
  hero_image_url: string;
  today_pick_product_id: string;
  featured_product_ids: string[];
  home_categories: HomeCategoryEntry[];
  shop_menu_items: ShopMenuItemEntry[];
  home_collection_ids: string[];
}

interface HomeCategoryEntry {
  id: string;
  name: string;
  slug: string;
  image_url: string;
}

interface ShopMenuItemEntry {
  id: string;
  label: string;
  path: string;
  special?: boolean;
}

const defaultHomeCategories: HomeCategoryEntry[] = [];
const defaultShopMenuItems: ShopMenuItemEntry[] = [];

const defaultSettings: StoreSettingsForm = {
  store_name: "Atlas Activewear",
  support_email: "support@atlasactivewear.com",
  address: "Downtown district, Beirut",
  low_stock_alerts: true,
  high_risk_alerts: true,
  fulfillment_location: "beirut-warehouse",
  show_sale_link: false,
  sale_title: "SEASONAL SALE",
  sale_headline: "UP TO 70% OFF",
  sale_subtitle: "Limited Time Offer",
  sale_end_at_input: "",
  hero_image_url: "",
  today_pick_product_id: "",
  featured_product_ids: [],
  home_categories: defaultHomeCategories,
  shop_menu_items: defaultShopMenuItems,
  home_collection_ids: [],
};

const slugifyPathToken = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toDisplayCategoryFromToken = (value: string) => {
  const token = slugifyPathToken(value);
  if (!token) return "";
  if (token === "gym" || token === "gym-crossfit" || token === "crossfit") return "Gym";
  if (
    token === "martial-arts" ||
    token.includes("muay-thai") ||
    token === "muaythai" ||
    token.includes("boxing") ||
    token === "mma" ||
    token.includes("combat") ||
    token === "sports"
  ) {
    return "Martial Arts";
  }
  return token
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const suggestShopMenuPath = (label: string) => {
  const token = slugifyPathToken(label);
  if (!token) return "";
  if (token === "sale") return "/sale";
  if (token === "new-arrivals" || token === "new-arrival") return "/new-arrivals";
  if (token === "collections" || token === "collection") return "/collections";
  if (token === "shop" || token === "shop-all" || token === "all-products") return "/shop";
  const categoryLabel = toDisplayCategoryFromToken(label) || toDisplayCategoryFromToken(token);
  return categoryLabel ? `/shop?category=${encodeURIComponent(categoryLabel)}` : "/shop";
};

const normalizeCategoryQueryLabel = (value: string) => {
  const decoded = decodeURIComponent(String(value || ""));
  const cleaned = decoded.replace(/\+/g, " ").trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
  if (!cleaned) return "";
  return toDisplayCategoryFromToken(cleaned) || cleaned;
};

const normalizeHomepageShopPath = (rawPath: string) => {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed) return "";
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  try {
    const parsed = new URL(path, "https://lbathletes.local");
    if (parsed.pathname.toLowerCase() === "/shop" && parsed.searchParams.has("category")) {
      const normalizedCategory = normalizeCategoryQueryLabel(
        String(parsed.searchParams.get("category") || "")
      );
      if (!normalizedCategory) {
        parsed.searchParams.delete("category");
      } else {
        parsed.searchParams.set("category", normalizedCategory);
      }
      const query = parsed.searchParams.toString();
      return query ? `${parsed.pathname}?${query}` : parsed.pathname;
    }
  } catch {
    // ignore parse failures and continue with fallback logic
  }

  const categoryPrefixMatch = path.match(/^\/category\/([^/?#]+)/i);
  if (!categoryPrefixMatch) return path;
  const categorySlug = decodeURIComponent(categoryPrefixMatch[1] || "");
  const categoryLabel = toDisplayCategoryFromToken(categorySlug);
  if (!categoryLabel) return "/shop";
  return `/shop?category=${encodeURIComponent(categoryLabel)}`;
};

const normalizeHomeCategorySlug = (value: string) => {
  const token = slugifyPathToken(value);
  if (!token) return "";
  if (
    token === "martial-arts" ||
    token === "sports" ||
    token.includes("muay-thai") ||
    token === "muaythai" ||
    token.includes("boxing") ||
    token.includes("combat") ||
    token === "mma"
  ) {
    return "martial-arts";
  }
  if (token === "crossfit" || token === "gym-crossfit") return "gym";
  return token;
};

export function SettingsPage() {
  const { showToast } = useToast();
  const { collectionsRaw, productsRaw } = useAdminLiveData();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StoreSettingsForm>(defaultSettings);

  useEffect(() => {
    return onSnapshot(doc(db, "site_settings", "store"), (snap) => {
      if (!snap.exists()) {
        setForm(defaultSettings);
        setLoading(false);
        return;
      }

      const data = snap.data() as Partial<StoreSettingsForm>;
      setForm((prev) => ({
        ...prev,
        store_name: data.store_name || defaultSettings.store_name,
        support_email: data.support_email || defaultSettings.support_email,
        address: data.address || defaultSettings.address,
        low_stock_alerts: data.low_stock_alerts ?? defaultSettings.low_stock_alerts,
        high_risk_alerts: data.high_risk_alerts ?? defaultSettings.high_risk_alerts,
        fulfillment_location: data.fulfillment_location || defaultSettings.fulfillment_location,
      }));
      setLoading(false);
    });
  }, []);

  const selectableProducts = useMemo(
    () =>
      productsRaw
        .map((entry) => ({
          id: entry.id,
          name: String(entry.name || "Untitled product"),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [productsRaw]
  );

  const updateHomeCategory = (
    index: number,
    patch: Partial<Pick<HomeCategoryEntry, "name" | "slug" | "image_url">>
  ) => {
    setForm((prev) => {
      const nextCategories = [...prev.home_categories];
      const current = nextCategories[index];
      if (!current) return prev;
      nextCategories[index] = {
        ...current,
        ...patch,
        slug: patch.slug !== undefined ? normalizeHomeCategorySlug(patch.slug) : current.slug,
      };
      return { ...prev, home_categories: nextCategories };
    });
  };

  const addHomeCategory = () => {
    setForm((prev) => ({
      ...prev,
      home_categories: [
        ...prev.home_categories,
        {
          id: `category-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: "",
          slug: "",
          image_url: "",
        },
      ],
    }));
  };

  const removeHomeCategory = (index: number) => {
    setForm((prev) => ({
      ...prev,
      home_categories: prev.home_categories.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const moveHomeCategory = (index: number, direction: "up" | "down") => {
    setForm((prev) => {
      const nextCategories = [...prev.home_categories];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= nextCategories.length) return prev;
      [nextCategories[index], nextCategories[targetIndex]] = [
        nextCategories[targetIndex],
        nextCategories[index],
      ];
      return { ...prev, home_categories: nextCategories };
    });
  };

  const updateShopMenuItem = (
    index: number,
    patch: Partial<Pick<ShopMenuItemEntry, "label" | "path" | "special">>
  ) => {
    setForm((prev) => {
      const nextItems = [...prev.shop_menu_items];
      const current = nextItems[index];
      if (!current) return prev;
      const nextLabel = patch.label !== undefined ? patch.label : current.label;
      const nextPathRaw =
        patch.path !== undefined
          ? patch.path
          : current.path || suggestShopMenuPath(nextLabel);
      nextItems[index] = {
        ...current,
        ...patch,
        path: normalizeHomepageShopPath(nextPathRaw),
      };
      return { ...prev, shop_menu_items: nextItems };
    });
  };

  const addShopMenuItem = () => {
    setForm((prev) => ({
      ...prev,
      shop_menu_items: [
        ...prev.shop_menu_items,
        {
          id: `shop-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label: "",
          path: "",
          special: false,
        },
      ],
    }));
  };

  const removeShopMenuItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      shop_menu_items: prev.shop_menu_items.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const moveShopMenuItem = (index: number, direction: "up" | "down") => {
    setForm((prev) => {
      const nextItems = [...prev.shop_menu_items];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= nextItems.length) return prev;
      [nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]];
      return { ...prev, shop_menu_items: nextItems };
    });
  };

  useEffect(() => {
    return onSnapshot(doc(db, "site_settings", "sale"), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as {
        show_sale_link?: boolean;
        sale_title?: string;
        sale_headline?: string;
        sale_subtitle?: string;
        end_at?: unknown;
      };
      const endAtValue = data.end_at as
        | { toDate?: () => Date }
        | string
        | undefined
        | null;
      let nextEndInput = "";
      if (endAtValue && typeof endAtValue === "object" && typeof endAtValue.toDate === "function") {
        nextEndInput = endAtValue.toDate().toISOString().slice(0, 16);
      } else if (typeof endAtValue === "string") {
        nextEndInput = endAtValue.slice(0, 16);
      }
      setForm((prev) => ({
        ...prev,
        show_sale_link: Boolean(data.show_sale_link),
        sale_title: String(data.sale_title || prev.sale_title),
        sale_headline: String(data.sale_headline || prev.sale_headline),
        sale_subtitle: String(data.sale_subtitle || prev.sale_subtitle),
        sale_end_at_input: nextEndInput,
      }));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, "site_settings", "homepage"), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as {
        hero_image_url?: string;
        today_pick_product_id?: string;
        featured_product_ids?: string[];
        home_categories?: unknown[];
        shop_menu_items?: unknown[];
        home_collection_ids?: string[];
      };
      const configuredCategories = Array.isArray(data.home_categories)
        ? data.home_categories
            .map((entry, index) => {
              if (!entry || typeof entry !== "object") return null;
              const candidate = entry as Partial<HomeCategoryEntry>;
              const name = String(candidate.name || "").trim();
              if (!name) return null;
              return {
                id: candidate.id || `category-${index}`,
                name,
                slug: normalizeHomeCategorySlug(String(candidate.slug || name)),
                image_url: String(candidate.image_url || "").trim(),
              } as HomeCategoryEntry;
            })
            .filter((entry: HomeCategoryEntry | null): entry is HomeCategoryEntry => Boolean(entry))
        : defaultHomeCategories;
      const configuredShopMenu = Array.isArray(data.shop_menu_items)
        ? data.shop_menu_items
            .map((entry, index) => {
              if (!entry || typeof entry !== "object") return null;
              const candidate = entry as Partial<ShopMenuItemEntry>;
              const label = String(candidate.label || "").trim();
              if (!label) return null;
              const normalizedPath = normalizeHomepageShopPath(String(candidate.path || ""));
              return {
                id: candidate.id || `shop-item-${index}`,
                label,
                path: normalizedPath || suggestShopMenuPath(label),
                special: Boolean(candidate.special),
              } as ShopMenuItemEntry;
            })
            .filter((entry: ShopMenuItemEntry | null): entry is ShopMenuItemEntry => Boolean(entry))
        : defaultShopMenuItems;
      setForm((prev) => ({
        ...prev,
        hero_image_url: String(data.hero_image_url || ""),
        today_pick_product_id: String(data.today_pick_product_id || ""),
        featured_product_ids: Array.isArray(data.featured_product_ids)
          ? data.featured_product_ids.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 6)
          : [],
        home_categories: configuredCategories,
        shop_menu_items: configuredShopMenu,
        home_collection_ids: Array.isArray(data.home_collection_ids)
          ? data.home_collection_ids.map((entry) => String(entry)).filter(Boolean)
          : [],
      }));
    });
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, "site_settings", "store"),
        {
          ...form,
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );
      await setDoc(
        doc(db, "site_settings", "sale"),
        {
          show_sale_link: form.show_sale_link,
          sale_title: form.sale_title.trim() || defaultSettings.sale_title,
          sale_headline: form.sale_headline.trim() || defaultSettings.sale_headline,
          sale_subtitle: form.sale_subtitle.trim() || defaultSettings.sale_subtitle,
          end_at: form.sale_end_at_input ? new Date(form.sale_end_at_input) : null,
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );
      await setDoc(
        doc(db, "site_settings", "homepage"),
        {
          hero_image_url: form.hero_image_url.trim(),
          today_pick_product_id: form.today_pick_product_id.trim(),
          featured_product_ids: form.featured_product_ids.slice(0, 6),
          home_categories: form.home_categories
            .map((entry) => ({
              id: String(entry.id || "").trim(),
              name: String(entry.name || "").trim(),
              slug: normalizeHomeCategorySlug(String(entry.slug || entry.name || "")),
              image_url: String(entry.image_url || "").trim(),
            }))
            .filter((entry) => entry.name && entry.slug),
          shop_menu_items: form.shop_menu_items
            .map((entry) => ({
              id: String(entry.id || "").trim(),
              label: String(entry.label || "").trim(),
              path: normalizeHomepageShopPath(String(entry.path || "")),
              special: Boolean(entry.special),
            }))
            .filter((entry) => entry.label && entry.path),
          home_collection_ids: form.home_collection_ids,
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );
      showToast({ title: "Settings saved", description: "Store settings synced to Firestore." });
    } catch (error) {
      console.error("Failed to save settings", error);
      showToast({ title: "Save failed", description: "Could not update store settings." });
    } finally {
      setSaving(false);
    }
  };

  const toggleFeaturedProductOnHome = (productId: string) => {
    setForm((prev) => {
      const exists = prev.featured_product_ids.includes(productId);
      if (exists) {
        return {
          ...prev,
          featured_product_ids: prev.featured_product_ids.filter((id) => id !== productId),
        };
      }
      if (prev.featured_product_ids.length >= 6) {
        showToast({
          title: "Maximum reached",
          description: "You can select up to 6 featured products for Home.",
        });
        return prev;
      }
      return {
        ...prev,
        featured_product_ids: [...prev.featured_product_ids, productId],
      };
    });
  };

  return (
    <div className="adm-page">
      <PageHeader
        title="Settings"
        breadcrumbs={[{ label: "Admin", href: "/admin/overview" }, { label: "Settings" }]}
        description="Store, sale, and homepage settings are synced to Firestore."
        primaryAction={
          <button type="button" className="adm-button adm-button--primary" onClick={saveSettings}>
            {saving ? "Saving..." : "Save settings"}
          </button>
        }
      />

      <section className="adm-grid adm-grid--two">
        <FormSection title="Store information" description="Customer-facing details and contact data.">
          {loading ? <p className="adm-muted">Loading store settings...</p> : null}
          <label>
            Store name
            <input
              className="adm-input"
              value={form.store_name}
              onChange={(event) => setForm((prev) => ({ ...prev, store_name: event.target.value }))}
            />
          </label>
          <label>
            Support email
            <input
              className="adm-input"
              value={form.support_email}
              onChange={(event) => setForm((prev) => ({ ...prev, support_email: event.target.value }))}
            />
          </label>
          <label className="adm-form-grid__full">
            Address
            <input
              className="adm-input"
              value={form.address}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
            />
          </label>
        </FormSection>

        <FormSection title="Operations" description="Shipping, payment, notification, and team preferences.">
          <label className="adm-toggle">
            <input
              type="checkbox"
              checked={form.low_stock_alerts}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, low_stock_alerts: event.target.checked }))
              }
            />
            Enable low-stock alerts
          </label>
          <label className="adm-toggle">
            <input
              type="checkbox"
              checked={form.high_risk_alerts}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, high_risk_alerts: event.target.checked }))
              }
            />
            Notify on high-risk orders
          </label>
          <label>
            Default fulfillment location
            <select
              className="adm-input"
              value={form.fulfillment_location}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, fulfillment_location: event.target.value }))
              }
            >
              <option value="beirut-warehouse">Beirut warehouse</option>
              <option value="dubai-hub">Dubai hub</option>
            </select>
          </label>
        </FormSection>
      </section>

      <section className="adm-grid adm-grid--two">
        <FormSection title="Sale settings" description="Controls `site_settings/sale` used by storefront sale UI.">
          <label className="adm-toggle adm-form-grid__full">
            <input
              type="checkbox"
              checked={form.show_sale_link}
              onChange={(event) => setForm((prev) => ({ ...prev, show_sale_link: event.target.checked }))}
            />
            Show sale link in storefront navigation
          </label>
          <label>
            Sale title
            <input
              className="adm-input"
              value={form.sale_title}
              onChange={(event) => setForm((prev) => ({ ...prev, sale_title: event.target.value }))}
            />
          </label>
          <label>
            Sale headline
            <input
              className="adm-input"
              value={form.sale_headline}
              onChange={(event) => setForm((prev) => ({ ...prev, sale_headline: event.target.value }))}
            />
          </label>
          <label className="adm-form-grid__full">
            Sale subtitle
            <input
              className="adm-input"
              value={form.sale_subtitle}
              onChange={(event) => setForm((prev) => ({ ...prev, sale_subtitle: event.target.value }))}
            />
          </label>
          <label className="adm-form-grid__full">
            Sale end date
            <input
              className="adm-input"
              type="datetime-local"
              value={form.sale_end_at_input}
              onChange={(event) => setForm((prev) => ({ ...prev, sale_end_at_input: event.target.value }))}
            />
          </label>
        </FormSection>

        <FormSection
          title="Homepage controls"
          description="Control hero image, featured item, category cards, and home collections from here."
        >
          <label className="adm-form-grid__full">
            Hero image URL (optional override)
            <input
              className="adm-input"
              value={form.hero_image_url}
              onChange={(event) => setForm((prev) => ({ ...prev, hero_image_url: event.target.value }))}
            />
          </label>
          <label className="adm-form-grid__full">
            Featured item on Home
            <select
              className="adm-input"
              value={form.today_pick_product_id}
              onChange={(event) => setForm((prev) => ({ ...prev, today_pick_product_id: event.target.value }))}
            >
              <option value="">No featured item selected</option>
              {selectableProducts.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-form-grid__full" style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="adm-button adm-button--ghost"
              onClick={() => setForm((prev) => ({ ...prev, today_pick_product_id: "" }))}
              disabled={!form.today_pick_product_id}
            >
              Remove featured item
            </button>
          </label>

          <label className="adm-form-grid__full" style={{ display: "grid", gap: 8 }}>
            Featured products on Home (max 6)
            <p className="adm-muted">
              These products appear in the Home featured section in the selected order.
            </p>
            <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto" }}>
              {selectableProducts.map((entry) => {
                const checked = form.featured_product_ids.includes(entry.id);
                return (
                  <label key={entry.id} className="adm-toggle">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFeaturedProductOnHome(entry.id)}
                    />
                    {entry.name}
                  </label>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="adm-muted">
                Selected: {form.featured_product_ids.length}/6
              </span>
              {form.featured_product_ids.length > 0 ? (
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() => setForm((prev) => ({ ...prev, featured_product_ids: [] }))}
                >
                  Clear featured products
                </button>
              ) : null}
            </div>
          </label>

          <div className="adm-form-grid__full" style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Home Categories</p>
            <p className="adm-muted">
              Use a category slug (example: `football`, `gym`, `martial-arts`).
            </p>
            {form.home_categories.map((entry, index) => (
              <div
                key={entry.id}
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto auto auto", gap: 8 }}
              >
                <input
                  className="adm-input"
                  value={entry.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    updateHomeCategory(index, {
                      name: nextName,
                      slug: entry.slug || normalizeHomeCategorySlug(nextName),
                    });
                  }}
                  placeholder="Gym"
                />
                <input
                  className="adm-input"
                  value={entry.slug}
                  onChange={(event) => updateHomeCategory(index, { slug: event.target.value })}
                  placeholder="gym"
                />
                <input
                  className="adm-input"
                  value={entry.image_url}
                  onChange={(event) => updateHomeCategory(index, { image_url: event.target.value })}
                  placeholder="https://..."
                />
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() => moveHomeCategory(index, "up")}
                  disabled={index === 0}
                  aria-label="Move category up"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() => moveHomeCategory(index, "down")}
                  disabled={index === form.home_categories.length - 1}
                  aria-label="Move category down"
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() => removeHomeCategory(index)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button type="button" className="adm-button adm-button--ghost" onClick={addHomeCategory}>
              <Plus size={16} />
              Add category
            </button>
          </div>

          <div className="adm-form-grid__full" style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Shop Menu Items</p>
            <p className="adm-muted">
              Manage SHOP dropdown links. Example paths: `/new-arrivals`, `/collections`, `/sale`, or
              `/shop?category=Football`.
            </p>
            {form.shop_menu_items.map((entry, index) => (
              <div
                key={entry.id}
                style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr auto auto auto auto", gap: 8 }}
              >
                <input
                  className="adm-input"
                  value={entry.label}
                  onChange={(event) => {
                    const nextLabel = event.target.value;
                    const suggestedPath = suggestShopMenuPath(nextLabel);
                    updateShopMenuItem(index, {
                      label: nextLabel,
                      path: entry.path || suggestedPath,
                    });
                  }}
                  placeholder="All Products"
                />
                <input
                  className="adm-input"
                  value={entry.path}
                  onChange={(event) => updateShopMenuItem(index, { path: event.target.value })}
                  placeholder="/shop"
                />
                <label className="adm-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(entry.special)}
                    onChange={(event) => updateShopMenuItem(index, { special: event.target.checked })}
                  />
                  Sale style
                </label>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() => moveShopMenuItem(index, "up")}
                  disabled={index === 0}
                  aria-label="Move menu item up"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() => moveShopMenuItem(index, "down")}
                  disabled={index === form.shop_menu_items.length - 1}
                  aria-label="Move menu item down"
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  type="button"
                  className="adm-button adm-button--ghost"
                  onClick={() => removeShopMenuItem(index)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button type="button" className="adm-button adm-button--ghost" onClick={addShopMenuItem}>
              <Plus size={16} />
              Add shop menu item
            </button>
          </div>

          <label className="adm-form-grid__full" style={{ display: "grid", gap: 8 }}>
            Collections on home
            <div style={{ display: "grid", gap: 8, maxHeight: 200, overflowY: "auto" }}>
              {collectionsRaw.map((entry) => {
                const id = String(entry.id);
                const checked = form.home_collection_ids.includes(id);
                return (
                  <label key={id} className="adm-toggle">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          home_collection_ids: event.target.checked
                            ? Array.from(new Set([...prev.home_collection_ids, id]))
                            : prev.home_collection_ids.filter((value) => value !== id),
                        }))
                      }
                    />
                    {String(entry.name || id)}
                  </label>
                );
              })}
            </div>
          </label>
        </FormSection>
      </section>
    </div>
  );
}
