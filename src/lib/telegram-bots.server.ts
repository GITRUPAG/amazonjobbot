// Generic Telegram helpers for the multi-bot system — every function here
// takes the bot's token as an argument (fetched from the `bots` table by
// the caller) rather than reading a single fixed env var, since there can
// now be any number of these.
import { createHash } from "crypto";

export async function tgSend<T = any>(
  token: string,
  method: string,
  body: Record<string, any>
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Telegram ${method} failed [${res.status}]: ${text}`);
  }
  const json = JSON.parse(text);
  if (json && json.ok === false) {
    throw new Error(`Telegram ${method} error: ${json.description ?? text}`);
  }
  return json.result ?? json;
}

export async function sendBotMessage(
  token: string,
  chat_id: number | string,
  text: string,
  opts: Record<string, any> = {}
) {
  return tgSend(token, "sendMessage", {
    chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
    ...opts,
  });
}

/**
 * Webhook secret is derived from BOTH the bot's own DB id and its token, so
 * every bot gets a distinct secret even in the (unlikely) event two rows
 * ever shared a token.
 */
export function deriveBotWebhookSecret(botId: string, token: string): string {
  return createHash("sha256").update(`telegram-bot-webhook:${botId}:${token}`).digest("base64url");
}

export function maskToken(token: string): string {
  if (token.length <= 10) return "•".repeat(token.length);
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}