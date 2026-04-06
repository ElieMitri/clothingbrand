import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ShoppingCart,
  Banknote,
  Shield,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Check,
  Star,
} from "lucide-react";
import { db } from "../lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { toCategorySlug } from "../lib/category";
import {
  ProductAuthenticity,
  toProductAuthenticityLabel,
} from "../lib/productAuthenticity";
import {
  getDefaultApparelSizes,
  getDefaultGloveSizes,
  getDefaultOneSizeSizes,
  getDefaultSizesByCategory,
} from "../lib/productSizing";

interface Product {
  id: string;
  name: string;
  price: number;
  original_price?: number;
  discount_percentage?: number;
  description: string;
  image_url: string;
  category: string;
  subcategory?: string;
  product_type?: string;
  authenticity?: ProductAuthenticity;
  images?: string[];
  colors?: string[];
  color_images?: Record<string, string>;
  color_galleries?: Record<string, string[]>;
  sizes?: string[];
  size_guide?: string;
  sold_out?: boolean;
  sold_out_sizes?: string[];
  rating?: number;
  reviews_count?: number;
  material?: string;
  care_instructions?: string;
}

interface ProductReview {
  id: string;
  product_id: string;
  user_id?: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at?: unknown;
}

const GUEST_CART_STORAGE_KEY = "guest_cart_items_v1";

interface GuestCartEntry {
  product_id: string;
  size: string;
  quantity: number;
}

const readGuestCart = (): GuestCartEntry[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(GUEST_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => ({
        product_id: String(entry?.product_id || "").trim(),
        size: String(entry?.size || "").trim(),
        quantity: Number(entry?.quantity || 0),
      }))
      .filter((entry) => entry.product_id && entry.size && entry.quantity > 0);
  } catch {
    return [];
  }
};

const writeGuestCart = (items: GuestCartEntry[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("guest-cart-updated"));
};
const normalizeVariantToken = (value: string) => String(value || "").trim().toLowerCase();
const normalizeDisplayedSizes = (context: string, sizes: string[]) => {
  const fallbackSizes = getDefaultSizesByCategory(context);
  const isGloveContext =
    fallbackSizes.length > 0 && fallbackSizes.every((size) => /oz/i.test(size));
  const isOneSizeContext =
    fallbackSizes.length === 1 &&
    fallbackSizes[0].toLowerCase() === getDefaultOneSizeSizes()[0].toLowerCase();

  const apparelTokens = new Set(
    getDefaultApparelSizes().map((size) => String(size).trim().toLowerCase())
  );
  const looksLikeApparelSizing =
    sizes.length > 0 &&
    sizes.every((size) => apparelTokens.has(String(size).trim().toLowerCase()));

  if (looksLikeApparelSizing) {
    return getDefaultGloveSizes();
  }

  if (isOneSizeContext && looksLikeApparelSizing) {
    return getDefaultOneSizeSizes();
  }

  if (!isGloveContext) return sizes;

  return sizes;
};

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState("M");
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    comment: "",
  });
  const buildSizingContext = (item: Product) =>
    [item.category, item.subcategory, item.product_type]
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .join(" ");

  useEffect(() => {
    if (id) {
      loadProduct();
      loadReviews(id);
    }
  }, [id]);

  useEffect(() => {
    setSelectedImage(0);
  }, [id]);

  const loadProduct = async () => {
    try {
      if (!id) return;

      const productRef = doc(db, "products", id);
      const productSnap = await getDoc(productRef);

      if (productSnap.exists()) {
        const data = { id: productSnap.id, ...productSnap.data() } as Product;
        setProduct(data);
        const sizingContext = buildSizingContext(data);
        const availableSizes =
          data.sizes && data.sizes.length > 0
            ? normalizeDisplayedSizes(sizingContext, data.sizes)
            : getDefaultSizesByCategory(sizingContext);
        const soldOutTokenSet = new Set(
          (Array.isArray(data.sold_out_sizes) ? data.sold_out_sizes : []).map(
            (size) => normalizeVariantToken(size)
          )
        );
        const firstAvailableSize =
          availableSizes.find(
            (size) => !soldOutTokenSet.has(normalizeVariantToken(size))
          ) || availableSizes[0];
        setSelectedSize(firstAvailableSize || "One Size");
      } else {
        setProduct(null);
      }
    } catch (error) {
      console.error("Error loading product:", error);
    } finally {
      setLoading(false);
    }
  };

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

  const addToCart = async () => {
    if (!product) return;
    if (isProductSoldOut || isSelectedSizeSoldOut) {
      alert("This product/size is sold out.");
      return;
    }

    try {
      setAdding(true);
      if (user) {
        const cartsRef = collection(db, "carts");
        const q = query(
          cartsRef,
          where("user_id", "==", user.uid),
          where("product_id", "==", product.id),
          where("size", "==", selectedSize)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const existingItem = querySnapshot.docs[0];
          const currentQuantity = existingItem.data().quantity || 0;
          await updateDoc(doc(db, "carts", existingItem.id), {
            quantity: currentQuantity + quantity,
          });
        } else {
          await addDoc(cartsRef, {
            user_id: user.uid,
            product_id: product.id,
            size: selectedSize,
            quantity: quantity,
            created_at: new Date(),
          });
        }
      } else {
        const guestCart = readGuestCart();
        const existingIndex = guestCart.findIndex(
          (entry) => entry.product_id === product.id && entry.size === selectedSize
        );

        if (existingIndex >= 0) {
          guestCart[existingIndex] = {
            ...guestCart[existingIndex],
            quantity: guestCart[existingIndex].quantity + quantity,
          };
        } else {
          guestCart.push({
            product_id: product.id,
            size: selectedSize,
            quantity,
          });
        }

        writeGuestCart(guestCart);
      }

      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 3000);
    } catch (error) {
      console.error("Error adding to cart:", error);
      alert("Failed to add to cart");
    } finally {
      setAdding(false);
    }
  };

  const loadReviews = async (productId: string) => {
    try {
      setLoadingReviews(true);
      const reviewsQuery = query(
        collection(db, "product_reviews"),
        where("product_id", "==", productId)
      );
      const reviewsSnap = await getDocs(reviewsQuery);
      const parsed = reviewsSnap.docs
        .map((entry) => {
          const data = entry.data();
          return {
            id: entry.id,
            product_id: String(data.product_id || productId),
            user_id: data.user_id ? String(data.user_id) : undefined,
            user_name: String(data.user_name || "Customer").trim() || "Customer",
            rating: Number(data.rating || 0),
            comment: String(data.comment || "").trim(),
            created_at: data.created_at,
          } as ProductReview;
        })
        .filter(
          (entry) =>
            entry.rating > 0 &&
            entry.rating <= 5 &&
            Boolean(entry.comment) &&
            Boolean(entry.user_name)
        );

      parsed.sort(
        (a, b) =>
          toDateValue(b.created_at).getTime() - toDateValue(a.created_at).getTime()
      );
      setReviews(parsed);
    } catch (error) {
      console.error("Error loading reviews:", error);
      setReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !id || !user) {
      navigate("/login");
      return;
    }

    const trimmedComment = reviewForm.comment.trim();
    if (!trimmedComment) return;

    try {
      setSubmittingReview(true);
      const userName =
        user.displayName?.trim() || user.email?.split("@")[0] || "Customer";

      await addDoc(collection(db, "product_reviews"), {
        product_id: id,
        user_id: user.uid,
        user_name: userName,
        rating: reviewForm.rating,
        comment: trimmedComment,
        created_at: serverTimestamp(),
      });

      await loadReviews(id);
      setReviewForm({ rating: 5, comment: "" });
    } catch (error) {
      console.error("Error submitting review:", error);
      alert("Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-12 px-4 bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-4">
              <div className="aspect-[3/4] bg-slate-800 animate-pulse rounded-2xl" />
              <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square bg-slate-800 animate-pulse rounded-xl"
                  />
                ))}
              </div>
            </div>
            <div className="space-y-6">
              <div className="h-8 bg-slate-800 animate-pulse rounded-xl w-3/4" />
              <div className="h-6 bg-slate-800 animate-pulse rounded-xl w-1/4" />
              <div className="h-24 bg-slate-800 animate-pulse rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen pt-24 flex flex-col items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-12 rounded-2xl shadow-lg">
          <h2 className="text-2xl font-light mb-4">Product not found</h2>
          <Link
            to="/shop"
            className="inline-block px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  const baseImages =
    product.images && product.images.length > 0
      ? product.images
      : [product.image_url];
  const productImages = baseImages;
  const goToPrevImage = () => {
    if (productImages.length <= 1) return;
    setSelectedImage((prev) =>
      prev === 0 ? productImages.length - 1 : prev - 1
    );
  };
  const goToNextImage = () => {
    if (productImages.length <= 1) return;
    setSelectedImage((prev) =>
      prev === productImages.length - 1 ? 0 : prev + 1
    );
  };
  const availableSizes =
    product.sizes && product.sizes.length > 0
      ? normalizeDisplayedSizes(buildSizingContext(product), product.sizes)
      : getDefaultSizesByCategory(buildSizingContext(product));
  const hasSelectableSizes = availableSizes.length > 0;
  const soldOutSizeTokenSet = new Set(
    (Array.isArray(product.sold_out_sizes) ? product.sold_out_sizes : []).map(
      (size) => normalizeVariantToken(size)
    )
  );
  const isSizeSoldOut = (size: string) =>
    soldOutSizeTokenSet.has(normalizeVariantToken(size));
  const areAllSizesSoldOut =
    availableSizes.length > 0 && availableSizes.every((size) => isSizeSoldOut(size));
  const isProductSoldOut = Boolean(product.sold_out) || areAllSizesSoldOut;
  const isSelectedSizeSoldOut = isSizeSoldOut(selectedSize);
  const currentUserReview = user
    ? reviews.find((review) => review.user_id && review.user_id === user.uid)
    : null;
  const formatReviewDate = (value: unknown) => {
    const dateValue = toDateValue(value);
    if (dateValue.getTime() === 0) return "";
    return dateValue.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  return (
    <div className="min-h-screen pt-24 pb-16 px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm mb-8 text-gray-600 bg-white px-4 py-3 rounded-xl shadow-sm">
          <Link to="/" className="hover:text-black transition-colors">
            Home
          </Link>
          <ChevronRight size={16} />
          <Link to="/shop" className="hover:text-black transition-colors">
            Shop
          </Link>
          <ChevronRight size={16} />
          <Link
            to={`/category/${toCategorySlug(product.category)}`}
            className="hover:text-black transition-colors"
          >
            {product.category}
          </Link>
          <ChevronRight size={16} />
          <span className="text-black font-medium">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Image Gallery */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="aspect-[3/4] bg-white rounded-2xl overflow-hidden shadow-lg relative group">
              <img
                src={productImages[selectedImage] || productImages[0]}
                alt={product.name}
                className="w-full h-full object-cover object-center scale-[1.14] group-hover:scale-[1.18] transition-transform duration-500"
              />

              {productImages.length > 1 && (
                <>
                  <button
                    onClick={goToPrevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 border border-gray-200 flex items-center justify-center hover:bg-white transition-colors shadow"
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={goToNextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 border border-gray-200 flex items-center justify-center hover:bg-white transition-colors shadow"
                    aria-label="Next image"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {/* Discount Badge */}
              {product.discount_percentage &&
                product.discount_percentage > 0 && (
                  <div className="absolute top-4 left-4 px-4 py-2 bg-red-500 text-white font-bold rounded-full shadow-lg">
                    -{product.discount_percentage}% OFF
                  </div>
                )}

            </div>

            {/* Thumbnail Images */}
            {productImages.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {productImages.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`w-24 h-24 shrink-0 rounded-xl overflow-hidden border-2 transition-all shadow-md hover:shadow-lg ${
                      selectedImage === index
                        ? "border-black ring-2 ring-black ring-offset-2"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <img
                      src={img}
                      alt={`${product.name} ${index + 1}`}
                      className="w-full h-full object-cover object-center bg-white"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="flex flex-col space-y-4 bg-white p-6 rounded-2xl shadow-lg">
            {/* Category & Rating */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-gray-100 text-[10px] tracking-widest text-gray-700 uppercase rounded-full font-semibold">
                  {product.category}
                </span>
                <span className="px-2.5 py-1 bg-slate-800 text-[10px] tracking-widest text-slate-300 uppercase rounded-full font-semibold">
                  {toProductAuthenticityLabel(product.authenticity)}
                </span>
              </div>
              {product.rating && (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={14}
                        className={
                          i < Math.floor(product.rating!)
                            ? "fill-yellow-400 text-yellow-400"
                            : "fill-gray-200 text-gray-200"
                        }
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-600 font-medium">
                    ({product.reviews_count || 0})
                  </span>
                </div>
              )}
            </div>

            {/* Product Name */}
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
              {product.name}
            </h1>

            {/* Price */}
            <div className="flex items-center gap-3">
              <p className="text-3xl font-bold">${product.price.toFixed(2)}</p>
              {product.original_price &&
                product.original_price > product.price && (
                  <div className="flex items-center gap-2">
                    <p className="text-lg text-gray-400 line-through">
                      ${product.original_price.toFixed(2)}
                    </p>
                    <span className="px-2.5 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                      Save $
                      {(product.original_price - product.price).toFixed(2)}
                    </span>
                  </div>
                )}
            </div>

            {/* Description */}
            <p className="text-gray-600 leading-relaxed text-sm border-t border-b border-gray-200 py-4">
              {product.description}
            </p>

            {hasSelectableSizes && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs tracking-wider font-bold uppercase">
                    Size:{" "}
                    <span className="font-normal text-gray-600">
                      {selectedSize}
                    </span>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map((size) => {
                    const soldOut = isSizeSoldOut(size);
                    const selected = selectedSize === size;
                    return (
                      <button
                        key={`size-${size}`}
                        type="button"
                        onClick={() => !soldOut && setSelectedSize(size)}
                        disabled={soldOut}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          soldOut
                            ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed line-through"
                            : selected
                            ? "bg-black text-white border-black"
                            : "bg-white text-gray-700 border-gray-300 hover:border-black hover:text-black"
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
                {isProductSoldOut && (
                  <p className="text-xs font-semibold text-red-600">Sold Out</p>
                )}
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-2">
              <label className="block text-xs tracking-wider font-bold uppercase">
                Quantity
              </label>
              <div className="flex items-center gap-3">
                <div className="flex items-center border-2 border-gray-300 rounded-xl shadow-sm">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-3 hover:bg-gray-100 transition-colors rounded-l-xl"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="px-6 font-bold text-base">{quantity}</span>
                  <button
                    onClick={() =>
                      setQuantity((prev) => prev + 1)
                    }
                    className="p-3 hover:bg-gray-100 transition-colors rounded-r-xl"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3">
              <button
                onClick={addToCart}
                disabled={adding || isProductSoldOut || isSelectedSizeSoldOut}
                className="w-full bg-black text-white py-3.5 px-6 rounded-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 text-xs tracking-wider font-bold shadow-lg hover:shadow-xl"
              >
                {adding ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ADDING...
                  </>
                ) : addedToCart ? (
                  <>
                    <Check size={18} />
                    ADDED TO CART
                  </>
                ) : isProductSoldOut || isSelectedSizeSoldOut ? (
                  <>SOLD OUT</>
                ) : (
                  <>
                    <ShoppingCart size={18} />
                    ADD TO CART
                  </>
                )}
              </button>
            </div>

            {/* Success Message */}
            {addedToCart && (
              <div className="bg-green-50 border-2 border-green-200 rounded-xl p-3 flex items-center gap-2.5 animate-fade-in">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="text-white" size={16} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-green-900 text-sm">
                    Added to cart!
                  </p>
                  <p className="text-xs text-green-700">Ready to checkout</p>
                </div>
                <Link
                  to="/cart"
                  className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-semibold text-xs"
                >
                  View Cart
                </Link>
              </div>
            )}

            {/* Features */}
            <div className="grid grid-cols-1 gap-2.5 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Banknote size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-bold">Cash on Delivery</p>
                  <p className="text-[10px] text-gray-600">
                    Pay when you receive your order
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Shield size={20} className="text-rose-600" />
                </div>
                <div>
                  <p className="text-xs font-bold">Final Sale</p>
                  <p className="text-[10px] text-gray-600">
                    No refunds, no exchange
                  </p>
                </div>
              </div>
            </div>

            {/* Reviews */}
            <div className="pt-4">
              <div className="flex gap-4 border-b-2 border-gray-200">
                <span className="pb-3 text-xs tracking-wider uppercase relative font-semibold text-black">
                  reviews
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black rounded-t-full" />
                </span>
              </div>

              <div className="py-4">
                <div className="space-y-4">
                  {user && !currentUserReview ? (
                    <form
                      onSubmit={submitReview}
                      className="bg-gray-50 rounded-xl p-4 border border-gray-200"
                    >
                      <p className="text-sm font-semibold mb-3">Write a review</p>
                      <div className="flex items-center gap-2 mb-3">
                        <label className="text-xs text-gray-600">Rating</label>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((ratingValue) => (
                            <button
                              key={ratingValue}
                              type="button"
                              onClick={() =>
                                setReviewForm((prev) => ({
                                  ...prev,
                                  rating: ratingValue,
                                }))
                              }
                              className="p-0.5"
                              aria-label={`Rate ${ratingValue} star${ratingValue > 1 ? "s" : ""}`}
                            >
                              <Star
                                size={18}
                                className={
                                  ratingValue <= reviewForm.rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "fill-gray-200 text-gray-300"
                                }
                              />
                            </button>
                          ))}
                        </div>
                        <span className="text-xs text-gray-500">
                          {reviewForm.rating}/5
                        </span>
                      </div>
                      <textarea
                        value={reviewForm.comment}
                        onChange={(e) =>
                          setReviewForm((prev) => ({
                            ...prev,
                            comment: e.target.value,
                          }))
                        }
                        placeholder="Share your experience with this product..."
                        className="w-full min-h-[88px] p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-black"
                        required
                      />
                      <button
                        type="submit"
                        disabled={submittingReview || !reviewForm.comment.trim()}
                        className="mt-3 px-4 py-2 bg-black text-white rounded-lg text-xs font-semibold tracking-wider disabled:opacity-50"
                      >
                        {submittingReview ? "SUBMITTING..." : "SUBMIT REVIEW"}
                      </button>
                    </form>
                  ) : user && currentUserReview ? (
                    <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 text-sm text-emerald-800">
                      You already submitted a review for this product.
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 text-sm text-gray-600">
                      Please{" "}
                      <Link to="/login" className="underline text-black font-medium">
                        sign in
                      </Link>{" "}
                      to leave a review.
                    </div>
                  )}

                  {loadingReviews ? (
                    <div className="text-center py-6 bg-gray-50 rounded-xl text-sm text-gray-500">
                      Loading reviews...
                    </div>
                  ) : reviews.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-xl">
                      <Star size={36} className="mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-600 font-medium text-sm">
                        No reviews yet
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Be the first to review this product!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reviews.map((review) => (
                        <div
                          key={review.id}
                          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold">
                                {review.user_name
                                  .split(" ")
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((part) => part[0]?.toUpperCase() || "")
                                  .join("")}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {review.user_name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatReviewDate(review.created_at) || "Verified buyer"}
                                </p>
                              </div>
                            </div>
                            <div className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-amber-50 border border-amber-200">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={`review-star-${review.id}-${i}`}
                                  size={12}
                                  className={
                                    i < review.rating
                                      ? "fill-amber-400 text-amber-400"
                                      : "fill-gray-200 text-gray-200"
                                  }
                                />
                              ))}
                            </div>
                          </div>
                          <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                            {review.comment}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
