import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  buildDashboardKpis,
  mapCustomers,
  mapOrders,
  mapProducts,
  type AdminOrderDoc,
  type AdminProductDoc,
  type AdminUserDoc,
} from "../utils/transforms";

export function useAdminLiveData() {
  const [productsRaw, setProductsRaw] = useState<AdminProductDoc[]>([]);
  const [ordersRaw, setOrdersRaw] = useState<AdminOrderDoc[]>([]);
  const [usersRaw, setUsersRaw] = useState<AdminUserDoc[]>([]);
  const [subscribersCount, setSubscribersCount] = useState(0);
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<
    Array<{ id: string; email: string; sent_emails: number; subscribed_at?: unknown }>
  >([]);
  const [collectionsRaw, setCollectionsRaw] = useState<
    Array<{
      id: string;
      name?: string;
      description?: string;
      image_url?: string;
      season?: string;
      year?: number;
      product_count?: number;
      is_active?: boolean;
      created_at?: unknown;
      updated_at?: unknown;
    }>
  >([]);
  const [analyticsEventsRaw, setAnalyticsEventsRaw] = useState<
    Array<{
      id: string;
      event_type?: string;
      full_path?: string;
      path?: string;
      search?: string;
      visitor_id?: string;
      session_id?: string;
      city?: string;
      region?: string;
      country?: string;
      created_at?: unknown;
    }>
  >([]);
  const [presenceRaw, setPresenceRaw] = useState<
    Array<{
      id: string;
      session_id?: string;
      visitor_id?: string;
      current_path?: string;
      city?: string;
      region?: string;
      country?: string;
      last_seen?: unknown;
      updated_at?: unknown;
      source?: string;
    }>
  >([]);
  const [saleSettings, setSaleSettings] = useState<{
    sale_title: string;
    sale_headline: string;
    sale_subtitle: string;
    show_sale_link: boolean;
    end_at: unknown;
  } | null>(null);
  const [storeSettings, setStoreSettings] = useState<{
    store_name: string;
  } | null>(null);
  const [homepageSettings, setHomepageSettings] = useState<{
    hero_image_url: string;
    today_pick_product_id: string;
    home_collection_ids: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let productsReady = false;
    let ordersReady = false;
    let usersReady = false;
    let newsletterReady = false;
    let collectionsReady = false;
    let analyticsReady = false;
    let homepageReady = false;

    const settleLoading = () => {
      if (
        productsReady &&
        ordersReady &&
        usersReady &&
        newsletterReady &&
        collectionsReady &&
        analyticsReady &&
        homepageReady
      ) {
        setLoading(false);
      }
    };

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(collection(db, "products"), (snap) => {
        const data = snap.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<AdminProductDoc, "id">),
        }));
        setProductsRaw(data);
        productsReady = true;
        settleLoading();
      })
    );

    unsubs.push(
      onSnapshot(query(collection(db, "orders"), orderBy("created_at", "desc")), (snap) => {
        const data = snap.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<AdminOrderDoc, "id">),
        }));
        setOrdersRaw(data);
        ordersReady = true;
        settleLoading();
      })
    );

    unsubs.push(
      onSnapshot(collection(db, "users"), (snap) => {
        const data = snap.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<AdminUserDoc, "id">),
        }));
        setUsersRaw(data);
        usersReady = true;
        settleLoading();
      })
    );

    unsubs.push(
      onSnapshot(collection(db, "newsletter"), (snap) => {
        setSubscribersCount(snap.size);
        setNewsletterSubscribers(
          snap.docs.map((entry) => {
            const data = entry.data() as {
              email?: string;
              sent_emails?: number;
              subscribed_at?: unknown;
            };
            return {
              id: entry.id,
              email: String(data.email || "").trim().toLowerCase(),
              sent_emails: Number(data.sent_emails || 0),
              subscribed_at: data.subscribed_at,
            };
          })
        );
        newsletterReady = true;
        settleLoading();
      })
    );

    unsubs.push(
      onSnapshot(query(collection(db, "collections"), orderBy("year", "desc")), (snap) => {
        setCollectionsRaw(
          snap.docs.map((entry) => ({
            id: entry.id,
            ...(entry.data() as Omit<(typeof collectionsRaw)[number], "id">),
          }))
        );
        collectionsReady = true;
        settleLoading();
      })
    );

    unsubs.push(
      onSnapshot(doc(db, "site_settings", "sale"), (snap) => {
        if (!snap.exists()) {
          setSaleSettings(null);
          return;
        }
        const data = snap.data() as {
          sale_title?: string;
          sale_headline?: string;
          sale_subtitle?: string;
          show_sale_link?: boolean;
          end_at?: unknown;
        };
        setSaleSettings({
          sale_title: data.sale_title || "SEASONAL SALE",
          sale_headline: data.sale_headline || "UP TO 70% OFF",
          sale_subtitle: data.sale_subtitle || "Limited Time Offer",
          show_sale_link: Boolean(data.show_sale_link),
          end_at: data.end_at,
        });
      })
    );

    unsubs.push(
      onSnapshot(doc(db, "site_settings", "store"), (snap) => {
        if (!snap.exists()) {
          setStoreSettings(null);
          return;
        }
        const data = snap.data() as { store_name?: string };
        setStoreSettings({
          store_name: String(data.store_name || "").trim() || "LB Athletes",
        });
      })
    );

    unsubs.push(
      onSnapshot(doc(db, "site_settings", "homepage"), (snap) => {
        if (!snap.exists()) {
          setHomepageSettings({
            hero_image_url: "",
            today_pick_product_id: "",
            home_collection_ids: [],
          });
          homepageReady = true;
          settleLoading();
          return;
        }
        const data = snap.data() as {
          hero_image_url?: string;
          today_pick_product_id?: string;
          home_collection_ids?: string[];
        };
        setHomepageSettings({
          hero_image_url: String(data.hero_image_url || ""),
          today_pick_product_id: String(data.today_pick_product_id || ""),
          home_collection_ids: Array.isArray(data.home_collection_ids)
            ? data.home_collection_ids.map((entry) => String(entry)).filter(Boolean)
            : [],
        });
        homepageReady = true;
        settleLoading();
      })
    );

    unsubs.push(
      onSnapshot(collection(db, "analytics_events"), (snap) => {
        const rows = snap.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<
            {
              id: string;
              event_type?: string;
              full_path?: string;
              path?: string;
              search?: string;
              visitor_id?: string;
              session_id?: string;
              city?: string;
              region?: string;
              country?: string;
              created_at?: unknown;
            },
            "id"
          >),
        }));
        setAnalyticsEventsRaw(rows);
        analyticsReady = true;
        settleLoading();
      })
    );

    unsubs.push(
      onSnapshot(collection(db, "analytics_presence"), (snap) => {
        const rows = snap.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<
            {
              id: string;
              session_id?: string;
              visitor_id?: string;
              current_path?: string;
              city?: string;
              region?: string;
              country?: string;
              last_seen?: unknown;
              updated_at?: unknown;
              source?: string;
            },
            "id"
          >),
        }));
        setPresenceRaw(rows);
      })
    );

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const products = useMemo(() => mapProducts(productsRaw), [productsRaw]);
  const orders = useMemo(() => mapOrders(ordersRaw), [ordersRaw]);
  const customers = useMemo(() => mapCustomers(usersRaw, ordersRaw), [usersRaw, ordersRaw]);
  const dashboardKpis = useMemo(
    () => buildDashboardKpis(ordersRaw, productsRaw),
    [ordersRaw, productsRaw]
  );

  return {
    loading,
    products,
    orders,
    customers,
    ordersRaw,
    productsRaw,
    dashboardKpis,
    subscribersCount,
    saleSettings,
    storeSettings,
    homepageSettings,
    collectionsRaw,
    newsletterSubscribers,
    analyticsEventsRaw,
    presenceRaw,
  };
}
