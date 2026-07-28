import { createFileRoute } from "@tanstack/react-router";
import { scrapeAndBroadcast } from "@/lib/broadcast.server";

export const Route = createFileRoute("/api/public/cron/scrape")({
  server: {
    handlers: {
      POST: async ({ request }) => runScrape(request),
      GET: async ({ request }) => runScrape(request),
    },
  },
});

// This route now exists mainly as a manual/fallback trigger. The primary
// path is the continuous in-process poll loop (pollLoop.server.ts), which
// calls scrapeAndBroadcast directly on its own timer and doesn't go through
// HTTP at all. This route stays around for: triggering a scrape from an
// external monitoring/cron service as a safety net, and for local testing.
async function runScrape(request: Request) {
  // Accept either the cron shared secret (Authorization: Bearer <CRON_SECRET>)
  // or the project's publishable key via the `apikey` header (used by pg_cron).
  const cronSecret = process.env.CRON_SECRET ?? "";
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const apikey = request.headers.get("apikey") ?? "";
  const ok =
    (cronSecret && bearer === cronSecret) ||
    (anonKey && (apikey === anonKey || bearer === anonKey));
  if (!ok) {
    return json({ error: "unauthorized" }, 401);
  }

  const result = await scrapeAndBroadcast(new URL(request.url).origin);
  return json(result, "error" in result ? 500 : 200);
}

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}