export type ProductAudience = "men" | "women" | "unisex";

const audienceValues: ProductAudience[] = ["men", "women", "unisex"];

export const normalizeProductAudience = (
  audience?: string | null,
  category?: string | null
): ProductAudience => {
  const normalizedAudience = String(audience || "")
    .trim()
    .toLowerCase();
  if (audienceValues.includes(normalizedAudience as ProductAudience)) {
    return normalizedAudience as ProductAudience;
  }

  const normalizedCategory = String(category || "")
    .trim()
    .toLowerCase();
  if (normalizedCategory === "men") return "men";
  if (normalizedCategory === "women") return "women";
  return "unisex";
};

export const audienceLabelMap: Record<ProductAudience, string> = {
  men: "Men",
  women: "Women",
  unisex: "Unisex",
};

