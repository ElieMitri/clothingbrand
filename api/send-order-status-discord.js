const truncate = (value, max) =>
  String(value || "").length > max
    ? `${String(value || "").slice(0, max - 3)}...`
    : String(value || "");

const getWebhookByAction = (action) => {
  if (action === "cancelled") {
    return String(process.env.DISCORD_CANCEL_WEBHOOK_URL || "").trim();
  }
  return "";
};

const sendDiscordPayload = async (webhookUrl, payload) => {
  if (!webhookUrl) {
    throw new Error("Missing action-specific Discord webhook URL");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

const buildStatusPayload = ({
  action,
  orderId,
  name,
  userEmail,
  phone,
  city,
  country,
  total,
  subtotal,
  shipping,
  tax,
  createdAt,
  itemCount,
  items,
  reason,
}) => {
  const shortOrderId = String(orderId || "").toUpperCase().slice(0, 8) || "UNKNOWN";
  const now = new Date();
  const created = new Date(String(createdAt || ""));
  const createdText = Number.isNaN(created.getTime())
    ? "-"
    : created.toLocaleString("en-GB", { hour12: false });
  const actionLabel = "ORDER CANCELLATION";
  const accentColor = 15158332;
  const normalizedItems = Array.isArray(items) ? items : [];
  const itemsText =
    normalizedItems.length > 0
      ? normalizedItems
          .map((item, index) => {
            const itemName = String(item?.name || item?.product_name || "Item");
            const sizePart = item?.size ? ` | Size ${item.size}` : "";
            const qty = Number(item?.quantity || 0);
            const unitPrice = Number(item?.unitPrice ?? item?.price ?? 0);
            const lineTotal = unitPrice * qty;
            return `${index + 1}) ${itemName}${sizePart} | Qty ${qty} | $${lineTotal.toFixed(
              2
            )}`;
          })
          .join("\n")
      : "- No items";

  return {
    content: `\n━━━━━━━━━━━━━━━━━━━━━━━━\n⚠️ **${actionLabel}**\n━━━━━━━━━━━━━━━━━━━━━━━━\n`,
    embeds: [
      {
        color: accentColor,
        title: `Order #${shortOrderId}`,
        fields: [
          { name: "Action", value: actionLabel, inline: true },
          { name: "Customer", value: truncate(name || "Not provided", 256), inline: true },
          { name: "User Email", value: truncate(userEmail || "Unknown", 256), inline: true },
          { name: "Phone", value: truncate(phone || "Not provided", 256), inline: true },
          { name: "Subtotal", value: `$${Number(subtotal || 0).toFixed(2)}`, inline: true },
          { name: "Shipping", value: `$${Number(shipping || 0).toFixed(2)}`, inline: true },
          { name: "Tax", value: `$${Number(tax || 0).toFixed(2)}`, inline: true },
          { name: "Total", value: `$${Number(total || 0).toFixed(2)}`, inline: true },
          { name: "Items", value: String(Number(itemCount || 0)), inline: true },
          { name: "Order Created", value: createdText, inline: true },
          { name: "Action Time", value: now.toLocaleString("en-GB", { hour12: false }), inline: true },
        ],
        description: truncate(
          [
            "**Location Details**",
            `City: ${city || "-"}`,
            `Country: ${country || "-"}`,
            reason ? "" : "",
            reason ? `**Note:** ${reason}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          4000
        ),
        footer: { text: `LBathletes • ${shortOrderId}` },
        timestamp: now.toISOString(),
      },
      {
        color: 5793266,
        title: "Order Items",
        description: `\`\`\`\n${truncate(itemsText, 3900)}\n\`\`\``,
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
      action,
      orderId,
      name,
      userEmail,
      phone,
      city,
      country,
      total,
      subtotal,
      shipping,
      tax,
      createdAt,
      itemCount,
      items,
      reason,
    } = req.body || {};

    if (!action || !orderId || typeof total !== "number") {
      return res.status(400).json({ error: "Invalid payload" });
    }

    if (action !== "cancelled") {
      return res.status(400).json({ error: "Unsupported action" });
    }

    const webhookUrl = getWebhookByAction(action);
    const payload = buildStatusPayload({
      action,
      orderId,
      name,
      userEmail,
      phone,
      city,
      country,
      total,
      subtotal,
      shipping,
      tax,
      createdAt,
      itemCount,
      items,
      reason,
    });
    await sendDiscordPayload(webhookUrl, payload);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Discord order-status notify error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
