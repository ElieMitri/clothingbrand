import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Filter } from "lucide-react";
import { db } from "../lib/firebase";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import {
  ProductAudience,
  normalizeProductAudience,
} from "../lib/productAudience";

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string;
  category: string;
  audience?: ProductAudience;
  description?: string;
  created_at: string;
}

export function NewArrivals() {
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

  const categories = Array.from(
    new Set(
      products
        .map((product) => product.category?.trim())
        .filter((category): category is string => Boolean(category))
    )
  ).sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    filterAndSortProducts();
  }, [products, selectedCategories, selectedAudience, priceRange, sortBy]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const productsRef = collection(db, "products");
      const q = query(productsRef, orderBy("created_at", "desc"), limit(50));
      const querySnapshot = await getDocs(q);

      const productsData = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          price: data.price,
          image_url: data.image_url,
          category: data.category,
          description: data.description,
          created_at: data.created_at?.toDate
            ? data.created_at.toDate().toISOString()
            : data.created_at,
        } as Product;
      });

      setProducts(productsData);
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-light tracking-wider mb-4">
            NEW ARRIVALS
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Discover the latest additions to our collection. Fresh styles just
            landed.
          </p>
          <div className="w-20 h-px bg-black mx-auto mt-6" />
        </div>

        {/* Filter Bar */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:border-black transition-colors"
            >
              <Filter size={18} />
              <span className="text-sm tracking-wide">FILTERS</span>
              {hasActiveFilters && (
                <span className="ml-1 px-2 py-0.5 bg-black text-white text-xs rounded-full">
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

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 hidden sm:inline">
              {filteredProducts.length}{" "}
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

        <div className="flex gap-8">
          {/* Sidebar Filters */}
          {showFilters && (
            <div className="w-64 flex-shrink-0 space-y-6">
              {/* Categories */}
              <div>
                <h3 className="font-medium text-sm tracking-wider mb-4">
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
                <h3 className="font-medium text-sm tracking-wider mb-4">
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
                <h3 className="font-medium text-sm tracking-wider mb-4">
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[3/4] bg-slate-800 rounded-lg mb-4" />
                    <div className="h-4 bg-slate-800 rounded mb-2" />
                    <div className="h-4 bg-slate-800 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-gray-500 text-lg mb-4">No products found</p>
                <button
                  onClick={clearFilters}
                  className="text-sm underline hover:text-black"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredProducts.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.id}`}
                    className="group"
                  >
                    <div className="aspect-[3/4] bg-gray-100 rounded-lg mb-4 overflow-hidden relative p-2">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3 bg-black text-white text-xs px-3 py-1 tracking-wider">
                        NEW
                      </div>
                    </div>
                    <h3 className="font-light text-sm md:text-base mb-1 tracking-wide line-clamp-1">
                      {product.name}
                    </h3>
                    <p className="text-gray-600 text-sm md:text-base font-medium">
                      ${product.price.toFixed(2)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
