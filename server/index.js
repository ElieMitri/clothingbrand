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

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Trivo <onboarding@resend.dev>",
        to: recipients,
        subject,
        html: `<p>${message.replace(/\n/g, "<br />")}</p>`,
      }),
    });

    const text = await r.text();

    if (!r.ok) {
      console.error("Resend API error:", text);
      return res.status(500).json({ error: text });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message });
  }
};

const sendOrderTelegram = async (req, res) => {
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
    return res.status(500).json({
      error: err.message || "Unknown error",
    });
  }
};

const sendTestTelegram = async (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    await sendTelegramText(
      [
        "Telegram Notification Test",
        "API endpoint is reachable and bot is configured.",
        `Time: ${timestamp}`,
      ].join("\n")
    );

    return res.status(200).json({
      success: true,
    });
  } catch (err) {
    console.error("Telegram test notify error:", err);
    return res.status(500).json({
      error: err.message || "Unknown error",
    });
  }
};

app.post("/send-newsletter", sendNewsletter);
app.post("/api/send-newsletter", sendNewsletter);
app.post("/send-order-telegram", sendOrderTelegram);
app.post("/api/send-order-telegram", sendOrderTelegram);
app.post("/test-telegram", sendTestTelegram);
app.post("/api/test-telegram", sendTestTelegram);

app.listen(3001, () => {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  console.log("Email server running on http://localhost:3001");
  console.log(
    `Telegram env loaded: tokenPresent=${Boolean(token)} tokenLen=${
      token.length
    } chatPresent=${Boolean(chatId)} chatLen=${chatId.length}`
  );
});
