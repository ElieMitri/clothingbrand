import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Sparkles, Layers } from "lucide-react";
import { db } from "../lib/firebase";
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  orderBy,
} from "firebase/firestore";

interface CollectionItem {
  id: string;
  name: string;
  description: string;
  image_url: string;
  season?: string;
  year?: number;
  product_count?: number;
  is_active?: boolean;
}

export function Collections() {
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [email, setEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<
    "idle" | "success" | "exists" | "error"
  >("idle");

  const seasons = ["Spring", "Summer", "Fall", "Winter"];

  useEffect(() => {
    setLoading(true);

    const q = query(collection(db, "collections"), orderBy("year", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as CollectionItem[];

        setCollections(data.filter((item) => item.is_active !== false));
        setLoading(false);
      },
      (error) => {
        console.error("Error loading collections:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.includes("@")) {
      setSubscribeStatus("error");
      setTimeout(() => setSubscribeStatus("idle"), 3000);
      return;
    }

    try {
      const duplicateQ = query(
        collection(db, "newsletter"),
        where("email", "==", email.toLowerCase())
      );
      const existing = await getDocs(duplicateQ);

      if (existing.empty) {
        await addDoc(collection(db, "newsletter"), {
          email: email.toLowerCase(),
          subscribed_at: serverTimestamp(),
          sent_emails: 0,
        });
        try {
          await fetch("/api/send-newsletter-subscriber-discord", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: email.toLowerCase(),
              source: "collections",
            }),
          });
        } catch (notifyError) {
          console.error("Newsletter Discord notify failed:", notifyError);
        }
        setSubscribeStatus("success");
      } else {
        setSubscribeStatus("exists");
      }
      setEmail("");
    } catch (error) {
      console.error("Collection subscribe failed:", error);
      setSubscribeStatus("error");
    } finally {
      setTimeout(() => setSubscribeStatus("idle"), 3000);
    }
  };

  const filteredCollections =
    selectedSeason === "all"
      ? collections
      : collections.filter((c) => c.season === selectedSeason);

  const featured = filteredCollections[0];

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-14 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 surface-card rounded-full mb-6">
            <Sparkles size={16} />
            <span className="text-xs tracking-widest">CURATED COLLECTIONS</span>
          </div>
          <h1 className="font-display text-5xl md:text-7xl tracking-[0.18em] mb-6 text-slate-50">
            COLLECTIONS
          </h1>
          <p className="text-slate-300 text-lg max-w-3xl mx-auto leading-relaxed">
            Every collection is now fully dynamic from Firebase and managed in the admin dashboard.
          </p>
        </div>

        <div className="flex justify-center gap-3 mb-12 flex-wrap">
          <button
            onClick={() => setSelectedSeason("all")}
            className={`px-6 py-2 rounded-full text-sm tracking-wider transition-all ${
              selectedSeason === "all"
                ? "bg-cyan-400 text-slate-950"
                : "surface-card hover:border-cyan-300/40"
            }`}
          >
            ALL COLLECTIONS
          </button>
          {seasons.map((season) => (
            <button
              key={season}
              onClick={() => setSelectedSeason(season)}
              className={`px-6 py-2 rounded-full text-sm tracking-wider transition-all ${
                selectedSeason === season
                  ? "bg-cyan-400 text-slate-950"
                  : "surface-card hover:border-cyan-300/40"
              }`}
            >
              {season.toUpperCase()}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[4/3] bg-slate-800 rounded-xl mb-4" />
                <div className="h-6 bg-slate-800 rounded w-2/3 mb-2" />
                <div className="h-4 bg-slate-800 rounded w-full mb-2" />
                <div className="h-4 bg-slate-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="text-center py-20 surface-card rounded-2xl">
            <Layers size={46} className="mx-auto text-slate-400 mb-4" />
            <p className="text-slate-300 text-lg mb-4">
              No collections found for this season
            </p>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 px-6 py-3 luxe-button rounded-xl text-sm"
            >
              Explore products
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <>
            {featured && (
              <div className="mb-12">
                <div className="group relative block rounded-3xl overflow-hidden h-[56vh] md:h-[66vh] border border-slate-700">
                  <img
                    src={featured.image_url}
                    alt={featured.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12 text-white">
                    <div className="max-w-3xl">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/20 backdrop-blur-sm rounded-full mb-4 border border-cyan-300/30">
                        <Sparkles size={16} />
                        <span className="text-xs tracking-widest">FEATURED COLLECTION</span>
                      </div>
                      <h2 className="text-4xl md:text-6xl font-light tracking-wider mb-4">
                        {featured.name}
                      </h2>
                      <p className="text-lg md:text-xl text-slate-200 mb-6 max-w-2xl">
                        {featured.description}
                      </p>
                      <div className="flex items-center gap-6 text-sm mb-6 text-slate-200">
                        {featured.season && (
                          <span className="flex items-center gap-2">
                            <Calendar size={16} />
                            {featured.season} {featured.year}
                          </span>
                        )}
                        {featured.product_count && (
                          <span>{featured.product_count} Pieces</span>
                        )}
                      </div>
                      <Link
                        to="/shop"
                        className="inline-flex items-center gap-2 bg-white text-slate-950 px-8 py-3 rounded-full hover:bg-slate-100 transition-colors"
                      >
                        EXPLORE COLLECTION
                        <ArrowRight size={18} />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-8">
              {filteredCollections.slice(1).map((item) => (
                <div key={item.id} className="group">
                  <div className="aspect-[4/3] rounded-2xl overflow-hidden mb-4 relative border border-slate-700">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <h3 className="text-2xl font-light tracking-wide mb-2 text-slate-100">
                    {item.name}
                  </h3>
                  <p className="text-slate-300 leading-relaxed mb-4">
                    {item.description}
                  </p>
                  <Link
                    to="/shop"
                    className="inline-flex items-center gap-2 text-sm group-hover:gap-3 transition-all text-cyan-200"
                  >
                    <span className="tracking-wider">SHOP THIS STYLE</span>
                    <ArrowRight size={16} />
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-20 surface-card rounded-3xl p-10 text-center border border-slate-700/70">
          <h2 className="font-display text-3xl md:text-4xl tracking-wider mb-4 text-slate-50">
            STAY INSPIRED
          </h2>
          <p className="text-slate-300 mb-7 max-w-2xl mx-auto">
            Be the first to discover new collections and exclusive launches.
          </p>

          <form
            onSubmit={handleSubscribe}
            className="max-w-xl mx-auto flex flex-col sm:flex-row gap-3"
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

          {subscribeStatus === "success" ? (
            <p className="mt-4 text-emerald-300 text-sm">Subscribed successfully.</p>
          ) : null}
          {subscribeStatus === "exists" ? (
            <p className="mt-4 text-cyan-200 text-sm">This email is already subscribed.</p>
          ) : null}
          {subscribeStatus === "error" ? (
            <p className="mt-4 text-rose-300 text-sm">Please enter a valid email address.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
