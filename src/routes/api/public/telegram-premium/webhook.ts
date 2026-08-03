import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/telegram-premium/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});

function safeEq(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

/**
 * Builds the direct "start application" URL — the consent/application flow
 * URL, not the job detail page. Example shape for UK:
 *   https://www.jobsatamazon.co.uk/application/uk/?CS=true&jobId=JOB-UK-0000000126&locale=en-GB&ssoEnabled=1#/consent?CS=true&jobId=JOB-UK-0000000126&locale=en-GB&ssoEnabled=1
 *
 * Only confirmed for UK so far. If/when a US job ever needs this, its
 * application-start URL format should be verified separately before
 * assuming it matches — falling back to the scraped job.url is safer than
 * guessing at an unverified link structure.
 */
function buildApplicationUrl(job: { external_id: string; region: string; url: string }): string {
  if (job.region === "UK") {
    const params = `CS=true&jobId=${encodeURIComponent(job.external_id)}&locale=en-GB&ssoEnabled=1`;
    return `https://www.jobsatamazon.co.uk/application/uk/?${params}#/consent?${params}`;
  }
  return job.url;
}

async function handle(request: Request) {
  const [{ derivePremiumWebhookSecret, sendPremiumMessage }, { formatJob }] = await Promise.all([
    import("@/lib/telegram-premium.server"),
    import("@/lib/telegram.server"), // reuse the existing job message formatter — no need to duplicate it
  ]);

  let expected: string;
  try {
    expected = derivePremiumWebhookSecret();
  } catch {
    return new Response("no premium telegram key", { status: 500 });
  }
  const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!safeEq(got, expected)) return new Response("unauthorized", { status: 401 });

  const update = (await request.json()) as any;
  const msg = update.message ?? update.edited_message;
  if (!msg?.chat?.id) return Response.json({ ok: true, ignored: true });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const chatId = msg.chat.id as number;
  const from = msg.from ?? {};
  const text: string = (msg.text ?? "").trim();
  const cmd = text.split(/\s+/)[0].toLowerCase();

  // Upsert into a SEPARATE premium_subscribers table — kept distinct from
  // the free-tier `subscribers` table so premium logic can never
  // accidentally affect free-tier broadcast delivery, and vice versa.
  const { data: existing } = await supabaseAdmin
    .from("premium_subscribers")
    .select("*")
    .eq("telegram_user_id", from.id)
    .maybeSingle();

  const base = {
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
        .from("premium_subscribers")
        .insert({ ...base, status: "active" })
        .select("*")
        .single();
      sub = data;
    } else {
      await supabaseAdmin.from("premium_subscribers").update(base).eq("id", existing.id);
    }

    if (cmd === "/start" || cmd === "/help") {
      const { data: latestJob } = await supabaseAdmin
        .from("jobs")
        .select("*")
        .order("scraped_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestJob) {
        await sendPremiumMessage(
          chatId,
          "👋 Welcome to Premium! No jobs have been scraped yet — send /latest any time to check again, and you'll get the newest one the moment it's available."
        );
      } else {
        // The whole point of premium: the direct application-start link,
        // not the job detail page URL, and not the /api/public/r/:jobId
        // click-tracked redirect used in free-tier alerts.
        const applyUrl = buildApplicationUrl(latestJob as any);
        const body = formatJob(latestJob as any, applyUrl);
        await sendPremiumMessage(chatId, `👋 Welcome to Premium!\n\n${body}`);
      }
    } else if (cmd === "/latest") {
      const { data: latestJob } = await supabaseAdmin
        .from("jobs")
        .select("*")
        .order("scraped_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestJob) {
        await sendPremiumMessage(chatId, "No jobs scraped yet — check back soon.");
      } else {
        const applyUrl = buildApplicationUrl(latestJob as any);
        const body = formatJob(latestJob as any, applyUrl);
        await sendPremiumMessage(chatId, body);
      }
    } else if (cmd === "/stop") {
      await supabaseAdmin.from("premium_subscribers").update({ status: "stopped" }).eq("id", sub!.id);
      await sendPremiumMessage(chatId, "🛑 Unsubscribed from Premium. Send /start to rejoin.");
    } else {
      await sendPremiumMessage(chatId, "Unknown command. Try /start or /latest");
    }
  } catch (e) {
    console.error("premium webhook error", e);
  }

  return Response.json({ ok: true });
}