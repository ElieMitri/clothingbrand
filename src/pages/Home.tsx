import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Award,
  Quote,
  ShieldCheck,
  Star,
  Truck,
  Zap,
} from "lucide-react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { addGuestCartItem, addItemToUserCart } from "../lib/cart";
import { StoreProduct } from "../lib/storefront";
import { ProductCard } from "../components/storefront/ProductCard";
import { Button } from "../components/storefront/Button";
import HeroImage from "../assets/hero.jpeg";

const valueItems = [
  {
    title: "Performance Fabrics",
    body: "Moisture-wicking and durable materials built for training intensity.",
    icon: Zap,
  },
  {
    title: "Secure Checkout",
    body: "Trusted payments and clear policies that reduce buying friction.",
    icon: ShieldCheck,
  },
  {
    title: "Fast Delivery",
    body: "Quick dispatch with transparent shipping updates from order to arrival.",
    icon: Truck,
  },
  {
    title: "Premium Quality",
    body: "High-end fit and finish designed to elevate your athletic wardrobe.",
    icon: Award,
  },
];

const testimonials = [
  {
    quote: "The fit and quality are better than any brand I used this year.",
    author: "Nour Haddad",
    rating: 5,
  },
  {
    quote: "Simple checkout, fast shipping, and products that perform in the gym.",
    author: "Charbel Khoury",
    rating: 4.5,
  },
  {
    quote: "Premium feel without overdesign. Exactly what I want in sportswear.",
    author: "Lynn Daher",
    rating: 4.8,
  },
];

interface HomeOfferEntry {
  id?: string;
  title: string;
  subtitle?: string;
  path: string;
  active?: boolean;
}

export function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [featuredProductIds, setFeaturedProductIds] = useState<string[]>([]);
  const [homeOffers, setHomeOffers] = useState<HomeOfferEntry[]>([]);
  const [quickAddingId, setQuickAddingId] = useState<string | null>(null);

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
    return onSnapshot(doc(db, "site_settings", "homepage"), (snapshot) => {
      if (!snapshot.exists()) {
        setFeaturedProductIds([]);
        setHomeOffers([]);
        return;
      }
      const data = snapshot.data() as {
        featured_product_ids?: string[];
        home_offers?: unknown[];
      };
      const ids = Array.isArray(data.featured_product_ids)
        ? data.featured_product_ids.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      setFeaturedProductIds(ids.slice(0, 6));
      const offers = Array.isArray(data.home_offers)
        ? data.home_offers
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const candidate = entry as Partial<HomeOfferEntry>;
              const title = String(candidate.title || "").trim();
              const path = String(candidate.path || "").trim();
              if (!title || !path || candidate.active === false) return null;
              return {
                id: String(candidate.id || title),
                title,
                subtitle: String(candidate.subtitle || "").trim(),
                path: path.startsWith("/") ? path : `/${path}`,
                active: true,
              } as HomeOfferEntry;
            })
            .filter((entry: HomeOfferEntry | null): entry is HomeOfferEntry => Boolean(entry))
        : [];
      setHomeOffers(offers);
    });
  }, []);

  const featuredProducts = useMemo(() => {
    const byId = new Map(products.map((item) => [item.id, item]));
    const selectedFromAdmin = featuredProductIds
      .map((id) => byId.get(id))
      .filter((item): item is StoreProduct => Boolean(item));

    const selectedIds = new Set(selectedFromAdmin.map((item) => item.id));
    const remainingFeatured = products.filter(
      (item) => Boolean(item.is_featured) && !selectedIds.has(item.id)
    );

    const merged = [...selectedFromAdmin, ...remainingFeatured];
    if (merged.length >= 6) return merged.slice(0, 6);

    const fallback = products.filter((item) => !selectedIds.has(item.id));
    return [...merged, ...fallback].slice(0, 6);
  }, [featuredProductIds, products]);

  const randomProducts = useMemo(() => {
    const featuredIds = new Set(featuredProducts.map((item) => item.id));
    const pool = products.filter((item) => !featuredIds.has(item.id));
    const shuffled = [...pool];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled.slice(0, 8);
  }, [products, featuredProducts]);

  const averageTestimonialRating = useMemo(() => {
    if (testimonials.length === 0) return 0;
    const total = testimonials.reduce((sum, testimonial) => sum + Number(testimonial.rating || 0), 0);
    return total / testimonials.length;
  }, []);

  const handleQuickAdd = async (product: StoreProduct) => {
    const size = Array.isArray(product.sizes) && product.sizes.length > 0 ? product.sizes[0] : "M";

    try {
      setQuickAddingId(product.id);
      if (user) {
        await addItemToUserCart(user.uid, product.id, size, 1);
      } else {
        addGuestCartItem(product.id, size, 1);
      }
    } finally {
      setQuickAddingId(null);
    }
  };

  return (
    <div className="pb-8">
      <section className="relative -mt-28 w-full min-h-screen overflow-hidden bg-white">
        <img
          src={HeroImage}
          alt="Athletic apparel hero"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/45 to-black/30" />

        <div className="store-container relative z-10 flex min-h-screen items-center py-10 pt-36">
          <div className="max-w-2xl p-6 md:p-10">
            <h1 className="font-display text-4xl font-extrabold leading-tight text-balance text-white md:text-6xl">
              Premium Athletic Apparel Designed For Daily Performance
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/85 md:text-base">
              Discover technical essentials and elevated silhouettes built for gym sessions, training days, and everyday movement.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate("/shop")} iconRight={<ArrowRight size={16} />}>
                Shop Now
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="store-container mt-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {valueItems.map((item) => (
            <article key={item.title} className="store-card p-5">
              <item.icon size={20} className="text-[var(--sf-accent)]" />
              <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--sf-text-muted)]">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {homeOffers.length > 0 ? (
        <section className="store-container mt-10">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {homeOffers.map((offer) => (
              <Link
                key={offer.id || offer.title}
                to={offer.path}
                className="store-card p-5 hover:shadow-[0_10px_28px_rgba(15,23,42,0.10)] transition-shadow"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-accent)]">
                  Offer
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--sf-text)]">{offer.title}</h3>
                {offer.subtitle ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--sf-text-muted)]">{offer.subtitle}</p>
                ) : null}
                <p className="mt-4 text-sm font-semibold text-[var(--sf-accent)]">Shop offer</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="store-container mt-16">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Featured Products</h2>
        </div>
        {featuredProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {featuredProducts.map((product) => (
              <div key={product.id} className="h-full">
                <ProductCard product={product} onQuickAdd={handleQuickAdd} />
                {quickAddingId === product.id ? (
                  <p className="mt-2 text-xs text-[var(--sf-text-muted)]">Adding to cart...</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="store-card p-8 text-center">
            <p className="text-sm text-[var(--sf-text-muted)]">No featured products configured yet.</p>
          </div>
        )}
      </section>

      <section className="store-container mt-16">
        <div className="mb-5">
          <h2 className="font-display text-2xl font-bold">Discover More</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {randomProducts.map((product) => (
            <div key={product.id} className="h-full">
              <ProductCard product={product} onQuickAdd={handleQuickAdd} />
              {quickAddingId === product.id ? (
                <p className="mt-2 text-xs text-[var(--sf-text-muted)]">Adding to cart...</p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            to="/shop"
            className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[var(--sf-accent)] px-6 text-sm font-semibold text-white hover:bg-[var(--sf-accent-hover)]"
          >
            Shop More
          </Link>
        </div>
      </section>

      <section className="store-container mt-16">
        <div className="store-card overflow-hidden p-6 md:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold">Trusted By Athletes</h2>
            <p className="text-sm text-[var(--sf-text-muted)]">
              {averageTestimonialRating.toFixed(1)}/5 average customer satisfaction
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <article
                key={testimonial.author}
                className="relative rounded-[14px] border border-[var(--sf-line)] bg-gradient-to-b from-white to-[var(--sf-bg-soft)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]"
              >
                <Quote size={18} className="absolute right-4 top-4 text-[var(--sf-accent)]/30" />
                <div className="mb-3 flex items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, index) => {
                    const starIndex = index + 1;
                    const fillRatio = Math.max(0, Math.min(1, Number(testimonial.rating || 0) - index));
                    const fillPercent = Math.round(fillRatio * 100);
                    return (
                      <span
                        key={`${testimonial.author}-${index}`}
                        className="relative inline-flex"
                        aria-hidden="true"
                      >
                        <Star size={14} className="text-amber-200" />
                        {fillPercent > 0 ? (
                          <span
                            className="absolute inset-0 overflow-hidden"
                            style={{ width: `${fillPercent}%` }}
                          >
                            <Star size={14} fill="currentColor" />
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                  <span className="ml-1 text-xs font-semibold text-amber-600">
                    {Number(testimonial.rating || 0).toFixed(1)}
                  </span>
                </div>
                <p className="text-sm leading-6 text-[var(--sf-text)]">“{testimonial.quote}”</p>
                <div className="mt-4 flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--sf-accent)] text-xs font-semibold text-white">
                    {testimonial.author
                      .split(" ")
                      .map((entry) => entry[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--sf-text)]">{testimonial.author}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
