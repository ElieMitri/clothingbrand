import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../lib/firebase";
import { getGuestCartCount } from "../../lib/cart";
import WebsiteLogo from "../../assets/logo website.jpeg";

interface ShopMenuItemEntry {
  id?: string;
  label: string;
  path: string;
  special?: boolean;
}

interface CollectionEntry {
  id: string;
  name?: string;
  is_active?: boolean;
  year?: number;
}

const defaultShopDropdownLinks: ShopMenuItemEntry[] = [
  { label: "Shop All", path: "/shop" },
  { label: "Collections", path: "/collections" },
  { label: "New Arrivals", path: "/new-arrivals" },
  { label: "Sale", path: "/sale", special: true },
];

const primaryLinks = [{ label: "Home", to: "/" }];

const secondaryLinks = [{ label: "Contact", to: "/contact" }];

const mobileLinks = [{ label: "Home", to: "/" }, ...secondaryLinks];

const normalizeShopMenuPath = (rawPath: string) => {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

export function StoreHeader() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileShopOpen, setMobileShopOpen] = useState(true);
  const [shopDropdownOpen, setShopDropdownOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [canRenderPortal, setCanRenderPortal] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [shopDropdownLinks, setShopDropdownLinks] = useState<ShopMenuItemEntry[]>(
    defaultShopDropdownLinks
  );
  const [collectionLinks, setCollectionLinks] = useState<ShopMenuItemEntry[]>([]);
  const shopDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMobileOpen(false);
    setMobileShopOpen(true);
    setShopDropdownOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setCanRenderPortal(true);
  }, []);

  useEffect(() => {
    if (!user) {
      const syncGuestCount = () => setCartItemCount(getGuestCartCount());
      syncGuestCount();
      window.addEventListener("guest-cart-updated", syncGuestCount);
      window.addEventListener("storage", syncGuestCount);
      return () => {
        window.removeEventListener("guest-cart-updated", syncGuestCount);
        window.removeEventListener("storage", syncGuestCount);
      };
    }

    const cartsRef = collection(db, "carts");
    const cartsQuery = query(cartsRef, where("user_id", "==", user.uid));

    const unsubscribe = onSnapshot(
      cartsQuery,
      (snapshot) => {
        const totalItems = snapshot.docs.reduce(
          (sum, entry) => sum + Number(entry.data().quantity || 0),
          0
        );
        setCartItemCount(totalItems);
      },
      () => setCartItemCount(0)
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "site_settings", "homepage"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setShopDropdownLinks(defaultShopDropdownLinks);
          return;
        }

        const data = snapshot.data() as { shop_menu_items?: unknown[] };
        const configuredItems = Array.isArray(data.shop_menu_items)
          ? data.shop_menu_items
              .map((entry) => {
                if (!entry || typeof entry !== "object") return null;
                const candidate = entry as Partial<ShopMenuItemEntry>;
                const label = String(candidate.label || "").trim();
                const path = normalizeShopMenuPath(String(candidate.path || ""));
                if (!label || !path) return null;
                return {
                  id: candidate.id,
                  label,
                  path,
                  special: Boolean(candidate.special),
                } as ShopMenuItemEntry;
              })
              .filter(
                (item: ShopMenuItemEntry | null): item is ShopMenuItemEntry =>
                  item !== null
              )
          : [];

        setShopDropdownLinks(
          configuredItems.length > 0 ? configuredItems : defaultShopDropdownLinks
        );
      },
      () => {
        setShopDropdownLinks(defaultShopDropdownLinks);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "collections"), orderBy("year", "desc")),
      (snapshot) => {
        const next = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }) as CollectionEntry)
          .filter((entry) => entry.is_active !== false && String(entry.name || "").trim())
          .map((entry) => {
            const name = String(entry.name || "").trim();
            return {
              id: `collection-${entry.id}`,
              label: name,
              path: `/shop?category=${encodeURIComponent(name)}`,
            } as ShopMenuItemEntry;
          });

        setCollectionLinks(next);
      },
      () => setCollectionLinks([])
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!shopDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (shopDropdownRef.current?.contains(target)) return;
      setShopDropdownOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [shopDropdownOpen]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const queryValue = searchValue.trim();
    if (!queryValue) {
      navigate("/shop");
      return;
    }
    navigate(`/shop?search=${encodeURIComponent(queryValue)}`);
  };

  const isMenuItemActive = useMemo(() => {
    return (path: string) => {
      const [targetPath, queryString] = String(path || "").split("?");
      if (!targetPath) return false;

      if (!queryString) {
        if (targetPath === "/") return location.pathname === "/";
        if (targetPath === "/shop") {
          const current = new URLSearchParams(location.search);
          return location.pathname === "/shop" && !current.has("category");
        }
        return (
          location.pathname === targetPath ||
          location.pathname.startsWith(`${targetPath}/`)
        );
      }

      if (location.pathname !== targetPath) return false;
      const expected = new URLSearchParams(queryString);
      const current = new URLSearchParams(location.search);

      for (const [key, value] of expected.entries()) {
        if (current.get(key) !== value) return false;
      }

      return true;
    };
  }, [location.pathname, location.search]);

  const isShopRoute =
    location.pathname.startsWith("/shop") ||
    location.pathname.startsWith("/collections") ||
    location.pathname.startsWith("/new-arrivals") ||
    location.pathname.startsWith("/sale") ||
    shopDropdownLinks.some((item) => isMenuItemActive(item.path));

  const isHomePage = location.pathname === "/";
  const isHeroNavMode = isHomePage && !isScrolled;

  const resolvedShopDropdownLinks = useMemo(() => {
    if (collectionLinks.length === 0) return shopDropdownLinks;

    const seenPaths = new Set(shopDropdownLinks.map((item) => item.path));
    const uniqueCollectionLinks = collectionLinks.filter(
      (item) => !seenPaths.has(item.path)
    );
    return [...shopDropdownLinks, ...uniqueCollectionLinks];
  }, [shopDropdownLinks, collectionLinks]);

  const uiToneClass = isHeroNavMode ? "text-white" : "text-[var(--sf-text)]";
  const navLinkClass = isHeroNavMode
    ? "text-white/95 hover:text-white"
    : "text-[var(--sf-text)] hover:text-[var(--sf-accent)]";
  const activeNavLinkClass = isHeroNavMode
    ? "text-white"
    : "text-[var(--sf-accent)]";

  const headerShellClass = isHeroNavMode
    ? "bg-transparent"
    : "bg-white/72 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65";
  const searchContainerClass = isHeroNavMode ? "bg-white/15" : "bg-white/80";
  const searchIconClass = isHeroNavMode
    ? "text-white/80"
    : "text-[var(--sf-text-muted)]";
  const searchInputClass = isHeroNavMode
    ? "text-white placeholder:text-white/70"
    : "text-[var(--sf-text)] placeholder:text-[var(--sf-text-muted)]";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${headerShellClass}`}
    >
      <div className="bg-gradient-to-r from-[var(--sf-accent)] via-[#4f7eb4] to-[var(--sf-accent)] transition-all duration-300">
        <p className="store-container py-2 text-center text-xs font-semibold tracking-[0.08em] text-white uppercase">
          🇱🇧 Free shipping on orders over $120 | Shop Now 🔥

        </p>
      </div>

      <div className="store-container flex h-20 items-center justify-between gap-3">
        <button
          type="button"
          className={`inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors lg:hidden ${uiToneClass}`}
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <Link
          to="/"
          className="inline-flex items-center"
          aria-label="LB Athletes home"
        >
          <img
            src={WebsiteLogo}
            alt="LB Athletes"
            className="h-16 w-auto object-contain md:h-16 lg:h-20"
          />
        </Link>

        <nav className="hidden items-center gap-6 px-1 py-1.5 lg:flex">
          {primaryLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`rounded-[10px] px-3.5 py-2 text-sm font-medium ${
                item.to === "/"
                  ? location.pathname === "/"
                    ? activeNavLinkClass
                    : navLinkClass
                  : location.pathname.startsWith(item.to)
                  ? activeNavLinkClass
                  : navLinkClass
              }`}
            >
              {item.label}
            </Link>
          ))}

          <div
            ref={shopDropdownRef}
            className="relative"
            onMouseEnter={() => setShopDropdownOpen(true)}
            onMouseLeave={() => setShopDropdownOpen(false)}
          >
            <button
              type="button"
              onClick={() => setShopDropdownOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-[10px] px-3.5 py-2 text-sm font-medium ${
                isShopRoute ? activeNavLinkClass : navLinkClass
              }`}
              aria-expanded={shopDropdownOpen}
              aria-haspopup="menu"
            >
              Shop
              <ChevronDown
                size={15}
                className={`transition-transform ${shopDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            <div
              className={`absolute left-0 top-full z-20 pt-2 transition-all ${
                shopDropdownOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-2 opacity-0"
              }`}
            >
              <div className="w-56 rounded-[14px] bg-white/95 p-2 shadow-[0_18px_36px_rgba(17,24,39,0.16)] backdrop-blur">
                {resolvedShopDropdownLinks.map((item) => (
                  <Link
                    key={`${item.label}-${item.path}`}
                    to={item.path}
                    className={`block rounded-md px-3 py-2 text-sm ${
                      isMenuItemActive(item.path)
                        ? "bg-[var(--sf-bg-soft)] text-[var(--sf-accent)]"
                        : item.special
                        ? "text-[var(--sf-danger)] hover:bg-red-50"
                        : "text-[var(--sf-text)] hover:bg-[var(--sf-bg-soft)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {secondaryLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`rounded-[10px] px-3.5 py-2 text-sm font-medium ${
                location.pathname.startsWith(item.to)
                  ? activeNavLinkClass
                  : navLinkClass
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <form
            onSubmit={onSearch}
            className={`hidden items-center rounded-[10px] px-3 py-2 transition-colors md:flex ${searchContainerClass}`}
          >
            <Search size={15} className={`transition-colors ${searchIconClass}`} />
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search"
              className={`w-36 border-0 bg-transparent px-2 text-sm outline-none transition-colors placeholder:transition-colors focus-visible:outline-none focus-visible:ring-0 ${searchInputClass}`}
              aria-label="Search products"
            />
          </form>

          <Link
            to={user ? "/profile" : "/login"}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors ${uiToneClass}`}
            aria-label="Account"
          >
            <User size={17} />
          </Link>

          <Link
            to="/cart"
            className={`relative inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors ${uiToneClass}`}
            aria-label="Cart"
          >
            <ShoppingBag size={17} />
            {cartItemCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--sf-accent)] px-1.5 text-[11px] font-semibold leading-[18px] text-white">
                {cartItemCount > 99 ? "99+" : cartItemCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>

      {canRenderPortal
        ? createPortal(
            <div
              className={`fixed inset-0 z-[80] bg-black/35 transition-opacity lg:hidden ${
                mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <button
                type="button"
                className="absolute inset-0"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu overlay"
              />
              <div
                className={`absolute left-0 top-0 z-10 h-full w-[320px] max-w-[85vw] bg-white p-6 shadow-[0_22px_44px_rgba(15,23,42,0.12)] transition-transform ${
                  mobileOpen ? "translate-x-0" : "-translate-x-full"
                }`}
              >
                <div className="mb-6 flex items-center justify-between">
                  <p className="font-display text-[13px] font-extrabold tracking-[0.14em] text-[var(--sf-text)]">
                    MENU
                  </p>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-[var(--sf-text)]"
                    onClick={() => setMobileOpen(false)}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="mb-6">
                  <form
                    onSubmit={onSearch}
                    className="flex items-center rounded-[14px] bg-[var(--sf-bg-soft)] px-3.5 py-2.5"
                  >
                    <Search size={15} className="text-[var(--sf-text-muted)]" />
                    <input
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      placeholder="Search products"
                      className="w-full border-0 bg-transparent px-2 text-sm outline-none"
                      aria-label="Search products"
                    />
                  </form>
                </div>

                <nav className="space-y-2">
                  <div className="rounded-[14px] bg-white/95 p-2 shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
                    {mobileLinks.slice(0, 1).map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`block rounded-[10px] px-3 py-2 text-[15px] ${
                          item.to === "/"
                            ? location.pathname === "/"
                              ? "bg-[var(--sf-bg-soft)] text-[var(--sf-accent)]"
                              : "text-[var(--sf-text)] hover:bg-[var(--sf-bg-soft)]"
                            : "text-[var(--sf-text)] hover:bg-[var(--sf-bg-soft)]"
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}

                    <button
                      type="button"
                      onClick={() => setMobileShopOpen((prev) => !prev)}
                      className={`mt-1 flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[15px] font-semibold ${
                        isShopRoute
                          ? "bg-[var(--sf-bg-soft)] text-[var(--sf-accent)]"
                          : "text-[var(--sf-text)] hover:bg-[var(--sf-bg-soft)]"
                      }`}
                    >
                      <span>Shop</span>
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${
                          mobileShopOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <div
                      className={`grid transition-all ${
                        mobileShopOpen
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="mt-1 space-y-1 pl-2">
                          {resolvedShopDropdownLinks.map((item) => (
                            <Link
                              key={`mobile-${item.label}-${item.path}`}
                              to={item.path}
                              className={`block rounded-[10px] px-3 py-2 text-[15px] ${
                                isMenuItemActive(item.path)
                                  ? "bg-[var(--sf-bg-soft)] text-[var(--sf-accent)]"
                                  : item.special
                                  ? "text-[var(--sf-danger)] hover:bg-red-50"
                                  : "text-[var(--sf-text)] hover:bg-[var(--sf-bg-soft)]"
                              }`}
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>

                    {mobileLinks.slice(1).map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`mt-1 block rounded-[10px] px-3 py-2 text-[15px] ${
                          location.pathname.startsWith(item.to)
                            ? "bg-[var(--sf-bg-soft)] text-[var(--sf-accent)]"
                            : "text-[var(--sf-text)] hover:bg-[var(--sf-bg-soft)]"
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </nav>
              </div>
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
