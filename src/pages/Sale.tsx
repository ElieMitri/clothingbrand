import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Filter, Tag, Clock, TrendingDown, ArrowRight } from "lucide-react";
import { db } from "../lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  onSnapshot,
  Timestamp,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ProductAudience,
  normalizeProductAudience,
} from "../lib/productAudience";
import {
  ProductAuthenticity,
  toProductAuthenticityLabel,
} from "../lib/productAuthenticity";
import { toCategorySlug } from "../lib/category";

interface Product {
  id: string;
  name: string;
  price: number;
  original_price?: number;
  image_url: string;
  category: string;
  sold_out?: boolean;
  sold_out_sizes?: string[];
  audience?: ProductAudience;
  authenticity?: ProductAuthenticity;
  discount_percentage?: number;
}

export function Sale() {
  const PRODUCTS_PER_BATCH = 12;
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAudience, setSelectedAudience] = useState<
    ProductAudience | "all"
  >("all");
  const [selectedDiscount, setSelectedDiscount] = useState<string>("all");
  const [sortBy, setSortBy] = useState("discount-high");
  const [showSaleLink, setShowSaleLink] = useState<boolean | null>(null);

  const [saleTitle, setSaleTitle] = useState("SEASONAL SALE");
  const [saleHeadline, setSaleHeadline] = useState("UP TO 70% OFF");
  const [saleSubtitle, setSaleSubtitle] = useState("Limited Time Offer");
  const [saleEndAt, setSaleEndAt] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const [email, setEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<
    "idle" | "success" | "exists" | "error"
  >("idle");
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PER_BATCH);
  const categorySupportsAudienceFilter = (categoryName: string) => {
    const slug = toCategorySlug(categoryName || "");
    return (
      slug.includes("shoe") ||
      slug.includes("sneaker") ||
      slug.includes("cloth") ||
      slug.includes("apparel")
    );
  };
  const shouldShowAudienceFilter = useMemo(() => {
    if (selectedCategories.length === 0) return false;
    return selectedCategories.every((category) =>
      categorySupportsAudienceFilter(category)
    );
  }, [selectedCategories]);
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );
  const hasMoreProducts = visibleProducts.length < filteredProducts.length;

  const categories = Array.from(
    new Set(
      products
        .map((product) => product.category?.trim())
        .filter((category): category is string => Boolean(category))
    )
  ).sort((a, b) => a.localeCompare(b));
  const discountRanges = [
    { value: "all", label: "All Discounts" },
    { value: "70", label: "Up to 70% off" },
    { value: "50", label: "Up to 50% off" },
    { value: "30", label: "Up to 30% off" },
  ];

  const getCountdown = (endAt: Date | null) => {
    if (!endAt) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    const now = Date.now();
    const distance = endAt.getTime() - now;
    if (distance <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    return {
      days: Math.floor(distance / (1000 * 60 * 60 * 24)),
      hours: Math.floor((distance / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((distance / (1000 * 60)) % 60),
      seconds: Math.floor((distance / 1000) % 60),
    };
  };

  useEffect(() => {
    if (showSaleLink === null) return;
    const isExpired =
      saleEndAt instanceof Date && saleEndAt.getTime() <= Date.now();
    if (!showSaleLink || isExpired) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const productsRef = collection(db, "products");
    const q = query(productsRef, where("discount_percentage", ">", 0), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const productsWithDiscount = querySnapshot.docs.map((entry) => {
          const data = entry.data();
          return {
            id: entry.id,
            ...data,
            original_price:
              data.original_price ||
              data.price / (1 - (data.discount_percentage || 0) / 100),
          } as Product;
        });
        setProducts(productsWithDiscount);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading products:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [showSaleLink, saleEndAt]);

  useEffect(() => {
    const saleRef = doc(db, "site_settings", "sale");
    const unsubscribe = onSnapshot(saleRef, (snap) => {
      if (!snap.exists()) {
        setShowSaleLink(true);
        setSaleTitle("SEASONAL SALE");
        setSaleHeadline("UP TO 70% OFF");
        setSaleSubtitle("Limited Time Offer");
        setSaleEndAt(null);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const data = snap.data();
      setShowSaleLink(data.show_sale_link !== false);
      setSaleTitle(data.sale_title || "SEASONAL SALE");
      setSaleHeadline(data.sale_headline || "UP TO 70% OFF");
      setSaleSubtitle(data.sale_subtitle || "Limited Time Offer");

      const dateValue =
        data.end_at instanceof Timestamp
          ? data.end_at.toDate()
          : data.end_at instanceof Date
          ? data.end_at
          : typeof data.end_at === "string"
          ? new Date(data.end_at)
          : null;

      const validEndAt =
        dateValue && !Number.isNaN(dateValue.getTime()) ? dateValue : null;
      setSaleEndAt(validEndAt);
      setTimeLeft(getCountdown(validEndAt));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    filterAndSortProducts();
  }, [
    products,
    selectedCategories,
    selectedAudience,
    selectedDiscount,
    sortBy,
    shouldShowAudienceFilter,
  ]);

  useEffect(() => {
    setVisibleCount(PRODUCTS_PER_BATCH);
  }, [selectedCategories, selectedAudience, selectedDiscount, sortBy, products]);

  useEffect(() => {
    if (!shouldShowAudienceFilter && selectedAudience !== "all") {
      setSelectedAudience("all");
    }
  }, [shouldShowAudienceFilter, selectedAudience]);

  useEffect(() => {
    setTimeLeft(getCountdown(saleEndAt));

    const timer = setInterval(() => {
      setTimeLeft(getCountdown(saleEndAt));
    }, 1000);

    return () => clearInterval(timer);
  }, [saleEndAt]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.includes("@")) {
      setSubscribeStatus("error");
      setTimeout(() => setSubscribeStatus("idle"), 3000);
      return;
    }

    try {
      const q = query(
        collection(db, "newsletter"),
        where("email", "==", email.toLowerCase())
      );
      const existing = await getDocs(q);

      if (existing.empty) {
        await addDoc(collection(db, "newsletter"), {
          email: email.toLowerCase(),
          subscribed_at: serverTimestamp(),
          sent_emails: 0,
        });
        try {
          await fetch("/api/send-newsletter-subscriber-discord", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: email.toLowerCase(),
              source: "sale",
            }),
          });
        } catch (notifyError) {
          console.error("Newsletter Discord notify failed:", notifyError);
        }
        setSubscribeStatus("success");
      } else {
        setSubscribeStatus("exists");
      }
      setEmail("");
    } catch (error) {
      console.error("Newsletter subscribe failed:", error);
      setSubscribeStatus("error");
    } finally {
      setTimeout(() => setSubscribeStatus("idle"), 3000);
    }
  };

  const filterAndSortProducts = () => {
    let filtered = [...products];

    if (selectedCategories.length > 0) {
      filtered = filtered.filter((p) =>
        selectedCategories.includes(p.category)
      );
    }

    if (shouldShowAudienceFilter && selectedAudience !== "all") {
      filtered = filtered.filter(
        (p) =>
          normalizeProductAudience(p.audience, p.category) === selectedAudience
      );
    }

    if (selectedDiscount !== "all") {
      const discountThreshold = parseInt(selectedDiscount);
      filtered = filtered.filter(
        (p) => (p.discount_percentage || 0) >= discountThreshold
      );
    }

    switch (sortBy) {
      case "discount-high":
        filtered.sort(
          (a, b) => (b.discount_percentage || 0) - (a.discount_percentage || 0)
        );
        break;
      case "discount-low":
        filtered.sort(
          (a, b) => (a.discount_percentage || 0) - (b.discount_percentage || 0)
        );
        break;
      case "price-low":
        filtered.sort((a, b) => a.price - b.price);
        break;
      case "price-high":
        filtered.sort((a, b) => b.price - a.price);
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
    setSelectedDiscount("all");
  };

  const isSaleExpired =
    saleEndAt instanceof Date && saleEndAt.getTime() <= Date.now();

  const isInitialLoading =
    showSaleLink === null || (showSaleLink === true && loading && products.length === 0);

  if (isInitialLoading) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12 rounded-3xl p-8 md:p-12 border border-slate-700/70 surface-card animate-pulse">
            <div className="h-8 w-40 bg-slate-800 rounded-full mx-auto mb-6" />
            <div className="h-14 w-80 bg-slate-800 rounded mx-auto mb-4" />
            <div className="h-7 w-64 bg-slate-800 rounded mx-auto mb-8" />
            <div className="flex justify-center gap-4 md:gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="text-center">
                  <div className="rounded-xl p-4 md:p-6 min-w-[70px] md:min-w-[90px] bg-slate-800">
                    <div className="h-8 w-8 bg-slate-700 rounded mx-auto" />
                  </div>
                  <div className="h-3 w-10 bg-slate-800 rounded mt-2 mx-auto" />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="py-4 px-6 rounded-xl border border-slate-700 surface-card animate-pulse">
                <div className="h-5 w-5 bg-slate-700 rounded mx-auto mb-2" />
                <div className="h-4 w-20 bg-slate-800 rounded mx-auto" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] bg-slate-800 rounded-lg mb-4" />
                <div className="h-4 bg-slate-800 rounded mb-2" />
                <div className="h-4 bg-slate-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (showSaleLink === false || isSaleExpired) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center surface-card rounded-2xl p-10 border border-slate-700/70">
          <h1 className="text-3xl md:text-4xl font-light text-slate-100 mb-3">
            No Active Sale
          </h1>
          <p className="text-slate-300 mb-6">
            {isSaleExpired
              ? "This sale ended when the countdown reached zero."
              : "There are no current sales available."}
          </p>
          <Link to="/shop" className="text-cyan-200 underline hover:text-cyan-100">
            Continue to Shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 bg-gradient-to-r from-rose-700/90 via-pink-700/85 to-fuchsia-700/80 text-white rounded-3xl p-8 md:p-12 relative overflow-hidden border border-rose-300/20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/20 rounded-full blur-3xl" />

          <div className="relative z-10 text-center">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-6 live-float">
              <TrendingDown size={20} />
              <span className="text-sm font-medium tracking-wider">
                {saleTitle}
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-semibold tracking-[0.16em] mb-4">
              {saleHeadline}
            </h1>
            <p className="text-xl md:text-2xl font-light mb-8">{saleSubtitle}</p>

            <div className="flex justify-center gap-4 md:gap-6">
              {[
                { label: "DAYS", value: timeLeft.days },
                { label: "HOURS", value: timeLeft.hours },
                { label: "MINS", value: timeLeft.minutes },
                { label: "SECS", value: timeLeft.seconds },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 md:p-6 min-w-[70px] md:min-w-[90px] live-pulse">
                    <div className="text-3xl md:text-4xl font-light">
                      {item.value.toString().padStart(2, "0")}
                    </div>
                  </div>
                  <div className="text-xs md:text-sm font-medium mt-2 tracking-wider">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {discountRanges.map((range) => (
            <button
              key={range.value}
              onClick={() => setSelectedDiscount(range.value)}
              className={`py-4 px-6 rounded-xl border transition-all ${
                selectedDiscount === range.value
                  ? "bg-rose-600 text-white border-rose-500"
                  : "surface-card border-slate-700 text-slate-100 hover:border-rose-400"
              }`}
            >
              <Tag size={20} className="mx-auto mb-2" />
              <p className="text-sm font-medium">{range.label}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-700/70">
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-pressed={showFilters}
              onClick={() => setShowFilters(!showFilters)}
              className={`relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
                showFilters
                  ? "bg-cyan-400 text-slate-950 border-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                  : "surface-card border-slate-700 hover:border-cyan-300/50"
              }`}
            >
              <Filter size={18} />
              <span className="text-sm tracking-wide">FILTERS</span>
              {(selectedCategories.length > 0 ||
                (shouldShowAudienceFilter && selectedAudience !== "all")) && (
                <span className="ml-1 px-2 py-0.5 bg-cyan-400 text-slate-950 text-xs rounded-full">
                  {selectedCategories.length +
                    (shouldShowAudienceFilter && selectedAudience !== "all" ? 1 : 0)}
                </span>
              )}
            </button>

            {(selectedCategories.length > 0 ||
              (shouldShowAudienceFilter && selectedAudience !== "all") ||
              selectedDiscount !== "all") && (
              <button
                onClick={clearFilters}
                className="text-sm text-slate-300 hover:text-cyan-200 underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300 hidden sm:inline">
              {visibleProducts.length} of {filteredProducts.length} items
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 surface-card rounded-lg text-sm focus:outline-none focus:border-cyan-300/50"
            >
              <option value="discount-high">Highest Discount</option>
              <option value="discount-low">Lowest Discount</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
            </select>
          </div>
        </div>

        <div className="flex gap-8">
          {showFilters && (
            <div className="w-64 flex-shrink-0 space-y-6 surface-card p-6 rounded-xl border border-slate-700 h-fit sticky top-24">
              <div>
                <h3 className="font-medium text-sm tracking-wider mb-4">CATEGORY</h3>
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
                        className="w-4 h-4 border-2 border-slate-500 rounded cursor-pointer checked:bg-cyan-400 checked:border-cyan-400"
                      />
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                        {category}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {shouldShowAudienceFilter && (
                <div>
                  <h3 className="font-medium text-sm tracking-wider mb-4">AUDIENCE</h3>
                  <select
                    value={selectedAudience}
                    onChange={(e) =>
                      setSelectedAudience(e.target.value as ProductAudience | "all")
                    }
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-950/70 text-slate-100 text-sm focus:outline-none focus:border-cyan-300"
                  >
                    <option value="all">All</option>
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                    <option value="unisex">Unisex</option>
                  </select>
                </div>
              )}
            </div>
          )}

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
              <div className="text-center py-20 surface-card rounded-xl">
                <Tag size={48} className="mx-auto mb-4 text-slate-500" />
                <p className="text-slate-300 text-lg mb-4">No sale items found</p>
                <button
                  onClick={clearFilters}
                  className="text-sm underline hover:text-cyan-200"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {visibleProducts.map((product) => (
                    <Link
                      key={product.id}
                      to={`/product/${product.id}`}
                      className="group surface-card rounded-xl overflow-hidden border border-slate-700 hover:shadow-xl transition-all"
                    >
                      <div className="aspect-[3/4] bg-white overflow-hidden relative">
                        <img
                          src={product.image_url}
                          alt={product.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover object-center scale-[1.14] group-hover:scale-[1.18] transition-transform duration-500"
                        />
                        <div className="absolute top-3 left-3 bg-rose-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                          -{product.discount_percentage}%
                        </div>
                        <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm text-white px-2 py-1 rounded text-xs">
                          <Clock size={12} className="inline mr-1" />
                          Limited
                        </div>
                        {Boolean(product.sold_out) && (
                          <div className="absolute bottom-3 left-3 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                            Sold Out
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-medium text-sm mb-2 tracking-wide line-clamp-1 text-slate-100">
                          {product.name}
                        </h3>
                        <p className="text-[11px] uppercase tracking-wider text-slate-300 mb-1">
                          {toProductAuthenticityLabel(product.authenticity)}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-rose-300 font-bold text-lg">
                            ${product.price.toFixed(2)}
                          </p>
                          <p className="text-slate-400 line-through text-sm">
                            ${(product.original_price || product.price).toFixed(2)}
                          </p>
                        </div>
                        <p className="text-xs text-emerald-300 mt-1 font-medium">
                          Save ${((product.original_price || product.price) - product.price).toFixed(2)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
                {hasMoreProducts ? (
                  <div className="mt-8 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => prev + PRODUCTS_PER_BATCH)}
                      className="inline-flex items-center rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-100 hover:border-cyan-300 transition-colors"
                    >
                      Load more ({filteredProducts.length - visibleProducts.length} left)
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="mt-16 surface-card rounded-3xl p-8 md:p-10 text-center border border-slate-700/70">
          <h2 className="font-display text-3xl md:text-5xl tracking-[0.08em] text-slate-50">
            NEVER MISS A DROP
          </h2>
          <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
            Subscribe for flash-sale alerts, countdown updates, and exclusive discount previews.
          </p>

          <form
            onSubmit={handleSubscribe}
            className="mt-7 max-w-xl mx-auto flex flex-col sm:flex-row gap-3"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="flex-1 rounded-xl px-5 py-3 border border-slate-600/80 bg-slate-950/65 text-slate-100 focus:outline-none focus:border-cyan-300"
              required
            />
            <button
              type="submit"
              className="rounded-xl px-6 py-3 luxe-button text-sm font-semibold tracking-[0.12em] inline-flex items-center justify-center gap-2"
            >
              SUBSCRIBE
              <ArrowRight size={15} />
            </button>
          </form>

          {subscribeStatus === "success" ? (
            <p className="mt-4 text-emerald-300 text-sm">Subscribed successfully.</p>
          ) : null}
          {subscribeStatus === "exists" ? (
            <p className="mt-4 text-cyan-200 text-sm">This email is already subscribed.</p>
          ) : null}
          {subscribeStatus === "error" ? (
            <p className="mt-4 text-rose-300 text-sm">Please enter a valid email address.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
