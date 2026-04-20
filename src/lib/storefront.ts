export interface StoreProduct {
  id: string;
  name: string;
  price: number;
  original_price?: number;
  image_url: string;
  images?: string[];
  category?: string;
  description?: string;
  colors?: string[];
  sizes?: string[];
  sold_out?: boolean;
  sold_out_sizes?: string[];
  is_featured?: boolean;
  created_at?: unknown;
  material?: string;
}

export const formatPrice = (value: number) => `$${Number(value || 0).toFixed(2)}`;

export const productGalleryImages = (product: StoreProduct) => {
  if (Array.isArray(product.images) && product.images.length > 0) {
    return product.images;
  }
  return [product.image_url].filter(Boolean);
};

export const getCompareAtPrice = (product: StoreProduct) => {
  if (product.original_price && product.original_price > product.price) {
    return product.original_price;
  }
  return undefined;
};

export const getDiscountPercent = (product: StoreProduct) => {
  const compareAt = getCompareAtPrice(product);
  if (!compareAt) return 0;
  return Math.round(((compareAt - product.price) / compareAt) * 100);
};

export const normalizeSize = (value: string) => String(value || "").trim().toLowerCase();

export const getDefaultSizes = (product?: Partial<StoreProduct>) => {
  const source = Array.isArray(product?.sizes) && product?.sizes?.length
    ? product.sizes
    : ["XS", "S", "M", "L", "XL"];

  return source.map((size) => String(size).trim()).filter(Boolean);
};

export const isSizeSoldOut = (product: StoreProduct, size: string) => {
  const soldOutSizes = Array.isArray(product.sold_out_sizes) ? product.sold_out_sizes : [];
  const soldOutSet = new Set(soldOutSizes.map(normalizeSize));
  return soldOutSet.has(normalizeSize(size));
};

export const getPreferredCartSize = (product: StoreProduct) => {
  const availableSize = getDefaultSizes(product).find(
    (size) => !isSizeSoldOut(product, size)
  );
  return availableSize || "One Size";
};

export const toDate = (value: unknown) => {
  if (value && typeof value === "object" && "toDate" in (value as object)) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return new Date(0);
    }
  }
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
};
