const sendTelegramText = async (text) => {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();

  if (!token || !chatId) {
    throw new Error(
      `Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID (tokenPresent=${Boolean(
        token
      )}, tokenLen=${token.length}, chatPresent=${Boolean(
        chatId
      )}, chatLen=${chatId.length})`
    );
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const reason = data?.description || `HTTP ${response.status}`;
    throw new Error(reason);
  }
};

const buildOrderTelegramMessage = (order) => {
  const {
    orderId,
    name,
    email,
    address,
    phone,
    directions,
    city,
    state,
    zipCode,
    country,
    subtotal,
    shipping,
    tax,
    total,
    items,
  } = order;

  const normalizedItems = Array.isArray(items) ? items : [];
  const orderedItemsText =
    normalizedItems.length > 0
      ? normalizedItems
          .map((item, index) => {
            const itemName = String(item?.name || "Item");
            const sizePart = item?.size ? ` | Size ${item.size}` : "";
            const qty = Number(item?.quantity || 0);
            const unitPrice = Number(item?.unitPrice || 0);
            const lineTotal = unitPrice * qty;
            return `${index + 1}) ${itemName}${sizePart} | Qty ${qty} | $${lineTotal.toFixed(
              2
            )}`;
          })
          .join("\n")
      : "- No items";
  const orderedAtRaw = order.orderedAt || new Date().toISOString();
  const orderedAt = new Date(String(orderedAtRaw));
  const orderedAtText = Number.isNaN(orderedAt.getTime())
    ? String(orderedAtRaw)
    : orderedAt.toLocaleString("en-GB", { hour12: false });

  return [
    "New Order Received",
    `Order ID: ${orderId}`,
    `Ordered At: ${orderedAtText}`,
    `Customer: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || "Not provided"}`,
    `Subtotal: $${Number(subtotal || 0).toFixed(2)}`,
    `Shipping: $${Number(shipping || 0).toFixed(2)}`,
    `Tax: $${Number(tax || 0).toFixed(2)}`,
    `Total: $${Number(total).toFixed(2)}`,
    "",
    "Delivery Address:",
    `${address}`,
    "",
    `Directions: ${directions || "-"}`,
    `City: ${city || "-"}`,
    `State: ${state || "-"}`,
    `ZIP: ${zipCode || "-"}`,
    `Country: ${country || "-"}`,
    "",
    "Order Items:",
    orderedItemsText,
  ].join("\n");
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      orderId,
      name,
      email,
      address,
      phone,
      directions,
      city,
      state,
      zipCode,
      country,
      subtotal,
      shipping,
      tax,
      total,
      items,
    } = req.body || {};

    if (!orderId || !name || !email || !address || typeof total !== "number") {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const text = buildOrderTelegramMessage({
      orderId,
      name,
      email,
      address,
      phone,
      directions,
      city,
      state,
      zipCode,
      country,
      subtotal,
      shipping,
      tax,
      total,
      items,
    });
    await sendTelegramText(text);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Telegram order notify error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({
      error: message,
    });
  }
}
