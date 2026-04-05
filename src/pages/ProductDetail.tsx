import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ShoppingCart,
  Truck,
  Banknote,
  Shield,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Check,
  Star,
  Zap,
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
  getDefaultSizeGuideByCategory,
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
  size_stock?: Record<string, number>;
  size_guide?: string;
  stock?: number;
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
  const [activeTab, setActiveTab] = useState<
    "description" | "details" | "size-guide" | "reviews"
  >("description");
  const [addedToCart, setAddedToCart] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    comment: "",
  });
  const tabsSectionRef = useRef<HTMLDivElement | null>(null);
  const buildSizingContext = (item: Product) =>
    [item.category, item.subcategory, item.product_type]
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .join(" ");

  const getAvailableStockForSize = (item: Product, size: string) => {
    const sizeStockMap = item.size_stock || {};
    const hasSizeStock = Object.keys(sizeStockMap).length > 0;
    if (hasSizeStock) {
      return Number(sizeStockMap[size] || 0);
    }
    return Number(item.stock || 0);
  };

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
        const availableSizes =
          data.sizes && data.sizes.length > 0
            ? data.sizes
            : getDefaultSizesByCategory(buildSizingContext(data));
        const firstInStockSize =
          availableSizes.find(
            (size) => getAvailableStockForSize(data, size) > 0
          ) || availableSizes[0];
        setSelectedSize(firstInStockSize || "One Size");
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

  const loadReviews = async (productId: string) => {
    try {
      setLoadingReviews(true);
      const reviewsQuery = query(
        collection(db, "product_reviews"),
        where("product_id", "==", productId)
      );
      const reviewsSnap = await getDocs(reviewsQuery);
      const parsed = reviewsSnap.docs
        .map((entry) => ({
          id: entry.id,
          ...entry.data(),
        }))
        .filter(
          (entry): entry is ProductReview =>
            typeof (entry as ProductReview).rating === "number" &&
            typeof (entry as ProductReview).comment === "string" &&
            typeof (entry as ProductReview).user_name === "string"
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

      const updatedReviews = [
        ...reviews,
        {
          id: `temp-${Date.now()}`,
          product_id: id,
          user_id: user.uid,
          user_name: userName,
          rating: reviewForm.rating,
          comment: trimmedComment,
          created_at: new Date(),
        },
      ];
      const avgRating =
        updatedReviews.reduce((sum, entry) => sum + entry.rating, 0) /
        updatedReviews.length;

      await updateDoc(doc(db, "products", id), {
        rating: Number(avgRating.toFixed(1)),
        reviews_count: updatedReviews.length,
      });

      setReviewForm({ rating: 5, comment: "" });
      await loadReviews(id);
      await loadProduct();
    } catch (error) {
      console.error("Error submitting review:", error);
      alert("Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const addToCart = async () => {
    if (!product) return;

    try {
      setAdding(true);
      const availableStock = getAvailableStockForSize(product, selectedSize);
      if (hasPerSizeStock && availableStock < 1) {
        alert(`Size ${selectedSize} is currently out of stock.`);
        return;
      }
      if (availableStock > 0 && quantity > availableStock) {
        alert(`Only ${availableStock} units are currently in stock.`);
        return;
      }

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
          if (availableStock > 0 && currentQuantity + quantity > availableStock) {
            alert(`Only ${availableStock} units are currently in stock.`);
            return;
          }
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
          const nextQuantity = guestCart[existingIndex].quantity + quantity;
          if (availableStock > 0 && nextQuantity > availableStock) {
            alert(`Only ${availableStock} units are currently in stock.`);
            return;
          }
          guestCart[existingIndex] = {
            ...guestCart[existingIndex],
            quantity: nextQuantity,
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
  const sizes =
    product.sizes && product.sizes.length > 0
      ? product.sizes
      : getDefaultSizesByCategory(buildSizingContext(product));
  const sizeGuideText =
    product.size_guide?.trim() ||
    getDefaultSizeGuideByCategory(buildSizingContext(product));
  const hasPerSizeStock = Object.keys(product.size_stock || {}).length > 0;
  const selectedSizeStock = getAvailableStockForSize(product, selectedSize);
  const sizeGuideLines = sizeGuideText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const sizeGuideRows = sizeGuideLines
    .slice(1)
    .filter((line) => line.includes("|"))
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 2);
  const hasStructuredSizeGuide = sizeGuideRows.length > 1;
  const sizeGuideColumns = hasStructuredSizeGuide ? sizeGuideRows[0] : [];
  const sizeGuideBodyRows = hasStructuredSizeGuide ? sizeGuideRows.slice(1) : [];
  const lengthColumnIndex = sizeGuideColumns.findIndex((col) =>
    /length\s*mm/i.test(col)
  );
  const displaySizeGuideColumns =
    hasStructuredSizeGuide && lengthColumnIndex >= 0
      ? sizeGuideColumns.map((col, idx) =>
          idx === lengthColumnIndex ? col.replace(/mm/i, "cm") : col
        )
      : sizeGuideColumns;
  const displaySizeGuideBodyRows =
    hasStructuredSizeGuide && lengthColumnIndex >= 0
      ? sizeGuideBodyRows.map((row) =>
          row.map((cell, idx) => {
            if (idx !== lengthColumnIndex) return cell;
            const mm = Number(cell);
            if (Number.isNaN(mm)) return cell;
            return (mm / 10).toFixed(1);
          })
        )
      : sizeGuideBodyRows;
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
  const openSizeGuideTab = () => {
    setActiveTab("size-guide");
    tabsSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
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
                className="w-full h-full object-contain p-4 md:p-6"
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

              {/* Stock Badge */}
              {product.stock && product.stock < 10 && (
                <div className="absolute top-4 right-4 px-4 py-2 bg-orange-500 text-white font-semibold rounded-full shadow-lg flex items-center gap-2">
                  <Zap size={16} />
                  Only {product.stock} left
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
                      className="w-full h-full object-contain bg-white p-1"
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

            {/* Size Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs tracking-wider font-bold uppercase">
                  Size:{" "}
                  <span className="font-normal text-gray-600">
                    {selectedSize}
                  </span>
                </label>
                <button
                  onClick={openSizeGuideTab}
                  className="text-xs text-gray-600 underline hover:text-black transition-colors font-medium"
                >
                  Size Guide
                </button>
              </div>
                <div className="grid grid-cols-6 gap-2">
                  {sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      disabled={
                        hasPerSizeStock && getAvailableStockForSize(product, size) <= 0
                      }
                      className={`py-2.5 border-2 rounded-xl transition-all text-xs font-bold shadow-sm hover:shadow-md ${
                        selectedSize === size
                          ? "border-black bg-black text-white scale-105"
                          : "border-gray-300 hover:border-black"
                      } ${
                        hasPerSizeStock && getAvailableStockForSize(product, size) <= 0
                          ? "opacity-40 cursor-not-allowed line-through"
                          : ""
                      }`}
                    >
                      {size}
                    </button>
                  ))}
              </div>
            </div>

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
                    onClick={() => setQuantity(quantity + 1)}
                    className="p-3 hover:bg-gray-100 transition-colors rounded-r-xl"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {(hasPerSizeStock || typeof product.stock === "number") && (
                  <span className="text-xs text-gray-600">
                    <span className="font-semibold">
                      {hasPerSizeStock
                        ? selectedSizeStock
                        : Number(product.stock || 0)}
                    </span>{" "}
                    available for {selectedSize}
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3">
              <button
                onClick={addToCart}
                disabled={adding || (hasPerSizeStock && selectedSizeStock <= 0)}
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
                  <Truck size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-bold">Free Shipping</p>
                  <p className="text-[10px] text-gray-600">
                    On orders over $100
                  </p>
                </div>
              </div>
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

            {/* Tabs */}
            <div className="pt-4" ref={tabsSectionRef}>
              <div className="flex gap-4 border-b-2 border-gray-200">
                {[
                  { key: "description", label: "description" },
                  { key: "details", label: "details" },
                  { key: "size-guide", label: "size guide" },
                  { key: "reviews", label: "reviews" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as typeof activeTab)}
                    className={`pb-3 text-xs tracking-wider uppercase relative font-semibold transition-colors ${
                      activeTab === tab.key
                        ? "text-black"
                        : "text-gray-500 hover:text-black"
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.key && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black rounded-t-full" />
                    )}
                  </button>
                ))}
              </div>

              <div className="py-4">
                {activeTab === "description" && (
                  <div className="prose prose-sm max-w-none">
                    <p className="text-gray-700 leading-relaxed text-sm">
                      {product.description}
                    </p>
                  </div>
                )}
                {activeTab === "details" && (
                  <div className="space-y-3">
                    {product.material && (
                      <div className="flex justify-between items-center py-2.5 px-3 bg-gray-50 rounded-xl">
                        <span className="text-gray-600 font-medium text-xs">
                          Material:
                        </span>
                        <span className="font-bold text-xs">
                          {product.material}
                        </span>
                      </div>
                    )}
                    {product.care_instructions && (
                      <div className="py-2.5 px-3 bg-gray-50 rounded-xl">
                        <span className="text-gray-600 font-medium block mb-1.5 text-xs">
                          Care Instructions:
                        </span>
                        <p className="text-gray-800 font-medium text-xs">
                          {product.care_instructions}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {activeTab === "size-guide" && (
                  <div className="py-2.5 px-3 bg-gray-50 rounded-xl">
                    <span className="text-gray-600 font-medium block mb-1.5 text-xs">
                      Size Guide:
                    </span>
                    {hasStructuredSizeGuide ? (
                      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-950">
                        <table className="w-full min-w-[560px] text-xs">
                          <thead className="bg-slate-800">
                            <tr>
                              {displaySizeGuideColumns.map((column, index) => (
                                <th
                                  key={`${column}-${index}`}
                                  className="px-3 py-2 text-left font-semibold whitespace-nowrap text-cyan-100"
                                >
                                  {column}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {displaySizeGuideBodyRows.map((row, rowIndex) => (
                              <tr
                                key={`inline-row-${rowIndex}`}
                                className={`border-t border-slate-700 ${
                                  rowIndex % 2 === 0 ? "bg-slate-950" : "bg-slate-900"
                                }`}
                              >
                                {row.map((cell, cellIndex) => (
                                  <td
                                    key={`inline-cell-${rowIndex}-${cellIndex}`}
                                    className={`px-3 py-2 whitespace-nowrap ${
                                      cellIndex === 0
                                        ? "font-semibold text-slate-100"
                                        : "text-slate-200"
                                    }`}
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-gray-800 font-medium text-xs whitespace-pre-line">
                        {sizeGuideText}
                      </p>
                    )}
                  </div>
                )}
                {activeTab === "reviews" && (
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
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
