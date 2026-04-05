export type ProductAuthenticity = "original" | "copy_a";

export const productAuthenticityLabelMap: Record<ProductAuthenticity, string> = {
  original: "Original",
  copy_a: "Copy A",
};

export const normalizeProductAuthenticity = (
  value: unknown
): ProductAuthenticity => {
  if (typeof value !== "string") return "original";
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "copy_a" ||
    normalized === "copy a" ||
    normalized === "copy-a" ||
    normalized === "copya"
  ) {
    return "copy_a";
  }
  return "original";
};

export const toProductAuthenticityLabel = (value: unknown): string =>
  productAuthenticityLabelMap[normalizeProductAuthenticity(value)];
