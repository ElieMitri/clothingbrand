const normalizeWhitespace = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const buildSearchImageUrl = (product, index = 0) => {
  const name = normalizeWhitespace(product?.name);
  const category = normalizeWhitespace(product?.category);
  const seed = encodeURIComponent(
    normalizeWhitespace([name, category, String(index || 0)].filter(Boolean).join("-")).slice(
      0,
      120
    )
  );
  return `https://picsum.photos/seed/${seed}/1200/1200`;
};

const withConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;

  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        const fallbackName = normalizeWhitespace(items[index]?.name || "Product");
        const fallbackSeed = encodeURIComponent(`${fallbackName}-${index}`);
        results[index] = {
          image_url: `https://picsum.photos/seed/${fallbackSeed}/1200/1200`,
          source: "error",
          error: error instanceof Error ? error.message : "Unknown image lookup error",
        };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, limit) }, () => run()));
  return results;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const products = Array.isArray(req.body?.products) ? req.body.products : [];
    if (products.length === 0) {
      return res.status(400).json({ error: "No products provided" });
    }

    const cappedProducts = products.slice(0, 400);
    const images = await withConcurrency(cappedProducts, 1, async (product, index) => ({
      image_url: buildSearchImageUrl(product, index),
      source: "picsum-seeded",
    }));

    return res.status(200).json({
      success: true,
      count: images.length,
      images,
    });
  } catch (error) {
    console.error("fetch-product-images error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch product images",
    });
  }
}
