import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  Clock3,
  ShoppingCart,
  User,
  LogOut,
  Menu,
  X,
  Package,
  Settings,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import Logo from "../assets/logo-transparent.png";

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

function PeakLogo({ className = "" }: { className?: string }) {
  return (
    <img src={Logo} alt="LBathletes" className={`${className} mix-blend-screen`} />
  );
}
export function Navbar() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isShopMenuOpen, setIsShopMenuOpen] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(0);
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
  const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);
  const notificationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const notificationPanelBubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubblePointerLeft, setBubblePointerLeft] = useState(20);
  const [shopCategories, setShopCategories] = useState<
    { name: string; path: string; special?: boolean }[]
  >([{ name: "New Arrivals", path: "/new-arrivals" }]);
  const adminEmails = ["lbathletes@hotmail.com", "sammourdany@gmail.com"];
  const isAdminUser =
    Boolean(user?.email) &&
    adminEmails.includes(String(user?.email).toLowerCase());

  // Handle scroll
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Load real-time cart count
  useEffect(() => {
    if (!user) {
      setCartItemCount(0);
      return;
    }

    const cartsRef = collection(db, "carts");
    const q = query(cartsRef, where("user_id", "==", user.uid));

    // Real-time listener for cart updates
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const totalItems = snapshot.docs.reduce((sum, doc) => {
          return sum + (doc.data().quantity || 0);
        }, 0);
        setCartItemCount(totalItems);
      },
      (error) => {
        console.error("Error loading cart count:", error);
        setCartItemCount(0);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
    setIsShopMenuOpen(false);
    setIsNotificationPanelOpen(false);
  }, [location]);

  useEffect(() => {
    if (isMobileMenuOpen || isNotificationPanelOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [isMobileMenuOpen, isNotificationPanelOpen]);

  useEffect(() => {
    if (!isNotificationPanelOpen) return;

    const updateBubblePointer = () => {
      const triggerRect = notificationTriggerRef.current?.getBoundingClientRect();
      const panelRect = notificationPanelBubbleRef.current?.getBoundingClientRect();
      if (!triggerRect || !panelRect) return;

      const pointerSize = 16; // matches h-4 w-4
      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      const minLeft = 12;
      const maxLeft = Math.max(minLeft, panelRect.width - pointerSize - 12);
      const computedLeft = triggerCenter - panelRect.left - pointerSize / 2;
      const safeLeft = Math.min(maxLeft, Math.max(minLeft, computedLeft));
      setBubblePointerLeft(safeLeft);
    };

    updateBubblePointer();
    window.addEventListener("resize", updateBubblePointer);
    window.addEventListener("scroll", updateBubblePointer, { passive: true });
    return () => {
      window.removeEventListener("resize", updateBubblePointer);
      window.removeEventListener("scroll", updateBubblePointer);
    };
  }, [isNotificationPanelOpen]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isUserMenuOpen || isShopMenuOpen || isNotificationPanelOpen) {
        const target = e.target as HTMLElement;
        if (
          !target.closest(".user-menu") &&
          !target.closest(".shop-menu") &&
          !target.closest(".notification-menu")
        ) {
          setIsUserMenuOpen(false);
          setIsShopMenuOpen(false);
          setIsNotificationPanelOpen(false);
        }
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isUserMenuOpen, isShopMenuOpen, isNotificationPanelOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsUserMenuOpen(false);
      navigate("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const isActivePath = (path: string) => {
    return location.pathname === path;
  };

  const isShopActive = () => {
    return (
      location.pathname.startsWith("/shop") ||
      location.pathname.startsWith("/category/") ||
      location.pathname === "/new-arrivals" ||
      location.pathname === "/sale"
    );
  };

  useEffect(() => {
    const loadShopCategories = async () => {
      try {
        const homepageSettingsSnap = await getDoc(
          doc(db, "site_settings", "homepage")
        );
        const customShopMenu = homepageSettingsSnap.exists()
          ? Array.isArray(homepageSettingsSnap.data().shop_menu_items)
            ? homepageSettingsSnap
                .data()
                .shop_menu_items.map(
                  (entry: {
                    label?: string;
                    path?: string;
                    special?: boolean;
                  } | null) => ({
                    name: entry?.label?.trim() || "",
                    path: entry?.path?.trim() || "",
                    special: Boolean(entry?.special),
                  })
                )
                .filter(
                  (entry: { name: string; path: string; special: boolean }) =>
                    entry.name && entry.path
                )
            : []
          : [];

        if (customShopMenu.length > 0) {
          setShopCategories(customShopMenu);
          return;
        }

        setShopCategories([
          { name: "New Arrivals", path: "/new-arrivals" },
          { name: "Collections", path: "/collections" },
        ]);
      } catch (error) {
        console.error("Error loading dynamic shop categories:", error);
        setShopCategories([
          { name: "New Arrivals", path: "/new-arrivals" },
          { name: "Collections", path: "/collections" },
        ]);
      }
    };

    loadShopCategories();
  }, []);

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

    const unsubNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const items = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...entry.data(),
      })) as WebNotificationEntry[];
      setWebNotifications(items);
    });

    const unsubStates = onSnapshot(statesRef, (snapshot) => {
      const stateById: Record<string, WebNotificationState> = {};
      snapshot.docs.forEach((entry) => {
        stateById[entry.id] = entry.data() as WebNotificationState;
      });
      setNotificationStates(stateById);
    });

    const unsubUser = onSnapshot(userRef, (snapshot) => {
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
      unsubNotifications();
      unsubStates();
      unsubUser();
    };
  }, [user?.uid]);

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

  const markAllVisibleNotificationsAsRead = async () => {
    if (!user || visibleNotifications.length === 0 || isMarkingAllAsRead) return;

    setIsMarkingAllAsRead(true);
    try {
      await Promise.all(
        visibleNotifications.map((notification) =>
          setDoc(
            doc(db, "users", user.uid, "web_notification_states", notification.id),
            {
              status: "read",
              read_at: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
        )
      );
    } finally {
      setIsMarkingAllAsRead(false);
    }
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

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      >
        <div className="w-full">
          <div
            className={`relative border-b transition-all duration-300 ${
              isScrolled
                ? "bg-slate-950/84 backdrop-blur-2xl border-slate-500/45 shadow-[0_16px_42px_rgba(2,6,23,0.62)]"
                : "bg-slate-950/58 backdrop-blur-xl border-slate-600/35 shadow-[0_10px_28px_rgba(2,6,23,0.48)]"
            }`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(148,163,184,0.08),transparent_32%,rgba(56,189,248,0.08))]" />
            <div className="max-w-7xl mx-auto flex items-center justify-between px-3 py-1 sm:px-4 sm:py-2.5 lg:px-5 xl:px-6">
            <div className="relative z-10 flex items-center gap-2">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2.5 hover:bg-slate-800/70 rounded-xl transition-colors"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>

              {/* Logo + Notifications */}
              <div ref={notificationPanelRef} className="relative notification-menu">
                {user ? (
                  <button
                    ref={notificationTriggerRef}
                    onClick={() => setIsNotificationPanelOpen((prev) => !prev)}
                    className="relative inline-flex items-center justify-center h-12 w-12 rounded-xl transition-all duration-300"
                    aria-label="Open notifications"
                  >
                    <PeakLogo className="h-11 w-11" />
                    {visibleNotifications.length > 0 && (
                      <span className="absolute top-0 right-0 translate-x-[8%] -translate-y-[8%] min-w-4.5 h-4.5 px-1 rounded-full bg-cyan-300 text-slate-950 text-[9px] font-bold inline-flex items-center justify-center shadow-[0_0_10px_rgba(103,232,249,0.4)]">
                        {visibleNotifications.length > 99
                          ? "99+"
                          : visibleNotifications.length}
                      </span>
                    )}
                  </button>
                ) : (
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center h-12 w-12 rounded-xl transition-all duration-300"
                    aria-label="LBathletes Home"
                  >
                    <PeakLogo className="h-11 w-11" />
                  </Link>
                )}

                {user && isNotificationPanelOpen && (
                  <div
                    ref={notificationPanelBubbleRef}
                    className="notification-bubble-enter fixed left-3 right-3 top-[92px] z-[75] rounded-2xl border border-cyan-300/20 bg-slate-950/95 backdrop-blur-xl shadow-[0_24px_70px_rgba(2,6,23,0.8)] p-3 max-h-[calc(100dvh-96px)] overflow-visible sm:absolute sm:top-full sm:left-0 sm:right-auto sm:mt-3 sm:w-[min(92vw,380px)] sm:max-h-none"
                  >
                    <div
                      className="notification-bubble-tip-enter absolute -top-2 h-4 w-4 rotate-45 border-l border-t border-cyan-300/20 bg-slate-950/95"
                      style={{ left: `${bubblePointerLeft}px` }}
                    />
                    <div className="flex items-start justify-between gap-3 px-1 pb-3 border-b border-slate-800/80">
                      <div>
                        <p className="text-base font-semibold text-slate-100 tracking-[0.01em]">
                          Notifications
                        </p>
                        <span className="mt-1 inline-flex text-xs text-slate-300">
                          {visibleNotifications.length} unread
                        </span>
                      </div>
                      <button
                        onClick={markAllVisibleNotificationsAsRead}
                        disabled={visibleNotifications.length === 0 || isMarkingAllAsRead}
                        className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-md bg-cyan-500/15 text-cyan-100 text-[11px] font-medium border border-cyan-400/35 hover:bg-cyan-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isMarkingAllAsRead ? "Marking..." : "Mark all as read"}
                      </button>
                    </div>
                    {visibleNotifications.length === 0 ? (
                      <div className="mt-3 rounded-xl border border-slate-700/80 bg-slate-900/60 px-3 py-4 text-sm text-slate-400">
                        No new notifications.
                      </div>
                    ) : (
                      <div className="mt-3 max-h-[calc(100dvh-180px)] overflow-y-auto space-y-2 pr-1 sm:max-h-[60vh]">
                        {visibleNotifications.map((notification) => (
                          <div
                            key={notification.id}
                            className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-3.5 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                {notification.category !== "general" ? (
                                  <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/85 font-medium">
                                    {notification.category}
                                  </p>
                                ) : null}
                                <p className="mt-1 text-[15px] font-semibold text-slate-100 leading-snug">
                                  {notification.title}
                                </p>
                                <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
                                  {notification.message}
                                </p>
                                <p className="mt-2.5 text-[11px] text-slate-500">
                                  {toDate(notification.created_at)?.toLocaleString() || ""}
                                </p>
                              </div>
                              <div className="h-7 w-7 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                                <Bell size={13} className="text-slate-400" />
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                              <button
                                onClick={() => markNotificationAsRead(notification.id)}
                                className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-cyan-500/15 text-cyan-100 text-xs border border-cyan-400/35 hover:bg-cyan-500/25 transition-colors"
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
            </div>

            {/* Desktop Navigation */}
            <div className="relative z-10 hidden lg:flex items-center gap-5 xl:gap-8">
              <Link
                to="/"
                className={`text-[12px] tracking-[0.16em] transition-all duration-300 relative group ${
                  isActivePath("/")
                    ? "text-white font-semibold"
                    : "text-slate-300 hover:text-slate-100"
                }`}
              >
                HOME
                <span
                  className={`absolute -bottom-3 left-0 h-[1.5px] bg-cyan-300 transition-all duration-300 ${
                    isActivePath("/") ? "w-full" : "w-0 group-hover:w-full"
                  }`}
                />
              </Link>

              {/* Shop Dropdown */}
              <div className="relative shop-menu">
                <button
                  onClick={() => setIsShopMenuOpen(!isShopMenuOpen)}
                  className={`text-[12px] tracking-[0.16em] transition-all duration-300 flex items-center gap-1.5 relative group ${
                    isShopActive()
                      ? "text-white font-semibold"
                      : "text-slate-300 hover:text-slate-100"
                  }`}
                >
                  SHOP
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-300 ${
                      isShopMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                  <span
                    className={`absolute -bottom-3 left-0 h-[1.5px] bg-cyan-300 transition-all duration-300 ${
                      isShopActive() ? "w-full" : "w-0 group-hover:w-full"
                    }`}
                  />
                </button>

                {/* Shop Dropdown Menu */}
                {isShopMenuOpen && (
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-4 w-64 surface-card rounded-2xl py-2 overflow-hidden border border-slate-500/40">
                    {shopCategories.map((category) => (
                      <Link
                        key={category.path}
                        to={category.path}
                        className={`block px-5 py-3 text-sm tracking-wider transition-all ${
                          category.special
                            ? "text-rose-300 font-semibold hover:bg-rose-900/30"
                            : "text-slate-200 hover:bg-slate-800/80 hover:text-cyan-100"
                        }`}
                      >
                        {category.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link
                to="/contact"
                className={`text-[12px] tracking-[0.16em] transition-all duration-300 relative group ${
                  isActivePath("/contact")
                    ? "text-white font-semibold"
                    : "text-slate-300 hover:text-slate-100"
                }`}
              >
                CONTACT
                <span
                  className={`absolute -bottom-3 left-0 h-[1.5px] bg-cyan-300 transition-all duration-300 ${
                    isActivePath("/contact")
                      ? "w-full"
                      : "w-0 group-hover:w-full"
                  }`}
                />
              </Link>
            </div>

            {/* Right Side Actions */}
            <div className="relative z-10 flex items-center gap-2 py-1">
              {user ? (
                <>
                  {isAdminUser && (
                    <Link
                      to="/admin"
                      className="hidden xl:inline-flex items-center rounded-full border border-cyan-300/40 bg-cyan-400/12 px-3 py-1 text-[10px] font-semibold tracking-[0.14em] text-cyan-100 hover:bg-cyan-400/20 transition-colors"
                    >
                      ADMIN
                    </Link>
                  )}

                  {/* Cart */}
                  <Link
                    to="/cart"
                    className="p-2.5 bg-slate-900/60 lg:bg-transparent border border-slate-700/70 lg:border-slate-600/40 hover:bg-slate-800/70 lg:hover:bg-slate-800/40 rounded-xl transition-all duration-300 relative group"
                    aria-label="Shopping cart"
                  >
                    <ShoppingCart
                      size={20}
                      className="text-slate-200 group-hover:text-cyan-200 transition-colors"
                    />
                    {cartItemCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-cyan-400 text-slate-950 text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-semibold shadow-[0_0_12px_rgba(34,211,238,0.75)]">
                        {cartItemCount > 9 ? "9+" : cartItemCount}
                      </span>
                    )}
                  </Link>

                  {/* User Menu Dropdown */}
                  <div className="relative user-menu">
                    <button
                      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      className="p-2.5 bg-slate-900/60 lg:bg-transparent border border-slate-700/70 lg:border-slate-600/40 hover:bg-slate-800/70 lg:hover:bg-slate-800/40 rounded-xl transition-all duration-300 group"
                      aria-label="User menu"
                    >
                      <User
                        size={20}
                        className="text-slate-200 group-hover:text-cyan-200 transition-colors"
                      />
                    </button>

                    {/* User Dropdown Menu */}
                    {isUserMenuOpen && (
                      <div className="absolute top-full right-0 mt-3 w-64 surface-card rounded-2xl py-2 overflow-hidden border border-cyan-400/25">
                        <div className="px-5 py-4 border-b border-slate-700/70 bg-slate-900/70">
                          <p className="text-sm font-semibold text-slate-100 truncate">
                            {user.email}
                          </p>
                          <p className="text-xs text-slate-300 mt-1">
                            Member since{" "}
                            {new Date(
                              user.metadata?.creationTime || ""
                            ).getFullYear()}
                          </p>
                        </div>

                        <div className="py-2">
                          <Link
                            to="/profile"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-3 px-5 py-3 text-sm text-slate-200 hover:bg-slate-800/70 transition-colors"
                          >
                            <User size={18} />
                            <span>My Profile</span>
                          </Link>

                          <Link
                            to="/orders"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-3 px-5 py-3 text-sm text-slate-200 hover:bg-slate-800/70 transition-colors"
                          >
                            <Package size={18} />
                            <span>My Orders</span>
                          </Link>

                          <Link
                            to="/settings"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-3 px-5 py-3 text-sm text-slate-200 hover:bg-slate-800/70 transition-colors"
                          >
                            <Settings size={18} />
                            <span>Settings</span>
                          </Link>
                        </div>

                        <div className="border-t border-stone-200/70 pt-2">
                          <button
                            onClick={handleSignOut}
                            className="flex items-center gap-3 px-5 py-3 text-sm text-rose-300 hover:bg-rose-900/30 transition-colors w-full font-medium"
                          >
                            <LogOut size={18} />
                            <span>Sign Out</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <Link
                  to="/login"
                  className="hidden lg:inline-flex items-center gap-2 px-6 py-2.5 luxe-button text-white text-[12px] tracking-[0.15em] rounded-xl font-semibold"
                >
                  LOGIN
                </Link>
              )}
            </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${
          isMobileMenuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-slate-950/72 backdrop-blur-sm transition-opacity duration-300 ${
              isMobileMenuOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <div className="pointer-events-none absolute -top-10 -right-10 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-20 left-[-40px] h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />

          {/* Menu Panel */}
          <div
            className={`absolute top-[84px] right-3 bottom-3 w-[88%] max-w-sm bg-slate-950/92 backdrop-blur-2xl shadow-[0_22px_60px_rgba(2,6,23,0.82)] overflow-y-auto border border-cyan-400/25 rounded-3xl transition-transform duration-300 ease-out ${
              isMobileMenuOpen ? "translate-x-0" : "translate-x-8"
            }`}
          >
            <div className="px-4 py-5 space-y-2">
              {/* User Section (Mobile) */}
              {user && (
                <div className="mb-4 p-4 bg-slate-900/85 rounded-2xl border border-slate-700/70">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-slate-100 truncate">
                      {user.email}
                    </p>
                    {isAdminUser && (
                      <span className="inline-flex items-center rounded-full border border-cyan-300/40 bg-cyan-400/12 px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-cyan-100">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300">
                    Member since{" "}
                    {new Date(user.metadata?.creationTime || "").getFullYear()}
                  </p>
                </div>
              )}

              <Link
                to="/"
                className={`block px-5 py-3.5 text-sm tracking-[0.12em] rounded-xl transition-all ${
                  isActivePath("/")
                    ? "bg-cyan-500/20 text-cyan-100 font-medium border border-cyan-400/40"
                    : "text-slate-200 hover:bg-slate-800/70"
                }`}
              >
                HOME
              </Link>

              {/* Shop Section */}
              <div className="space-y-1">
                <div className="px-5 py-3 text-sm tracking-[0.12em] text-cyan-100 font-semibold">
                  SHOP
                </div>
                <div className="pl-4 space-y-1">
                  {shopCategories.map((category) => (
                    <Link
                      key={category.path}
                      to={category.path}
                      className={`block px-5 py-3 text-sm rounded-xl transition-all ${
                        isActivePath(category.path)
                          ? "bg-cyan-500/20 text-cyan-100 font-medium border border-cyan-400/40"
                          : category.special
                          ? "text-rose-300 hover:bg-rose-900/30"
                          : "text-slate-300 hover:text-cyan-200 hover:bg-slate-800/70"
                      }`}
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
              </div>

              <Link
                to="/contact"
                className={`block px-5 py-3.5 text-sm tracking-[0.12em] rounded-xl transition-all ${
                  isActivePath("/contact")
                    ? "bg-cyan-500/20 text-cyan-100 font-medium border border-cyan-400/40"
                    : "text-slate-200 hover:bg-slate-800/70"
                }`}
              >
                CONTACT
              </Link>

              {/* Mobile User Menu */}
              {user ? (
                <>
                  <div className="pt-4 border-t border-slate-700/70 space-y-1">
                    <Link
                      to="/cart"
                      className={`flex items-center gap-3 px-5 py-3.5 text-sm tracking-[0.12em] rounded-xl transition-all ${
                        isActivePath("/cart")
                          ? "bg-cyan-500/20 text-cyan-100 font-medium border border-cyan-400/40"
                          : "text-slate-200 hover:bg-slate-800/70"
                      }`}
                    >
                      <ShoppingCart size={18} />
                      <span>Cart</span>
                      {cartItemCount > 0 && (
                        <span className="ml-auto px-2 py-0.5 bg-cyan-400 text-slate-950 text-xs rounded-full font-semibold">
                          {cartItemCount}
                        </span>
                      )}
                    </Link>

                    <Link
                      to="/profile"
                      className={`flex items-center gap-3 px-5 py-3.5 text-sm tracking-[0.12em] rounded-xl transition-all ${
                        isActivePath("/profile")
                          ? "bg-cyan-500/20 text-cyan-100 font-medium border border-cyan-400/40"
                          : "text-slate-200 hover:bg-slate-800/70"
                      }`}
                    >
                      <User size={18} />
                      <span>My Profile</span>
                    </Link>

                    <Link
                      to="/orders"
                      className={`flex items-center gap-3 px-5 py-3.5 text-sm tracking-[0.12em] rounded-xl transition-all ${
                        isActivePath("/orders")
                          ? "bg-cyan-500/20 text-cyan-100 font-medium border border-cyan-400/40"
                          : "text-slate-200 hover:bg-slate-800/70"
                      }`}
                    >
                      <Package size={18} />
                      <span>My Orders</span>
                    </Link>

                    <Link
                      to="/settings"
                      className={`flex items-center gap-3 px-5 py-3.5 text-sm tracking-[0.12em] rounded-xl transition-all ${
                        isActivePath("/settings")
                          ? "bg-cyan-500/20 text-cyan-100 font-medium border border-cyan-400/40"
                          : "text-slate-200 hover:bg-slate-800/70"
                      }`}
                    >
                      <Settings size={18} />
                      <span>Settings</span>
                    </Link>

                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 w-full px-5 py-3.5 text-sm tracking-[0.12em] rounded-xl transition-all text-rose-300 hover:bg-rose-900/30 font-medium"
                    >
                      <LogOut size={18} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="pt-4">
                  <Link
                    to="/login"
                    className="block px-5 py-3.5 text-sm tracking-[0.12em] luxe-button rounded-xl text-center font-medium transition-all"
                  >
                    LOGIN
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
    </>
  );
}
