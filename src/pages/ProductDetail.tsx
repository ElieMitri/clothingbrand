import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Box, RefreshCcw, ShieldCheck, Truck } from "lucide-react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { addGuestCartItem, addItemToUserCart } from "../lib/cart";
import {
  StoreProduct,
  formatPrice,
  getCompareAtPrice,
  getDefaultSizes,
  isSizeSoldOut,
  productGalleryImages,
} from "../lib/storefront";
import { ProductGallery } from "../components/storefront/ProductGallery";
import { Button } from "../components/storefront/Button";
import { ProductCard } from "../components/storefront/ProductCard";

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("M");
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!id) return;
      setLoading(true);

      const ref = doc(db, "products", id);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setProduct(null);
        setLoading(false);
        return;
      }

      const nextProduct = { id: snap.id, ...snap.data() } as StoreProduct;
      setProduct(nextProduct);

      const availableSizes = getDefaultSizes(nextProduct).filter(
        (size) => !isSizeSoldOut(nextProduct, size)
      );
      setSelectedSize(availableSizes[0] || "One Size");

      const colors = Array.isArray(nextProduct.colors) ? nextProduct.colors : [];
      setSelectedColor(colors[0] || "");
      setLoading(false);
    };

    run();
  }, [id]);

  useEffect(() => {
    if (!product) return;
    const unsubscribe = onSnapshot(collection(db, "products"), (snapshot) => {
      const all = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...entry.data(),
      })) as StoreProduct[];

      const related = all
        .filter(
          (entry) => entry.id !== product.id && String(entry.category || "") === String(product.category || "")
        )
        .slice(0, 4);

      setRelatedProducts(related);
    });

    return () => unsubscribe();
  }, [product]);

  const images = useMemo(
    () => (product ? productGalleryImages(product) : []),
    [product]
  );

  const sizes = useMemo(() => {
    if (!product) return [];
    return getDefaultSizes(product);
  }, [product]);

  const compareAt = product ? getCompareAtPrice(product) : undefined;
  const descriptionContent = useMemo(() => {
    const fallback =
      "Engineered for movement, comfort, and all-day performance.";
    const raw = String(product?.description || "").trim();
    if (!raw) return { lead: fallback, bullets: [] as string[] };

    const compact = raw.replace(/\s+/g, " ").trim();
    const bulletCandidates = compact
      .split(/[✔✅•]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (bulletCandidates.length <= 1) {
      return { lead: compact, bullets: [] as string[] };
    }

    const lead = bulletCandidates[0];
    const bullets = bulletCandidates
      .slice(1)
      .map((entry) => entry.replace(/^[\-–—|:;,.\s]+/, "").trim())
      .filter(Boolean);

    return { lead: lead || fallback, bullets };
  }, [product?.description]);

  const handleAddToCart = async (buyNow = false) => {
    if (!product) return;
    if (product.sold_out || isSizeSoldOut(product, selectedSize)) return;

    try {
      setAdding(true);
      if (user) {
        await addItemToUserCart(user.uid, product.id, selectedSize, quantity);
      } else {
        addGuestCartItem(product.id, selectedSize, quantity);
      }

      if (buyNow) {
        navigate("/cart");
      }
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="store-container py-10">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="h-[560px] animate-pulse rounded-[var(--sf-radius-lg)] bg-[var(--sf-bg-soft)]" />
          <div className="space-y-4">
            <div className="h-9 w-3/4 animate-pulse rounded bg-[var(--sf-bg-soft)]" />
            <div className="h-6 w-1/3 animate-pulse rounded bg-[var(--sf-bg-soft)]" />
            <div className="h-40 animate-pulse rounded bg-[var(--sf-bg-soft)]" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="store-container py-20 text-center">
        <h1 className="font-display text-3xl font-bold">Product Not Found</h1>
        <Link to="/shop" className="mt-4 inline-block text-sm font-semibold text-[var(--sf-accent)]">
          Back to shop
        </Link>
      </div>
    );
  }

  return (
    <div className="store-container pb-8 pt-8">
      <div className="mb-6 text-xs text-[var(--sf-text-muted)]">
        <Link to="/shop" className="hover:text-[var(--sf-accent)]">Shop</Link>
        <span className="px-2">/</span>
        <span>{product.category || "Product"}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <ProductGallery images={images} productName={product.name} />

        <section className="lg:sticky lg:top-28 lg:self-start">
          <div className="space-y-5 rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-white p-5 md:p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--sf-text-muted)]">{product.category || "Apparel"}</p>
              <h1 className="mt-2 font-display text-3xl font-bold text-[var(--sf-text)]">{product.name}</h1>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-2xl font-bold text-[var(--sf-text)]">{formatPrice(product.price)}</span>
                {compareAt ? (
                  <span className="text-sm text-[var(--sf-text-muted)] line-through">{formatPrice(compareAt)}</span>
                ) : null}
              </div>
            </div>

            {Array.isArray(product.colors) && product.colors.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-[var(--sf-text)]">Color: {selectedColor}</p>
                <div className="flex flex-wrap gap-2">
                  {product.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        selectedColor === color
                          ? "border-[var(--sf-accent)] bg-[var(--sf-bg-soft)]"
                          : "border-[var(--sf-line)]"
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {sizes.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-[var(--sf-text)]">Size</p>
                <div className="grid grid-cols-4 gap-2">
                  {sizes.map((size) => {
                    const soldOut = isSizeSoldOut(product, size);
                    return (
                      <button
                        key={size}
                        type="button"
                        disabled={soldOut}
                        onClick={() => setSelectedSize(size)}
                        className={`rounded-[10px] border px-3 py-2 text-sm font-medium ${
                          selectedSize === size
                            ? "border-[var(--sf-accent)] bg-[var(--sf-bg-soft)]"
                            : "border-[var(--sf-line)]"
                        } ${soldOut ? "cursor-not-allowed opacity-40" : ""}`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-semibold text-[var(--sf-text)]">Quantity</p>
              <div className="inline-flex items-center rounded-[10px] border border-[var(--sf-line)]">
                <button
                  type="button"
                  className="h-10 w-10 text-lg"
                  onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                >
                  -
                </button>
                <span className="inline-flex min-w-10 justify-center text-sm font-semibold">{quantity}</span>
                <button
                  type="button"
                  className="h-10 w-10 text-lg"
                  onClick={() => setQuantity((prev) => prev + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Button fullWidth size="lg" onClick={() => handleAddToCart(false)} disabled={adding || product.sold_out}>
                {adding ? "Adding..." : "Add to Cart"}
              </Button>
              <Button fullWidth size="lg" variant="secondary" onClick={() => handleAddToCart(true)} disabled={adding || product.sold_out}>
                Buy Now
              </Button>
            </div>

            <div className="rounded-[12px] border border-[var(--sf-line)] bg-[var(--sf-bg-soft)] p-4">
              <p className="text-sm leading-6 text-[var(--sf-text-muted)]">
                {descriptionContent.lead}
              </p>
              {descriptionContent.bullets.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm leading-6 text-[var(--sf-text-muted)]">
                  {descriptionContent.bullets.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--sf-accent)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-3 rounded-[10px] border border-[var(--sf-line)] p-3 text-sm">
                <Truck size={16} className="text-[var(--sf-accent)]" />
                <span>Shipping in 1-3 business days</span>
              </div>
              <div className="flex items-center gap-3 rounded-[10px] border border-[var(--sf-line)] p-3 text-sm">
                <RefreshCcw size={16} className="text-[var(--sf-accent)]" />
                <span>14-day easy return policy</span>
              </div>
              <div className="flex items-center gap-3 rounded-[10px] border border-[var(--sf-line)] p-3 text-sm">
                <ShieldCheck size={16} className="text-[var(--sf-accent)]" />
                <span>Secure checkout and payment protection</span>
              </div>
              <div className="flex items-center gap-3 rounded-[10px] border border-[var(--sf-line)] p-3 text-sm">
                <Box size={16} className="text-[var(--sf-accent)]" />
                <span>Premium quality control before dispatch</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-14">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Related Products</h2>
          <Link to="/shop" className="text-sm font-semibold text-[var(--sf-accent)]">View all</Link>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {relatedProducts.map((item) => (
            <ProductCard key={item.id} product={item} onQuickAdd={() => navigate(`/product/${item.id}`)} />
          ))}
        </div>
      </section>
    </div>
  );
}
