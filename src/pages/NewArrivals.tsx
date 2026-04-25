import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Filter } from "lucide-react";
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  ProductAudience,
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
  audience?: ProductAudience;
  authenticity?: ProductAuthenticity;
  description?: string;
  created_at: string;
}

export function NewArrivals() {
  const PRODUCTS_PER_BATCH = 12;
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAudience, setSelectedAudience] = useState<
    ProductAudience | "all"
  >("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [sortBy, setSortBy] = useState("newest");
  const [configuredNewArrivalIds, setConfiguredNewArrivalIds] = useState<string[]>(
    []
  );
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PER_BATCH);

  const categories = Array.from(
    new Set(
      products
        .map((product) => product.category?.trim())
        .filter((category): category is string => Boolean(category))
    )
  ).sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "site_settings", "homepage"), (snap) => {
      const ids =
        snap.exists() && Array.isArray(snap.data().new_arrival_ids)
          ? (snap.data().new_arrival_ids as string[])
          : [];
      setConfiguredNewArrivalIds(ids);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setLoading(true);
    const productsQuery = query(collection(db, "products"), orderBy("created_at", "desc"));
    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        const mapDocToProduct = (
          productId: string,
          data: Record<string, unknown>
        ): Product => ({
          id: productId,
          name: String(data.name || ""),
          price: Number(data.price || 0),
          image_url: String(data.image_url || ""),
          category: String(data.category || ""),
          audience: data.audience as ProductAudience | undefined,
          authenticity: data.authenticity as ProductAuthenticity | undefined,
          description:
            typeof data.description === "string" ? data.description : undefined,
          created_at:
            data.created_at && typeof data.created_at === "object"
              ? (data.created_at as { toDate?: () => Date }).toDate
                ? (
                    data.created_at as {
                      toDate: () => Date;
                    }
                  ).toDate().toISOString()
                : String(data.created_at)
              : String(data.created_at || ""),
        });

        const allProducts = snapshot.docs.map((entry) =>
          mapDocToProduct(entry.id, entry.data())
        );

        if (configuredNewArrivalIds.length > 0) {
          const orderedConfigured = configuredNewArrivalIds
            .map((id) => allProducts.find((item) => item.id === id))
            .filter((item): item is Product => Boolean(item));
          setProducts(orderedConfigured.slice(0, 50));
        } else {
          setProducts([]);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error loading products:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [configuredNewArrivalIds]);

  useEffect(() => {
    filterAndSortProducts();
  }, [products, selectedCategories, selectedAudience, priceRange, sortBy]);

  const filterAndSortProducts = () => {
    let filtered = [...products];

    // Filter by category
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((p) =>
        selectedCategories.includes(p.category)
      );
    }

    if (selectedAudience !== "all") {
      filtered = filtered.filter(
        (p) =>
          normalizeProductAudience(p.audience, p.category) === selectedAudience
      );
    }

    // Filter by price
    filtered = filtered.filter(
      (p) => p.price >= priceRange[0] && p.price <= priceRange[1]
    );

    // Sort
    switch (sortBy) {
      case "newest":
        filtered.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case "price-low":
        filtered.sort((a, b) => a.price - b.price);
        break;
      case "price-high":
        filtered.sort((a, b) => b.price - a.price);
        break;
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    setFilteredProducts(filtered);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedAudience("all");
    setPriceRange([0, 1000]);
    setSortBy("newest");
  };

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedAudience !== "all" ||
    priceRange[0] > 0 ||
    priceRange[1] < 1000;
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );
  const hasMoreProducts = visibleProducts.length < filteredProducts.length;

  useEffect(() => {
    setVisibleCount(PRODUCTS_PER_BATCH);
  }, [selectedCategories, selectedAudience, priceRange, sortBy, products]);

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl md:text-5xl font-light tracking-[0.14em] mb-3">
            NEW ARRIVALS
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Discover the latest additions to our collection. Fresh styles just
            landed.
          </p>
          <div className="w-20 h-px bg-black mx-auto mt-4" />
        </div>

        {/* Filter Bar */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-pressed={showFilters}
              onClick={() => setShowFilters(!showFilters)}
              className={`relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
                showFilters
                  ? "bg-black text-white border-black shadow-md"
                  : "bg-white text-gray-900 border-gray-300 hover:border-black"
              }`}
            >
              <Filter size={18} />
              <span className="text-sm tracking-wide">FILTERS</span>
              {hasActiveFilters && (
                <span
                  className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                    showFilters
                      ? "bg-white text-black"
                      : "bg-black text-white"
                  }`}
                >
                  {selectedCategories.length +
                    (selectedAudience !== "all" ? 1 : 0) +
                    (priceRange[0] > 0 || priceRange[1] < 1000 ? 1 : 0)}
                </span>
              )}
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-600 hover:text-black underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-sm text-gray-600 hidden sm:inline">
              {visibleProducts.length} of {filteredProducts.length}{" "}
              {filteredProducts.length === 1 ? "item" : "items"}
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-black"
            >
              <option value="newest">Newest First</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="name">Name: A to Z</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-5 lg:gap-6">
          {/* Sidebar Filters */}
          {showFilters && (
            <div className="w-full lg:w-64 flex-shrink-0 space-y-5 border border-gray-200 rounded-xl p-4 lg:p-0 lg:border-0">
              {/* Categories */}
              <div>
                <h3 className="font-medium text-sm tracking-wider mb-3">
                  CATEGORY
                </h3>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <label
                      key={category}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category)}
                        onChange={() => toggleCategory(category)}
                        className="w-4 h-4 border-2 border-gray-300 rounded cursor-pointer checked:bg-black checked:border-black"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-black transition-colors">
                        {category}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium text-sm tracking-wider mb-3">
                  AUDIENCE
                </h3>
                <select
                  value={selectedAudience}
                  onChange={(e) =>
                    setSelectedAudience(e.target.value as ProductAudience | "all")
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-black"
                >
                  <option value="all">All</option>
                  <option value="men">Men</option>
                  <option value="women">Women</option>
                  <option value="unisex">Unisex</option>
                </select>
              </div>

              {/* Price Range */}
              <div>
                <h3 className="font-medium text-sm tracking-wider mb-3">
                  PRICE RANGE
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      value={priceRange[0]}
                      onChange={(e) =>
                        setPriceRange([Number(e.target.value), priceRange[1]])
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-black"
                      placeholder="Min"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="number"
                      value={priceRange[1]}
                      onChange={(e) =>
                        setPriceRange([priceRange[0], Number(e.target.value)])
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-black"
                      placeholder="Max"
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    value={priceRange[1]}
                    onChange={(e) =>
                      setPriceRange([priceRange[0], Number(e.target.value)])
                    }
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Products Grid */}
          <div className="flex-1">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 md:gap-6">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[3/4] bg-slate-800 rounded-lg mb-3" />
                    <div className="h-4 bg-slate-800 rounded mb-2" />
                    <div className="h-4 bg-slate-800 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-14">
                <p className="text-gray-500 text-lg mb-3">No products found</p>
                <button
                  onClick={clearFilters}
                  className="text-sm underline hover:text-black"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 md:gap-6">
                  {visibleProducts.map((product) => (
                    <Link
                      key={product.id}
                      to={`/product/${product.id}`}
                      className="group"
                    >
                      <div className="aspect-[3/4] rounded-lg mb-3 overflow-hidden relative bg-white">
                        <img
                          src={product.image_url}
                          alt={product.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover object-center scale-[1.14] group-hover:scale-[1.18] transition-transform duration-500"
                        />
                        <div className="absolute top-3 left-3 bg-black text-white text-xs px-3 py-1 tracking-wider">
                          NEW
                        </div>
                      </div>
                      <h3 className="font-light text-sm md:text-base mb-1 tracking-wide line-clamp-1">
                        {product.name}
                      </h3>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">
                        {toProductAuthenticityLabel(product.authenticity)}
                      </p>
                      <p className="text-gray-600 text-sm md:text-base font-medium">
                        ${product.price.toFixed(2)}
                      </p>
                    </Link>
                  ))}
                </div>
                {hasMoreProducts ? (
                  <div className="mt-8 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => prev + PRODUCTS_PER_BATCH)}
                      className="inline-flex items-center rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium hover:border-black transition-colors"
                    >
                      Load more ({filteredProducts.length - visibleProducts.length} left)
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
