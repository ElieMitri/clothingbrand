import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();

app.use(cors());
app.use(express.json());

const truncate = (value, max) =>
  String(value || "").length > max
    ? `${String(value || "").slice(0, max - 3)}...`
    : String(value || "");

const sendDiscordPayload = async (payload, webhookUrlOverride) => {
  const webhookUrl = String(
    webhookUrlOverride || process.env.DISCORD_ORDER_WEBHOOK_URL || ""
  ).trim();
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
        timestamp: orderedAt.toISOString(),
      },
      {
        color: 5793266,
        title: "Order Items",
        description: `\`\`\`\n${truncate(orderedItemsText, 3900)}\n\`\`\``,
      },
    ],
  };
};

const sendNewsletter = async (req, res) => {
  try {
    const { subject, message, recipients } = req.body;

    // Basic validation
    if (
      !subject ||
      !message ||
      !Array.isArray(recipients) ||
      recipients.length === 0
    ) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing RESEND_API_KEY" });
    }

    const fromAddress =
      process.env.NEWSLETTER_FROM || "LBathletes <onboarding@resend.dev>";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
    const uniqueRecipients = Array.from(
      new Set(
        recipients
          .map((email) => String(email || "").trim().toLowerCase())
          .filter((email) => emailRegex.test(email))
      )
    );

    if (uniqueRecipients.length === 0) {
      return res.status(400).json({ error: "No valid recipients provided" });
    }

    const escapeHtml = (text) =>
      String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const htmlBody = `<div style="font-family: Arial, sans-serif; line-height:1.6; color:#0f172a;">${escapeHtml(
      message
    ).replace(/\n/g, "<br />")}</div>`;

    const failedRecipients = [];
    let sentCount = 0;
    const concurrency = 10;

    for (let i = 0; i < uniqueRecipients.length; i += concurrency) {
      const slice = uniqueRecipients.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        slice.map(async (recipient) => {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromAddress,
              to: [recipient],
              subject,
              html: htmlBody,
            }),
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `Send failed for ${recipient}`);
          }

          return recipient;
        })
      );

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          sentCount += 1;
        } else {
          failedRecipients.push({
            email: slice[index],
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason || "Unknown error"),
          });
        }
      });
    }

    if (sentCount === 0) {
      return res.status(500).json({
        error:
          "Newsletter failed for all recipients. Verify your Resend domain/sender settings.",
        sent_count: 0,
        failed_count: failedRecipients.length,
        failed_recipients: failedRecipients.slice(0, 20),
      });
    }

    res.json({
      success: true,
      sent_count: sentCount,
      failed_count: failedRecipients.length,
      failed_recipients: failedRecipients.slice(0, 20),
      total_requested: uniqueRecipients.length,
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
};

const sendOrderDiscord = async (req, res) => {
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
      orderedAt: req.body?.orderedAt,
    });
    await sendDiscordPayload(payload);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Discord order notify error:", err);
    return res.status(500).json({
      error: err.message || "Unknown error",
    });
  }
};

const sendTestDiscord = async (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    await sendDiscordPayload({
      content: "━━━━━━━━━━━━━━━━━━━━━━━━\n✅ **DISCORD TEST**\n━━━━━━━━━━━━━━━━━━━━━━━━",
      embeds: [
        {
          color: 5793266,
          title: "Discord Notification Test",
          description: `API endpoint is reachable.\nTime: ${timestamp}`,
          timestamp,
        },
      ],
    });

    return res.status(200).json({
      success: true,
    });
  } catch (err) {
    console.error("Discord test notify error:", err);
    return res.status(500).json({
      error: err.message || "Unknown error",
    });
  }
};

const getWebhookByAction = (action) => {
  if (action === "cancelled") {
    return String(process.env.DISCORD_CANCEL_WEBHOOK_URL || "").trim();
  }
  return "";
};

const buildStatusPayload = ({
  action,
  orderId,
  name,
  userEmail,
  phone,
  city,
  state,
  zipCode,
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
            `State: ${state || "-"}`,
            `ZIP: ${zipCode || "-"}`,
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

const sendOrderStatusDiscord = async (req, res) => {
  try {
    const {
      action,
      orderId,
      name,
      userEmail,
      phone,
      city,
      state,
      zipCode,
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
    if (!webhookUrl) {
      return res.status(500).json({ error: "Missing action-specific Discord webhook URL" });
    }

    const payload = buildStatusPayload({
      action,
      orderId,
      name,
      userEmail,
      phone,
      city,
      state,
      zipCode,
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
    await sendDiscordPayload(payload, webhookUrl);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Discord order-status notify error:", err);
    return res.status(500).json({
      error: err.message || "Unknown error",
    });
  }
};

const sendUserCreatedDiscord = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address, source } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const webhookUrl = String(process.env.DISCORD_USER_CREATED_WEBHOOK_URL || "").trim();
    if (!webhookUrl) {
      return res.status(500).json({ error: "Missing DISCORD_USER_CREATED_WEBHOOK_URL" });
    }

    const now = new Date();
    const payload = {
      content:
        "\n━━━━━━━━━━━━━━━━━━━━━━━━\n👤 **NEW USER CREATED**\n━━━━━━━━━━━━━━━━━━━━━━━━\n",
      embeds: [
        {
          color: 3447003,
          title: "New Signup",
          fields: [
            {
              name: "Name",
              value: truncate(
                `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim() ||
                  "Not provided",
                256
              ),
              inline: true,
            },
            { name: "Email", value: truncate(String(email || ""), 256), inline: true },
            { name: "Phone", value: truncate(String(phone || "Not provided"), 256), inline: true },
            {
              name: "Source",
              value: truncate(String(source || "register"), 256),
              inline: true,
            },
          ],
          description: `**Address:** ${truncate(String(address || "Not provided"), 1000)}`,
          footer: { text: "LBathletes • New User" },
          timestamp: now.toISOString(),
        },
      ],
    };
    await sendDiscordPayload(payload, webhookUrl);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Discord user-created notify error:", err);
    return res.status(500).json({
      error: err.message || "Unknown error",
    });
  }
};

app.post("/send-newsletter", sendNewsletter);
app.post("/api/send-newsletter", sendNewsletter);
app.post("/send-order-discord", sendOrderDiscord);
app.post("/api/send-order-discord", sendOrderDiscord);
app.post("/test-discord", sendTestDiscord);
app.post("/api/test-discord", sendTestDiscord);
app.post("/send-order-status-discord", sendOrderStatusDiscord);
app.post("/api/send-order-status-discord", sendOrderStatusDiscord);
app.post("/send-user-created-discord", sendUserCreatedDiscord);
app.post("/api/send-user-created-discord", sendUserCreatedDiscord);

app.listen(3001, () => {
  const webhookUrl = String(process.env.DISCORD_ORDER_WEBHOOK_URL || "").trim();
  console.log("Email server running on http://localhost:3001");
  console.log(
    `Discord env loaded: webhookPresent=${Boolean(webhookUrl)} webhookLen=${webhookUrl.length}`
  );
});
