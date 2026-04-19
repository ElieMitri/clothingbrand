import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Award, ShieldCheck, Truck, Zap } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { addGuestCartItem, addItemToUserCart } from "../lib/cart";
import { StoreProduct } from "../lib/storefront";
import { ProductCard } from "../components/storefront/ProductCard";
import { Button } from "../components/storefront/Button";

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
  },
  {
    quote: "Simple checkout, fast shipping, and products that perform in the gym.",
    author: "Karim S.",
  },
  {
    quote: "Premium feel without overdesign. Exactly what I want in sportswear.",
    author: "Rami H.",
  },
];

export function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<StoreProduct[]>([]);
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

  const featuredProducts = useMemo(() => {
    const featured = products.filter((item) => item.is_featured);
    if (featured.length > 0) return featured.slice(0, 8);
    return products.slice(0, 8);
  }, [products]);

  const collectionTiles = useMemo(() => {
    const categories = Array.from(
      new Set(
        products
          .map((item) => String(item.category || "").trim())
          .filter(Boolean)
      )
    );

    return categories.slice(0, 3).map((category, index) => {
      const heroProduct =
        products.find((item) => item.category === category && item.image_url) ||
        products[index];
      return {
        name: category,
        image: heroProduct?.image_url || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
      };
    });
  }, [products]);

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
          src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=2200&q=80"
          alt="Athletic apparel hero"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/45 to-black/30" />

        <div className="store-container relative z-10 flex min-h-screen items-center py-10 pt-36">
          <div className="max-w-2xl rounded-[var(--sf-radius-lg)] bg-black/30 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.24)] backdrop-blur-[2px] md:p-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
              Spring / Summer 2026
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-tight text-balance text-white md:text-6xl">
              Premium Athletic Apparel Designed For Daily Performance
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/85 md:text-base">
              Discover technical essentials and elevated silhouettes built for gym sessions, training days, and everyday movement.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate("/shop")} iconRight={<ArrowRight size={16} />}>
                Shop Best Sellers
              </Button>
              <Button size="lg" variant="secondary" onClick={() => navigate("/new-arrivals")}>
                Explore New Arrivals
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
          <h2 className="font-display text-2xl font-bold">Featured Collections</h2>
          <Link to="/collections" className="text-sm font-semibold text-[var(--sf-accent)] hover:text-[var(--sf-accent-hover)]">
            View all
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {collectionTiles.map((tile) => (
            <Link
              key={tile.name}
              to={`/shop?category=${encodeURIComponent(tile.name)}`}
              className="group relative overflow-hidden rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)]"
            >
              <img src={tile.image} alt={tile.name} className="h-56 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-black/5" />
              <div className="absolute bottom-4 left-4 text-white">
                <p className="text-xs uppercase tracking-[0.12em]">Collection</p>
                <p className="font-display text-2xl font-bold">{tile.name}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="store-container mt-16">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Best Sellers</h2>
          <Link to="/shop" className="text-sm font-semibold text-[var(--sf-accent)] hover:text-[var(--sf-accent-hover)]">
            Shop all products
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featuredProducts.map((product) => (
            <div key={product.id} className="h-full">
              <ProductCard product={product} onQuickAdd={handleQuickAdd} />
              {quickAddingId === product.id ? (
                <p className="mt-2 text-xs text-[var(--sf-text-muted)]">Adding to cart...</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="store-container mt-16">
        <div className="store-card p-6 md:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold">Trusted By Athletes</h2>
            <p className="text-sm text-[var(--sf-text-muted)]">4.9/5 average customer satisfaction</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <article key={testimonial.author} className="rounded-[12px] border border-[var(--sf-line)] p-4">
                <p className="text-sm leading-6 text-[var(--sf-text)]">“{testimonial.quote}”</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-text-muted)]">
                  {testimonial.author}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
