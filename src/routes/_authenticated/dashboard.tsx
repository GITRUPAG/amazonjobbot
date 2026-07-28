import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDashboardStats, runScrapeNow, registerTelegramWebhook, getBotInfo } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, Webhook } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — Amazon Warehouse Jobs Bot" },
    { name: "description", content: "Live stats for the Amazon warehouse jobs Telegram bot." },
    { property: "og:title", content: "Dashboard — Amazon Warehouse Jobs Bot" },
    { property: "og:description", content: "Live stats for the Amazon warehouse jobs Telegram bot." },
  ] }),
  component: Dashboard,
});

function Dashboard() {
  const statsFn = useServerFn(getDashboardStats);
  const scrapeFn = useServerFn(runScrapeNow);
  const hookFn = useServerFn(registerTelegramWebhook);
  const botFn = useServerFn(getBotInfo);

  const stats = useQuery({ queryKey: ["stats"], queryFn: () => statsFn() });
  const bot = useQuery({ queryKey: ["botInfo"], queryFn: () => botFn() });

  const cards = [
    { label: "Jobs in last 24h", value: stats.data?.jobs24h },
    { label: "Jobs in last 7 days", value: stats.data?.jobs7d },
    { label: "Active subscribers", value: stats.data?.subscribersActive },
    { label: "Total subscribers", value: stats.data?.subscribersTotal },
    { label: "Channel posts (24h)", value: stats.data?.channelSent24h },
    { label: "DMs sent (24h)", value: stats.data?.dmSent24h },
    { label: "Apply clicks (24h)", value: stats.data?.clicks24h },
    { label: "Apply clicks (7d)", value: stats.data?.clicks7d },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Amazon warehouse jobs — US & UK</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            const p = hookFn();
            toast.promise(p, { loading: "Registering webhook…", success: "Telegram webhook registered", error: (e) => String(e.message ?? e) });
            await p.catch(() => {}); bot.refetch();
          }}>
            <Webhook className="h-4 w-4 mr-2" /> Register webhook
          </Button>
          <Button onClick={async () => {
            const p = scrapeFn();
            toast.promise(p, { loading: "Scraping…", success: (r: any) => `Scraped ${r.scraped}, new ${r.new}, channel ${r.channelSent ?? 0}, DMs ${r.dmSent ?? 0}`, error: (e) => String(e.message ?? e) });
            await p.catch(() => {}); stats.refetch();
          }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Run scrape now
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{c.value ?? "—"}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Bot status</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {bot.data?.error ? (
            <div className="text-destructive">{bot.data.error}</div>
          ) : bot.data?.me ? (
            <>
              <div><span className="text-muted-foreground">Bot:</span> @{bot.data.me.username} ({bot.data.me.first_name})</div>
              <div><span className="text-muted-foreground">Webhook URL:</span> <code className="text-xs">{bot.data.hook?.url || "(not set)"}</code></div>
              <div><span className="text-muted-foreground">Pending updates:</span> {bot.data.hook?.pending_update_count ?? 0}</div>
              {bot.data.hook?.last_error_message && <div className="text-destructive">Last error: {bot.data.hook.last_error_message}</div>}
            </>
          ) : (
            <div className="text-muted-foreground">Loading…</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
