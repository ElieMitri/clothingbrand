export default async (req) => {
  if (req.method !== "POST") {
    return {
      statusCode: 405,
      body: "Method not allowed",
    };
  }

  try {
    const webhookUrl = process.env.SLACK_ORDER_WEBHOOK_URL;
    if (!webhookUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing SLACK_ORDER_WEBHOOK_URL" }),
      };
    }

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
    } = JSON.parse(req.body || "{}");

    if (!orderId || !name || !email || !address || typeof total !== "number") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid payload" }),
      };
    }

    const normalizedItems = Array.isArray(items) ? items : [];
    const itemCount = normalizedItems.reduce(
      (sum, item) => sum + Number(item?.quantity || 0),
      0
    );
    const orderedItemsText =
      normalizedItems.length > 0
        ? normalizedItems
            .map((item, index) => {
              const itemName = String(item?.name || "Item");
              const sizePart = item?.size ? ` • Size ${item.size}` : "";
              const qty = Number(item?.quantity || 0);
              const unitPrice = Number(item?.unitPrice || 0);
              const lineTotal = unitPrice * qty;
              return `${index + 1}. ${itemName}${sizePart} • Qty ${qty} • $${lineTotal.toFixed(
                2
              )}`;
            })
            .join("\n")
        : "- No items";

    const message = {
      text: `New order #${orderId} • $${Number(total).toFixed(2)}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "______________________________",
          },
        },
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "New Order Received",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Order ID:*\n${orderId}`,
            },
            {
              type: "mrkdwn",
              text: `*Customer:*\n${name}`,
            },
            {
              type: "mrkdwn",
              text: `*Email:*\n${email}`,
            },
            {
              type: "mrkdwn",
              text: `*Phone:*\n${phone || "Not provided"}`,
            },
          ],
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Items:*\n${Number(itemCount || 0)}`,
            },
            {
              type: "mrkdwn",
              text: `*Subtotal:*\n$${Number(subtotal || 0).toFixed(2)}`,
            },
            {
              type: "mrkdwn",
              text: `*Shipping:*\n$${Number(shipping || 0).toFixed(2)}`,
            },
            {
              type: "mrkdwn",
              text: `*Tax:*\n$${Number(tax || 0).toFixed(2)}`,
            },
            {
              type: "mrkdwn",
              text: `*Total:*\n$${Number(total).toFixed(2)}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `*Delivery Address:*\n${address}\n\n` +
              `*Directions:*\n${directions || "-"}`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*City:*\n${city || "-"}`,
            },
            {
              type: "mrkdwn",
              text: `*State:*\n${state || "-"}`,
            },
            {
              type: "mrkdwn",
              text: `*ZIP:*\n${zipCode || "-"}`,
            },
            {
              type: "mrkdwn",
              text: `*Country:*\n${country || "-"}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Order Items:*\n${orderedItemsText}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "______________________________",
          },
        },
      ],
    };

    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const text = await r.text();
    if (!r.ok) {
      console.error("Slack webhook error:", text);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: text || "Slack webhook failed" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("Slack order notify error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
    };
  }
};
