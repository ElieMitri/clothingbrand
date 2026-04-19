import { Link } from "react-router-dom";

const footerColumns = [
  {
    title: "Shop",
    links: [
      { label: "All Products", to: "/shop" },
      { label: "Collections", to: "/collections" },
      { label: "New Arrivals", to: "/new-arrivals" },
      { label: "Sale", to: "/sale" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
      { label: "Terms", to: "/terms" },
      { label: "Privacy", to: "/privacy" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Orders", to: "/orders" },
      { label: "Account", to: "/profile" },
      { label: "Shipping", to: "/cart" },
      { label: "Returns", to: "/contact" },
    ],
  },
];

export function StoreFooter() {
  return (
    <footer className="mt-20 border-t border-[var(--sf-line)] bg-[var(--sf-bg-soft)]">
      <div className="store-container grid gap-8 py-12 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-lg font-extrabold tracking-[0.12em] text-[var(--sf-text)]">
            LBATHLETES
          </p>
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
                  <Link to={item.to} className="text-sm text-[var(--sf-text)] hover:text-[var(--sf-accent)]">
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
