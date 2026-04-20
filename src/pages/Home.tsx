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
    author: "Maya K.",
    role: "Hybrid Athlete",
    rating: 5,
  },
  {
    quote: "Simple checkout, fast shipping, and products that perform in the gym.",
    author: "Karim S.",
    role: "Strength Coach",
    rating: 5,
  },
  {
    quote: "Premium feel without overdesign. Exactly what I want in sportswear.",
    author: "Rami H.",
    role: "Crossfit Member",
    rating: 5,
  },
];

export function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [todayPickProductId, setTodayPickProductId] = useState("");
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
        setTodayPickProductId("");
        return;
      }
      const data = snapshot.data() as { today_pick_product_id?: string };
      setTodayPickProductId(String(data.today_pick_product_id || "").trim());
    });
  }, []);

  const featuredPick = useMemo(() => {
    if (todayPickProductId) {
      const adminSelected = products.find((item) => item.id === todayPickProductId);
      if (adminSelected) return adminSelected;
    }
    return products.find((item) => item.is_featured) || products[0] || null;
  }, [products, todayPickProductId]);

  const randomProducts = useMemo(() => {
    const pool = products.filter((item) => item.id !== featuredPick?.id);
    const shuffled = [...pool];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled.slice(0, 8);
  }, [products, featuredPick?.id]);

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

      <section className="store-container mt-16">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Featured Pick</h2>
        </div>
        {featuredPick ? (
          <div className="max-w-sm">
            <ProductCard product={featuredPick} onQuickAdd={handleQuickAdd} />
            {quickAddingId === featuredPick.id ? (
              <p className="mt-2 text-xs text-[var(--sf-text-muted)]">Adding to cart...</p>
            ) : null}
          </div>
        ) : (
          <div className="store-card p-8 text-center">
            <p className="text-sm text-[var(--sf-text-muted)]">No featured product configured yet.</p>
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
            <p className="text-sm text-[var(--sf-text-muted)]">4.9/5 average customer satisfaction</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <article
                key={testimonial.author}
                className="relative rounded-[14px] border border-[var(--sf-line)] bg-gradient-to-b from-white to-[var(--sf-bg-soft)] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)]"
              >
                <Quote size={18} className="absolute right-4 top-4 text-[var(--sf-accent)]/30" />
                <div className="mb-3 flex items-center gap-1 text-amber-500">
                  {Array.from({ length: testimonial.rating }).map((_, index) => (
                    <Star key={`${testimonial.author}-${index}`} size={14} fill="currentColor" />
                  ))}
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
                    <p className="text-xs uppercase tracking-[0.08em] text-[var(--sf-text-muted)]">
                      {testimonial.role}
                    </p>
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
