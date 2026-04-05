export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
  } catch (error) {
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to send order confirmation email",
    });
  }
}
