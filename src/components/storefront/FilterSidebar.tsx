import { X } from "lucide-react";

interface FilterSidebarProps {
  open: boolean;
  onClose: () => void;
  categories: Array<{ label: string; value: string }>;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: "featured" | "price-low" | "price-high" | "newest") => void;
  minPrice: number;
  maxPrice: number;
  onPriceChange: (next: { min: number; max: number }) => void;
}

export function FilterSidebar({
  open,
  onClose,
  categories,
  selectedCategory,
  onCategoryChange,
  sortBy,
  onSortChange,
  minPrice,
  maxPrice,
  onPriceChange,
}: FilterSidebarProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside
        className={`fixed right-0 top-0 z-50 h-full w-[320px] max-w-[85vw] bg-white p-5 shadow-[0_20px_40px_rgba(0,0,0,0.18)] transition-transform lg:sticky lg:top-28 lg:z-10 lg:h-auto lg:max-h-[calc(100dvh-8rem)] lg:w-full lg:max-w-none lg:self-start lg:overflow-y-auto lg:rounded-[var(--sf-radius-lg)] lg:border lg:border-[var(--sf-line)] lg:shadow-none ${
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="mb-5 flex items-center justify-between lg:hidden">
          <h3 className="text-base font-semibold">Filters</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--sf-line)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-6">
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-text-muted)]">Category</h4>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="category"
                  checked={selectedCategory === "all"}
                  onChange={() => onCategoryChange("all")}
                />
                All Products
              </label>
              {categories.map((category) => (
                <label key={category.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="category"
                    checked={selectedCategory === category.value}
                    onChange={() => onCategoryChange(category.value)}
                  />
                  {category.label}
                </label>
              ))}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-text-muted)]">Sort</h4>
            <select
              value={sortBy}
              onChange={(event) => onSortChange(event.target.value as "featured" | "price-low" | "price-high" | "newest")}
              className="w-full rounded-[10px] border border-[var(--sf-line-strong)] bg-white px-3 py-2.5 text-sm"
            >
              <option value="featured">Featured</option>
              <option value="newest">Newest</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
            </select>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-text-muted)]">Price</h4>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                value={minPrice}
                onChange={(event) => onPriceChange({ min: Number(event.target.value || 0), max: maxPrice })}
                className="rounded-[10px] border border-[var(--sf-line-strong)] px-3 py-2 text-sm"
                aria-label="Minimum price"
              />
              <input
                type="number"
                min={0}
                value={maxPrice}
                onChange={(event) => onPriceChange({ min: minPrice, max: Number(event.target.value || 0) })}
                className="rounded-[10px] border border-[var(--sf-line-strong)] px-3 py-2 text-sm"
                aria-label="Maximum price"
              />
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
