export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { subject, message, recipients } = req.body || {};

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

    return res.status(200).json({
      success: true,
      sent_count: sentCount,
      failed_count: failedRecipients.length,
      failed_recipients: failedRecipients.slice(0, 20),
      total_requested: uniqueRecipients.length,
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
