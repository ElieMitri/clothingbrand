const truncate = (value, max) =>
  String(value || "").length > max
    ? `${String(value || "").slice(0, max - 3)}...`
    : String(value || "");

const sendDiscordPayload = async (payload) => {
  const webhookUrl = String(process.env.DISCORD_USER_CREATED_WEBHOOK_URL || "").trim();
  if (!webhookUrl) {
    throw new Error("Missing DISCORD_USER_CREATED_WEBHOOK_URL");
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
    const { firstName, lastName, email, phone, address, source } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "Invalid payload" });
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

    await sendDiscordPayload(payload);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Discord user-created notify error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
