import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Filter, X } from "lucide-react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { fromCategorySlug, toCategorySlug } from "../lib/category";
import {
  ProductAudience,
  audienceLabelMap,
  normalizeProductAudience,
} from "../lib/productAudience";
import {
  ProductAuthenticity,
  toProductAuthenticityLabel,
} from "../lib/productAuthenticity";

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string;
  category: string;
  subcategory?: string;
  product_type?: string;
  colors?: string[];
  brand?: string;
  tags?: string[];
  sold_out?: boolean;
  sold_out_sizes?: string[];
  audience?: ProductAudience;
  authenticity?: ProductAuthenticity;
}

interface HomeCategoryEntry {
  id?: string;
  name?: string;
  slug?: string;
  image_url?: string;
}
const isGenericChildType = (entry: string, parentCategory: string) => {
  const childSlug = toCategorySlug(entry || "");
  const parentSlug = toCategorySlug(parentCategory || "");
  if (!childSlug) return true;
  if (childSlug === parentSlug) return true;
  return childSlug === "all" || childSlug === "general" || childSlug === "other";
};
const resolveProductChildType = (product: Product) => {
  const category = String(product.category || "").trim();
  const subcategory = String(product.subcategory || "").trim();
  const productType = String(product.product_type || "").trim();

  if (productType && !isGenericChildType(productType, category)) {
    return productType;
  }
  if (subcategory && !isGenericChildType(subcategory, category)) {
    return subcategory;
  }
  return "";
};
const isSupplementLikeProduct = (product: Product) =>
  /\b(supplement|protein|whey|creatine|amino|bcaa|eaa|vitamin|mass|pre[\s-]?workout)\b/i.test(
    `${product.category || ""} ${product.subcategory || ""} ${product.product_type || ""} ${product.name || ""}`
  );
const isMartialArtsLikeProduct = (product: Product) =>
  /\b(sports|martial|muay[\s-]?thai|boxing|mma|combat|glove|wrap|shin|guard)\b/i.test(
    `${product.category || ""} ${product.subcategory || ""} ${product.product_type || ""} ${product.name || ""}`
  );
const categoryMatchesSlug = (product: Product, slug: string) => {
  const categorySlug = toCategorySlug(product.category || "");
  const selectedSlug = toCategorySlug(slug || "");
  if (!categorySlug || !selectedSlug) return false;
  if (categorySlug === selectedSlug) return true;

  if (selectedSlug === "gym" || selectedSlug === "gym-crossfit") {
    return (
      categorySlug.includes("gym") ||
      categorySlug.includes("crossfit") ||
      isSupplementLikeProduct(product)
    );
  }

  if (selectedSlug === "martial-arts") {
    return isMartialArtsLikeProduct(product);
  }

  return false;
};

export function CategoryPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(fromCategorySlug(slug));
  const [selectedType, setSelectedType] = useState("all");
  const [selectedAudience, setSelectedAudience] = useState<
    ProductAudience | "all"
  >("all");
  const [colorInput, setColorInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"featured" | "price-low" | "price-high">(
    "featured"
  );
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubscribers: Array<() => void> = [];

    const homepageRef = doc(db, "site_settings", "homepage");
    unsubscribers.push(
      onSnapshot(
        homepageRef,
        (homepageSnap) => {
          if (homepageSnap.exists()) {
            const configured = homepageSnap.data().home_categories;
            if (Array.isArray(configured)) {
              const matched = configured.find((item: HomeCategoryEntry) => {
                if (!item?.slug || typeof item.slug !== "string") return false;
                return toCategorySlug(item.slug) === toCategorySlug(slug);
              });
              if (matched?.name && typeof matched.name === "string") {
                setDisplayName(matched.name);
                return;
              }
            }
          }
          setDisplayName(fromCategorySlug(slug));
        },
        () => setDisplayName(fromCategorySlug(slug))
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, "products"),
        (snapshot) => {
          const allProducts = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as Product[];

          const filtered = allProducts.filter(
            (product) => categoryMatchesSlug(product, slug)
          );
          setProducts(filtered);
          setLoading(false);
        },
        (error) => {
          console.error("Error loading category page:", error);
          setLoading(false);
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [slug]);
  useEffect(() => {
    setSelectedType("all");
  }, [slug]);

  const typeOptions = useMemo(() => {
    const types = Array.from(
      new Set(
        products
          .map((product) => resolveProductChildType(product))
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    return ["all", ...types];
  }, [products]);
  const shouldShowTypeFilter = typeOptions.length > 1;
  const getProductType = (product: Product) =>
    resolveProductChildType(product).toLowerCase();

  useEffect(() => {
    let filtered = [...products];

    if (shouldShowTypeFilter && selectedType !== "all") {
      filtered = filtered.filter(
        (product) =>
          getProductType(product) === selectedType.trim().toLowerCase()
      );
    }

    if (selectedAudience !== "all") {
      filtered = filtered.filter(
        (product) =>
          normalizeProductAudience(product.audience, product.category) ===
          selectedAudience
      );
    }

    if (colorInput.trim()) {
      const colorTerm = colorInput.trim().toLowerCase();
      filtered = filtered.filter((product) =>
        (product.colors || []).some((color) =>
          String(color || "")
            .toLowerCase()
            .includes(colorTerm)
        )
      );
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((product) => {
        const tagsText = Array.isArray(product.tags) ? product.tags.join(" ") : "";
        return (
          product.name.toLowerCase().includes(term) ||
          product.category.toLowerCase().includes(term) ||
          String(product.subcategory || "")
            .toLowerCase()
            .includes(term) ||
          String(product.product_type || "")
            .toLowerCase()
            .includes(term) ||
          String(product.brand || "")
            .toLowerCase()
            .includes(term) ||
          tagsText.toLowerCase().includes(term)
        );
      });
    }

    if (sortBy === "price-low") {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-high") {
      filtered.sort((a, b) => b.price - a.price);
    }

    setFilteredProducts(filtered);
  }, [
    products,
    selectedType,
    shouldShowTypeFilter,
    selectedAudience,
    colorInput,
    searchTerm,
    sortBy,
  ]);

  const heading = useMemo(
    () => (displayName?.trim() ? displayName : fromCategorySlug(slug)),
    [displayName, slug]
  );

  useEffect(() => {
    if (!isFilterPanelOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFilterPanelOpen]);

  useEffect(() => {
    if (!isFilterPanelOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFilterPanelOpen(false);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isFilterPanelOpen]);

  const activeFilterCount = [
    shouldShowTypeFilter && selectedType !== "all",
    selectedAudience !== "all",
    colorInput.trim().length > 0,
    searchTerm.trim().length > 0,
    sortBy !== "featured",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSelectedType("all");
    setSelectedAudience("all");
    setColorInput("");
    setSearchTerm("");
    setSortBy("featured");
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 flex items-end justify-between gap-4">
          <h1 className="text-4xl md:text-5xl font-light tracking-wider uppercase">
            {heading}
          </h1>
          <div className="flex items-center gap-3">
            <Link to="/shop" className="text-sm underline hover:text-cyan-200">
              View All Products
            </Link>
            <button
              type="button"
              onClick={() => setIsFilterPanelOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium hover:border-black transition-colors"
            >
              <Filter size={16} />
              Filters
              {activeFilterCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black px-1.5 text-[11px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="mb-8 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            Showing {filteredProducts.length} product
            {filteredProducts.length === 1 ? "" : "s"}
          </p>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-black underline underline-offset-4"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div
          className={`fixed inset-x-0 top-[84px] bottom-0 z-[140] transition-opacity duration-300 ${
            isFilterPanelOpen
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none"
          }`}
          aria-hidden={!isFilterPanelOpen}
        >
          <button
            type="button"
            onClick={() => setIsFilterPanelOpen(false)}
            className="absolute inset-0 bg-black/35"
            aria-label="Close filter panel"
          />
          <aside
            className={`absolute right-0 top-0 h-full w-[360px] max-w-[90vw] bg-white border-l border-gray-200 shadow-2xl transition-transform duration-300 ease-out ${
              isFilterPanelOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setIsFilterPanelOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                aria-label="Close filters"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto h-[calc(100%-68px)]">
              {shouldShowTypeFilter && (
                <div className="space-y-1.5">
                  <label className="text-sm text-gray-500">Type</label>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">All</option>
                    {typeOptions
                      .filter((entry) => entry !== "all")
                      .map((entry) => (
                        <option key={entry} value={entry}>
                          {entry}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm text-gray-500">Search</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Name, type, brand..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-gray-500">Color</label>
                <input
                  type="text"
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Black, White..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-gray-500">Audience</label>
                <select
                  value={selectedAudience}
                  onChange={(e) =>
                    setSelectedAudience(e.target.value as ProductAudience | "all")
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="all">All</option>
                  <option value="men">Men</option>
                  <option value="women">Women</option>
                  <option value="unisex">Unisex</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-gray-500">Sort</label>
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as "featured" | "price-low" | "price-high"
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="featured">Featured</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setIsFilterPanelOpen(false)}
                  className="flex-1 rounded-lg bg-black px-3 py-2 text-sm text-white hover:bg-gray-800"
                >
                  Apply
                </button>
              </div>
            </div>
          </aside>
        </div>

        {shouldShowTypeFilter && (
          <div className="flex justify-center gap-3 md:gap-5 mb-8 flex-wrap border-b border-gray-200 pb-2">
            {typeOptions.map((entry) => {
              const isAll = entry === "all";
              const isSelected = selectedType === entry;
              const label = isAll ? "All" : entry;
              return (
                <button
                  key={`type-tab-${entry}`}
                  onClick={() => setSelectedType(entry)}
                  className={`text-xs md:text-sm tracking-[0.12em] uppercase transition-colors pb-2 ${
                    isSelected
                      ? "text-black border-b-2 border-black font-medium"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] bg-slate-800 rounded-lg mb-4" />
                <div className="space-y-2">
                  <div className="h-3 bg-slate-800 rounded w-1/4" />
                  <div className="h-4 bg-slate-800 rounded w-3/4" />
                  <div className="h-4 bg-slate-800 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg mb-4">
              No products found in this category yet.
            </p>
            <Link to="/shop" className="text-black underline hover:text-gray-600">
              Browse shop
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredProducts.map((product) => (
              <Link
                key={product.id}
                to={`/product/${product.id}`}
                className="group"
              >
                <div className="relative aspect-[3/4] mb-4 overflow-hidden rounded-lg bg-white">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-center scale-[1.14] group-hover:scale-[1.18] transition-transform duration-500"
                  />
                  {Boolean(product.sold_out) && (
                    <span className="absolute top-2 left-2 px-2 py-1 bg-red-600 text-white text-[10px] font-semibold rounded">
                      Sold Out
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs tracking-wider text-gray-500 uppercase">
                    {[
                      product.category,
                      !isSupplementLikeProduct(product)
                        ? audienceLabelMap[
                            normalizeProductAudience(product.audience, product.category)
                          ]
                        : "",
                      toProductAuthenticityLabel(product.authenticity),
                    ]
                      .map((entry) => String(entry || "").trim())
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                  <h3 className="font-light text-lg">{product.name}</h3>
                  <p className="text-gray-900 font-medium">
                    ${product.price.toFixed(2)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
