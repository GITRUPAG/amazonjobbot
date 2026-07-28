import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    return { userId: context.userId, roles: (data ?? []).map((r: any) => r.role) };
  });

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since7 = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

    const [jobs24, jobs7, subsActive, subsTotal, dm24, ch24, clicks24, clicks7] = await Promise.all([
      supabaseAdmin.from("jobs").select("id", { head: true, count: "exact" }).gte("scraped_at", since24),
      supabaseAdmin.from("jobs").select("id", { head: true, count: "exact" }).gte("scraped_at", since7),
      supabaseAdmin.from("subscribers").select("id", { head: true, count: "exact" }).eq("status", "active"),
      supabaseAdmin.from("subscribers").select("id", { head: true, count: "exact" }),
      supabaseAdmin.from("deliveries").select("id", { head: true, count: "exact" }).eq("channel", "dm").gte("sent_at", since24),
      supabaseAdmin.from("deliveries").select("id", { head: true, count: "exact" }).eq("channel", "channel").gte("sent_at", since24),
      supabaseAdmin.from("clicks").select("id", { head: true, count: "exact" }).gte("clicked_at", since24),
      supabaseAdmin.from("clicks").select("id", { head: true, count: "exact" }).gte("clicked_at", since7),
    ]);

    return {
      jobs24h: jobs24.count ?? 0,
      jobs7d: jobs7.count ?? 0,
      subscribersActive: subsActive.count ?? 0,
      subscribersTotal: subsTotal.count ?? 0,
      dmSent24h: dm24.count ?? 0,
      channelSent24h: ch24.count ?? 0,
      clicks24h: clicks24.count ?? 0,
      clicks7d: clicks7.count ?? 0,
    };
  });

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("jobs")
      .select("*")
      .order("scraped_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const listQueries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase
      .from("search_queries")
      .select("*")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const upsertQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; region: "US" | "UK"; keyword?: string | null; city?: string | null; active: boolean }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (data.id) {
      const { error } = await context.supabase.from("search_queries").update({
        region: data.region, keyword: data.keyword ?? null, city: data.city ?? null, active: data.active,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("search_queries").insert({
        region: data.region, keyword: data.keyword ?? null, city: data.city ?? null, active: data.active,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("search_queries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase.from("subscribers").select("*").order("joined_at", { ascending: false }).limit(500);
    return data ?? [];
  });

export const updateSubscriberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "active" | "paused" | "stopped" | "banned" }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("subscribers").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase.from("app_settings").select("key, value");
    const out: Record<string, any> = {};
    for (const row of data ?? []) out[row.key] = row.value;
    return out;
  });

export const updateSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; value: any }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("app_settings").upsert({
      key: data.key, value: data.value, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runScrapeNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // Manual trigger for testing. The continuous poll loop (pollLoop.server.ts)
    // is the primary path once deployed on a persistent host — this button
    // just fires the same shared logic on demand.
    const { scrapeAndBroadcast } = await import("@/lib/broadcast.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const origin = new URL(req.url).origin;
    return scrapeAndBroadcast(origin);
  });

export const registerTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { tg, deriveWebhookSecret } = await import("@/lib/telegram.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const forwardedHost = req.headers.get("x-forwarded-host");
    const origin = forwardedHost
      ? `https://${forwardedHost}`
      : new URL(req.url).origin.replace(/^http:/, "https:");
    const url = `${origin}/api/public/telegram/webhook`;
    const secret = deriveWebhookSecret();
    const result = await tg("setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message", "edited_message"],
    });
    return { ok: true, url, result };
  });
  export const getBotInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { tg } = await import("@/lib/telegram.server");
    try {
      const [me, hook] = await Promise.all([tg("getMe", {}), tg("getWebhookInfo", {})]);
      return { me, hook };
    } catch (e: any) {
      return { error: String(e?.message ?? e) };
    }
  });

export const getDailyChart = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
    const [{ data: jobs }, { data: subs }, { data: clicks }] = await Promise.all([
      supabaseAdmin.from("jobs").select("scraped_at").gte("scraped_at", since),
      supabaseAdmin.from("subscribers").select("joined_at").gte("joined_at", since),
      supabaseAdmin.from("clicks").select("clicked_at").gte("clicked_at", since),
    ]);
    const bucket = (rows: any[] | null, key: string) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) {
        const d = new Date(r[key]).toISOString().slice(0, 10);
        m.set(d, (m.get(d) ?? 0) + 1);
      }
      return m;
    };
    const j = bucket(jobs, "scraped_at");
    const s = bucket(subs, "joined_at");
    const c = bucket(clicks, "clicked_at");
    const out: { day: string; jobs: number; subs: number; clicks: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
      out.push({ day: d.slice(5), jobs: j.get(d) ?? 0, subs: s.get(d) ?? 0, clicks: c.get(d) ?? 0 });
    }
    return out;
  });

export const topClickedJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const { data: clicks } = await supabaseAdmin.from("clicks").select("job_id").gte("clicked_at", since);
    const counts = new Map<string, number>();
    for (const c of clicks ?? []) counts.set(c.job_id, (counts.get(c.job_id) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!top.length) return [];
    const ids = top.map(([id]) => id);
    const { data: jobs } = await supabaseAdmin.from("jobs").select("id,title,region,city").in("id", ids);
    return top.map(([id, count]) => ({ count, job: (jobs ?? []).find((j: any) => j.id === id) }));
  });