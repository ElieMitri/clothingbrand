const truncate = (value, max) =>
  String(value || "").length > max
    ? `${String(value || "").slice(0, max - 3)}...`
    : String(value || "");

const sendDiscordPayload = async (payload) => {
  const webhookUrl = String(
    process.env.DISCORD_NEWSLETTER_WEBHOOK_URL ||
      process.env.DISCORD_USER_CREATED_WEBHOOK_URL ||
      ""
  ).trim();

  if (!webhookUrl) {
    throw new Error(
      "Missing DISCORD_NEWSLETTER_WEBHOOK_URL (or DISCORD_USER_CREATED_WEBHOOK_URL fallback)"
    );
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, source } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "Invalid payload" });
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

    await sendDiscordPayload(payload);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Discord newsletter subscribe notify error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
