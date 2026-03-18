import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || "gpt-5.2";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const CRM_WEBHOOK_URL = process.env.CRM_WEBHOOK_URL || "";

function getCorsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: getCorsHeaders(origin)
  });
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(function (item) {
      return item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string";
    })
    .slice(-8)
    .map(function (item) {
      return {
        role: item.role,
        content: item.content.slice(0, 1500)
      };
    });
}

function escapeTelegram(text) {
  return String(text || "").replace(/[<>&]/g, function (char) {
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return "&amp;";
  });
}

async function sendTelegramLead(lead) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { delivered: false, skipped: true };
  }

  const historyText = (lead.history || [])
    .map(function (item) {
      const role = item.role === "assistant" ? "Бот" : "Пользователь";
      return role + ": " + item.content;
    })
    .join("\n");

  const text =
    "<b>Новый лид с AI-чата</b>\n" +
    "Имя: " + escapeTelegram(lead.name) + "\n" +
    "Телефон: " + escapeTelegram(lead.phone) + "\n" +
    "Источник: " + escapeTelegram(lead.source || "tilda-ai-widget") + "\n" +
    (lead.conversationId ? "Conversation ID: " + escapeTelegram(lead.conversationId) + "\n" : "") +
    (historyText ? "\n<b>Последние сообщения</b>\n" + escapeTelegram(historyText) : "");

  const response = await fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Telegram error: " + errorText);
  }

  return { delivered: true };
}

async function sendCrmWebhookLead(lead) {
  if (!CRM_WEBHOOK_URL) {
    return { delivered: false, skipped: true };
  }

  const response = await fetch(CRM_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      source: lead.source || "tilda-ai-widget",
      createdAt: new Date().toISOString(),
      leadType: "consultation_request",
      patient: {
        name: lead.name,
        phone: lead.phone
      },
      meta: {
        conversationId: lead.conversationId || null,
        page: lead.page || null
      },
      conversation: lead.history || []
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("CRM webhook error: " + errorText);
  }

  return { delivered: true };
}

function buildInput(history, message) {
  const items = history.map(function (item) {
    return {
      role: item.role,
      content: item.content
    };
  });

  items.push({
    role: "user",
    content: message
  });

  return items;
}

async function handleRequest(request) {
  const origin = request.headers.get("origin") || "*";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin)
    });
  }

  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" }, origin);
  }

  try {
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "chat";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const history = sanitizeHistory(body.history);

    if (action === "lead") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const source = typeof body.source === "string" ? body.source.trim() : "tilda-ai-widget";
      const page = typeof body.page === "string" ? body.page.trim() : "";

      if (!name || !phone) {
        return json(400, { error: "Name and phone are required" }, origin);
      }

      const leadPayload = {
        name,
        phone,
        source,
        conversationId,
        history,
        page
      };

      const deliveryResults = await Promise.allSettled([
        sendTelegramLead(leadPayload),
        sendCrmWebhookLead(leadPayload)
      ]);

      const telegramResult =
        deliveryResults[0].status === "fulfilled" ? deliveryResults[0].value : { delivered: false, error: String(deliveryResults[0].reason) };
      const webhookResult =
        deliveryResults[1].status === "fulfilled" ? deliveryResults[1].value : { delivered: false, error: String(deliveryResults[1].reason) };

      if (!telegramResult.delivered && !webhookResult.delivered) {
        return json(
          502,
          {
            error: "Lead delivery failed",
            telegramDelivered: false,
            webhookDelivered: false,
            telegramError: telegramResult.error || null,
            webhookError: webhookResult.error || null
          },
          origin
        );
      }

      return json(
        200,
        {
          ok: true,
          telegramDelivered: Boolean(telegramResult.delivered),
          webhookDelivered: Boolean(webhookResult.delivered),
          telegramError: telegramResult.error || null,
          webhookError: webhookResult.error || null
        },
        origin
      );
    }

    if (!message) {
      return json(400, { error: "Message is required" }, origin);
    }

    const instructions =
      "Ты AI-помощник клиники флебологии «Варикоза нет». " +
      "Отвечай по-русски, спокойно, короткими абзацами, вежливо и по делу. " +
      "Твоя задача: помочь посетителю сайта понять, стоит ли записаться на консультацию флеболога, как проходит прием, нужно ли УЗИ вен и как подготовиться. " +
      "Нельзя ставить диагноз, назначать лечение, препараты, операции или обещать результат. " +
      "Если вопрос требует врача, прямо скажи, что нужен очный осмотр. " +
      "Если есть тревожные симптомы, рекомендуй обратиться на консультацию без запугивания. " +
      "Не придумывай цены, адреса, врачей, акции или медицинские факты, если их нет во входных данных. " +
      "Опирайся на общую медицинскую осторожность и контекст лендинга: консультация флеболога, УЗИ вен нижних конечностей, план лечения по показаниям.";

    const response = await client.responses.create({
      model: MODEL,
      instructions,
      input: buildInput(history, message),
      previous_response_id: conversationId || undefined,
      max_output_tokens: 450,
      reasoning: {
        effort: "low"
      },
      text: {
        verbosity: "low"
      }
    });

    const answer = response.output_text || "Не удалось подготовить ответ. Попробуйте сформулировать вопрос немного иначе.";
    const suggestBooking = /запис|консультац|осмотр|узи/i.test(answer);
    const suggestLeadCapture = suggestBooking || history.length >= 4;

    return json(
      200,
      {
        answer,
        conversationId: response.id,
        suggestBooking,
        suggestLeadCapture
      },
      origin
    );
  } catch (error) {
    return json(
      500,
      {
        error: "Server error",
        details: error instanceof Error ? error.message : String(error)
      },
      origin
    );
  }
}

export async function GET(request) {
  const origin = request.headers.get("origin") || "*";

  return json(
    200,
    {
      ok: true,
      message: "Varicosenet chat endpoint is running. Use POST to send chat messages or leads."
    },
    origin
  );
}

export async function POST(request) {
  return handleRequest(request);
}

export async function OPTIONS(request) {
  const origin = request.headers.get("origin") || "*";

  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin)
  });
}
