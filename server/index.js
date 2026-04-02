import express from "express";
import cors from "cors";
import "dotenv/config";
import fetch from "node-fetch";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/send-newsletter", async (req, res) => {
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
});

app.listen(3001, () => {
  console.log("Email server running on http://localhost:3001");
});
