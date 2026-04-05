import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
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
  created_at?: unknown;
  audience?: ProductAudience;
  authenticity?: ProductAuthenticity;
}

export function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAudience, setSelectedAudience] = useState<
    ProductAudience | "all"
  >("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [colorInput, setColorInput] = useState("");
  const [sortBy, setSortBy] = useState<"featured" | "price-low" | "price-high">(
    "featured"
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<string[]>(["all"]);

  const getProductType = (product: Product) =>
    String(product.subcategory || product.product_type || "")
      .trim()
      .toLowerCase();

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

  const typeOptions = useMemo(() => {
    const source =
      selectedCategory === "all"
        ? products
        : products.filter((product) => product.category === selectedCategory);
    const types = Array.from(
      new Set(
        source
          .map((product) => product.subcategory || product.product_type || "")
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    return ["all", ...types];
  }, [products, selectedCategory]);

  useEffect(() => {
    let filtered = [...products];

    if (selectedCategory !== "all") {
      filtered = filtered.filter((product) => product.category === selectedCategory);
    }

    if (selectedType !== "all") {
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
    selectedAudience,
    colorInput,
    sortBy,
    searchTerm,
  ]);

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-light text-center mb-8 tracking-[0.14em]">
          SHOP
        </h1>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-gray-500">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Name, brand, type, SKU..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[220px]"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-gray-500">Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[180px]"
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

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-gray-500">Audience</label>
            <select
              value={selectedAudience}
              onChange={(e) =>
                setSelectedAudience(e.target.value as ProductAudience | "all")
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[150px]"
            >
              <option value="all">All</option>
              <option value="men">Men</option>
              <option value="women">Women</option>
              <option value="unisex">Unisex</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-gray-500">Color</label>
            <input
              type="text"
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              placeholder="Black, White, Navy..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[170px]"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-gray-500">Sort</label>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "featured" | "price-low" | "price-high")
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[190px]"
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
            </select>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex justify-center gap-4 md:gap-6 mb-8 flex-wrap border-b border-gray-200 pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
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

        {/* Products Grid */}
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
              onClick={() => setSelectedCategory("all")}
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
                <div className="aspect-[3/4] bg-gray-100 mb-3 overflow-hidden rounded-lg p-2">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs tracking-wider text-gray-500 uppercase">
                    {product.category}
                    {product.subcategory
                      ? ` • ${product.subcategory}`
                      : product.product_type
                      ? ` • ${product.product_type}`
                      : ""}{" "}
                    •{" "}
                    {
                      audienceLabelMap[
                        normalizeProductAudience(product.audience, product.category)
                      ]
                    }{" "}
                    • {toProductAuthenticityLabel(product.authenticity)}
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
