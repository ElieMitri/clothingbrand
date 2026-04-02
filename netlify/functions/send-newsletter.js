export default async (req) => {
  if (req.method !== "POST") {
    return {
      statusCode: 405,
      body: "Method not allowed",
    };
  }

  try {
    const { subject, message, recipients } = JSON.parse(req.body);

    if (
      !subject ||
      !message ||
      !Array.isArray(recipients) ||
      recipients.length === 0
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid payload" }),
      };
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
      console.error("Resend error:", text);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: text }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("Server error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
