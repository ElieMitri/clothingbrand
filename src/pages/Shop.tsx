import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Filter } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { addGuestCartItem, addItemToUserCart } from "../lib/cart";
import { StoreProduct, toDate } from "../lib/storefront";
import { ProductCard } from "../components/storefront/ProductCard";
import { Button } from "../components/storefront/Button";
import { FilterSidebar } from "../components/storefront/FilterSidebar";

const slugifyCategoryToken = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const singularizeCategoryWord = (word: string) => {
  const token = String(word || "").trim();
  if (!token) return "";
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("sses") || token.endsWith("ss")) return token;
  if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
  return token;
};

const normalizeCategoryKey = (value: string) => {
  const compact = slugifyCategoryToken(decodeURIComponent(String(value || "")))
    .split("-")
    .filter(Boolean)
    .map((token) => singularizeCategoryWord(token))
    .join("");
  if (!compact) return "";
  if (compact === "gym" || compact === "crossfit" || compact === "gymcrossfit") return "gymcrossfit";
  if (
    compact === "martialarts" ||
    compact === "martial" ||
    compact === "muaythai" ||
    compact === "boxing" ||
    compact === "mma" ||
    compact === "combat" ||
    compact === "combatsports"
  ) {
    return "martialarts";
  }
  return compact;
};

export function Shop() {
  const PRODUCTS_PER_BATCH = 12;
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<
    "" | "newest" | "oldest" | "price-low" | "price-high" | "name-asc"
  >("");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(500);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PER_BATCH);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "products"), (snapshot) => {
      const nextProducts = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...entry.data(),
      })) as StoreProduct[];
      setProducts(nextProducts);
    });

    return () => unsubscribe();
  }, []);

  const categoryOptions = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    products.forEach((product) => {
      const label = String(product.category || "").trim();
      if (!label) return;
      const key = normalizeCategoryKey(label);
      if (!key) return;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { label, count: 1 });
        return;
      }
      byKey.set(key, {
        label: label.length > existing.label.length ? label : existing.label,
        count: existing.count + 1,
      });
    });
    return Array.from(byKey.entries())
      .map(([value, entry]) => ({ value, label: entry.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const categoryParam = params.get("category");
    const searchParam = params.get("search");

    if (!categoryParam) {
      setSelectedCategory("all");
    } else {
      const selectedKey = normalizeCategoryKey(categoryParam);
      setSelectedCategory(selectedKey || "all");
    }

    setSearchTerm(searchParam || "");
  }, [location.search]);

  const filteredProducts = useMemo(() => {
    let next = [...products];

    if (selectedCategory !== "all") {
      const selectedCategoryKey = normalizeCategoryKey(selectedCategory);
      next = next.filter((product) => {
        const productCategoryKey = normalizeCategoryKey(String(product.category || ""));
        if (!productCategoryKey || !selectedCategoryKey) return false;
        return productCategoryKey === selectedCategoryKey;
      });
    }

    if (searchTerm.trim()) {
      const token = searchTerm.toLowerCase();
      next = next.filter((product) => {
        const text = `${product.name || ""} ${product.category || ""} ${product.description || ""}`.toLowerCase();
        return text.includes(token);
      });
    }

    next = next.filter((product) => product.price >= minPrice && product.price <= maxPrice);

    if (sortBy === "price-low") {
      next.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-high") {
      next.sort((a, b) => b.price - a.price);
    } else if (sortBy === "newest") {
      next.sort((a, b) => toDate(b.created_at).getTime() - toDate(a.created_at).getTime());
    } else if (sortBy === "oldest") {
      next.sort((a, b) => toDate(a.created_at).getTime() - toDate(b.created_at).getTime());
    } else if (sortBy === "name-asc") {
      next.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, {
          sensitivity: "base",
        })
      );
    } else if (sortBy) {
      next.sort((a, b) => Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured)));
    }

    return next;
  }, [products, selectedCategory, searchTerm, minPrice, maxPrice, sortBy]);

  const onCategoryChange = (nextCategoryKey: string) => {
    const params = new URLSearchParams(location.search);
    if (nextCategoryKey === "all") {
      params.delete("category");
    } else {
      const selectedOption = categoryOptions.find((option) => option.value === nextCategoryKey);
      params.set("category", selectedOption?.label || nextCategoryKey);
    }
    const query = params.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`, { replace: true });
  };

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );
  const hasMoreProducts = visibleProducts.length < filteredProducts.length;

  useEffect(() => {
    setVisibleCount(PRODUCTS_PER_BATCH);
  }, [selectedCategory, searchTerm, minPrice, maxPrice, sortBy]);

  const handleQuickAdd = async (product: StoreProduct) => {
    const size = Array.isArray(product.sizes) && product.sizes.length > 0 ? product.sizes[0] : "M";

    if (user) {
      await addItemToUserCart(user.uid, product.id, size, 1);
      return;
    }

    addGuestCartItem(product.id, size, 1);
  };

  return (
    <div className="store-container pb-8 pt-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-text-muted)]">Collection</p>
          <h1 className="font-display text-4xl font-bold text-[var(--sf-text)]">Shop All Products</h1>
          <p className="mt-2 text-sm text-[var(--sf-text-muted)]">Clean essentials and high-performance apparel for every training day.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            iconLeft={<Filter size={15} />}
            onClick={() => setFiltersOpen(true)}
            className="lg:hidden"
          >
            Filters
          </Button>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search products"
            className="h-11 w-52 rounded-[10px] border border-[var(--sf-line-strong)] px-3 text-sm"
            aria-label="Search products"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <FilterSidebar
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          categories={categoryOptions}
          selectedCategory={selectedCategory}
          onCategoryChange={onCategoryChange}
          sortBy={sortBy}
          onSortChange={setSortBy}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onPriceChange={({ min, max }) => {
            setMinPrice(Math.max(0, min));
            setMaxPrice(Math.max(0, max));
          }}
        />

        <section>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-[var(--sf-text-muted)]">
              Showing {visibleProducts.length} of {filteredProducts.length} product
              {filteredProducts.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={() => {
                setSortBy("");
                setMinPrice(0);
                setMaxPrice(500);
                setSearchTerm("");
                const params = new URLSearchParams(location.search);
                params.delete("category");
                params.delete("search");
                const query = params.toString();
                navigate(`${location.pathname}${query ? `?${query}` : ""}`, { replace: true });
              }}
              className="text-sm font-medium text-[var(--sf-text-muted)] hover:text-[var(--sf-text)]"
            >
              Clear filters
            </button>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="store-card p-8 text-center">
              <p className="text-sm text-[var(--sf-text-muted)]">No products match your current filters.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {visibleProducts.map((product) => (
                  <ProductCard key={product.id} product={product} onQuickAdd={handleQuickAdd} />
                ))}
              </div>
              {hasMoreProducts ? (
                <div className="mt-6 flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setVisibleCount((prev) => prev + PRODUCTS_PER_BATCH)
                    }
                  >
                    Load more ({filteredProducts.length - visibleProducts.length} left)
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
