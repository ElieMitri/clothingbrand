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

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Discord test notify error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
