import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { StoreProduct, formatPrice, getCompareAtPrice, getDiscountPercent } from "../../lib/storefront";
import { toFastImageUrl } from "../../lib/image";
import { Button } from "./Button";

interface ProductCardProps {
  product: StoreProduct;
  onQuickAdd?: (product: StoreProduct) => void;
}

export function ProductCard({ product, onQuickAdd }: ProductCardProps) {
  const compareAtPrice = getCompareAtPrice(product);
  const discountPercent = getDiscountPercent(product);
  const isSoldOut = Boolean(product.sold_out);
  const cardImageUrl = toFastImageUrl(product.image_url, 720);

  return (
    <article className="group store-card flex h-full flex-col overflow-hidden">
      <Link to={`/product/${product.id}`} className="relative block aspect-[4/5] overflow-hidden bg-[var(--sf-bg-soft)]">
        <img
          src={cardImageUrl}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
        {discountPercent > 0 ? (
          <span className="absolute left-3 top-3 rounded-md bg-[var(--sf-accent)] px-2.5 py-1 text-xs font-semibold text-white">
            -{discountPercent}%
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--sf-text-muted)]">
            {product.category || "Apparel"}
          </p>
          <Link
            to={`/product/${product.id}`}
            className="block min-h-[2.8rem] text-[15px] font-semibold leading-snug text-[var(--sf-text)] hover:text-[var(--sf-accent)] line-clamp-2"
          >
            {product.name}
          </Link>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[var(--sf-text)]">{formatPrice(product.price)}</span>
          {compareAtPrice ? (
            <span className="text-sm text-[var(--sf-text-muted)] line-through">{formatPrice(compareAtPrice)}</span>
          ) : null}
        </div>

        {Array.isArray(product.colors) && product.colors.length > 0 ? (
          <div className="mt-3 flex items-center gap-1.5" aria-label="Available colors">
            {product.colors.slice(0, 4).map((color) => (
              <span
                key={color}
                title={color}
                className="h-4 w-4 rounded-full border border-[var(--sf-line-strong)]"
                style={{ backgroundColor: color.toLowerCase() }}
              />
            ))}
            {product.colors.length > 4 ? (
              <span className="text-xs text-[var(--sf-text-muted)]">+{product.colors.length - 4}</span>
            ) : null}
          </div>
        ) : null}

        <Button
          type="button"
          size="sm"
          variant="secondary"
          fullWidth
          className="mt-auto"
          onClick={() => {
            if (isSoldOut) return;
            onQuickAdd?.(product);
          }}
          disabled={isSoldOut}
          iconLeft={<ShoppingBag size={15} />}
        >
          {isSoldOut ? "Sold Out" : "Quick Add"}
        </Button>
      </div>
    </article>
  );
}
