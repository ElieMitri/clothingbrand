import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Filter, Heart } from "lucide-react";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, where, limit } from "firebase/firestore";
import {
  ProductAuthenticity,
  toProductAuthenticityLabel,
} from "../lib/productAuthenticity";

interface Product {
  id: string;
  name: string;
  price: number;
  original_price?: number;
  discount_percentage?: number;
  image_url: string;
  category: string;
  subcategory?: string;
  authenticity?: ProductAuthenticity;
  colors?: string[];
  stock?: number;
}

export function Men() {
  const PRODUCTS_PER_BATCH = 12;
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PER_BATCH);

  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>(
    []
  );
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [sortBy, setSortBy] = useState("featured");

  const subcategories = [
    "Shirts",
    "Pants",
    "Jackets",
    "Sweaters",
    "T-Shirts",
    "Shorts",
  ];
  const colors = ["Black", "White", "Beige", "Navy", "Grey", "Brown", "Blue"];
  const sizes = ["XS", "S", "M", "L", "XL", "XXL"];

  useEffect(() => {
    setLoading(true);
    const productsRef = collection(db, "products");
    const q = query(productsRef, where("category", "==", "Men"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const productsData = querySnapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        })) as Product[];

        setProducts(productsData);
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
    filterAndSortProducts();
  }, [
    products,
    selectedSubcategories,
    selectedColors,
    selectedSizes,
    priceRange,
    sortBy,
  ]);

  const filterAndSortProducts = () => {
    let filtered = [...products];

    if (selectedSubcategories.length > 0) {
      filtered = filtered.filter(
        (p) => p.subcategory && selectedSubcategories.includes(p.subcategory)
      );
    }

    if (selectedColors.length > 0) {
      filtered = filtered.filter(
        (p) => p.colors && p.colors.some((c) => selectedColors.includes(c))
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

  const toggleSubcategory = (sub: string) => {
    setSelectedSubcategories((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
  };

  const toggleColor = (color: string) => {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
    );
  };

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const clearFilters = () => {
    setSelectedSubcategories([]);
    setSelectedColors([]);
    setSelectedSizes([]);
    setPriceRange([0, 500]);
  };

  const colorMap: { [key: string]: string } = {
    Black: "bg-black",
    White: "bg-white border border-gray-300",
    Beige: "bg-[#F5F5DC]",
    Navy: "bg-[#000080]",
    Grey: "bg-gray-500",
    Brown: "bg-[#8B4513]",
    Blue: "bg-blue-600",
  };
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );
  const hasMoreProducts = visibleProducts.length < filteredProducts.length;

  useEffect(() => {
    setVisibleCount(PRODUCTS_PER_BATCH);
  }, [selectedSubcategories, selectedColors, selectedSizes, priceRange, sortBy, products]);

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="mb-16">
          <div className="relative h-[45vh] rounded-3xl overflow-hidden mb-12 shadow-xl">
            <img
              src="https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?q=80&w=2070"
              alt="Men's Collection"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex items-end">
              <div className="p-12 text-white">
                <div className="inline-block px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-sm font-medium mb-4">
                  Spring Collection 2024
                </div>
                <h1 className="text-5xl md:text-7xl font-light tracking-[0.15em] mb-3">
                  MEN'S
                </h1>
                <p className="text-xl font-light tracking-wide opacity-90">
                  Timeless Sophistication
                </p>
              </div>
            </div>
          </div>

          <div className="text-center max-w-3xl mx-auto">
            <p className="text-gray-600 text-lg leading-relaxed">
              Discover our curated selection of men's essentials. From classic
              staples to contemporary pieces, find everything you need to
              elevate your wardrobe.
            </p>
          </div>
        </div>

        {/* Quick Category Links */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-12">
          {subcategories.map((sub) => (
            <button
              key={sub}
              onClick={() => toggleSubcategory(sub)}
              className={`py-3 px-4 text-sm font-medium border-2 rounded-xl transition-all ${
                selectedSubcategories.includes(sub)
                  ? "bg-black text-white border-black shadow-lg scale-105"
                  : "bg-white border-gray-200 hover:border-black hover:shadow-md"
              }`}
            >
              {sub}
            </button>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-gray-200">
          <button
            type="button"
            aria-pressed={showFilters}
            onClick={() => setShowFilters(!showFilters)}
            className={`relative z-10 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 transition-all duration-200 ${
              showFilters
                ? "bg-black text-white border-black shadow-md"
                : "bg-white text-gray-900 border-gray-300 hover:border-black hover:shadow-md"
            }`}
          >
            <Filter size={18} />
            <span className="text-sm font-semibold tracking-wide">FILTERS</span>
            {selectedSubcategories.length +
              selectedColors.length +
              selectedSizes.length >
              0 && (
              <span className="ml-1 px-2.5 py-1 bg-black text-white text-xs font-bold rounded-full">
                {selectedSubcategories.length +
                  selectedColors.length +
                  selectedSizes.length}
              </span>
            )}
          </button>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 font-medium hidden sm:inline">
              {visibleProducts.length} of {filteredProducts.length} items
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2.5 bg-white border-2 border-gray-300 rounded-xl text-sm font-medium focus:outline-none focus:border-black transition-colors"
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
            <div className="w-72 flex-shrink-0 space-y-8 bg-white p-6 rounded-2xl shadow-lg h-fit sticky top-28">
              <div>
                <h3 className="font-semibold text-sm tracking-wider mb-4 text-gray-900">
                  CATEGORY
                </h3>
                <div className="space-y-3">
                  {subcategories.map((sub) => (
                    <label
                      key={sub}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSubcategories.includes(sub)}
                        onChange={() => toggleSubcategory(sub)}
                        className="w-5 h-5 border-2 border-gray-300 rounded accent-black"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-black font-medium">
                        {sub}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="font-semibold text-sm tracking-wider mb-4 text-gray-900">
                  COLOR
                </h3>
                <div className="grid grid-cols-5 gap-3">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => toggleColor(color)}
                      className={`w-11 h-11 rounded-full ${colorMap[color]} ${
                        selectedColors.includes(color)
                          ? "ring-4 ring-black ring-offset-2 scale-110"
                          : "hover:ring-2 hover:ring-gray-400 hover:scale-105"
                      } transition-all duration-200 shadow-md`}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="font-semibold text-sm tracking-wider mb-4 text-gray-900">
                  SIZE
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => toggleSize(size)}
                      className={`py-2.5 text-sm font-semibold border-2 rounded-lg transition-all ${
                        selectedSizes.includes(size)
                          ? "bg-black text-white border-black shadow-md scale-105"
                          : "bg-white border-gray-300 hover:border-black"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="font-semibold text-sm tracking-wider mb-4 text-gray-900">
                  PRICE RANGE
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="px-3 py-1 bg-gray-100 rounded-lg">
                      ${priceRange[0]}
                    </span>
                    <span className="text-gray-400">—</span>
                    <span className="px-3 py-1 bg-gray-100 rounded-lg">
                      ${priceRange[1]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    value={priceRange[1]}
                    onChange={(e) =>
                      setPriceRange([priceRange[0], Number(e.target.value)])
                    }
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
                  />
                </div>
              </div>

              <button
                onClick={clearFilters}
                className="w-full py-3 text-sm font-semibold border-2 border-gray-300 rounded-xl hover:border-black hover:bg-gray-50 transition-all"
              >
                Clear All Filters
              </button>
            </div>
          )}

          {/* Products Grid */}
          <div className="flex-1">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[3/4] bg-slate-800 rounded-2xl mb-4" />
                    <div className="h-4 bg-slate-800 rounded mb-2" />
                    <div className="h-4 bg-slate-800 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl">
                <p className="text-gray-500 text-lg mb-4 font-medium">
                  No products match your filters
                </p>
                <button
                  onClick={clearFilters}
                  className="text-sm font-semibold underline hover:text-black"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {visibleProducts.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.id}`}
                    className="group"
                  >
                    <div className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden">
                      {/* Image Container */}
                      <div className="aspect-[3/4] bg-gray-100 relative overflow-hidden">
                        <img
                          src={product.image_url}
                          alt={product.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover object-center scale-[1.12] group-hover:scale-[1.16] transition-transform duration-700"
                        />

                        {/* Badges */}
                        <div className="absolute top-3 left-3 flex flex-col gap-2">
                          {product.discount_percentage &&
                            product.discount_percentage > 0 && (
                              <span className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg">
                                -{product.discount_percentage}%
                              </span>
                            )}
                          {product.stock && product.stock < 10 && (
                            <span className="px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-full shadow-lg">
                              Low Stock
                            </span>
                          )}
                        </div>

                        {/* Wishlist Button */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                          }}
                          className="absolute top-3 right-3 p-2.5 bg-white/95 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white hover:scale-110 shadow-lg"
                        >
                          <Heart size={18} className="text-gray-700" />
                        </button>

                        {/* Quick View Overlay */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-4">
                          <button className="w-full py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors">
                            Quick View
                          </button>
                        </div>
                      </div>

                      {/* Product Info */}
                      <div className="p-4">
                        <h3 className="font-medium text-sm mb-2 tracking-wide line-clamp-2 text-gray-900 group-hover:text-black min-h-[2.5rem]">
                          {product.name}
                        </h3>
                        <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">
                          {toProductAuthenticityLabel(product.authenticity)}
                        </p>

                        {/* Price */}
                        <div className="flex items-center gap-2 mb-3">
                          <p className="text-gray-900 text-base font-bold">
                            ${product.price.toFixed(2)}
                          </p>
                          {product.original_price &&
                            product.original_price > product.price && (
                              <p className="text-gray-400 text-sm line-through">
                                ${product.original_price.toFixed(2)}
                              </p>
                            )}
                        </div>

                        {/* Colors */}
                        {product.colors && product.colors.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            {product.colors.slice(0, 5).map((color, i) => (
                              <div
                                key={i}
                                className={`w-5 h-5 rounded-full ${
                                  colorMap[color] || "bg-gray-300"
                                } shadow-sm border border-gray-200`}
                                title={color}
                              />
                            ))}
                            {product.colors.length > 5 && (
                              <span className="text-xs text-gray-500 ml-1">
                                +{product.colors.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
