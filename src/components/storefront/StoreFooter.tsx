import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import WebsiteLogo from "../../assets/logo website.jpeg";

interface FooterLinkEntry {
  id?: string;
  label: string;
  to: string;
  special?: boolean;
}

interface CollectionEntry {
  id: string;
  name?: string;
  is_active?: boolean;
  year?: number;
}

const defaultShopLinks: FooterLinkEntry[] = [
  { label: "All Products", to: "/shop" },
  { label: "Collections", to: "/collections" },
  { label: "New Arrivals", to: "/new-arrivals" },
  { label: "Sale", to: "/sale", special: true },
];

const normalizeShopMenuPath = (rawPath: string) => {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

export function StoreFooter() {
  const [shopLinks, setShopLinks] = useState<FooterLinkEntry[]>(defaultShopLinks);
  const [collectionLinks, setCollectionLinks] = useState<FooterLinkEntry[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "site_settings", "homepage"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setShopLinks(defaultShopLinks);
          return;
        }

        const data = snapshot.data() as { shop_menu_items?: unknown[] };
        const configuredItems = Array.isArray(data.shop_menu_items)
          ? data.shop_menu_items
              .map((entry) => {
                if (!entry || typeof entry !== "object") return null;
                const candidate = entry as Partial<FooterLinkEntry>;
                const label = String(candidate.label || "").trim();
                const to = normalizeShopMenuPath(String(candidate.to || (candidate as { path?: string }).path || ""));
                if (!label || !to) return null;
                return {
                  id: candidate.id,
                  label,
                  to,
                  special: Boolean(candidate.special),
                } as FooterLinkEntry;
              })
              .filter(
                (item: FooterLinkEntry | null): item is FooterLinkEntry =>
                  item !== null
              )
          : [];

        setShopLinks(configuredItems.length > 0 ? configuredItems : defaultShopLinks);
      },
      () => {
        setShopLinks(defaultShopLinks);
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
              to: `/shop?category=${encodeURIComponent(name)}`,
            } as FooterLinkEntry;
          });

        setCollectionLinks(next);
      },
      () => setCollectionLinks([])
    );

    return () => unsubscribe();
  }, []);

  const resolvedShopLinks = useMemo(() => {
    if (collectionLinks.length === 0) return shopLinks;
    const seen = new Set(shopLinks.map((item) => item.to));
    const uniqueCollections = collectionLinks.filter((item) => !seen.has(item.to));
    return [...shopLinks, ...uniqueCollections];
  }, [shopLinks, collectionLinks]);

  const footerColumns = [
    {
      title: "Shop",
      links: resolvedShopLinks,
    },
    {
      title: "Company",
      links: [
        { label: "Contact Us", to: "/contact" },
        { label: "Terms & Conditions", to: "/terms" },
        { label: "Privacy Policy", to: "/privacy" },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "My Orders", to: "/profile#my-orders" },
        { label: "Account", to: "/profile" },
        { label: "Returns", to: "/contact" },
      ],
    },
  ];

  return (
    <footer className="mt-20 border-t border-[var(--sf-line)] bg-[var(--sf-bg-soft)]">
      <div className="store-container grid gap-8 py-12 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link to="/" className="inline-flex items-center">
            <img
              src={WebsiteLogo}
              alt="LBathletes logo"
              className="h-14 w-auto rounded-md object-contain"
            />
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--sf-text-muted)]">
            Premium athletic apparel built for training, performance, and everyday confidence.
          </p>
        </div>

        {footerColumns.map((column) => (
          <div key={column.title}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-text-muted)]">
              {column.title}
            </h3>
            <ul className="mt-3 space-y-2">
              {column.links.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="text-sm text-[var(--sf-text)] transition-colors hover:text-[var(--sf-accent)] hover:underline hover:underline-offset-4"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--sf-line)]">
        <div className="store-container flex flex-col gap-2 py-4 text-xs text-[var(--sf-text-muted)] md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} LBathletes. All rights reserved.</p>
          <p>Secure checkout • Easy returns • Trusted support</p>
        </div>
      </div>
    </footer>
  );
}
