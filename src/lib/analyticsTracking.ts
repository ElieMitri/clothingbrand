import { addDoc, collection, doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

const VISITOR_KEY = "lb_visitor_id";
const SESSION_KEY = "lb_session_id";
const GEO_CACHE_KEY = "lb_geo_cache_v1";
const PRESENCE_HEARTBEAT_MS = 45000;
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const generateId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

let lastEventKey = "";
let lastEventAt = 0;
let presenceTimer: number | null = null;
let activePresenceSessionId = "";
let geoRequestPromise: Promise<{
  city: string;
  region: string;
  country: string;
  countryCode: string;
}> | null = null;
let onVisibilityBound = false;
let triggerPresenceWrite: (() => void) | null = null;

const readStorage = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (storage: Storage, key: string, value: string) => {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write issues.
  }
};

const getPersistentIdSafe = (storage: Storage, key: string, prefix: string) => {
  const existing = readStorage(storage, key);
  if (existing) return existing;
  const created = generateId(prefix);
  writeStorage(storage, key, created);
  return created;
};

const parseGeoCache = (raw: string | null) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      city?: string;
      region?: string;
      country?: string;
      countryCode?: string;
      cachedAt?: number;
    };
    if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > GEO_CACHE_TTL_MS) {
      return null;
    }
    return {
      city: String(parsed.city || "").trim(),
      region: String(parsed.region || "").trim(),
      country: String(parsed.country || "").trim(),
      countryCode: String(parsed.countryCode || "").trim(),
    };
  } catch {
    return null;
  }
};

const getGeoInfo = async () => {
  if (typeof window === "undefined") {
    return { city: "", region: "", country: "", countryCode: "" };
  }

  // In local development, this API route is usually unavailable.
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return { city: "", region: "", country: "", countryCode: "" };
  }

  const cached = parseGeoCache(readStorage(window.localStorage, GEO_CACHE_KEY));
  if (cached) return cached;

  if (!geoRequestPromise) {
    geoRequestPromise = (async () => {
      try {
        const response = await fetch("/api/resolve-visitor-geo", { method: "GET" });
        const body = (await response.json()) as {
          city?: string;
          region?: string;
          country?: string;
          countryCode?: string;
        };
        const nextGeo = {
          city: String(body?.city || "").trim(),
          region: String(body?.region || "").trim(),
          country: String(body?.country || "").trim(),
          countryCode: String(body?.countryCode || "").trim(),
        };

        writeStorage(
          window.localStorage,
          GEO_CACHE_KEY,
          JSON.stringify({ ...nextGeo, cachedAt: Date.now() })
        );
        return nextGeo;
      } catch {
        return { city: "", region: "", country: "", countryCode: "" };
      } finally {
        geoRequestPromise = null;
      }
    })();
  }

  return geoRequestPromise;
};

const buildCurrentPath = () =>
  `${window.location?.pathname || "/"}${window.location?.search || ""}`;

const startPresenceTracking = (
  sessionId: string,
  visitorId: string,
  geo: { city: string; region: string; country: string; countryCode: string }
) => {
  if (typeof window === "undefined") return;
  if (!sessionId || !visitorId) return;

  if (activePresenceSessionId && activePresenceSessionId !== sessionId && presenceTimer) {
    window.clearInterval(presenceTimer);
    presenceTimer = null;
  }
  activePresenceSessionId = sessionId;

  const writePresence = async () => {
    try {
      await setDoc(
        doc(db, "analytics_presence", sessionId),
        {
          session_id: sessionId,
          visitor_id: visitorId,
          current_path: buildCurrentPath(),
          city: geo.city || null,
          region: geo.region || null,
          country: geo.country || null,
          country_code: geo.countryCode || null,
          last_seen: Timestamp.now(),
          updated_at: Timestamp.now(),
          source: "storefront",
        },
        { merge: true }
      );
    } catch {
      // Presence writes are best-effort.
    }
  };

  void writePresence();

  if (!presenceTimer) {
    presenceTimer = window.setInterval(() => {
      void writePresence();
    }, PRESENCE_HEARTBEAT_MS);
  }
  triggerPresenceWrite = () => {
    void writePresence();
  };

  if (!onVisibilityBound) {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && triggerPresenceWrite) {
        triggerPresenceWrite();
      }
    });
    onVisibilityBound = true;
  }
};

export async function trackPageView(pathname: string, search = "") {
  if (typeof window === "undefined") return;

  const normalizedPath = `${pathname || "/"}${search || ""}`;
  const now = Date.now();
  const dedupeKey = `page_view:${normalizedPath}`;

  if (dedupeKey === lastEventKey && now - lastEventAt < 1200) {
    return;
  }

  lastEventKey = dedupeKey;
  lastEventAt = now;

  try {
    const visitorId = getPersistentIdSafe(window.localStorage, VISITOR_KEY, "visitor");
    const sessionId = getPersistentIdSafe(window.sessionStorage, SESSION_KEY, "session");
    const geo = await getGeoInfo();

    startPresenceTracking(sessionId, visitorId, geo);

    await addDoc(collection(db, "analytics_events"), {
      event_type: "page_view",
      path: pathname || "/",
      search: search || "",
      full_path: normalizedPath,
      visitor_id: visitorId,
      session_id: sessionId,
      city: geo.city || null,
      region: geo.region || null,
      country: geo.country || null,
      country_code: geo.countryCode || null,
      referrer: document.referrer || "",
      user_agent: navigator.userAgent || "",
      created_at: Timestamp.now(),
    });
  } catch (error) {
    console.error("Failed to track page view", error);
  }
}
