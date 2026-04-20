import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

const VISITOR_KEY = "lb_visitor_id";
const SESSION_KEY = "lb_session_id";

const generateId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

const getPersistentId = (storage: Storage, key: string, prefix: string) => {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const created = generateId(prefix);
  storage.setItem(key, created);
  return created;
};

let lastEventKey = "";
let lastEventAt = 0;

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
    const visitorId = getPersistentId(window.localStorage, VISITOR_KEY, "visitor");
    const sessionId = getPersistentId(window.sessionStorage, SESSION_KEY, "session");

    await addDoc(collection(db, "analytics_events"), {
      event_type: "page_view",
      path: pathname || "/",
      search: search || "",
      full_path: normalizedPath,
      visitor_id: visitorId,
      session_id: sessionId,
      referrer: document.referrer || "",
      user_agent: navigator.userAgent || "",
      created_at: Timestamp.now(),
    });
  } catch (error) {
    console.error("Failed to track page view", error);
  }
}
