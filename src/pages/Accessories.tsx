import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Filter, Grid, List } from "lucide-react";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string;
  category: string;
  subcategory?: string;
  description?: string;
}

export function Accessories() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 300]);
  const [sortBy, setSortBy] = useState("featured");

  const accessoryTypes = [
    "Bags & Purses",
    "Jewelry",
    "Watches",
    "Belts",
    "Hats",
    "Scarves",
    "Sunglasses",
    "Wallets",
  ];

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    filterAndSortProducts();
  }, [products, selectedTypes, priceRange, sortBy]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const productsRef = collection(db, "products");
      const q = query(
        productsRef,
        where("category", "==", "Accessories"),
        limit(50)
      );
      const querySnapshot = await getDocs(q);

      const productsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Product[];

      setProducts(productsData);
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortProducts = () => {
    let filtered = [...products];

    if (selectedTypes.length > 0) {
      filtered = filtered.filter(
        (p) => p.subcategory && selectedTypes.includes(p.subcategory)
      );
    }

    filtered = filtered.filter(
      (p) => p.price >= priceRange[0] && p.price <= priceRange[1]
    );

    switch (sortBy) {
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

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const clearFilters = () => {
    setSelectedTypes([]);
    setPriceRange([0, 300]);
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="mb-16 text-center">
          <h1 className="text-5xl md:text-6xl font-light tracking-[0.2em] mb-6">
            ACCESSORIES
          </h1>
          <p className="text-gray-600 text-lg max-w-3xl mx-auto mb-8">
            Complete your look with our carefully selected accessories. From
            statement pieces to everyday essentials, find the perfect finishing
            touch.
          </p>
          <div className="w-20 h-px bg-black mx-auto" />
        </div>

        {/* Category Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {accessoryTypes.slice(0, 8).map((type) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`aspect-square rounded-xl overflow-hidden relative group transition-all ${
                selectedTypes.includes(type) ? "ring-4 ring-black" : ""
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/20 z-10" />
              <div className="absolute inset-0 bg-gray-200" />
              <div className="absolute inset-0 flex items-center justify-center z-20 text-center px-4">
                <span className="text-white text-sm md:text-base font-light tracking-widest">
                  {type.toUpperCase()}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-4">
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
              {selectedTypes.length > 0 && (
                <span className="ml-1 px-2 py-0.5 bg-black text-white text-xs rounded-full">
                  {selectedTypes.length}
                </span>
              )}
            </button>

            {selectedTypes.length > 0 && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-600 hover:text-black underline"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 border border-gray-300 rounded-lg p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded ${
                  viewMode === "grid"
                    ? "bg-black text-white"
                    : "hover:bg-gray-100"
                }`}
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded ${
                  viewMode === "list"
                    ? "bg-black text-white"
                    : "hover:bg-gray-100"
                }`}
              >
                <List size={18} />
              </button>
            </div>

            <span className="text-sm text-gray-600 hidden sm:inline">
              {filteredProducts.length} items
            </span>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-black"
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="name">Name: A to Z</option>
            </select>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Filters Sidebar */}
          {showFilters && (
            <div className="w-64 flex-shrink-0 space-y-8">
              <div>
                <h3 className="font-medium text-sm tracking-wider mb-4">
                  TYPE
                </h3>
                <div className="space-y-2">
                  {accessoryTypes.map((type) => (
                    <label
                      key={type}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTypes.includes(type)}
                        onChange={() => toggleType(type)}
                        className="w-4 h-4 border-2 border-gray-300 rounded cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-black transition-colors">
                        {type}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium text-sm tracking-wider mb-4">
                  PRICE RANGE
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">${priceRange[0]}</span>
                    <span className="font-medium">${priceRange[1]}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="300"
                    value={priceRange[1]}
                    onChange={(e) =>
                      setPriceRange([priceRange[0], Number(e.target.value)])
                    }
                    className="w-full accent-black"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={priceRange[0]}
                      onChange={(e) =>
                        setPriceRange([Number(e.target.value), priceRange[1]])
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-black"
                      placeholder="Min"
                    />
                    <input
                      type="number"
                      value={priceRange[1]}
                      onChange={(e) =>
                        setPriceRange([priceRange[0], Number(e.target.value)])
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-black"
                      placeholder="Max"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Products */}
          <div className="flex-1">
            {loading ? (
              <div
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
                    : "space-y-4"
                }
              >
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    {viewMode === "grid" ? (
                      <>
                        <div className="aspect-square bg-slate-800 rounded-lg mb-4" />
                        <div className="h-4 bg-slate-800 rounded mb-2" />
                        <div className="h-4 bg-slate-800 rounded w-1/2" />
                      </>
                    ) : (
                      <div className="flex gap-4">
                        <div className="w-32 h-32 bg-slate-800 rounded-lg" />
                        <div className="flex-1">
                          <div className="h-4 bg-slate-800 rounded mb-2" />
                          <div className="h-4 bg-slate-800 rounded w-1/2 mb-4" />
                          <div className="h-4 bg-slate-800 rounded" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-gray-500 text-lg mb-4">
                  No accessories found
                </p>
                <button
                  onClick={clearFilters}
                  className="text-sm underline hover:text-black"
                >
                  Clear all filters
                </button>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredProducts.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.id}`}
                    className="group"
                  >
                    <div className="aspect-square bg-gray-100 rounded-lg mb-4 overflow-hidden">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mb-1">
                      {product.subcategory}
                    </p>
                    <h3 className="font-light text-sm mb-1 tracking-wide line-clamp-1">
                      {product.name}
                    </h3>
                    <p className="text-gray-900 text-sm font-medium">
                      ${product.price.toFixed(2)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {filteredProducts.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.id}`}
                    className="flex gap-6 group hover:bg-gray-50 p-4 rounded-lg transition-colors"
                  >
                    <div className="w-40 h-40 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 mb-2">
                        {product.subcategory}
                      </p>
                      <h3 className="font-light text-xl mb-2 tracking-wide">
                        {product.name}
                      </h3>
                      <p className="text-gray-900 font-medium text-lg mb-3">
                        ${product.price.toFixed(2)}
                      </p>
                      {product.description && (
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {product.description}
                        </p>
                      )}
                    </div>
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
