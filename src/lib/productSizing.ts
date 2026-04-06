const shoeKeywords = [
  "shoe",
  "sneaker",
  "boot",
  "cleat",
  "footwear",
  "trainer",
];

const oneSizeKeywords = [
  "accessor",
  "bag",
  "equipment",
  "gear",
  "muay",
  "boxing",
  "glove",
  "shin",
  "mouth",
  "headgear",
  "wrap",
  "pad",
  "belt",
  "rope",
  "cap",
  "hat",
];

const supplementKeywords = [
  "supplement",
  "herbal",
  "wellness",
  "recovery",
  "protein",
  "creatine",
  "pre-workout",
  "pre workout",
  "bcaa",
  "mass gainer",
  "gainer",
  "vitamin",
  "whey",
  "collagen",
  "omega",
  "electrolyte",
];

const normalizeCategory = (category: string) => category.trim().toLowerCase();

const containsAnyKeyword = (category: string, keywords: string[]) =>
  keywords.some((keyword) => category.includes(keyword));

export const getDefaultShoeSizes = () => [
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
];

export const getDefaultApparelSizes = () => ["XS", "S", "M", "L", "XL", "XXL"];

export const getDefaultGloveSizes = () => ["8oz", "10oz", "12oz", "14oz", "16oz"];

export const getDefaultOneSizeSizes = () => ["One Size"];
export const getDefaultSupplementSizes = () => [
  "30 Servings",
  "60 Servings",
  "1kg",
];

export const getDefaultSizesByCategory = (category: string) => {
  const normalized = normalizeCategory(category);

  if (containsAnyKeyword(normalized, shoeKeywords)) {
    return getDefaultShoeSizes();
  }

  if (containsAnyKeyword(normalized, supplementKeywords)) {
    return getDefaultSupplementSizes();
  }

  if (containsAnyKeyword(normalized, oneSizeKeywords)) {
    return getDefaultOneSizeSizes();
  }

  return getDefaultApparelSizes();
};

export const getDefaultShoeSizeGuide = () =>
  "Shoe Size Guide (General)\nEU | US | UK | LENGTH cm\n36 | 5 | 4 | 23.3\n37 | 5.5 | 4.5 | 24.0\n38 | 6 | 5 | 24.7\n39 | 6.5 | 6 | 25.3\n40 | 7 | 6.5 | 26.0\n41 | 8 | 7 | 26.7\n42 | 9 | 8 | 27.3\n43 | 9.5 | 8.5 | 28.0\n44 | 10 | 9 | 28.7\n45 | 11 | 10 | 29.3\n46 | 12 | 11 | 30.0\n47 | 13 | 12 | 30.7\n48 | 14 | 13 | 31.3";

export const getDefaultSizeGuideByCategory = (category: string) => {
  const normalized = normalizeCategory(category);

  if (containsAnyKeyword(normalized, shoeKeywords)) {
    return getDefaultShoeSizeGuide();
  }

  if (containsAnyKeyword(normalized, supplementKeywords)) {
    return "Supplement size guide: choose by servings or net weight. Example variants: 30 servings, 60 servings, 1kg.";
  }

  if (containsAnyKeyword(normalized, oneSizeKeywords)) {
    return "One-size item. Product dimensions may vary slightly by style.";
  }

  return "Clothing fit guide: If you are between two sizes, choose the larger size for a relaxed fit and the smaller size for a slim fit.";
};
