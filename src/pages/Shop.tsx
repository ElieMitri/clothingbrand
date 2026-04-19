import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Filter } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { addGuestCartItem, addItemToUserCart } from "../lib/cart";
import { StoreProduct, toDate } from "../lib/storefront";
import { ProductCard } from "../components/storefront/ProductCard";
import { Button } from "../components/storefront/Button";
import { FilterSidebar } from "../components/storefront/FilterSidebar";

export function Shop() {
  const location = useLocation();
  const { user } = useAuth();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"featured" | "price-low" | "price-high" | "newest">("featured");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(500);
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const categoryParam = params.get("category");
    const searchParam = params.get("search");

    if (categoryParam) {
      setSelectedCategory(categoryParam);
    }
    if (searchParam) {
      setSearchTerm(searchParam);
    }
  }, [location.search]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => String(product.category || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const filteredProducts = useMemo(() => {
    let next = [...products];

    if (selectedCategory !== "all") {
      next = next.filter((product) =>
        String(product.category || "").toLowerCase() === selectedCategory.toLowerCase()
      );
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
    } else {
      next.sort((a, b) => Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured)));
    }

    return next;
  }, [products, selectedCategory, searchTerm, minPrice, maxPrice, sortBy]);

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
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
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
              Showing {filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory("all");
                setSortBy("featured");
                setMinPrice(0);
                setMaxPrice(500);
                setSearchTerm("");
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} onQuickAdd={handleQuickAdd} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
