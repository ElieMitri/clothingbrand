const truncate = (value, max) =>
  String(value || "").length > max
    ? `${String(value || "").slice(0, max - 3)}...`
    : String(value || "");

const sendDiscordPayload = async (payload) => {
  const webhookUrl = String(process.env.DISCORD_ORDER_WEBHOOK_URL || "").trim();
  if (!webhookUrl) {
    throw new Error("Missing DISCORD_ORDER_WEBHOOK_URL");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      username: "LBathletes",
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(body || `HTTP ${response.status}`);
  }
};

const buildOrderDiscordPayload = (order) => {
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
    orderedAt,
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
  const orderedAtRaw = orderedAt || new Date().toISOString();
  const orderTime = new Date(String(orderedAtRaw));
  const orderedAtText = Number.isNaN(orderTime.getTime())
    ? String(orderedAtRaw)
    : orderTime.toLocaleString("en-GB", { hour12: false });
  const shortOrderId = String(orderId || "").toUpperCase().slice(0, 8) || "UNKNOWN";

  return {
    content:
      "\n━━━━━━━━━━━━━━━━━━━━━━━━\n🧾 **NEW ORDER ALERT**\n━━━━━━━━━━━━━━━━━━━━━━━━\n",
    embeds: [
      {
        color: 5763719,
        title: `Order #${shortOrderId}`,
        fields: [
          { name: "Ordered At", value: orderedAtText, inline: true },
          { name: "Customer", value: truncate(name, 256), inline: true },
          { name: "Email", value: truncate(email, 256), inline: true },
          { name: "Phone", value: truncate(phone || "Not provided", 256), inline: true },
          { name: "Subtotal", value: `$${Number(subtotal || 0).toFixed(2)}`, inline: true },
          { name: "Shipping", value: `$${Number(shipping || 0).toFixed(2)}`, inline: true },
          { name: "Tax", value: `$${Number(tax || 0).toFixed(2)}`, inline: true },
          { name: "Total", value: `$${Number(total).toFixed(2)}`, inline: true },
        ],
        description: truncate(
          [
            "**Delivery Address**",
            address || "-",
            "",
            `**Directions:** ${directions || "-"}`,
            `**City:** ${city || "-"}`,
            `**State:** ${state || "-"}`,
            `**ZIP:** ${zipCode || "-"}`,
            `**Country:** ${country || "-"}`,
          ].join("\n"),
          4096
        ),
        footer: { text: `LBathletes Orders • ${shortOrderId}` },
        timestamp: orderTime.toISOString(),
      },
      {
        color: 5793266,
        title: "Order Items",
        description: `\`\`\`\n${truncate(orderedItemsText, 3900)}\n\`\`\``,
      },
    ],
  };
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
      orderedAt,
    } = req.body || {};

    if (!orderId || !name || !email || !address || typeof total !== "number") {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const payload = buildOrderDiscordPayload({
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
      orderedAt,
    });
    await sendDiscordPayload(payload);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Discord order notify error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
