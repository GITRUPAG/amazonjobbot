import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/telegram/webhook")({
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

async function handle(request: Request) {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!tgToken) return new Response("no telegram key", { status: 500 });
  const expected = createHash("sha256").update(`telegram-webhook:${tgToken}`).digest("base64url");
  const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!safeEq(got, expected)) return new Response("unauthorized", { status: 401 });

  const update = (await request.json()) as any;
  const msg = update.message ?? update.edited_message;
  if (!msg?.chat?.id) return Response.json({ ok: true, ignored: true });

  const [{ supabaseAdmin }, { sendMessage }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/telegram.server"),
  ]);

  const chatId = msg.chat.id as number;
  const from = msg.from ?? {};
  const text: string = (msg.text ?? "").trim();

  // Upsert subscriber
  const { data: existing } = await supabaseAdmin
    .from("subscribers")
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
  if (!existing) {
    // status must be set explicitly here — runScrapeCore only DMs subscribers
    // where status = 'active', and there's no guarantee the DB column has a
    // default of 'active' rather than null.
    const { data } = await supabaseAdmin
      .from("subscribers")
      .insert({ ...base, status: "active" })
      .select("*")
      .single();
    sub = data;
  } else {
    await supabaseAdmin.from("subscribers").update(base).eq("id", existing.id);
  }

  const cmd = text.split(/\s+/)[0].toLowerCase();
  const arg = text.slice(cmd.length).trim();

  try {
    if (cmd === "/start" || cmd === "/help") {
      const { data: welcomeRow } = await supabaseAdmin.from("app_settings").select("value").eq("key", "welcome_message").maybeSingle();
      const welcome = (welcomeRow?.value as string | undefined) ?? "👋 Welcome!";
      await sendMessage(chatId, welcome);
    } else if (cmd === "/pause") {
      await supabaseAdmin.from("subscribers").update({ status: "paused" }).eq("id", sub!.id);
      await sendMessage(chatId, "⏸ Paused. Send /resume to start alerts again.");
    } else if (cmd === "/resume") {
      await supabaseAdmin.from("subscribers").update({ status: "active" }).eq("id", sub!.id);
      await sendMessage(chatId, "▶️ Alerts resumed.");
    } else if (cmd === "/stop") {
      await supabaseAdmin.from("subscribers").update({ status: "stopped" }).eq("id", sub!.id);
      await sendMessage(chatId, "🛑 Unsubscribed. Send /start to sign up again.");
    } else if (cmd === "/region" || cmd === "/regions") {
      // /region US or /region UK or /region US,UK
      const parts = arg.toUpperCase().split(/[,\s]+/).filter((p): p is "US" | "UK" => p === "US" || p === "UK");
      const regions: ("US" | "UK")[] = parts.length ? parts : ["US", "UK"];
      await supabaseAdmin.from("subscribers").update({ regions }).eq("id", sub!.id);
      await sendMessage(chatId, `✅ Regions set to: ${regions.join(", ")}`);
    } else if (cmd === "/city" || cmd === "/cities") {
      const cities = arg ? arg.split(",").map((c) => c.trim()).filter(Boolean) : [];
      await supabaseAdmin.from("subscribers").update({ cities }).eq("id", sub!.id);
      await sendMessage(chatId, cities.length ? `📍 Cities: ${cities.join(", ")}` : "📍 City filter cleared.");
    } else if (cmd === "/keyword" || cmd === "/keywords") {
      const kws = arg ? arg.split(",").map((c) => c.trim()).filter(Boolean) : [];
      await supabaseAdmin.from("subscribers").update({ keywords: kws }).eq("id", sub!.id);
      await sendMessage(chatId, kws.length ? `🔍 Keywords: ${kws.join(", ")}` : "🔍 Keyword filter cleared.");
    } else if (cmd === "/filter" || cmd === "/filters" || cmd === "/status") {
      const { data: cur } = await supabaseAdmin.from("subscribers").select("*").eq("id", sub!.id).single();
      const lines = [
        `<b>Your filters</b>`,
        `Status: ${cur?.status}`,
        `Regions: ${(cur?.regions ?? []).join(", ") || "(all)"}`,
        `Cities: ${(cur?.cities ?? []).join(", ") || "(any)"}`,
        `Keywords: ${(cur?.keywords ?? []).join(", ") || "(any)"}`,
        ``,
        `Change with:`,
        `<code>/region US,UK</code>`,
        `<code>/city London, Manchester</code>`,
        `<code>/keyword sortation, night</code>`,
      ];
      await sendMessage(chatId, lines.join("\n"));
    } else {
      await sendMessage(chatId, "Unknown command. Try /help");
    }
  } catch (e) {
    console.error("webhook error", e);
  }

  return Response.json({ ok: true });
}