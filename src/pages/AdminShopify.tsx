import { useMemo, useState } from "react";
import { Download, Link as LinkIcon, Loader2 } from "lucide-react";

type CsvCell = string | number | boolean | null | undefined;
interface ExportOptions {
  disableInventoryTracking: boolean;
}

interface ImportedProduct {
  name: string;
  description?: string;
  brand?: string;
  sku?: string;
  category?: string;
  product_type?: string;
  image_url?: string;
  price?: number;
  original_price?: number;
  stock?: number;
  colors?: string[];
  sizes?: string[];
  variants?: ImportedVariant[];
}

interface ImportedVariant {
  sku?: string;
  barcode?: string;
  price?: number | null;
  original_price?: number | null;
  stock?: number | null;
  image_url?: string;
  weight_grams?: number | null;
  requires_shipping?: boolean | null;
  charge_tax?: boolean | null;
  option1_name?: string;
  option1_value?: string;
  option2_name?: string;
  option2_value?: string;
  option3_name?: string;
  option3_value?: string;
}

interface ImportResponse {
  success?: boolean;
  count?: number;
  products?: ImportedProduct[];
  error?: string;
}

const SHOPIFY_HEADERS = [
  "Title",
  "URL handle",
  "Description",
  "Vendor",
  "Product category",
  "Type",
  "Tags",
  "Published on online store",
  "Status",
  "SKU",
  "Barcode",
  "Option1 name",
  "Option1 value",
  "Option1 Linked To",
  "Option2 name",
  "Option2 value",
  "Option2 Linked To",
  "Option3 name",
  "Option3 value",
  "Option3 Linked To",
  "Price",
  "Compare-at price",
  "Cost per item",
  "Charge tax",
  "Tax code",
  "Unit price total measure",
  "Unit price total measure unit",
  "Unit price base measure",
  "Unit price base measure unit",
  "Inventory tracker",
  "Inventory quantity",
  "Continue selling when out of stock",
  "Weight value (grams)",
  "Weight unit for display",
  "Requires shipping",
  "Fulfillment service",
  "Product image URL",
  "Image position",
  "Image alt text",
  "Variant image URL",
  "Gift card",
  "SEO title",
  "SEO description",
  "Color (product.metafields.shopify.color-pattern)",
  "Google Shopping / Google product category",
  "Google Shopping / Gender",
  "Google Shopping / Age group",
  "Google Shopping / Manufacturer part number (MPN)",
  "Google Shopping / Ad group name",
  "Google Shopping / Ads labels",
  "Google Shopping / Condition",
  "Google Shopping / Custom product",
  "Google Shopping / Custom label 0",
  "Google Shopping / Custom label 1",
  "Google Shopping / Custom label 2",
  "Google Shopping / Custom label 3",
  "Google Shopping / Custom label 4",
];

const slugify = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const formatPrice = (value: number | undefined) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return parsed.toFixed(2);
};

const optionNameByPosition = (variant: ImportedVariant, position: 1 | 2 | 3) => {
  if (position === 1) return String(variant.option1_name || "").trim();
  if (position === 2) return String(variant.option2_name || "").trim();
  return String(variant.option3_name || "").trim();
};

const optionValueByPosition = (variant: ImportedVariant, position: 1 | 2 | 3) => {
  if (position === 1) return String(variant.option1_value || "").trim();
  if (position === 2) return String(variant.option2_value || "").trim();
  return String(variant.option3_value || "").trim();
};

const isColorOptionName = (name: string) => /\b(colou?r)\b/i.test(name);

const unique = (values: string[]) =>
  Array.from(new Set(values.map((entry) => String(entry || "").trim()).filter(Boolean)));

const inferDefaultSizesForProduct = (product: ImportedProduct) => {
  const blob = [
    product.name,
    product.description,
    product.category,
    product.product_type,
    product.source_url,
  ]
    .map((entry) => String(entry || "").toLowerCase())
    .join(" ");

  const isApparelLike =
    /\b(jersey|kit|shirt|t-?shirt|top|hoodie|sweatshirt|tracksuit|shorts?|uniform)\b/.test(
      blob
    );

  if (!isApparelLike) return [];
  return ["XS", "S", "M", "L", "XL"];
};

const buildFallbackVariants = (product: ImportedProduct): ImportedVariant[] => {
  const inferredDefaultSizes = inferDefaultSizesForProduct(product);
  const sizes =
    inferredDefaultSizes.length > 0
      ? inferredDefaultSizes
      : unique(Array.isArray(product.sizes) ? product.sizes : []);
  const colors = unique(Array.isArray(product.colors) ? product.colors : []);

  if (sizes.length > 0) {
    return sizes.map((size) => ({
      option1_name: "Size",
      option1_value: size,
      sku: product.sku ? `${product.sku}-${String(size).replace(/\s+/g, "-")}` : "",
      stock: null,
      price: product.price,
      original_price: product.original_price,
    }));
  }

  if (colors.length > 1) {
    return colors.map((color) => ({
      option1_name: "Color",
      option1_value: color,
      sku: product.sku ? `${product.sku}-${String(color).replace(/\s+/g, "-")}` : "",
      stock: null,
      price: product.price,
      original_price: product.original_price,
    }));
  }

  return [];
};

const getProductVariants = (product: ImportedProduct) => {
  const imported = Array.isArray(product.variants)
    ? product.variants.filter((variant) => {
        return (
          String(variant.option1_value || "").trim() ||
          String(variant.option2_value || "").trim() ||
          String(variant.option3_value || "").trim() ||
          String(variant.sku || "").trim()
        );
      })
    : [];

  const importedHasRealOptions = imported.some((variant) => {
    const optionValues = [
      String(variant.option1_value || "").trim(),
      String(variant.option2_value || "").trim(),
      String(variant.option3_value || "").trim(),
    ].filter(Boolean);
    if (optionValues.length === 0) return false;
    return optionValues.some(
      (value) => !/^(default title|default)$/i.test(String(value || "").trim())
    );
  });

  if (imported.length > 0 && importedHasRealOptions) return imported;

  const fallback = buildFallbackVariants(product);
  return fallback.length > 0 ? fallback : [{}];
};

const inferShopifyProductCategory = (product: ImportedProduct) => {
  const blob = [
    product.category,
    product.product_type,
    product.name,
    product.description,
    Array.isArray(product.colors) ? product.colors.join(" ") : "",
  ]
    .map((entry) => String(entry || "").toLowerCase())
    .join(" ");

  if (
    /\b(t-?shirt|shirt|tank|hoodie|sweatshirt|jersey|top)\b/.test(blob)
  ) {
    return "Apparel & Accessories > Clothing > Shirts & Tops";
  }
  if (/\b(shorts?)\b/.test(blob)) {
    return "Apparel & Accessories > Clothing > Shorts";
  }
  if (/\b(pants?|trousers?|joggers?|leggings?)\b/.test(blob)) {
    return "Apparel & Accessories > Clothing > Pants";
  }
  if (/\b(shoes?|sneakers?|boots?|cleats?|studs?)\b/.test(blob)) {
    return "Apparel & Accessories > Shoes";
  }
  if (/\b(gloves?)\b/.test(blob)) {
    return "Apparel & Accessories > Clothing Accessories > Gloves & Mittens";
  }
  if (/\b(socks?)\b/.test(blob)) {
    return "Apparel & Accessories > Clothing > Socks & Hosiery";
  }
  if (/\b(hat|cap|beanie)\b/.test(blob)) {
    return "Apparel & Accessories > Clothing Accessories > Hats";
  }
  if (/\b(bag|backpack|duffel)\b/.test(blob)) {
    return "Apparel & Accessories > Handbags, Wallets & Cases";
  }
  if (/\b(ball|football|soccer ball|basketball|volleyball)\b/.test(blob)) {
    return "Sporting Goods > Athletics";
  }
  if (
    /\b(protein|whey|creatine|bcaa|pre-?workout|supplement|vitamin|collagen)\b/.test(
      blob
    )
  ) {
    return "Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements";
  }
  if (/\b(perfume|cologne|fragrance)\b/.test(blob)) {
    return "Health & Beauty > Personal Care > Cosmetics > Perfumes & Colognes";
  }

  return "";
};

const SPORT_TAG_RULES: Array<{
  pattern: RegExp;
  sportTag: string;
  smartCollectionTag: string;
}> = [
  {
    pattern: /\b(football|soccer|futbol|futsal)\b/,
    sportTag: "football",
    smartCollectionTag: "football-kit",
  },
  {
    pattern: /\b(basketball|nba)\b/,
    sportTag: "basketball",
    smartCollectionTag: "basketball-kit",
  },
];

const inferSportSmartSkuBase = (product: ImportedProduct) => {
  const blob = [
    product.name,
    product.description,
    product.category,
    product.product_type,
    product.source_url,
  ]
    .map((entry) => String(entry || "").toLowerCase())
    .join(" ");

  const matched = SPORT_TAG_RULES.find((rule) => rule.pattern.test(blob));
  return matched?.smartCollectionTag || "";
};

const inferSmartCollectionTags = (product: ImportedProduct) => {
  const blob = [
    product.name,
    product.description,
    product.category,
    product.product_type,
    product.source_url,
    Array.isArray(product.colors) ? product.colors.join(" ") : "",
  ]
    .map((entry) => String(entry || "").toLowerCase())
    .join(" ");

  const tags = new Set<string>();

  SPORT_TAG_RULES.forEach((rule) => {
    if (!rule.pattern.test(blob)) return;
    tags.add(rule.sportTag);
    tags.add(`sport-${rule.sportTag}`);
    // Always add this exact tag so Shopify condition "Tag is equal to ..." works.
    tags.add(rule.smartCollectionTag);
  });

  const looksLikeKit =
    /\b(kit|uniform|set|jersey|matchwear)\b/.test(blob) ||
    (/\b(football|soccer|basketball)\b/.test(blob) &&
      /\b(jersey|shorts?)\b/.test(blob));

  if (looksLikeKit) {
    tags.add("kit");
    tags.add("product-kit");
  }

  return Array.from(tags);
};

const csvEscape = (value: CsvCell) => {
  const raw = String(value ?? "");
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const toShopifyRows = (product: ImportedProduct, options: ExportOptions) => {
  const title = String(product.name || "").trim();
  const handle = slugify(title);
  const colors = Array.isArray(product.colors)
    ? product.colors.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  const parsedStock = Number(product.stock);
  const hasStock = Number.isFinite(parsedStock) && parsedStock >= 0;
  const tags = Array.from(
    new Set([
      ...[product.brand, product.category, product.product_type, ...colors]
        .map((entry) => String(entry || "").trim())
        .filter(Boolean),
      ...inferSmartCollectionTags(product),
    ])
  ).join(", ");

  const shopifyProductCategory = inferShopifyProductCategory(product);
  const variants = getProductVariants(product);
  const smartSkuBase = inferSportSmartSkuBase(product);

  return variants.map((variant, index) => {
    const row: Record<string, CsvCell> = {};
    SHOPIFY_HEADERS.forEach((header) => {
      row[header] = "";
    });

    const variantOptionNames = [
      optionNameByPosition(variant, 1),
      optionNameByPosition(variant, 2),
      optionNameByPosition(variant, 3),
    ];
    const variantOptionValues = [
      optionValueByPosition(variant, 1),
      optionValueByPosition(variant, 2),
      optionValueByPosition(variant, 3),
    ];

    const optionNames = variantOptionNames.map((name, optionIndex) => {
      if (name) return name;
      const value = variantOptionValues[optionIndex];
      if (!value) return "";
      if (optionIndex === 0) {
        const sizeValues = unique(Array.isArray(product.sizes) ? product.sizes : []);
        if (sizeValues.includes(value)) return "Size";
      }
      return `Option ${optionIndex + 1}`;
    });

    row["Title"] = index === 0 ? title : "";
    row["URL handle"] = handle;
    row["Description"] = index === 0 ? String(product.description || "").trim() : "";
    row["Vendor"] = index === 0 ? String(product.brand || "").trim() : "";
    row["Product category"] = index === 0 ? shopifyProductCategory : "";
    row["Type"] = index === 0 ? String(product.product_type || "").trim() : "";
    // Keep tags on every variant row so Shopify doesn't drop them on import updates.
    row["Tags"] = tags;
    row["Published on online store"] = "TRUE";
    row["Status"] = "active";
    const sizeForSku = String(variantOptionValues[0] || "").trim();
    const computedSku = smartSkuBase
      ? `${smartSkuBase}${sizeForSku ? `-${slugify(sizeForSku)}` : ""}`
      : String(variant.sku || product.sku || handle).trim();
    row["SKU"] = computedSku;
    row["Barcode"] = String(variant.barcode || "").trim();
    row["Option1 name"] = optionNames[0] || "";
    row["Option1 value"] = variantOptionValues[0] || "";
    row["Option2 name"] = optionNames[1] || "";
    row["Option2 value"] = variantOptionValues[1] || "";
    row["Option3 name"] = optionNames[2] || "";
    row["Option3 value"] = variantOptionValues[2] || "";
    row["Option1 Linked To"] = isColorOptionName(optionNames[0])
      ? "product.metafields.shopify.color-pattern"
      : "";
    row["Option2 Linked To"] = isColorOptionName(optionNames[1])
      ? "product.metafields.shopify.color-pattern"
      : "";
    row["Option3 Linked To"] = isColorOptionName(optionNames[2])
      ? "product.metafields.shopify.color-pattern"
      : "";

    row["Price"] = formatPrice(Number(variant.price) || product.price);
    const variantCompareAt = Number(variant.original_price);
    const variantPrice = Number(variant.price) || Number(product.price);
    const productCompareAt = Number(product.original_price);
    row["Compare-at price"] =
      variantCompareAt > variantPrice
        ? formatPrice(variantCompareAt)
        : productCompareAt > variantPrice
          ? formatPrice(productCompareAt)
          : "";
    row["Charge tax"] =
      typeof variant.charge_tax === "boolean"
        ? variant.charge_tax
          ? "TRUE"
          : "FALSE"
        : "TRUE";

    const variantStock = Number(variant.stock);
    const hasVariantStock = Number.isFinite(variantStock) && variantStock >= 0;
    const inventoryQuantity = hasVariantStock
      ? Math.round(variantStock)
      : hasStock
        ? Math.round(parsedStock)
        : "";
    if (options.disableInventoryTracking) {
      row["Inventory tracker"] = "";
      row["Inventory quantity"] = "";
      row["Fulfillment service"] = "manual";
    } else {
      row["Inventory tracker"] = inventoryQuantity === "" ? "" : "shopify";
      row["Inventory quantity"] = inventoryQuantity;
      row["Fulfillment service"] = "manual";
    }
    row["Continue selling when out of stock"] = "DENY";
    row["Weight value (grams)"] =
      Number.isFinite(Number(variant.weight_grams)) && Number(variant.weight_grams) > 0
        ? Number(variant.weight_grams)
        : "";
    row["Weight unit for display"] = "g";
    row["Requires shipping"] =
      typeof variant.requires_shipping === "boolean"
        ? variant.requires_shipping
          ? "TRUE"
          : "FALSE"
        : "TRUE";

    row["Product image URL"] = index === 0 ? String(product.image_url || "").trim() : "";
    row["Image position"] = index === 0 ? 1 : "";
    row["Image alt text"] = index === 0 && title ? `${title} image` : "";
    row["Variant image URL"] = String(variant.image_url || "").trim();
    row["Gift card"] = index === 0 ? "FALSE" : "";
    row["SEO title"] = index === 0 ? title : "";
    row["SEO description"] = index === 0 ? String(product.description || "").trim() : "";
    row["Color (product.metafields.shopify.color-pattern)"] =
      index === 0 ? colors.join("; ") : "";
    row["Google Shopping / Google product category"] =
      index === 0 ? shopifyProductCategory : "";
    row["Google Shopping / Manufacturer part number (MPN)"] = String(
      computedSku || variant.sku || product.sku || ""
    ).trim();
    row["Google Shopping / Condition"] = "New";
    row["Google Shopping / Custom product"] = "FALSE";

    return row;
  });
};

const buildCsv = (products: ImportedProduct[], options: ExportOptions) => {
  const rows = products.flatMap((product) => toShopifyRows(product, options));
  const headerLine = SHOPIFY_HEADERS.map(csvEscape).join(",");
  const bodyLines = rows.map((row) =>
    SHOPIFY_HEADERS.map((header) => csvEscape(row[header])).join(",")
  );
  return [headerLine, ...bodyLines].join("\n");
};

export function AdminShopify() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [products, setProducts] = useState<ImportedProduct[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
    new Set()
  );
  const [disableInventoryTracking, setDisableInventoryTracking] = useState(true);

  const selectedProducts = useMemo(
    () => products.filter((_, index) => selectedIndexes.has(index)),
    [products, selectedIndexes]
  );
  const allSelected = products.length > 0 && selectedIndexes.size === products.length;

  const handleConvert = async () => {
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl) {
      setError("Please add a URL first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/import-products-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      const payload = (await response.json().catch(() => ({}))) as ImportResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Could not import products from this URL.");
      }

      const importedProducts = Array.isArray(payload.products)
        ? payload.products
        : [];
      if (importedProducts.length === 0) {
        throw new Error("No products were found to convert.");
      }

      setProducts(importedProducts);
      setSelectedIndexes(new Set(importedProducts.map((_, index) => index)));
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Failed to convert URL.";
      setProducts([]);
      setSelectedIndexes(new Set());
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (selectedProducts.length === 0) return;
    const csv = buildCsv(selectedProducts, {
      disableInventoryTracking,
    });
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "shopify_products_import.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const toggleSelection = (index: number) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIndexes(new Set(products.map((_, index) => index)));
  };

  const clearAll = () => {
    setSelectedIndexes(new Set());
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-semibold text-gray-900">Shopify CSV Converter</h1>
          <p className="text-sm text-gray-600 mt-2">
            Paste a product or collection URL, convert products into Shopify template
            format, then download the CSV.
          </p>

          <div className="mt-6 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <LinkIcon
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://example.com/collections/all"
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
              />
            </div>
            <button
              type="button"
              onClick={handleConvert}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-black text-white px-5 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? "Converting..." : "Convert"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={selectedProducts.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-900 px-5 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              <Download size={16} />
              Download Selected CSV
            </button>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={disableInventoryTracking}
              onChange={(event) =>
                setDisableInventoryTracking(event.target.checked)
              }
            />
            Disable inventory tracking for all selected items
            (leave <span className="font-medium">Inventory tracker</span> empty)
          </label>

          {error ? (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          ) : null}

          {products.length > 0 ? (
            <p className="mt-4 text-sm text-green-700 flex flex-wrap items-center gap-2">
              <span>
                Converted {products.length} product{products.length === 1 ? "" : "s"}.
              </span>
              <span>
                Selected {selectedProducts.length} of {products.length}.
              </span>
              <button
                type="button"
                onClick={selectAll}
                className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
            </p>
          ) : null}
        </div>

        {products.length > 0 ? (
          <div className="rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">All Products</h2>
            <p className="text-sm text-gray-600 mt-1">
              Choose exactly what to include in the exported CSV.
            </p>

            <div className="mt-4 overflow-x-auto max-h-[65vh]">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200">
                    <th className="py-2 pr-4 font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) => {
                          if (event.target.checked) {
                            selectAll();
                          } else {
                            clearAll();
                          }
                        }}
                        aria-label="Select all products"
                      />
                    </th>
                    <th className="py-2 pr-4 font-medium text-gray-700">Title</th>
                    <th className="py-2 pr-4 font-medium text-gray-700">Vendor</th>
                    <th className="py-2 pr-4 font-medium text-gray-700">Price</th>
                    <th className="py-2 pr-4 font-medium text-gray-700">SKU</th>
                    <th className="py-2 pr-4 font-medium text-gray-700">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr key={`${product.name}-${index}`} className="border-b border-gray-100">
                      <td className="py-2 pr-4">
                        <input
                          type="checkbox"
                          checked={selectedIndexes.has(index)}
                          onChange={() => toggleSelection(index)}
                          aria-label={`Select ${product.name}`}
                        />
                      </td>
                      <td className="py-2 pr-4 text-gray-900">{product.name}</td>
                      <td className="py-2 pr-4 text-gray-700">{product.brand || "-"}</td>
                      <td className="py-2 pr-4 text-gray-700">
                        {formatPrice(product.price) || "-"}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">{product.sku || "-"}</td>
                      <td className="py-2 pr-4 text-gray-700">
                        {Number.isFinite(Number(product.stock))
                          ? Math.max(0, Math.round(Number(product.stock)))
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
