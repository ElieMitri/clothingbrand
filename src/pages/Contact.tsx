import { useState } from "react";
import { Mail, MapPin, Phone, Send } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

export function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setStatus("sending");

      await addDoc(collection(db, "contact_messages"), {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        message: formData.message.trim(),
        created_at: serverTimestamp(),
        status: "new",
      });

      setStatus("success");
      setFormData({ name: "", email: "", message: "" });
      setTimeout(() => setStatus("idle"), 4000);
    } catch (error) {
      console.error("Contact form submit failed:", error);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs tracking-[0.18em] text-cyan-200">CONTACT</p>
          <h1 className="mt-3 font-display text-4xl md:text-6xl tracking-[0.08em] text-slate-50">
            LET'S TALK
          </h1>
          <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
            Reach out for support, order questions, collaborations, or anything
            else. Our team replies as fast as possible.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="surface-card rounded-3xl p-7 md:p-9 border border-slate-700/70">
            <h2 className="font-display text-2xl tracking-[0.06em] text-slate-50">
              Contact Details
            </h2>
            <p className="mt-3 text-slate-300 leading-relaxed">
              We usually respond within 24 hours on business days.
            </p>

            <div className="mt-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-cyan-500/20 border border-cyan-400/35 text-cyan-100 flex items-center justify-center">
                  <Mail size={18} />
                </div>
                <div>
                  <p className="text-xs tracking-[0.16em] text-slate-300">EMAIL</p>
                  <p className="mt-1 text-slate-100 font-medium">
                    eliegmitri7@gmail.com
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-cyan-500/20 border border-cyan-400/35 text-cyan-100 flex items-center justify-center">
                  <Phone size={18} />
                </div>
                <div>
                  <p className="text-xs tracking-[0.16em] text-slate-300">PHONE</p>
                  <p className="mt-1 text-slate-100 font-medium">+961 81 107 752</p>
                </div>
              </div>

            </div>
          </div>

          <div className="surface-card rounded-3xl p-7 md:p-9 border border-slate-700/70">
            <h2 className="font-display text-2xl tracking-[0.06em] text-slate-50">
              Send Message
            </h2>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {status === "success" ? (
                <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 px-4 py-3 text-sm">
                  Message sent successfully. We will get back to you soon.
                </div>
              ) : null}
              {status === "error" ? (
                <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 text-rose-200 px-4 py-3 text-sm">
                  Failed to send message. Please try again.
                </div>
              ) : null}

              <div>
                <label className="block text-xs tracking-[0.14em] text-slate-300 mb-2">
                  NAME
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                  className="w-full rounded-xl border border-slate-600/80 px-4 py-3 focus:outline-none focus:border-cyan-300"
                />
              </div>

              <div>
                <label className="block text-xs tracking-[0.14em] text-slate-300 mb-2">
                  EMAIL
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  required
                  className="w-full rounded-xl border border-slate-600/80 px-4 py-3 focus:outline-none focus:border-cyan-300"
                />
              </div>

              <div>
                <label className="block text-xs tracking-[0.14em] text-slate-300 mb-2">
                  MESSAGE
                </label>
                <textarea
                  value={formData.message}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, message: e.target.value }))
                  }
                  required
                  rows={6}
                  className="w-full rounded-xl border border-slate-600/80 px-4 py-3 focus:outline-none focus:border-cyan-300 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full rounded-xl px-6 py-3 luxe-button text-sm font-semibold tracking-[0.12em] inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {status === "sending" ? "SENDING..." : "SEND MESSAGE"}
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
