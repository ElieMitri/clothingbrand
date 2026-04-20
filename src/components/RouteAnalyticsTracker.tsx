import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../lib/analyticsTracking";

export function RouteAnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    void trackPageView(location.pathname, location.search);
  }, [location.pathname, location.search]);

  return null;
}
