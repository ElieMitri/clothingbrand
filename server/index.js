import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import importProductsFromUrl from "../api/import-products-from-url.js";

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
    const { subject, message, recipients } = req.body || {};
    const trimmedSubject = String(subject || "").trim();
    const trimmedMessage = String(message || "").trim();

    // Basic validation
    if (
      !trimmedSubject ||
      !trimmedMessage ||
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
      process.env.NEWSLETTER_FROM ||
      process.env.ORDER_STATUS_FROM ||
      "LBathletes <onboarding@resend.dev>";
    const supportEmail = String(process.env.SUPPORT_EMAIL || "").trim();
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
      trimmedMessage
    ).replace(/\n/g, "<br />")}</div>`;
    const textBody = trimmedMessage;

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
              subject: trimmedSubject,
              html: htmlBody,
              text: textBody,
              reply_to: emailRegex.test(supportEmail) ? supportEmail : undefined,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            let parsedError = null;
            try {
              parsedError = errorText ? JSON.parse(errorText) : null;
            } catch {
              parsedError = null;
            }
            const reason =
              (parsedError && (parsedError.message || parsedError.error)) ||
              errorText ||
              `Send failed for ${recipient}`;
            throw new Error(String(reason));
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

const sendOrderStatusEmail = async (req, res) => {
  try {
    const { email, orderId, status, title, message, itemCount } = req.body || {};

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    if (!normalizedEmail || !orderId || !status) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing RESEND_API_KEY" });
    }

    const from =
      process.env.ORDER_STATUS_FROM ||
      process.env.NEWSLETTER_FROM ||
      "LBathletes <onboarding@resend.dev>";

    const safeTitle = String(title || "Order Status Update");
    const safeMessage = String(message || "Your order status has changed.");
    const shortOrderId = String(orderId).slice(0, 8).toUpperCase();
    const safeItemCount = Number(itemCount || 0);
    const statusLabel =
      String(status || "")
        .trim()
        .charAt(0)
        .toUpperCase() + String(status || "").trim().slice(1);
    const supportEmail = process.env.SUPPORT_EMAIL || "lbathletes@hotmail.com";
    const websiteUrl = process.env.SITE_URL || "https://lbathletes.com";

    const escapeHtml = (text) =>
      String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const statusTone = String(status || "").trim().toLowerCase();
    const statusBg =
      statusTone === "delivered"
        ? "#E8F7EE"
        : statusTone === "shipped"
          ? "#EAF2FF"
          : statusTone === "cancelled"
            ? "#FDECEC"
            : "#F3F4F6";
    const statusColor =
      statusTone === "delivered"
        ? "#1F7A46"
        : statusTone === "shipped"
          ? "#1D4ED8"
          : statusTone === "cancelled"
            ? "#B42318"
            : "#374151";

    const itemSummary =
      safeItemCount > 0
        ? `${safeItemCount} item${safeItemCount === 1 ? "" : "s"}`
        : "Not specified";

    const html = `
      <div style="margin:0;padding:24px;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;background:#111827;color:#FFFFFF;">
              <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#D1D5DB;">LB Athletes</p>
              <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;font-weight:700;">${escapeHtml(
                safeTitle
              )}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#1F2937;">
                ${escapeHtml(safeMessage)}
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 8px;border:1px solid #E5E7EB;border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #E5E7EB;">
                    <p style="margin:0;font-size:13px;color:#6B7280;">Order Number</p>
                    <p style="margin:4px 0 0;font-size:17px;font-weight:700;color:#111827;">#${escapeHtml(
                      shortOrderId
                    )}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #E5E7EB;">
                    <p style="margin:0;font-size:13px;color:#6B7280;">Status</p>
                    <p style="margin:8px 0 0;display:inline-block;padding:6px 10px;border-radius:999px;font-size:13px;font-weight:700;background:${statusBg};color:${statusColor};">${escapeHtml(
                      statusLabel
                    )}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:13px;color:#6B7280;">Items</p>
                    <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(
                      itemSummary
                    )}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#4B5563;">
                Questions about your order? Reply to this email or contact us at
                <a href="mailto:${escapeHtml(
                  supportEmail
                )}" style="color:#111827;font-weight:600;text-decoration:none;">${escapeHtml(
      supportEmail
    )}</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#F9FAFB;border-top:1px solid #E5E7EB;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6B7280;">
                This is a transactional update for your order at LB Athletes.
                Visit us at <a href="${escapeHtml(
                  websiteUrl
                )}" style="color:#374151;text-decoration:underline;">${escapeHtml(
      websiteUrl
    )}</a>.
              </p>
            </td>
          </tr>
        </table>
      </div>
    `;
    const text = `${safeTitle}

Order Number: #${shortOrderId}
Status: ${statusLabel}
Items: ${itemSummary}

${safeMessage}

Need help? Reply to this email or contact ${supportEmail}.
${websiteUrl}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [normalizedEmail],
        subject: `${safeTitle} • #${shortOrderId}`,
        html,
        text,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(500).json({
        error: payload?.message || payload?.error || `HTTP ${response.status}`,
      });
    }

    return res.status(200).json({ success: true, id: payload?.id || null });
  } catch (err) {
    console.error("Order status email notify error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to send status email",
    });
  }
};

const sendOrderConfirmationEmail = async (req, res) => {
  try {
    const {
      email,
      orderId,
      name,
      phone,
      address,
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

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !orderId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing RESEND_API_KEY" });
    }

    const from =
      process.env.ORDER_STATUS_FROM ||
      process.env.NEWSLETTER_FROM ||
      "LBathletes <onboarding@resend.dev>";
    const supportEmail = process.env.SUPPORT_EMAIL || "lbathletes@hotmail.com";
    const websiteUrl = process.env.SITE_URL || "https://lbathletes.com";
    const shortOrderId = String(orderId).slice(0, 8).toUpperCase();
    const safeName = String(name || "Customer").trim();
    const safePhone = String(phone || "-").trim();
    const safeAddress = String(address || "-").trim();
    const safeDirections = String(directions || "-").trim();
    const safeCity = String(city || "-").trim();
    const safeState = String(state || "-").trim();
    const safeZipCode = String(zipCode || "-").trim();
    const safeCountry = String(country || "Lebanon").trim();
    const safeSubtotal = Number(subtotal || 0);
    const safeShipping = Number(shipping || 0);
    const safeTax = Number(tax || 0);
    const safeTotal = Number(total || 0);

    const escapeHtml = (text) =>
      String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const normalizedItems = items.map((item, index) => {
      const itemName = String(item?.name || item?.product_name || `Item ${index + 1}`);
      const itemSize = String(item?.size || "-");
      const qty = Number(item?.quantity || 0);
      const unitPrice = Number(item?.unitPrice ?? item?.price ?? 0);
      return {
        name: itemName,
        size: itemSize,
        quantity: qty,
        unitPrice,
        lineTotal: unitPrice * qty,
      };
    });

    const itemsRows = normalizedItems
      .map(
        (item) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:14px;color:#111827;">${escapeHtml(
              item.name
            )}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:14px;color:#4B5563;text-align:center;">${escapeHtml(
              item.size
            )}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:14px;color:#4B5563;text-align:center;">${item.quantity}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:14px;color:#111827;text-align:right;">$${item.lineTotal.toFixed(
              2
            )}</td>
          </tr>
        `
      )
      .join("");

    const html = `
      <div style="margin:0;padding:24px;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;background:#111827;color:#FFFFFF;">
              <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#D1D5DB;">LB Athletes</p>
              <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;font-weight:700;">Thank you for your order</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1F2937;">
                Hi ${escapeHtml(safeName)}, your order has been received successfully.
              </p>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151;">
                We are now preparing your items. You will receive another email when your order status changes.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #E5E7EB;border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #E5E7EB;">
                    <p style="margin:0;font-size:13px;color:#6B7280;">Order Number</p>
                    <p style="margin:4px 0 0;font-size:17px;font-weight:700;color:#111827;">#${escapeHtml(
                      shortOrderId
                    )}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:13px;color:#6B7280;">Shipping Details</p>
                    <p style="margin:6px 0 0;font-size:14px;line-height:1.6;color:#111827;">
                      ${escapeHtml(safeAddress)}<br/>
                      ${escapeHtml(safeCity)}, ${escapeHtml(safeState)} ${escapeHtml(
      safeZipCode
    )}<br/>
                      ${escapeHtml(safeCountry)}<br/>
                      Phone: ${escapeHtml(safePhone)}<br/>
                      Notes: ${escapeHtml(safeDirections)}
                    </p>
                  </td>
                </tr>
              </table>

              <h2 style="margin:20px 0 10px;font-size:17px;color:#111827;">Order Details</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr>
                    <th style="padding:10px 12px;background:#F9FAFB;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:left;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;">Item</th>
                    <th style="padding:10px 12px;background:#F9FAFB;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;">Size</th>
                    <th style="padding:10px 12px;background:#F9FAFB;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:center;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;">Qty</th>
                    <th style="padding:10px 12px;background:#F9FAFB;border-bottom:1px solid #E5E7EB;font-size:12px;text-align:right;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows}
                </tbody>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                <tr>
                  <td style="font-size:14px;color:#4B5563;padding:4px 0;">Subtotal</td>
                  <td style="font-size:14px;color:#111827;text-align:right;padding:4px 0;">$${safeSubtotal.toFixed(
                    2
                  )}</td>
                </tr>
                <tr>
                  <td style="font-size:14px;color:#4B5563;padding:4px 0;">Service Fee</td>
                  <td style="font-size:14px;color:#111827;text-align:right;padding:4px 0;">$${safeShipping.toFixed(
                    2
                  )}</td>
                </tr>
                <tr>
                  <td style="font-size:14px;color:#4B5563;padding:4px 0;">Tax</td>
                  <td style="font-size:14px;color:#111827;text-align:right;padding:4px 0;">$${safeTax.toFixed(
                    2
                  )}</td>
                </tr>
                <tr>
                  <td style="font-size:16px;font-weight:700;color:#111827;padding:8px 0 0;">Order Total</td>
                  <td style="font-size:16px;font-weight:700;color:#111827;text-align:right;padding:8px 0 0;">$${safeTotal.toFixed(
                    2
                  )}</td>
                </tr>
              </table>

              <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#4B5563;">
                Need help? Reply to this email or contact us at
                <a href="mailto:${escapeHtml(
                  supportEmail
                )}" style="color:#111827;font-weight:600;text-decoration:none;">${escapeHtml(
      supportEmail
    )}</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#F9FAFB;border-top:1px solid #E5E7EB;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6B7280;">
                This is a transactional confirmation for your order at LB Athletes.
                Visit us at <a href="${escapeHtml(
                  websiteUrl
                )}" style="color:#374151;text-decoration:underline;">${escapeHtml(
      websiteUrl
    )}</a>.
              </p>
            </td>
          </tr>
        </table>
      </div>
    `;

    const plainItems = normalizedItems
      .map(
        (item, index) =>
          `${index + 1}. ${item.name} | Size: ${item.size} | Qty: ${
            item.quantity
          } | $${item.lineTotal.toFixed(2)}`
      )
      .join("\n");

    const text = `Thank you for your order

Order Number: #${shortOrderId}
Name: ${safeName}
Phone: ${safePhone}
Address: ${safeAddress}, ${safeCity}, ${safeState} ${safeZipCode}, ${safeCountry}
Notes: ${safeDirections}

Order Details:
${plainItems}

Subtotal: $${safeSubtotal.toFixed(2)}
Service Fee: $${safeShipping.toFixed(2)}
Tax: $${safeTax.toFixed(2)}
Order Total: $${safeTotal.toFixed(2)}

Need help? Contact ${supportEmail}
${websiteUrl}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [normalizedEmail],
        subject: `Thank you for your order • #${shortOrderId}`,
        html,
        text,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(500).json({
        error: payload?.message || payload?.error || `HTTP ${response.status}`,
      });
    }

    return res.status(200).json({ success: true, id: payload?.id || null });
  } catch (err) {
    console.error("Order confirmation email notify error:", err);
    return res.status(500).json({
      error:
        err instanceof Error ? err.message : "Failed to send order confirmation email",
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

const sendNewsletterSubscriberDiscord = async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const webhookUrl = String(
      process.env.DISCORD_NEWSLETTER_WEBHOOK_URL ||
        process.env.DISCORD_USER_CREATED_WEBHOOK_URL ||
        ""
    ).trim();
    if (!webhookUrl) {
      return res.status(500).json({
        error:
          "Missing DISCORD_NEWSLETTER_WEBHOOK_URL (or DISCORD_USER_CREATED_WEBHOOK_URL fallback)",
      });
    }

    const now = new Date();
    const payload = {
      content:
        "\n━━━━━━━━━━━━━━━━━━━━━━━━\n📬 **NEW NEWSLETTER SUBSCRIBER**\n━━━━━━━━━━━━━━━━━━━━━━━━\n",
      embeds: [
        {
          color: 5793266,
          title: "Newsletter Opt-in",
          fields: [
            {
              name: "Email",
              value: truncate(String(email || ""), 256),
              inline: true,
            },
            {
              name: "Source",
              value: truncate(String(source || "unknown"), 256),
              inline: true,
            },
          ],
          footer: { text: "LBathletes • Newsletter" },
          timestamp: now.toISOString(),
        },
      ],
    };

    await sendDiscordPayload(payload, webhookUrl);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Discord newsletter subscribe notify error:", err);
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
app.post("/send-order-status-email", sendOrderStatusEmail);
app.post("/api/send-order-status-email", sendOrderStatusEmail);
app.post("/send-order-confirmation-email", sendOrderConfirmationEmail);
app.post("/api/send-order-confirmation-email", sendOrderConfirmationEmail);
app.post("/send-user-created-discord", sendUserCreatedDiscord);
app.post("/api/send-user-created-discord", sendUserCreatedDiscord);
app.post("/send-newsletter-subscriber-discord", sendNewsletterSubscriberDiscord);
app.post(
  "/api/send-newsletter-subscriber-discord",
  sendNewsletterSubscriberDiscord
);
app.post("/import-products-from-url", importProductsFromUrl);
app.post("/api/import-products-from-url", importProductsFromUrl);

app.listen(3001, () => {
  const webhookUrl = String(process.env.DISCORD_ORDER_WEBHOOK_URL || "").trim();
  console.log("Email server running on http://localhost:3001");
  console.log(
    `Discord env loaded: webhookPresent=${Boolean(webhookUrl)} webhookLen=${webhookUrl.length}`
  );
});
