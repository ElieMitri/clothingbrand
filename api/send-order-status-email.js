export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      email,
      orderId,
      status,
      title,
      message,
      itemCount,
    } = req.body || {};

    const normalizedEmail = String(email || "").trim().toLowerCase();
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
      return res
        .status(500)
        .json({ error: payload?.message || `HTTP ${response.status}` });
    }

    return res.status(200).json({ success: true, id: payload?.id || null });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to send status email",
    });
  }
}
