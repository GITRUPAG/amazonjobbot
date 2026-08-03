import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/telegram-bots/$botId/webhook")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handle(request, params.botId),
    },
  },
});

function safeEq(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

/**
 * Direct "start application" URL for premium-tier bots. Only confirmed for
 * UK so far (see buildApplicationUrl note in the standalone premium bot's
 * webhook) - falls back to the scraped job.url for anything else rather
 * than guessing at an unverified link shape.
 */
function buildApplicationUrl(job: { external_id: string; region: string; url: string }): string {
  if (job.region === "UK") {
    const params = `CS=true&jobId=${encodeURIComponent(job.external_id)}&locale=en-GB&ssoEnabled=1`;
    return `https://www.jobsatamazon.co.uk/application/uk/?${params}#/consent?${params}`;
  }
  return job.url;
}

async function handle(request: Request, botId: string | undefined) {
  if (!botId) return new Response("missing bot id", { status: 400 });

  const [{ supabaseAdmin }, { deriveBotWebhookSecret, sendBotMessage }, { formatJob }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/telegram-bots.server"),
    import("@/lib/telegram.server"),
  ]);

  const { data: bot } = await supabaseAdmin.from("bots").select("*").eq("id", botId).maybeSingle();
  if (!bot || !bot.active) return new Response("bot not found or inactive", { status: 404 });

  const expected = deriveBotWebhookSecret(bot.id, bot.bot_token);
  const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!safeEq(got, expected)) return new Response("unauthorized", { status: 401 });

  const update = (await request.json()) as any;
  const msg = update.message ?? update.edited_message;
  if (!msg?.chat?.id) return Response.json({ ok: true, ignored: true });

  const chatId = msg.chat.id as number;
  const from = msg.from ?? {};
  const text: string = (msg.text ?? "").trim();
  const cmd = text.split(/\s+/)[0].toLowerCase();

  const { data: existing } = await supabaseAdmin
    .from("bot_subscribers")
    .select("*")
    .eq("bot_id", bot.id)
    .eq("telegram_user_id", from.id)
    .maybeSingle();

  const base = {
    bot_id: bot.id,
    telegram_user_id: from.id,
    chat_id: chatId,
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_active_at: new Date().toISOString(),
  };

  let sub = existing;

  try {
    if (!existing) {
      const { data } = await supabaseAdmin
        .from("bot_subscribers")
        .insert({ ...base, status: "active" })
        .select("*")
        .single();
      sub = data;
    } else {
      await supabaseAdmin.from("bot_subscribers").update(base).eq("id", existing.id);
    }

    if (cmd === "/start" || cmd === "/help") {
      const { data: latestJob } = await supabaseAdmin
        .from("jobs")
        .select("*")
        .order("scraped_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestJob) {
        await sendBotMessage(
          bot.bot_token,
          chatId,
          "Welcome! No jobs have been scraped yet. Send /latest any time to check again."
        );
      } else {
        const applyUrl =
          bot.tier === "premium"
            ? buildApplicationUrl(latestJob as any)
            : `${new URL(request.url).origin}/api/public/r/${latestJob.id}`;
        const body = formatJob(latestJob as any, applyUrl);
        await sendBotMessage(bot.bot_token, chatId, `Welcome!\n\n${body}`);
      }
    } else if (cmd === "/latest") {
      const { data: latestJob } = await supabaseAdmin
        .from("jobs")
        .select("*")
        .order("scraped_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestJob) {
        await sendBotMessage(bot.bot_token, chatId, "No jobs scraped yet. Check back soon.");
      } else {
        const applyUrl =
          bot.tier === "premium"
            ? buildApplicationUrl(latestJob as any)
            : `${new URL(request.url).origin}/api/public/r/${latestJob.id}`;
        const body = formatJob(latestJob as any, applyUrl);
        await sendBotMessage(bot.bot_token, chatId, body);
      }
    } else if (cmd === "/stop") {
      await supabaseAdmin.from("bot_subscribers").update({ status: "stopped" }).eq("id", sub!.id);
      await sendBotMessage(bot.bot_token, chatId, "Unsubscribed. Send /start to rejoin.");
    } else {
      await sendBotMessage(bot.bot_token, chatId, "Unknown command. Try /start or /latest");
    }
  } catch (e) {
    console.error("telegram-bots webhook error for bot " + bot.id, e);
  }

  return Response.json({ ok: true });
}