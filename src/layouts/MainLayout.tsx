import { Outlet } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { StoreHeader } from "../components/storefront/StoreHeader";
import { StoreFooter } from "../components/storefront/StoreFooter";

export const MainLayout = () => {
  const whatsappNumber = String(
    import.meta.env.VITE_ORDER_WHATSAPP_NUMBER || "96181107752"
  )
    .replace(/[^\d]/g, "")
    .trim();
  const whatsappLink = `https://wa.me/${whatsappNumber}`;

  return (
    <div className="page-shell min-h-screen">
      <StoreHeader />
      <main className="pt-28">
        <Outlet />
      </main>
      <StoreFooter />

      <a
        href={whatsappLink}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-500 text-white shadow-md hover:bg-emerald-600"
      >
        <MessageCircle size={18} />
      </a>
    </div>
  );
};
