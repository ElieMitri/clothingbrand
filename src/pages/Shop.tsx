import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Filter, X } from "lucide-react";
import { db } from "../lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { toCategorySlug } from "../lib/category";
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
  colors?: string[];
  product_type?: string;
  brand?: string;
  sku?: string;
  tags?: string[];
  flavor?: string;
  net_weight?: string;
  is_featured?: boolean;
  sold_out?: boolean;
  sold_out_sizes?: string[];
  created_at?: unknown;
  audience?: ProductAudience;
  authenticity?: ProductAuthenticity;
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
const isMartialArtsLikeProduct = (product: Product) =>
  /\b(sports|martial|muay[\s-]?thai|boxing|mma|combat|glove|wrap|shin|guard)\b/i.test(
    `${product.category || ""} ${product.subcategory || ""} ${product.product_type || ""} ${product.name || ""}`
  );

export function Shop() {
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAudience, setSelectedAudience] = useState<
    ProductAudience | "all"
  >("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"featured" | "price-low" | "price-high">(
    "featured"
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<string[]>(["all"]);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const categoryMatches = (product: Product, selectedCategoryValue: string) => {
    if (selectedCategoryValue === "all") return true;

    const selectedSlug = toCategorySlug(selectedCategoryValue);
    const productSlug = toCategorySlug(product.category || "");
    if (!selectedSlug || !productSlug) return false;
    if (productSlug === selectedSlug) return true;

    if (selectedSlug === "gym" || selectedSlug === "gym-crossfit") {
      return (
        productSlug.includes("gym") ||
        productSlug.includes("crossfit") ||
        isSupplementLikeProduct(product)
      );
    }

    if (selectedSlug === "martial-arts") {
      return isMartialArtsLikeProduct(product);
    }

    return false;
  };
  const categorySupportsAudienceFilter = (categoryName: string) => {
    const slug = toCategorySlug(categoryName || "");
    return (
      slug.includes("shoe") ||
      slug.includes("sneaker") ||
      slug.includes("cloth") ||
      slug.includes("apparel")
    );
  };

  const getProductType = (product: Product) =>
    resolveProductChildType(product).toLowerCase();
  const isSupplementLikeProduct = (product: Product) =>
    /\b(supplement|protein|whey|creatine|amino|bcaa|eaa|vitamin|mass|pre[\s-]?workout)\b/i.test(
      `${product.category || ""} ${product.subcategory || ""} ${product.product_type || ""} ${product.name || ""}`
    );

  const toDateValue = (value: unknown) => {
    if (value && typeof value === "object" && "toDate" in (value as object)) {
      try {
        return (value as { toDate: () => Date }).toDate();
      } catch {
        return new Date(0);
      }
    }
    if (value instanceof Date) return value;
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date(0);
  };
  const getDisplayCategoryName = (categoryName: string) => {
    const slug = toCategorySlug(categoryName || "");
    if (slug.includes("gym") || slug.includes("crossfit")) return "Gym";
    if (
      slug.includes("sports") ||
      slug.includes("martial") ||
      slug.includes("muay-thai") ||
      slug.includes("muaythai") ||
      slug.includes("boxing") ||
      slug.includes("mma") ||
      slug.includes("combat")
    ) {
      return "Martial Arts";
    }
    return categoryName;
  };

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        const productsData = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        })) as Product[];

        setProducts(productsData);
        const dynamicCategories = Array.from(
          new Set(
            productsData
              .map((product) => product.category?.trim())
              .filter((category): category is string => Boolean(category))
          )
        ).sort((a, b) => a.localeCompare(b));
        setCategories(["all", ...dynamicCategories]);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading products:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setSelectedType("all");
  }, [selectedCategory]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const categoryParam = params.get("category");
    if (!categoryParam) {
      if (location.pathname === "/shop") {
        setSelectedCategory("all");
      }
      return;
    }
    const requestedCategory = categoryParam.trim();
    const requestedSlug = toCategorySlug(requestedCategory);
    if (
      requestedSlug.includes("sports") ||
      requestedSlug.includes("martial") ||
      requestedSlug.includes("muay-thai") ||
      requestedSlug.includes("muaythai") ||
      requestedSlug.includes("boxing") ||
      requestedSlug.includes("mma") ||
      requestedSlug.includes("combat")
    ) {
      setSelectedCategory("Martial Arts");
      return;
    }
    setSelectedCategory(requestedCategory);
  }, [location.pathname, location.search]);

  const categoryOptions = useMemo(() => {
    const normalized = Array.from(
      new Set(
        categories.map((entry) => getDisplayCategoryName(entry)).filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return normalized;
  }, [categories]);

  const typeOptions = useMemo(() => {
    if (selectedCategory === "all") return ["all"];

    const source = products.filter((product) =>
      categoryMatches(product, selectedCategory)
    );
    const types = Array.from(
      new Set(
        source
          .map((product) => resolveProductChildType(product))
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    return ["all", ...types];
  }, [products, selectedCategory]);
  const shouldShowTypeFilter = selectedCategory !== "all" && typeOptions.length > 1;
  const shouldShowAudienceFilter = useMemo(() => {
    if (selectedCategory === "all") return false;
    return categorySupportsAudienceFilter(selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    if (!shouldShowTypeFilter && selectedType !== "all") {
      setSelectedType("all");
    }
  }, [shouldShowTypeFilter, selectedType]);

  useEffect(() => {
    if (!shouldShowAudienceFilter && selectedAudience !== "all") {
      setSelectedAudience("all");
    }
  }, [shouldShowAudienceFilter, selectedAudience]);

  useEffect(() => {
    let filtered = [...products];

    if (selectedCategory !== "all") {
      filtered = filtered.filter((product) =>
        categoryMatches(product, selectedCategory)
      );
    }

    if (shouldShowTypeFilter && selectedType !== "all") {
      filtered = filtered.filter(
        (product) =>
          getProductType(product) === selectedType.trim().toLowerCase()
      );
    }

    if (shouldShowAudienceFilter && selectedAudience !== "all") {
      filtered = filtered.filter(
        (product) =>
          normalizeProductAudience(product.audience, product.category) ===
          selectedAudience
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
          String(product.sku || "")
            .toLowerCase()
            .includes(term) ||
          String(product.flavor || "")
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
    } else {
      filtered.sort((a, b) => {
        const featuredDelta = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured));
        if (featuredDelta !== 0) return featuredDelta;
        return toDateValue(b.created_at).getTime() - toDateValue(a.created_at).getTime();
      });
    }

    setFilteredProducts(filtered);
  }, [
    products,
    selectedCategory,
    selectedType,
    shouldShowTypeFilter,
    selectedAudience,
    shouldShowAudienceFilter,
    sortBy,
    searchTerm,
  ]);

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
    selectedCategory !== "all",
    shouldShowTypeFilter && selectedType !== "all",
    shouldShowAudienceFilter && selectedAudience !== "all",
    sortBy !== "featured",
    searchTerm.trim().length > 0,
  ].filter(Boolean).length;

  const setCategoryAndSyncUrl = (category: string) => {
    const params = new URLSearchParams(location.search);
    if (category === "all") {
      params.delete("category");
    } else {
      params.set("category", category);
    }
    const nextSearch = params.toString().replace(/\+/g, "%20");
    const nextUrl = nextSearch ? `/shop?${nextSearch}` : "/shop";
    const currentUrl = `${location.pathname}${location.search}`;

    setSelectedCategory(category);
    if (currentUrl !== nextUrl) {
      navigate(nextUrl);
    }
  };

  const clearFilters = () => {
    setCategoryAndSyncUrl("all");
    setSelectedType("all");
    setSelectedAudience("all");
    setSortBy("featured");
    setSearchTerm("");
  };

  return (
    <div className="min-h-screen pt-20 pb-20 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between gap-3">
          <h1 className="text-4xl md:text-5xl font-light tracking-[0.14em]">SHOP</h1>
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

        <div className="flex items-center justify-between gap-4 mb-5">
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
              <div className="space-y-1.5">
                <label className="text-sm text-gray-500">Search</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Name, brand, type, SKU..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-gray-500">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setCategoryAndSyncUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {shouldShowTypeFilter && (
                <div className="space-y-1.5">
                  <label className="text-sm text-gray-500">Type</label>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">Everything</option>
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

              {shouldShowAudienceFilter && (
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
              )}

              <div className="space-y-1.5">
                <label className="text-sm text-gray-500">Sort</label>
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as "featured" | "price-low" | "price-high")
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="featured">Featured</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          </aside>
        </div>

        <div className="flex justify-center gap-4 md:gap-6 mb-8 flex-wrap border-b border-gray-200 pb-2">
          {categoryOptions.map((category) => (
            <button
              key={category}
              onClick={() => setCategoryAndSyncUrl(category)}
              className={`text-sm tracking-[0.14em] uppercase transition-colors pb-2 ${
                selectedCategory === category
                  ? "text-black border-b-2 border-black font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {category}
            </button>
          ))}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] bg-slate-800 rounded-lg mb-3" />
                <div className="space-y-1.5">
                  <div className="h-3 bg-slate-800 rounded w-1/4" />
                  <div className="h-4 bg-slate-800 rounded w-3/4" />
                  <div className="h-4 bg-slate-800 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-14">
            <p className="text-gray-500 text-lg mb-3">
              No products found in this category
            </p>
            <button
              onClick={() => setCategoryAndSyncUrl("all")}
              className="text-black underline hover:text-gray-600"
            >
              View all products
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
            {filteredProducts.map((product) => (
              <Link
                key={product.id}
                to={`/product/${product.id}`}
                className="group"
              >
                <div className="relative aspect-[3/4] mb-3 overflow-hidden rounded-lg bg-white">
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
                <div className="space-y-1.5">
                  <p className="text-xs tracking-wider text-gray-500 uppercase">
                    {Array.from(
                      new Set(
                        [
                      getDisplayCategoryName(product.category),
                      resolveProductChildType(product),
                      !isSupplementLikeProduct(product)
                        ? audienceLabelMap[
                            normalizeProductAudience(product.audience, product.category)
                          ]
                        : "",
                      toProductAuthenticityLabel(product.authenticity),
                        ]
                          .map((entry) => String(entry || "").trim())
                          .filter(Boolean)
                      )
                    )
                      .map((entry) => String(entry || "").trim())
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                  <h3 className="font-light text-lg">{product.name}</h3>
                  {(product.brand || product.flavor || product.net_weight) && (
                    <p className="text-xs text-gray-500">
                      {product.brand ? product.brand : ""}
                      {product.flavor ? `${product.brand ? " • " : ""}${product.flavor}` : ""}
                      {product.net_weight
                        ? `${product.brand || product.flavor ? " • " : ""}${product.net_weight}`
                        : ""}
                    </p>
                  )}
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
