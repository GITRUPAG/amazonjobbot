// Shared scrape-then-broadcast logic. Used by both the continuous poll loop
// (pollLoop.server.ts) and the manual "run now" admin action / cron fallback
// route (cron/scrape.ts), so there's exactly one place this logic lives.

export async function scrapeAndBroadcast(appOrigin: string) {
  const [{ supabaseAdmin }, { scrapeAll }, { sendMessage, formatJob }] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/amazon-scraper.server"),
    import("@/lib/telegram.server"),
  ]);

  const { data: queries } = await supabaseAdmin
    .from("search_queries")
    .select("keyword, city")
    .eq("active", true);

  const scraped = await scrapeAll((queries ?? []).map((q: any) => ({ keyword: q.keyword, city: q.city })));

  if (scraped.length === 0) {
    return { ok: true, scraped: 0, new: 0 };
  }

  const rows = scraped.map((j: any) => ({
    external_id: j.external_id,
    region: j.region,
    title: j.title,
    city: j.city,
    state: j.state,
    warehouse: j.warehouse,
    job_type: j.job_type,
    employment_type: j.employment_type,
    pay_rate: j.pay_rate,
    description: j.description,
    url: j.url,
    posted_at: j.posted_at,
    raw: j.raw,
  }));

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("jobs")
    .upsert(rows, { onConflict: "region,external_id", ignoreDuplicates: true })
    .select("id, external_id, region, title, city, state, warehouse, job_type, pay_rate, url, broadcast_at");

  if (insErr) {
    console.error("job insert error", insErr);
    return { error: insErr.message };
  }

  const newJobs = (inserted ?? []).filter((j: any) => !j.broadcast_at);
  if (newJobs.length === 0) {
    return { ok: true, scraped: scraped.length, new: 0 };
  }

  const [{ data: settings }, { data: subs }] = await Promise.all([
    supabaseAdmin.from("app_settings").select("key, value"),
    supabaseAdmin.from("subscribers").select("*").eq("status", "active"),
  ]);
  const channelSetting = (settings ?? []).find((s: any) => s.key === "channel_id");
  const channelId: string = String(channelSetting?.value ?? "");

  let channelSent = 0;
  let dmSent = 0;
  const now = new Date().toISOString();

  for (const job of newJobs) {
    const applyUrl = `${appOrigin}/api/public/r/${job.id}`;
    const text = formatJob(job as any, applyUrl);

    if (channelId) {
      try {
        const msg: any = await sendMessage(channelId, text);
        await supabaseAdmin.from("deliveries").insert({
          job_id: job.id,
          channel: "channel",
          message_id: msg?.message_id ?? null,
        });
        channelSent++;
      } catch (e: any) {
        await supabaseAdmin.from("deliveries").insert({
          job_id: job.id,
          channel: "channel",
          error: String(e?.message ?? e),
        });
      }
    }

    for (const s of subs ?? []) {
      if (!matchesFilter(job as any, s)) continue;
      try {
        const msg: any = await sendMessage(s.chat_id, `${text}\n\n<i>Filtered for you • /filter to change</i>`);
        await supabaseAdmin.from("deliveries").insert({
          job_id: job.id,
          subscriber_id: s.id,
          channel: "dm",
          message_id: msg?.message_id ?? null,
        });
        dmSent++;
      } catch (e: any) {
        const errMsg = String(e?.message ?? e);
        await supabaseAdmin.from("deliveries").insert({
          job_id: job.id,
          subscriber_id: s.id,
          channel: "dm",
          error: errMsg,
        });
        if (/blocked|deactivated|chat not found/i.test(errMsg)) {
          await supabaseAdmin.from("subscribers").update({ status: "stopped" }).eq("id", s.id);
        }
      }
    }

    await supabaseAdmin.from("jobs").update({ broadcast_at: now }).eq("id", job.id);
  }

  return { ok: true, scraped: scraped.length, new: newJobs.length, channelSent, dmSent };
}

function matchesFilter(job: any, sub: any): boolean {
  const regions: string[] = sub.regions ?? [];
  if (regions.length && !regions.includes(job.region)) return false;
  const cities: string[] = sub.cities ?? [];
  if (cities.length) {
    const jc = (job.city ?? "").toLowerCase();
    const jw = (job.warehouse ?? "").toLowerCase();
    if (!cities.some((c) => jc.includes(c.toLowerCase()) || jw.includes(c.toLowerCase()))) return false;
  }
  const keywords: string[] = sub.keywords ?? [];
  if (keywords.length) {
    const hay = `${job.title} ${job.job_type ?? ""}`.toLowerCase();
    if (!keywords.some((k) => hay.includes(k.toLowerCase()))) return false;
  }
  return true;
}