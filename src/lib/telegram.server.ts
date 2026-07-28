// Server-only Telegram helpers. Calls the Telegram Bot API directly.
import { createHash } from "crypto";

function keys() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Telegram bot token not configured");
  }
  return { token };
}

export async function tg<T = any>(method: string, body: Record<string, any>): Promise<T> {
  const { token } = keys();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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

export async function sendMessage(chat_id: number | string, text: string, opts: Record<string, any> = {}) {
  return tg("sendMessage", {
    chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
    ...opts,
  });
}

export function formatJob(job: {
  title: string;
  city?: string | null;
  state?: string | null;
  warehouse?: string | null;
  job_type?: string | null;
  pay_rate?: string | null;
  region: "US" | "UK";
}, applyUrl: string) {
  const flag = job.region === "US" ? "🇺🇸" : "🇬🇧";
  const loc = [job.warehouse, job.city, job.state].filter(Boolean).join(", ") || "Location TBD";
  const bits = [
    `${flag} <b>${escapeHtml(job.title)}</b>`,
    `📍 ${escapeHtml(loc)}`,
    job.job_type ? `🧰 ${escapeHtml(job.job_type)}` : null,
    job.pay_rate ? `💷 ${escapeHtml(job.pay_rate)}` : null,
    ``,
    `🔗 <a href="${applyUrl}">Apply on Amazon</a>`,
  ].filter(Boolean);
  return bits.join("\n");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

export function deriveWebhookSecret(): string {
  const { token } = keys();
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}