import { Instagram, Mail, Phone } from "lucide-react";

function WhatsAppLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M13.601 2.326A7.854 7.854 0 0 0 8.006.002a7.94 7.94 0 0 0-6.83 11.978L0 16l4.149-1.084a7.94 7.94 0 0 0 3.857.992h.003a7.94 7.94 0 0 0 5.592-13.582Zm-5.595 12.24h-.002a6.57 6.57 0 0 1-3.35-.92l-.24-.142-2.463.644.657-2.401-.156-.246A6.57 6.57 0 0 1 8.007 1.34a6.59 6.59 0 0 1 4.659 1.93 6.58 6.58 0 0 1-4.66 11.296Zm3.61-4.934c-.197-.099-1.17-.578-1.352-.644-.181-.066-.313-.099-.445.1-.132.197-.51.643-.626.775-.115.132-.23.148-.428.05-.197-.1-.832-.307-1.585-.98-.586-.522-.982-1.166-1.097-1.363-.116-.198-.012-.304.087-.403.089-.089.198-.231.297-.347.099-.116.132-.198.198-.33.066-.132.033-.248-.017-.347-.05-.1-.445-1.074-.61-1.47-.161-.387-.325-.334-.445-.34l-.379-.007a.73.73 0 0 0-.528.248c-.181.198-.693.677-.693 1.651 0 .975.71 1.916.809 2.048.099.132 1.397 2.134 3.387 2.992.474.204.843.326 1.131.417.475.15.907.129 1.248.078.381-.057 1.17-.479 1.336-.941.165-.462.165-.858.116-.94-.05-.083-.182-.133-.379-.232Z" />
    </svg>
  );
}

export function Contact() {
  const whatsappNumber = String(
    import.meta.env.VITE_ORDER_WHATSAPP_NUMBER || "96181107752"
  )
    .replace(/[^\d]/g, "")
    .trim();
  const whatsappLink = `https://wa.me/${whatsappNumber}`;

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

        <div className="grid grid-cols-1 gap-8">
          <div className="surface-card rounded-3xl p-7 md:p-9 border border-slate-700/70">
            <h2 className="font-display text-2xl tracking-[0.06em] text-slate-50">
              Contact Details
            </h2>
            <p className="mt-3 text-slate-300 leading-relaxed">
              We usually respond within 24 hours on business days.
            </p>

            <div className="mt-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700">
                  <Mail size={18} />
                </div>
                <div>
                  <p className="text-xs tracking-[0.16em] text-slate-500">EMAIL</p>
                  <p className="mt-1 text-slate-700 font-semibold">
                    lbathletes@hotmail.com
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                  <Phone size={18} />
                </div>
                <div>
                  <p className="text-xs tracking-[0.16em] text-slate-500">PHONE</p>
                  <div className="mt-1 flex items-center gap-3">
                    <p className="text-slate-700 font-semibold">+961 81 107 752</p>
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Chat on WhatsApp"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                    >
                      <WhatsAppLogo className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
                  <Instagram size={18} />
                </div>
                <div>
                  <p className="text-xs tracking-[0.16em] text-slate-500">INSTAGRAM</p>
                  <p className="mt-1 text-slate-600 text-sm">
                    Follow our latest drops, launches, and brand updates.
                  </p>
                  <a
                    href="https://instagram.com/lbathletes"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 rounded-xl border border-fuchsia-300 bg-fuchsia-50 px-4 py-2 text-fuchsia-700 hover:bg-fuchsia-100 transition-colors font-semibold text-sm"
                  >
                    <Instagram size={16} />
                    @lbathletes
                  </a>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
