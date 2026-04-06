const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; LBathletesImporter/1.0; +https://lbathletes.com)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const MAX_PRODUCTS = 250;
const MAX_DETAIL_PAGES = 120;
const MAX_LISTING_PAGES = 8;
const SHOPIFY_PAGE_SIZE = 250;

const normalizeWhitespace = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const stripHtml = (value) =>
  normalizeWhitespace(String(value || "").replace(/<[^>]*>/g, " "));

const parseNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value || "")
    .replace(/,/g, "")
    .match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
};

const uniqueNonEmpty = (values) =>
  Array.from(
    new Set(
      toArray(values)
        .map((entry) => normalizeWhitespace(entry))
        .filter(Boolean)
    )
  );

const collectTextSnippets = (value, bucket = []) => {
  if (!value) return bucket;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectTextSnippets(entry, bucket));
    return bucket;
  }
  if (typeof value === "string" || typeof value === "number") {
    const normalized = normalizeWhitespace(String(value));
    if (normalized) bucket.push(normalized);
    return bucket;
  }
  if (typeof value !== "object") return bucket;

  Object.values(value).forEach((entry) => collectTextSnippets(entry, bucket));
  return bucket;
};

const sanitizeUrl = (candidate, baseUrl) => {
  const raw = String(candidate || "").trim();
  if (!raw) return "";
  try {
    const next = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
    if (!["http:", "https:"].includes(next.protocol)) return "";
    return next.toString();
  } catch {
    return "";
  }
};

const extractMeta = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(expression);
  return normalizeWhitespace(match?.[1] || "");
};

const parseJsonLdBlocks = (html) => {
  const blocks = [];
  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match = regex.exec(html);
  while (match) {
    const raw = String(match[1] || "").trim();
    if (raw) {
      try {
        blocks.push(JSON.parse(raw));
      } catch {
        // Some websites include invalid JSON-LD; skip.
      }
    }
    match = regex.exec(html);
  }
  return blocks;
};

const readBalancedJsonSlice = (text, startIndex) => {
  const start = Number(startIndex);
  const startChar = text[start];
  if (start < 0 || !["{", "["].includes(startChar)) return "";

  const stack = [startChar];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }
    if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack[stack.length - 1] !== expected) return "";
      stack.pop();
      if (stack.length === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
};

const extractJsonCandidatesFromScript = (rawScript) => {
  const raw = String(rawScript || "").trim();
  if (!raw) return [];

  const candidates = [raw];
  const assignmentIndex = raw.indexOf("=");
  if (assignmentIndex >= 0) {
    candidates.push(raw.slice(assignmentIndex + 1).replace(/;+\s*$/, "").trim());
  }

  const firstObjectIndex = raw.search(/[{[]/);
  if (firstObjectIndex >= 0) {
    const balanced = readBalancedJsonSlice(raw, firstObjectIndex);
    if (balanced) candidates.push(balanced);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
};

const extractImageUrls = (value, baseUrl, bucket = []) => {
  if (!value) return bucket;

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return bucket;

    if (normalized.includes(",")) {
      normalized
        .split(",")
        .map((entry) => entry.trim().split(/\s+/)[0])
        .map((entry) => sanitizeUrl(entry, baseUrl))
        .filter(Boolean)
        .forEach((entry) => bucket.push(entry));
      return bucket;
    }

    const sanitized = sanitizeUrl(normalized, baseUrl);
    if (sanitized) bucket.push(sanitized);
    return bucket;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => extractImageUrls(entry, baseUrl, bucket));
    return bucket;
  }

  if (typeof value !== "object") return bucket;

  const likelyImageFields = [
    "url",
    "src",
    "srcset",
    "href",
    "image",
    "images",
    "featured_image",
    "thumbnail",
    "secure_url",
    "contentUrl",
  ];

  likelyImageFields.forEach((field) => {
    if (value[field]) extractImageUrls(value[field], baseUrl, bucket);
  });

  return bucket;
};

const collectSchemaEntities = (value, bucket = []) => {
  if (!value) return bucket;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSchemaEntities(entry, bucket));
    return bucket;
  }
  if (typeof value !== "object") return bucket;

  bucket.push(value);

  if (Array.isArray(value["@graph"])) {
    value["@graph"].forEach((entry) => collectSchemaEntities(entry, bucket));
  }
  if (Array.isArray(value.itemListElement)) {
    value.itemListElement.forEach((entry) => collectSchemaEntities(entry, bucket));
  }
  if (value.item) collectSchemaEntities(value.item, bucket);
  if (value.mainEntity) collectSchemaEntities(value.mainEntity, bucket);
  return bucket;
};

const hasSchemaType = (entity, typeName) => {
  const types = toArray(entity?.["@type"]).map((entry) =>
    String(entry || "").toLowerCase()
  );
  return types.includes(String(typeName || "").toLowerCase());
};

const extractProductFromEntity = (entity, baseUrl) => {
  if (!entity || typeof entity !== "object") return null;
  if (!hasSchemaType(entity, "Product")) return null;

  const offers = Array.isArray(entity.offers)
    ? entity.offers[0]
    : entity.offers || {};

  const images = toArray(entity.image)
    .map((entry) => sanitizeUrl(entry, baseUrl))
    .filter(Boolean);
  const colorValue = entity.color;
  const colors = Array.isArray(colorValue)
    ? colorValue.map((entry) => normalizeWhitespace(entry)).filter(Boolean)
    : normalizeWhitespace(colorValue)
      .split(/[|,/]/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const price =
    parseNumber(offers?.price) ||
    parseNumber(entity.price);

  const product = {
    name: normalizeWhitespace(entity.name),
    description: stripHtml(entity.description),
    brand: normalizeWhitespace(
      typeof entity.brand === "string" ? entity.brand : entity.brand?.name
    ),
    sku: normalizeWhitespace(entity.sku || entity.mpn),
    category: normalizeWhitespace(entity.category),
    product_type: normalizeWhitespace(entity.category),
    image_url: images[0] || "",
    images,
    price: price || 0,
    original_price: parseNumber(entity?.highPrice) || price || 0,
    currency: normalizeWhitespace(
      offers?.priceCurrency || entity?.priceCurrency || ""
    ),
    colors,
    source_url: sanitizeUrl(entity.url, baseUrl) || baseUrl || "",
  };

  if (!product.name) return null;
  return product;
};

const dedupeProducts = (products) => {
  const seen = new Set();
  return products.filter((product) => {
    const key = [
      normalizeWhitespace(product.name).toLowerCase(),
      normalizeWhitespace(product.sku).toLowerCase(),
      normalizeWhitespace(product.image_url).toLowerCase(),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractCandidateLinks = (html, baseUrl) => {
  const links = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match = regex.exec(html);
  while (match) {
    const absolute = sanitizeUrl(match[1], baseUrl);
    if (!absolute) {
      match = regex.exec(html);
      continue;
    }
    links.push(absolute);
    match = regex.exec(html);
  }
  return Array.from(new Set(links));
};

const looksLikeProductUrl = (urlString) => {
  const lower = String(urlString || "").toLowerCase();
  if (!lower) return false;
  if (/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/.test(lower)) return false;
  if (/\/(collections|category|categories|blogs?|about|contact|account|cart|checkout)(\/|$)/.test(lower)) {
    return false;
  }
  return (
    /\/product(s)?\//.test(lower) ||
    /\/shop\//.test(lower) ||
    /\/p\//.test(lower) ||
    /\/item(s)?\//.test(lower) ||
    /\/dp\//.test(lower) ||
    lower.includes("sku") ||
    lower.includes("item") ||
    lower.includes("product_id=") ||
    lower.includes("variant=")
  );
};

const parseCollectionContext = (sourceUrl) => {
  try {
    const parsed = new URL(sourceUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const collectionsIndex = parts.findIndex((entry) => entry === "collections");
    if (collectionsIndex < 0) {
      return { handle: "", page: 1 };
    }

    const handle = String(parts[collectionsIndex + 1] || "").trim();
    const page = Math.max(1, Number(parsed.searchParams.get("page") || 1));
    return { handle, page };
  } catch {
    return { handle: "", page: 1 };
  }
};

const buildPaginatedUrls = (sourceUrl, maxPages = MAX_LISTING_PAGES) => {
  const urls = [];
  try {
    const base = new URL(sourceUrl);
    const startPage = Math.max(1, Number(base.searchParams.get("page") || 1));
    for (let page = startPage; page < startPage + maxPages; page += 1) {
      const next = new URL(base.toString());
      next.searchParams.set("page", String(page));
      urls.push(next.toString());
    }
  } catch {
    // Ignore invalid URL; caller already validates.
  }
  return Array.from(new Set(urls));
};

const supplementKeywordRegex =
  /\b(supplement|vitamin|whey|protein|creatine|amino|bcaa|eaa|mass|pre[\s-]?workout|fat[\s-]?burner|glutamine|electrolyte|collagen|omega|liver support)\b/i;

const categoryInferenceRules = [
  { category: "Football", pattern: /\b(football|soccer|cleat|studs|goalkeeper|goalie)\b/i },
  { category: "Futsal", pattern: /\b(futsal)\b/i },
  { category: "Basketball", pattern: /\b(basketball|nba)\b/i },
  { category: "Running", pattern: /\b(running|jogging|marathon|trail[\s-]?run)\b/i },
  { category: "Boxing", pattern: /\b(boxing|boxe|punching)\b/i },
  { category: "Muay Thai", pattern: /\b(muay[\s-]?thai|thai[\s-]?boxing)\b/i },
  { category: "Padel", pattern: /\b(padel)\b/i },
  { category: "Tennis", pattern: /\b(tennis)\b/i },
  { category: "Swimming", pattern: /\b(swim|swimming|goggles|swimsuit)\b/i },
  { category: "Gym", pattern: /\b(gym|crossfit|fitness|training)\b/i },
];

const productTypeInferenceRules = [
  { type: "Boots", pattern: /\b(boots|cleat|studs)\b/i },
  { type: "Jerseys", pattern: /\b(jersey|shirt|kit)\b/i },
  { type: "Shorts", pattern: /\b(shorts)\b/i },
  { type: "Balls", pattern: /\b(ball)\b/i },
  { type: "Goalkeeper Gloves", pattern: /\b(goalkeeper|goalie|keeper)\b/i },
  { type: "Shin Guards", pattern: /\b(shin[\s-]?guard)\b/i },
  { type: "Socks", pattern: /\b(socks?)\b/i },
];

const isGenericCategoryName = (value) => {
  const slug = normalizeWhitespace(value).toLowerCase();
  return (
    !slug ||
    [
      "all",
      "general",
      "products",
      "product",
      "shop",
      "store",
      "catalog",
      "catalogue",
      "featured",
      "uncategorized",
      "misc",
      "other",
    ].includes(slug)
  );
};

const inferCategoryFromContext = (context) => {
  const normalized = normalizeWhitespace(context).toLowerCase();
  if (!normalized) return "";
  const match = categoryInferenceRules.find((entry) => entry.pattern.test(normalized));
  return match?.category || "";
};

const inferProductTypeFromContext = (context) => {
  const normalized = normalizeWhitespace(context).toLowerCase();
  if (!normalized) return "";
  const match = productTypeInferenceRules.find((entry) => entry.pattern.test(normalized));
  return match?.type || "";
};

const normalizeImportedCategory = ({
  sourceUrl,
  productType,
  title,
  tags,
}) => {
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    parsed = null;
  }

  const context = `${productType || ""} ${title || ""} ${(tags || []).join(" ")}`;
  const { handle } = parseCollectionContext(sourceUrl);

  // Muscle Madness collection imports should live under Gym.
  if (parsed?.hostname?.toLowerCase().includes("musclemadnesslb.com")) {
    if (handle === "all" || handle === "shop" || handle === "products") {
      return "Gym";
    }
  }

  if (supplementKeywordRegex.test(context)) {
    return "Gym";
  }
  if (supplementKeywordRegex.test(handle.replace(/-/g, " "))) {
    return "Gym";
  }

  const inferred = inferCategoryFromContext(
    `${context} ${handle.replace(/-/g, " ")} ${sourceUrl}`
  );
  if (inferred) return inferred;

  return normalizeWhitespace(productType) || "General";
};

const normalizeImportedTaxonomy = (entry, sourceUrl) => {
  const title = normalizeWhitespace(entry.name || "");
  const description = normalizeWhitespace(entry.description || "");
  const tagBlob = collectTextSnippets(entry.tags || []).join(" ");
  const urlBlob = normalizeWhitespace(entry.source_url || sourceUrl || "");
  const contextBlob = `${title} ${description} ${entry.category || ""} ${entry.product_type || ""} ${tagBlob} ${urlBlob}`;

  let category = normalizeWhitespace(entry.category);
  let productType = normalizeWhitespace(entry.product_type);

  if (supplementKeywordRegex.test(contextBlob)) {
    category = "Gym";
  }

  if (isGenericCategoryName(category)) {
    category = inferCategoryFromContext(contextBlob) || category;
  }

  if (!productType || isGenericCategoryName(productType)) {
    productType = inferProductTypeFromContext(contextBlob) || productType;
  }

  if (!category) {
    category = normalizeImportedCategory({
      sourceUrl,
      productType,
      title,
      tags: collectTextSnippets(entry.tags || []),
    });
  }

  return {
    category: normalizeWhitespace(category) || "General",
    product_type: normalizeWhitespace(productType),
  };
};

const collectProductLikeObjects = (value, bucket = []) => {
  if (!value) return bucket;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectProductLikeObjects(entry, bucket));
    return bucket;
  }
  if (typeof value !== "object") return bucket;

  const name = normalizeWhitespace(value.name || value.title);
  const image = value.image || value.featured_image || value.thumbnail;
  const hasPrice =
    parseNumber(value.price) !== null ||
    parseNumber(value.compare_at_price) !== null ||
    parseNumber(value.sale_price) !== null;
  const looksLikeProduct =
    name &&
    (Boolean(image) ||
      Boolean(value.handle) ||
      Boolean(value.url) ||
      Boolean(value.sku)) &&
    hasPrice;

  if (looksLikeProduct) {
    bucket.push(value);
  }

  Object.values(value).forEach((entry) => collectProductLikeObjects(entry, bucket));
  return bucket;
};

const parseProductsFromGenericScriptJson = (html, pageUrl) => {
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  const products = [];
  let match = scriptRegex.exec(html);

  while (match) {
    const raw = String(match[1] || "").trim();
    if (!raw) {
      match = scriptRegex.exec(html);
      continue;
    }

    const jsonCandidates = extractJsonCandidatesFromScript(raw);
    jsonCandidates.forEach((jsonCandidate) => {
      try {
        const parsed = JSON.parse(jsonCandidate);
        const candidates = collectProductLikeObjects(parsed);
        candidates.forEach((entry) => {
          const images = uniqueNonEmpty(extractImageUrls(
            entry.images || entry.image || entry.featured_image,
            pageUrl
          ));
          const price =
            parseNumber(entry.price) ||
            parseNumber(entry.sale_price) ||
            parseNumber(entry.variants?.[0]?.price) ||
            parseNumber(entry.price_min) ||
            0;
          const originalPrice =
            parseNumber(entry.compare_at_price) ||
            parseNumber(entry.variants?.[0]?.compare_at_price) ||
            parseNumber(entry.price_max) ||
            price;
          const handle = normalizeWhitespace(entry.handle);
          const sourceFromHandle = handle
            ? sanitizeUrl(`/products/${handle}`, pageUrl)
            : "";

          products.push({
            name: normalizeWhitespace(entry.name || entry.title),
            description: stripHtml(entry.description || entry.body_html),
            brand: normalizeWhitespace(entry.vendor || entry.brand),
            sku: normalizeWhitespace(entry.sku || entry.variants?.[0]?.sku),
            category: normalizeWhitespace(
              entry.product_type || entry.type || entry.category
            ),
            product_type: normalizeWhitespace(
              entry.product_type || entry.type || entry.category
            ),
            image_url: images[0] || "",
            images,
            price,
            original_price: originalPrice,
            currency: normalizeWhitespace(
              entry.currency || entry.priceCurrency || ""
            ),
            colors: uniqueNonEmpty(entry.color || entry.colors || []),
            source_url: sanitizeUrl(entry.url, pageUrl) || sourceFromHandle || pageUrl,
          });
        });
      } catch {
        // Not valid JSON; ignore this candidate.
      }
    });

    match = scriptRegex.exec(html);
  }

  return dedupeProducts(products);
};

const parseProductsFromHtmlCards = (html, pageUrl) => {
  const cards = [];
  const cardRegex =
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match = cardRegex.exec(html);

  while (match) {
    const href = sanitizeUrl(match[1], pageUrl);
    const block = String(match[2] || "");
    const imgMatch =
      block.match(/<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/i) ||
      block.match(/data-image=["']([^"']+)["']/i);
    const headingMatch = block.match(/<(h1|h2|h3|h4|span)[^>]*>([^<]{3,})<\/\1>/i);
    const titleAttrMatch = block.match(/title=["']([^"']{3,})["']/i);
    const name = normalizeWhitespace(headingMatch?.[2] || titleAttrMatch?.[1] || "");
    const priceMatch = block.match(/([$€£]\s?\d[\d.,]*)|(\d[\d.,]*\s?(USD|EUR|LBP))/i);
    const dataPriceMatch = block.match(/data-(?:price|amount)=["']([^"']+)["']/i);

    if (!href || !name) {
      match = cardRegex.exec(html);
      continue;
    }

    const parsedPrice =
      parseNumber(priceMatch?.[0]) ||
      parseNumber(dataPriceMatch?.[1]) ||
      0;
    if (parsedPrice <= 0) {
      match = cardRegex.exec(html);
      continue;
    }

    const imageUrl = sanitizeUrl(imgMatch?.[1], pageUrl);

    cards.push({
      name,
      description: "",
      brand: "",
      sku: "",
      category: "",
      product_type: "",
      image_url: imageUrl,
      images: imageUrl ? [imageUrl] : [],
      price: parsedPrice,
      original_price: parsedPrice,
      currency: "",
      colors: [],
      source_url: href,
    });

    match = cardRegex.exec(html);
  }

  return dedupeProducts(cards);
};

const fetchShopifyProducts = async (sourceUrl) => {
  const base = new URL(sourceUrl).origin;
  const { handle, page } = parseCollectionContext(sourceUrl);
  const all = [];

  const mapShopifyProduct = (entry) => {
    const images = Array.isArray(entry.images)
      ? entry.images
          .map((item) => sanitizeUrl(item?.src || item, base))
          .filter(Boolean)
      : [];
    const firstVariant = Array.isArray(entry.variants) ? entry.variants[0] : {};
    return {
      name: normalizeWhitespace(entry.title),
      description: stripHtml(entry.body_html),
      brand: normalizeWhitespace(entry.vendor),
      sku: normalizeWhitespace(firstVariant?.sku),
      category: normalizeImportedCategory({
        sourceUrl,
        productType: entry.product_type,
        title: entry.title,
        tags: Array.isArray(entry.tags)
          ? entry.tags
          : String(entry.tags || "")
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
      }),
      product_type: normalizeWhitespace(entry.product_type),
      image_url: images[0] || "",
      images,
      price: parseNumber(firstVariant?.price) || 0,
      original_price:
        parseNumber(firstVariant?.compare_at_price) ||
        parseNumber(firstVariant?.price) ||
        0,
      currency: "",
      colors: [],
      source_url: sanitizeUrl(`/products/${entry.handle}`, base) || sourceUrl,
    };
  };

  if (handle) {
    let currentPage = page;
    for (let i = 0; i < MAX_LISTING_PAGES; i += 1) {
      const endpoint = `${base}/collections/${handle}/products.json?limit=${SHOPIFY_PAGE_SIZE}&page=${currentPage}`;
      const response = await fetch(endpoint, {
        headers: DEFAULT_HEADERS,
        redirect: "follow",
      });
      if (!response.ok) break;
      const payload = await response.json().catch(() => ({}));
      const products = Array.isArray(payload?.products) ? payload.products : [];
      if (products.length === 0) break;
      all.push(...products.map(mapShopifyProduct));
      if (products.length < SHOPIFY_PAGE_SIZE || all.length >= MAX_PRODUCTS) break;
      currentPage += 1;
    }
  } else {
    const endpoint = `${base}/products.json?limit=${SHOPIFY_PAGE_SIZE}`;
    const response = await fetch(endpoint, {
      headers: DEFAULT_HEADERS,
      redirect: "follow",
    });
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      const products = Array.isArray(payload?.products) ? payload.products : [];
      all.push(...products.map(mapShopifyProduct));
    }
  }

  return dedupeProducts(all).slice(0, MAX_PRODUCTS);
};

const parseProductsFromHtml = (html, pageUrl) => {
  const entities = parseJsonLdBlocks(html).flatMap((entry) =>
    collectSchemaEntities(entry)
  );
  const directProducts = entities
    .map((entity) => extractProductFromEntity(entity, pageUrl))
    .filter(Boolean);
  const scriptJsonProducts = parseProductsFromGenericScriptJson(html, pageUrl);
  const htmlCardProducts = parseProductsFromHtmlCards(html, pageUrl);
  const combinedProducts = dedupeProducts([
    ...directProducts,
    ...scriptJsonProducts,
    ...htmlCardProducts,
  ]);
  if (combinedProducts.length > 0) return combinedProducts;

  const ogTitle = extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
  const ogDescription =
    extractMeta(html, "og:description") || extractMeta(html, "description");
  const ogImage = extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
  const amount = parseNumber(
    extractMeta(html, "product:price:amount") ||
      extractMeta(html, "twitter:data1") ||
      ""
  );
  const currency =
    extractMeta(html, "product:price:currency") ||
    extractMeta(html, "twitter:label1");

  if (!ogTitle) return [];

  return [
    {
      name: ogTitle,
      description: ogDescription,
      brand: "",
      sku: "",
      category: "",
      product_type: "",
      image_url: sanitizeUrl(ogImage, pageUrl),
      images: sanitizeUrl(ogImage, pageUrl)
        ? [sanitizeUrl(ogImage, pageUrl)]
        : [],
      price: amount || 0,
      original_price: amount || 0,
      currency: normalizeWhitespace(currency),
      colors: [],
      source_url: pageUrl,
    },
  ];
};

const fetchHtml = async (url) => {
  const response = await fetch(url, {
    headers: DEFAULT_HEADERS,
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Could not fetch URL (${response.status})`);
  }
  return response.text();
};

const ensureSafePublicUrl = (url) => {
  const parsed = new URL(url);
  const lowerHost = parsed.hostname.toLowerCase();
  const blockedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "metadata.google.internal",
  ]);
  if (blockedHosts.has(lowerHost) || lowerHost.endsWith(".local")) {
    throw new Error("Blocked hostname");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP(S) URLs are allowed");
  }
};

const enrichImportedProduct = (entry, sourceUrl) => {
  const taxonomy = normalizeImportedTaxonomy(entry, sourceUrl);
  const images = uniqueNonEmpty(
    toArray(entry.images)
      .map((url) => sanitizeUrl(url, sourceUrl))
      .filter(Boolean)
  );
  const imageUrl = sanitizeUrl(entry.image_url, sourceUrl) || images[0] || "";
  const parsedPrice = Number(entry.price || 0);
  const price = Number.isFinite(parsedPrice) ? Math.max(parsedPrice, 0) : 0;
  const parsedOriginalPrice = Number(entry.original_price || entry.price || 0);
  const originalPrice = Number.isFinite(parsedOriginalPrice)
    ? Math.max(parsedOriginalPrice, price)
    : price;

  return {
    name: normalizeWhitespace(entry.name),
    description: normalizeWhitespace(entry.description),
    brand: normalizeWhitespace(entry.brand),
    sku: normalizeWhitespace(entry.sku),
    category: taxonomy.category,
    product_type: taxonomy.product_type,
    image_url: imageUrl,
    images: imageUrl && images.length === 0 ? [imageUrl] : images,
    price,
    original_price: originalPrice,
    currency: normalizeWhitespace(entry.currency),
    colors: uniqueNonEmpty(entry.colors),
    source_url: sanitizeUrl(entry.source_url, sourceUrl) || sourceUrl,
  };
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sourceUrl = String(req.body?.url || "").trim();
    if (!sourceUrl) {
      return res.status(400).json({ error: "Missing URL" });
    }

    ensureSafePublicUrl(sourceUrl);

    let parsedProducts = await fetchShopifyProducts(sourceUrl);
    if (parsedProducts.length >= 1) {
      parsedProducts = parsedProducts.slice(0, MAX_PRODUCTS);
    }

    const listingUrls = buildPaginatedUrls(sourceUrl);
    const discovered = [];
    const detailCandidates = [];

    for (const listingUrl of listingUrls) {
      try {
        const listingHtml = await fetchHtml(listingUrl);
        const fromListing = parseProductsFromHtml(listingHtml, listingUrl);
        if (fromListing.length > 0) discovered.push(...fromListing);

        const candidateLinks = extractCandidateLinks(listingHtml, listingUrl).filter(
          looksLikeProductUrl
        );
        detailCandidates.push(...candidateLinks);
      } catch {
        // Skip failed listing pages.
      }
      if (dedupeProducts(discovered).length >= MAX_PRODUCTS) break;
    }

    if (discovered.length > 0) {
      parsedProducts = dedupeProducts([...parsedProducts, ...discovered]).slice(
        0,
        MAX_PRODUCTS
      );
    }

    if (parsedProducts.length < 20 && detailCandidates.length > 0) {
      const uniqueDetailLinks = Array.from(new Set(detailCandidates)).slice(
        0,
        MAX_DETAIL_PAGES
      );
      for (const detailUrl of uniqueDetailLinks) {
        try {
          const detailHtml = await fetchHtml(detailUrl);
          const detailProducts = parseProductsFromHtml(detailHtml, detailUrl);
          if (detailProducts.length > 0) discovered.push(...detailProducts);
          if (dedupeProducts(discovered).length >= MAX_PRODUCTS) break;
        } catch {
          // Skip individual detail pages that fail.
        }
      }
      parsedProducts = dedupeProducts([...parsedProducts, ...discovered]).slice(
        0,
        MAX_PRODUCTS
      );
    }

    const limitedProducts = parsedProducts
      .slice(0, MAX_PRODUCTS)
      .map((entry) => enrichImportedProduct(entry, sourceUrl))
      .filter((entry) => Boolean(entry.name));

    if (limitedProducts.length === 0) {
      return res.status(422).json({
        error:
          "No products were detected on that page. Try a product or collection URL that contains product metadata.",
      });
    }

    return res.status(200).json({
      success: true,
      source_url: sourceUrl,
      count: limitedProducts.length,
      products: limitedProducts,
    });
  } catch (error) {
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to import from URL",
    });
  }
}
