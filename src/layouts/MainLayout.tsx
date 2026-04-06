import { Outlet } from "react-router-dom";
import { Navbar } from "../components/Navbar";

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

export const MainLayout = () => {
  const whatsappNumber = String(
    import.meta.env.VITE_ORDER_WHATSAPP_NUMBER || "96181107752"
  )
    .replace(/[^\d]/g, "")
    .trim();
  const whatsappLink = `https://wa.me/${whatsappNumber}`;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-28 -left-20 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl live-float" />
        <div className="absolute top-1/4 -right-24 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl live-float [animation-delay:0.8s]" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl live-float [animation-delay:1.6s]" />
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.22)_1px,transparent_0)] [background-size:32px_32px]" />
      </div>
      <Navbar />
      <main className="relative z-10 page-enter">
        <Outlet />
      </main>
      <a
        href={whatsappLink}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-5 right-5 z-[85] inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_14px_30px_rgba(16,185,129,0.45)] hover:bg-emerald-600 transition-colors"
      >
        <WhatsAppLogo className="h-7 w-7" />
      </a>
    </div>
  );
};
