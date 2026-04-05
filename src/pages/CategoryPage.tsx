import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
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
  audience?: ProductAudience;
  authenticity?: ProductAuthenticity;
}

interface HomeCategoryEntry {
  id?: string;
  name?: string;
  slug?: string;
  image_url?: string;
}

export function CategoryPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(fromCategorySlug(slug));
  const [selectedAudience, setSelectedAudience] = useState<
    ProductAudience | "all"
  >("all");
  const [sortBy, setSortBy] = useState<"featured" | "price-low" | "price-high">(
    "featured"
  );

  useEffect(() => {
    const loadCategory = async () => {
      try {
        setLoading(true);

        // Resolve display title from admin-configured home categories when available.
        const homepageSnap = await getDoc(doc(db, "site_settings", "homepage"));
        if (homepageSnap.exists()) {
          const configured = homepageSnap.data().home_categories;
          if (Array.isArray(configured)) {
            const matched = configured.find((item: HomeCategoryEntry) => {
              if (!item?.slug || typeof item.slug !== "string") return false;
              return toCategorySlug(item.slug) === toCategorySlug(slug);
            });
            if (matched?.name && typeof matched.name === "string") {
              setDisplayName(matched.name);
            } else {
              setDisplayName(fromCategorySlug(slug));
            }
          } else {
            setDisplayName(fromCategorySlug(slug));
          }
        } else {
          setDisplayName(fromCategorySlug(slug));
        }

        // Dynamic behavior: no new pages needed, products are filtered by category slug.
        const snapshot = await getDocs(collection(db, "products"));
        const allProducts = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Product[];

        const filtered = allProducts.filter(
          (product) => toCategorySlug(product.category) === toCategorySlug(slug)
        );
        setProducts(filtered);
      } catch (error) {
        console.error("Error loading category page:", error);
      } finally {
        setLoading(false);
      }
    };

    loadCategory();
  }, [slug]);

  useEffect(() => {
    let filtered = [...products];

    if (selectedAudience !== "all") {
      filtered = filtered.filter(
        (product) =>
          normalizeProductAudience(product.audience, product.category) ===
          selectedAudience
      );
    }

    if (sortBy === "price-low") {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-high") {
      filtered.sort((a, b) => b.price - a.price);
    }

    setFilteredProducts(filtered);
  }, [products, selectedAudience, sortBy]);

  const heading = useMemo(
    () => (displayName?.trim() ? displayName : fromCategorySlug(slug)),
    [displayName, slug]
  );

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 flex items-end justify-between gap-4">
          <h1 className="text-4xl md:text-5xl font-light tracking-wider uppercase">
            {heading}
          </h1>
          <Link to="/shop" className="text-sm underline hover:text-cyan-200">
            View All Products
          </Link>
        </div>

        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Audience</label>
            <select
              value={selectedAudience}
              onChange={(e) =>
                setSelectedAudience(e.target.value as ProductAudience | "all")
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All</option>
              <option value="men">Men</option>
              <option value="women">Women</option>
              <option value="unisex">Unisex</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Sort</label>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "featured" | "price-low" | "price-high")
              }
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
            </select>
          </div>
        </div>

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
                <div className="aspect-[3/4] bg-gray-100 mb-4 overflow-hidden rounded-lg p-2">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-500"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs tracking-wider text-gray-500 uppercase">
                    {product.category} •{" "}
                    {
                      audienceLabelMap[
                        normalizeProductAudience(product.audience, product.category)
                      ]
                    }{" "}
                    • {toProductAuthenticityLabel(product.authenticity)}
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
