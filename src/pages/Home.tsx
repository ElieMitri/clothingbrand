import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Check,
  Clock3,
  ArrowRight,
  Banknote,
  BadgeCheck,
  Gem,
  Instagram,
  PackageCheck,
  Shield,
  Truck,
  Sparkles,
  Star,
} from "lucide-react";
import { db } from "../lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";
import { toCategorySlug } from "../lib/category";
import { useAuth } from "../contexts/AuthContext";
import {
  ProductAuthenticity,
  toProductAuthenticityLabel,
} from "../lib/productAuthenticity";

import Photo from "../assets/photo.png"
import LbLogo from "../assets/lbathletes-logo.png";
import Logo from "../assets/logo-transparent.png";

interface Product {
  id: string;
  name: string;
  price: number;
  original_price?: number;
  discount_percentage?: number;
  image_url: string;
  category: string;
  authenticity?: ProductAuthenticity;
  description?: string;
  is_featured?: boolean;
  is_new_arrival?: boolean;
  created_at?: unknown;
}

interface Category {
  id: string;
  name: string;
  image_url: string;
  slug: string;
}

interface CollectionItem {
  id: string;
  name: string;
  description: string;
  image_url: string;
  season?: string;
  year?: number;
  is_active?: boolean;
}

type DateField = Timestamp | Date | string | null | undefined;
type WebNotificationCategory =
  | "general"
  | "orderUpdates"
  | "promotions"
  | "newsletter";

interface WebNotificationEntry {
  id: string;
  title: string;
  message: string;
  category: WebNotificationCategory;
  recipient_user_id?: string | null;
  recipient_email?: string | null;
  created_at?: DateField;
}

interface WebNotificationState {
  status?: "read" | "remind_later";
  remind_at?: DateField;
}

interface NotificationPreferences {
  orderUpdates?: boolean;
  promotions?: boolean;
  newsletter?: boolean;
}

const REMIND_LATER_HOURS = 24;

function CedarLogo({ className = "" }: { className?: string }) {
  return (
    <img src={Logo} alt="LBathletes" className={className} />
  );
}

const formatPrice = (value: number) => `$${value.toFixed(2)}`;

const resolveHomeCategoryPath = (rawSlug?: string) => {
  const slug = String(rawSlug || "").trim();
  if (!slug) return "/shop";
  if (slug.startsWith("/")) return slug;

  const normalized = slug.toLowerCase();
  if (normalized === "sale") return "/sale";
  if (normalized === "new-arrivals" || normalized === "new-arrival") {
    return "/new-arrivals";
  }
  if (normalized === "collections" || normalized === "collection") {
    return "/collections";
  }
  if (normalized === "shop" || normalized === "shop-all") return "/shop";
  const token = toCategorySlug(slug);
  const category =
    token === "gym" || token === "gym-crossfit" || token === "crossfit"
      ? "Gym"
      : token === "martial-arts" ||
          token.includes("muay-thai") ||
          token === "muaythai" ||
          token.includes("boxing") ||
          token === "mma" ||
          token.includes("combat") ||
          token === "sports"
        ? "Martial Arts"
        : token
            .split("-")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");

  return category
    ? `/shop?category=${encodeURIComponent(category)}`
    : "/shop";
};

export function Home() {
  const { user } = useAuth();
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [collectionsData, setCollectionsData] = useState<CollectionItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [featuredProductIds, setFeaturedProductIds] = useState<string[]>([]);
  const [newArrivalIds, setNewArrivalIds] = useState<string[]>([]);
  const [todayPickProductId, setTodayPickProductId] = useState("");
  const [heroImageOverride, setHeroImageOverride] = useState("");
  const [homeCollectionIds, setHomeCollectionIds] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<
    "idle" | "success" | "exists" | "error"
  >("idle");
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(false);
  const [isUserSubscribed, setIsUserSubscribed] = useState(false);
  const [webNotifications, setWebNotifications] = useState<
    WebNotificationEntry[]
  >([]);
  const [notificationStates, setNotificationStates] = useState<
    Record<string, WebNotificationState>
  >({});
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>({
      orderUpdates: true,
      promotions: true,
      newsletter: true,
    });
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (allProducts.length === 0) {
      setFeaturedProducts([]);
      setNewArrivals([]);
      return;
    }

    if (featuredProductIds.length > 0) {
      const orderedFeatured = featuredProductIds
        .map((id) => allProducts.find((product) => product.id === id))
        .filter((product): product is Product => Boolean(product))
        .slice(0, 3);
      setFeaturedProducts(orderedFeatured);
    } else {
      setFeaturedProducts([]);
    }

    if (newArrivalIds.length > 0) {
      const orderedArrivals = newArrivalIds
        .map((id) => allProducts.find((product) => product.id === id))
        .filter((product): product is Product => Boolean(product))
        .slice(0, 4);
      setNewArrivals(orderedArrivals);
    } else {
      setNewArrivals([]);
    }
  }, [allProducts, featuredProductIds, newArrivalIds]);

  useEffect(() => {
    const unsubscribers: Unsubscribe[] = [];

    try {
      const settingsRef = doc(db, "site_settings", "homepage");

      unsubscribers.push(
        onSnapshot(settingsRef, (settingsSnap) => {
          let featuredIds: string[] = [];
          let arrivalsIds: string[] = [];

          if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            featuredIds = data.featured_product_ids || [];
            arrivalsIds = data.new_arrival_ids || [];
            setTodayPickProductId(data.today_pick_product_id || "");
            setHeroImageOverride(data.hero_image_url || "");
            setHomeCollectionIds(data.home_collection_ids || []);
            const configuredCategories = Array.isArray(data.home_categories)
              ? data.home_categories
                  .map((entry: unknown, index: number) => {
                    if (!entry || typeof entry !== "object") return null;
                    const candidate = entry as Partial<Category>;
                    const name = typeof candidate.name === "string" ? candidate.name : "";
                    const slug = typeof candidate.slug === "string" ? candidate.slug : "";
                    const imageUrl =
                      typeof candidate.image_url === "string"
                        ? candidate.image_url
                        : "";

                    if (!name || !slug || !imageUrl) return null;
                    return {
                      id: candidate.id || `custom-${index + 1}`,
                      name,
                      slug,
                      image_url: imageUrl,
                    } as Category;
                  })
                  .filter((item: Category | null): item is Category => item !== null)
              : [];

            setCategories(
              configuredCategories
            );
          } else {
            setTodayPickProductId("");
            setHeroImageOverride("");
            setHomeCollectionIds([]);
            setCategories([]);
          }

          setFeaturedProductIds(featuredIds);
          setNewArrivalIds(arrivalsIds);
        })
      );

      const productsQuery = query(collection(db, "products"), orderBy("created_at", "desc"));
      unsubscribers.push(
        onSnapshot(productsQuery, (snapshot) => {
          const data = snapshot.docs.map((entry) => ({
            id: entry.id,
            ...entry.data(),
          })) as Product[];
          setAllProducts(data);
        })
      );

      const collectionsQ = query(collection(db, "collections"), orderBy("year", "desc"));
      unsubscribers.push(
        onSnapshot(collectionsQ, (snapshot) => {
          const data = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as CollectionItem[];
          setCollectionsData(data.filter((item) => item.is_active !== false));
        })
      );

      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    } catch (error) {
      console.error("Error loading home content:", error);
    }
  }, []);

  useEffect(() => {
    const checkUserSubscription = async () => {
      if (!user?.email) {
        setIsUserSubscribed(false);
        return;
      }

      const normalizedUserEmail = user.email.toLowerCase();
      setEmail(normalizedUserEmail);
      setIsCheckingSubscription(true);

      try {
        const subscriberQuery = query(
          collection(db, "newsletter"),
          where("email", "==", normalizedUserEmail)
        );
        const subscriberSnap = await getDocs(subscriberQuery);
        setIsUserSubscribed(!subscriberSnap.empty);
      } catch (error) {
        console.error("Error checking newsletter subscription:", error);
        setIsUserSubscribed(false);
      } finally {
        setIsCheckingSubscription(false);
      }
    };

    checkUserSubscription();
  }, [user?.email]);

  useEffect(() => {
    if (!user) {
      setWebNotifications([]);
      setNotificationStates({});
      setNotificationPreferences({
        orderUpdates: true,
        promotions: true,
        newsletter: true,
      });
      return;
    }

    const notificationsQuery = query(
      collection(db, "web_notifications"),
      orderBy("created_at", "desc"),
      limit(100)
    );
    const statesRef = collection(db, "users", user.uid, "web_notification_states");
    const userRef = doc(db, "users", user.uid);

    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const items = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...entry.data(),
      })) as WebNotificationEntry[];
      setWebNotifications(items);
    });

    const unsubscribeStates = onSnapshot(statesRef, (snapshot) => {
      const stateById: Record<string, WebNotificationState> = {};
      snapshot.docs.forEach((entry) => {
        stateById[entry.id] = entry.data() as WebNotificationState;
      });
      setNotificationStates(stateById);
    });

    const unsubscribeUser = onSnapshot(userRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      const prefs =
        data.notificationPreferences &&
        typeof data.notificationPreferences === "object"
          ? (data.notificationPreferences as NotificationPreferences)
          : {};

      setNotificationPreferences({
        orderUpdates: prefs.orderUpdates ?? true,
        promotions: prefs.promotions ?? true,
        newsletter: prefs.newsletter ?? true,
      });
    });

    return () => {
      unsubscribeNotifications();
      unsubscribeStates();
      unsubscribeUser();
    };
  }, [user?.uid]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!notificationPanelRef.current) return;
      if (!notificationPanelRef.current.contains(event.target as Node)) {
        setIsNotificationPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const toDate = (value?: DateField) => {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "string") return new Date(value);
    return null;
  };

  const isCategoryEnabled = (category: WebNotificationCategory) => {
    if (category === "general") return true;
    if (category === "orderUpdates") return notificationPreferences.orderUpdates ?? true;
    if (category === "promotions") return notificationPreferences.promotions ?? true;
    if (category === "newsletter") return notificationPreferences.newsletter ?? true;
    return true;
  };

  const visibleNotifications = useMemo(() => {
    const now = new Date();
    const normalizedUserEmail = String(user?.email || "")
      .trim()
      .toLowerCase();

    return webNotifications.filter((notification) => {
      if (!isCategoryEnabled(notification.category)) return false;
      const targetUserId = String(notification.recipient_user_id || "").trim();
      const targetEmail = String(notification.recipient_email || "")
        .trim()
        .toLowerCase();
      const isTargeted = Boolean(targetUserId || targetEmail);
      if (isTargeted) {
        if (targetUserId && targetUserId !== user?.uid) return false;
        if (targetEmail && targetEmail !== normalizedUserEmail) return false;
      }
      const state = notificationStates[notification.id];
      if (!state) return true;
      if (state.status === "read") return false;
      if (state.status === "remind_later") {
        const remindAt = toDate(state.remind_at);
        if (remindAt && remindAt > now) return false;
      }
      return true;
    });
  }, [webNotifications, notificationStates, notificationPreferences, user?.uid, user?.email]);

  const markNotificationAsRead = async (notificationId: string) => {
    if (!user) return;
    await setDoc(
      doc(db, "users", user.uid, "web_notification_states", notificationId),
      {
        status: "read",
        read_at: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const remindNotificationLater = async (notificationId: string) => {
    if (!user) return;
    const remindAt = new Date(Date.now() + REMIND_LATER_HOURS * 60 * 60 * 1000);
    await setDoc(
      doc(db, "users", user.uid, "web_notification_states", notificationId),
      {
        status: "remind_later",
        remind_at: Timestamp.fromDate(remindAt),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.includes("@")) {
      setSubscribeStatus("error");
      setTimeout(() => setSubscribeStatus("idle"), 3000);
      return;
    }

    try {
      const duplicateQuery = query(
        collection(db, "newsletter"),
        where("email", "==", normalizedEmail)
      );
      const existing = await getDocs(duplicateQuery);

      if (existing.empty) {
        await addDoc(collection(db, "newsletter"), {
          email: normalizedEmail,
          subscribed_at: serverTimestamp(),
          sent_emails: 0,
        });
        try {
          await fetch("/api/send-newsletter-subscriber-discord", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: normalizedEmail,
              source: "home",
            }),
          });
        } catch (notifyError) {
          console.error("Newsletter Discord notify failed:", notifyError);
        }
        setSubscribeStatus("success");
        if (user?.email && user.email.toLowerCase() === normalizedEmail) {
          setIsUserSubscribed(true);
        }
      } else {
        setSubscribeStatus("exists");
        if (user?.email && user.email.toLowerCase() === normalizedEmail) {
          setIsUserSubscribed(true);
        }
      }
      if (!user?.email) {
        setEmail("");
      }
    } catch (error) {
      console.error("Newsletter subscribe failed:", error);
      setSubscribeStatus("error");
    } finally {
      setTimeout(() => setSubscribeStatus("idle"), 3000);
    }
  };

  const heroProduct =
    featuredProducts.find((product) => product.id === todayPickProductId) ||
    featuredProducts[0];
  const defaultHeroImage =
 Photo;
  const heroImage =
    heroImageOverride ||
    defaultHeroImage;
  const homeCollections =
    homeCollectionIds.length > 0
      ? homeCollectionIds
          .map((id) => collectionsData.find((entry) => entry.id === id))
          .filter((entry): entry is CollectionItem => Boolean(entry))
      : collectionsData.slice(0, 3);
  const topDiscountProduct = useMemo(() => {
    const discounted = allProducts.filter(
      (product) => Number(product.discount_percentage || 0) > 0
    );
    if (discounted.length === 0) return null;

    return discounted.sort((a, b) => {
      const aDiscount = Number(a.discount_percentage || 0);
      const bDiscount = Number(b.discount_percentage || 0);
      if (aDiscount !== bDiscount) return bDiscount - aDiscount;
      return a.price - b.price;
    })[0];
  }, [allProducts]);
  const topDiscountOriginalPrice = topDiscountProduct
    ? topDiscountProduct.original_price &&
      Number(topDiscountProduct.original_price) > Number(topDiscountProduct.price)
      ? Number(topDiscountProduct.original_price)
      : Number(topDiscountProduct.price) /
        (1 - Number(topDiscountProduct.discount_percentage || 0) / 100)
    : null;

  return (
    <div className="min-h-screen pb-16">
      {false && user && (
        <div
          ref={notificationPanelRef}
          className="fixed right-4 bottom-4 z-40"
        >
          <button
            onClick={() => setIsNotificationPanelOpen((prev) => !prev)}
            className="relative h-14 w-14 rounded-2xl border border-cyan-300/45 bg-slate-900/90 shadow-[0_12px_28px_rgba(2,6,23,0.45)] flex items-center justify-center"
            aria-label="Open notifications"
          >
            <CedarLogo className="h-8 w-8" />
            {visibleNotifications.length > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-white text-xs font-semibold inline-flex items-center justify-center">
                {visibleNotifications.length > 99
                  ? "99+"
                  : visibleNotifications.length}
              </span>
            )}
          </button>

          {isNotificationPanelOpen && (
            <div className="absolute bottom-16 right-0 w-[min(92vw,360px)] bg-slate-950/95 border border-slate-700 rounded-2xl shadow-[0_24px_60px_rgba(2,6,23,0.75)] p-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-sm font-semibold text-slate-100">Notifications</p>
                <span className="text-xs text-slate-400">
                  {visibleNotifications.length} unread
                </span>
              </div>
              {visibleNotifications.length === 0 ? (
                <div className="rounded-xl border border-slate-700 px-3 py-4 text-sm text-slate-400">
                  No new notifications.
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                  {visibleNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {notification.category !== "general" ? (
                            <p className="text-[11px] uppercase tracking-wider text-slate-400">
                              {notification.category}
                            </p>
                          ) : null}
                          <p className="mt-1 text-sm font-semibold text-slate-100">
                            {notification.title}
                          </p>
                          <p className="mt-1 text-sm text-slate-300">
                            {notification.message}
                          </p>
                          <p className="mt-2 text-[11px] text-slate-500">
                            {toDate(notification.created_at)?.toLocaleString() || ""}
                          </p>
                        </div>
                        <Bell size={15} className="text-slate-500 shrink-0 mt-0.5" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => markNotificationAsRead(notification.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-cyan-500/15 text-cyan-100 text-xs border border-cyan-400/30 hover:bg-cyan-500/25"
                        >
                          <Check size={13} />
                          Mark as read
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <section className="pt-0">
        <div className="space-y-6">
          <div className="relative overflow-hidden min-h-screen">
            <img
              src={heroImage}
              alt={heroProduct?.name || "Hero"}
              className="absolute inset-0 h-full w-full object-cover object-[62%_center] md:object-center scale-105 md:scale-[1.02] brightness-[0.58] contrast-110 saturate-[0.9]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/84 via-slate-950/55 to-slate-950/86 backdrop-blur-[1px]" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/35 via-transparent to-slate-950/45" />
            <div className="relative z-10 min-h-screen max-w-7xl mx-auto px-4 py-20 md:py-20 lg:py-24 flex items-center justify-center">
              <div className="text-center max-w-3xl">
                <p className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-300/45 bg-cyan-400/12 text-cyan-100 text-xs tracking-[0.2em] shadow-[0_0_20px_rgba(34,211,238,0.25)]">
                  <Sparkles size={14} />
                  LBATHLETES • ALL SPORTS
                </p>
                <h1 className="mt-6 font-display text-4xl sm:text-5xl md:text-7xl leading-[0.94] tracking-[0.12em] text-white text-balance drop-shadow-[0_4px_24px_rgba(2,6,23,0.75)]">
                  LBATHLETES
                  <br />
                  PERFORMANCE
                </h1>
                <p className="mt-6 max-w-2xl mx-auto text-slate-200/95 text-base md:text-lg leading-relaxed drop-shadow-[0_2px_14px_rgba(2,6,23,0.7)]">
                  Gear and style for every sport. Built for movement, speed,
                  endurance, and everyday athlete confidence.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center sm:items-center">
                  <Link
                    to="/shop"
                    className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl border border-slate-400/40 bg-slate-900/50 text-slate-100 text-sm font-semibold tracking-[0.13em] hover:border-cyan-300/50 hover:bg-slate-900/80"
                  >
                   Shop Now!
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-card rounded-3xl p-6 md:p-7 min-h-[260px] live-float [animation-duration:8s]">
              <p className="text-xs tracking-[0.18em] text-cyan-200">TOP DISCOUNT PICK</p>
              {topDiscountProduct ? (
                <>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-50 leading-tight line-clamp-2">
                    {topDiscountProduct.name}
                  </h2>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-500/15 px-3 py-1 text-rose-200 text-sm">
                    <Star size={14} fill="currentColor" />
                    Save {Number(topDiscountProduct.discount_percentage || 0)}%
                  </div>
                  <p className="mt-3 text-slate-300 text-sm">
                    Category: {topDiscountProduct.category}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xl font-semibold text-slate-100">
                      {formatPrice(Number(topDiscountProduct.price || 0))}
                    </span>
                    {topDiscountOriginalPrice ? (
                      <span className="text-sm text-slate-400 line-through">
                        {formatPrice(Number(topDiscountOriginalPrice))}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4">
                    <Link
                      to={`/product/${topDiscountProduct.id}`}
                      className="inline-flex items-center gap-2 text-sm text-cyan-200 hover:text-cyan-100"
                    >
                      Shop this deal
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-50 leading-tight">
                    No Active Discounts Yet
                  </h2>
                  <p className="mt-3 text-slate-300 text-sm">
                    Add product discounts from admin and your best offer will show here automatically.
                  </p>
                </>
              )}
            </div>

            <div className="surface-card rounded-3xl p-6 md:p-7 min-h-[260px]">
              <p className="text-xs tracking-[0.18em] text-slate-300">ABOUT US</p>
              <h3 className="mt-3 text-xl font-semibold text-slate-50">Built By Athletes, For Athletes</h3>
              <p className="mt-2 text-sm text-slate-300 line-clamp-2">
                We focus on performance products that look clean, feel premium,
                and hold up in real play.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-700/70 p-3 text-slate-200 inline-flex items-center gap-2">
                  <Gem size={14} className="text-cyan-200" />
                  High quality materials
                </div>
                <div className="rounded-xl border border-slate-700/70 p-3 text-slate-200 inline-flex items-center gap-2">
                  <PackageCheck size={14} className="text-cyan-200" />
                  Trusted reseller sourcing
                </div>
                <div className="rounded-xl border border-slate-700/70 p-3 text-slate-200 inline-flex items-center gap-2">
                  <BadgeCheck size={14} className="text-cyan-200" />
                  Verified authenticity focus
                </div>
                <div className="rounded-xl border border-slate-700/70 p-3 text-slate-200 inline-flex items-center gap-2">
                  <Banknote size={14} className="text-cyan-200" />
                  Flexible payment options
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 mt-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
           { icon: Truck, label: "QUICK FULFILLMENT", sub: "Across Lebanon" },
            { icon: Banknote, label: "FLEXIBLE PAYMENT", sub: "Multiple checkout options" },
            { icon: Shield, label: "FINAL SALE", sub: "No refunds" },
          ].map((item) => (
            <div
              key={item.label}
              className="surface-card rounded-2xl p-5 flex items-center gap-4 hover:-translate-y-0.5"
            >
              <div className="h-11 w-11 rounded-xl bg-cyan-500/18 text-cyan-100 flex items-center justify-center">
                <item.icon size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide text-slate-100">
                  {item.label}
                </p>
                <p className="text-xs text-slate-300">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {categories.length > 0 ? (
        <section className="px-4 mt-16">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between gap-4 mb-7">
              <div>
                <p className="text-xs tracking-[0.18em] text-cyan-200">DISCOVER</p>
                <h2 className="font-display text-3xl md:text-4xl tracking-[0.08em] text-slate-50">
                  SHOP BY CATEGORY
                </h2>
              </div>
              <Link
                to="/shop"
                className="text-sm text-slate-300 hover:text-cyan-200 inline-flex items-center gap-2"
              >
                View full catalog <ArrowRight size={15} />
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {categories.map((category, index) => (
                <Link
                  key={category.id}
                  to={resolveHomeCategoryPath(category.slug)}
                  className={`group relative overflow-hidden rounded-3xl border border-slate-700/70 min-h-[220px] md:min-h-[320px] ${
                    index === 0 ? "md:col-span-2" : ""
                  }`}
                >
                  <img
                    src={category.image_url}
                    alt={category.name}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between">
                    <h3 className="text-lg md:text-2xl font-semibold tracking-[0.14em] text-white">
                      {category.name.toUpperCase()}
                    </h3>
                    <span className="h-9 w-9 rounded-full bg-cyan-400/25 border border-cyan-300/35 text-cyan-100 flex items-center justify-center">
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {homeCollections.length > 0 ? (
        <section className="px-4 mt-16">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between gap-4 mb-7">
              <div>
                <p className="text-xs tracking-[0.18em] text-cyan-200">RUNWAY</p>
                <h2 className="font-display text-4xl md:text-5xl tracking-[0.08em] text-slate-50">
                  COLLECTIONS
                </h2>
              </div>
              <Link
                to="/collections"
                className="text-sm text-slate-300 hover:text-cyan-200 inline-flex items-center gap-2"
              >
                View all collections <ArrowRight size={15} />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {homeCollections.map((entry) => (
                <Link
                  key={entry.id}
                  to="/collections"
                  className="group relative rounded-3xl overflow-hidden min-h-[320px] border border-slate-700/70"
                >
                  <img
                    src={entry.image_url}
                    alt={entry.name}
                    className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-950/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <p className="text-xs tracking-[0.14em] text-cyan-200">
                      {(entry.season || "CURATED").toUpperCase()}
                      {entry.year ? ` ${entry.year}` : ""}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-white line-clamp-2">
                      {entry.name}
                    </h3>
                    <p className="mt-2 text-sm text-slate-200/95 line-clamp-2">
                      {entry.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-4 mt-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-7">
            <div>
              <p className="text-xs tracking-[0.18em] text-cyan-200">CURATED</p>
              <h2 className="font-display text-4xl md:text-5xl tracking-[0.08em] text-slate-50">
                FEATURED SELECTS
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {featuredProducts.map((product) => (
              <Link
                key={product.id}
                to={`/product/${product.id}`}
                className="group surface-card rounded-3xl overflow-hidden hover:-translate-y-1"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-white">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-center scale-[1.14] group-hover:scale-[1.18] transition-transform duration-700"
                  />
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-cyan-500/85 px-3 py-1 text-[11px] font-semibold tracking-wide text-slate-950">
                    <Star size={12} />
                    EDITOR'S PICK
                  </div>
                  {product.discount_percentage ? (
                    <div className="absolute top-3 right-3 rounded-full bg-rose-500 px-3 py-1 text-[11px] font-semibold text-white">
                      -{product.discount_percentage}%
                    </div>
                  ) : null}
                </div>
                <div className="p-5">
                  <p className="text-xs text-slate-300 tracking-[0.16em] uppercase">
                    {product.category} •{" "}
                    {toProductAuthenticityLabel(product.authenticity)}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-50 line-clamp-2">
                    {product.name}
                  </h3>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xl font-bold text-cyan-100">
                      {formatPrice(product.price)}
                    </span>
                    {product.original_price && product.original_price > product.price ? (
                      <span className="text-sm text-slate-400 line-through">
                        {formatPrice(product.original_price)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="px-4 mt-16">
        <div className="max-w-7xl mx-auto surface-card rounded-3xl p-8 md:p-10 border border-slate-700/70">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-1">
              <p className="text-xs tracking-[0.18em] text-cyan-200">ABOUT LBathletes</p>
              <h2 className="mt-3 font-display text-3xl md:text-4xl tracking-[0.08em] text-slate-50">
                DESIGN-LED
                <br />
                ESSENTIALS
              </h2>
            </div>
            <div className="lg:col-span-2">
              <p className="text-slate-200 leading-relaxed">
                LBathletes is built around clean silhouettes, elevated materials, and
                intentional details that feel modern every day. We focus on
                wearable luxury with limited releases, fast fulfillment, and a
                refined shopping experience from first look to checkout.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/shop"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl luxe-button text-sm font-semibold tracking-[0.12em]"
                >
                  SHOP NOW
                  <ArrowRight size={15} />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl luxe-outline text-sm font-semibold tracking-[0.12em]"
                >
                  CONTACT TEAM
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 mt-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-7">
            <div>
              <p className="text-xs tracking-[0.18em] text-cyan-200">JUST IN</p>
              <h2 className="font-display text-3xl md:text-4xl tracking-[0.08em] text-slate-50">
                NEW ARRIVALS
              </h2>
            </div>
            <Link
              to="/new-arrivals"
              className="text-sm text-slate-300 hover:text-cyan-200 inline-flex items-center gap-2"
            >
              Browse all <ArrowRight size={15} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {newArrivals.map((product) => (
              <Link
                key={product.id}
                to={`/product/${product.id}`}
                className="group surface-card rounded-2xl overflow-hidden"
              >
                <div className="aspect-[3/4] overflow-hidden bg-white">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-center scale-[1.14] group-hover:scale-[1.18] transition-transform duration-700"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-sm md:text-base font-medium text-slate-50 line-clamp-2">
                    {product.name}
                  </h3>
                  <p className="mt-2 text-cyan-100 font-semibold">
                    {formatPrice(product.price)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 mt-16">
        <div className="max-w-3xl mx-auto surface-card rounded-3xl p-7 md:p-8 border border-slate-700/70 text-center">
          <p className="text-xs tracking-[0.18em] text-cyan-200">SOCIAL</p>
          <h3 className="mt-2 font-display text-2xl tracking-[0.08em] text-slate-50">
            Follow Us On Instagram
          </h3>
          <p className="mt-3 text-slate-300 text-sm md:text-base">
            Get early previews, new arrivals, and campaign highlights from LBathletes.
          </p>
          {/* <img
            src={LbLogo}
            alt="LBathletes"
            className="mt-5 h-20 w-20 md:h-24 md:w-24 mx-auto rounded-2xl object-cover ring-1 ring-cyan-300/35"
          /> */}
          <a
            href="https://instagram.com/lbathletes"
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-1 rounded-xl border border-cyan-300/45 bg-cyan-500/10 px-5 py-2.5 text-cyan-100 hover:bg-cyan-500/20 transition-colors font-semibold"
          >
            <Instagram size={18} />
            @lbathletes
          </a>
        </div>
      </section>

      <section className="px-4 mt-8 pb-16">
        <div className="max-w-3xl mx-auto surface-card rounded-3xl p-8 md:p-10 text-center border border-slate-700/70">
          <p className="text-xs tracking-[0.18em] text-cyan-200">INNER CIRCLE</p>
          <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-[0.08em] text-slate-50">
            JOIN THE CLUB
          </h2>
          <p className="mt-4 text-slate-300">
            Receive early-access drops, private sale alerts, and curated style
            updates.
          </p>

          {user && isCheckingSubscription ? (
            <p className="mt-6 text-slate-300 text-sm">Checking subscription status...</p>
          ) : user && isUserSubscribed ? (
            <p className="mt-6 text-emerald-300 text-sm">You are already subscribed.</p>
          ) : (
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
                className="rounded-xl px-6 py-3 luxe-button text-sm font-semibold tracking-[0.12em]"
              >
                SUBSCRIBE
              </button>
            </form>
          )}

          {subscribeStatus === "success" ? (
            <p className="mt-4 text-emerald-300 text-sm">You're in. Welcome to the circle.</p>
          ) : null}
          {subscribeStatus === "exists" ? (
            <p className="mt-4 text-cyan-200 text-sm">This email is already subscribed.</p>
          ) : null}
          {subscribeStatus === "error" ? (
            <p className="mt-4 text-rose-300 text-sm">Please enter a valid email address.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
