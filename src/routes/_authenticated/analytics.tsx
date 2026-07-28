import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDailyChart, topClickedJobs } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [
    { title: "Analytics — Amazon Warehouse Jobs Bot" },
    { name: "description", content: "Jobs, subscribers and click analytics for the bot." },
    { property: "og:title", content: "Analytics — Amazon Warehouse Jobs Bot" },
    { property: "og:description", content: "Jobs, subscribers and click analytics for the bot." },
  ] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const dailyFn = useServerFn(getDailyChart);
  const topFn = useServerFn(topClickedJobs);
  const daily = useQuery({ queryKey: ["daily"], queryFn: () => dailyFn() });
  const top = useQuery({ queryKey: ["top"], queryFn: () => topFn() });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <Card>
        <CardHeader><CardTitle className="text-sm">Last 14 days</CardTitle></CardHeader>
        <CardContent style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="jobs" stroke="#3b82f6" name="Jobs scraped" />
              <Line type="monotone" dataKey="subs" stroke="#10b981" name="New subscribers" />
              <Line type="monotone" dataKey="clicks" stroke="#f59e0b" name="Apply clicks" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Top clicked jobs (last 7 days)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {top.data?.length === 0 && <div className="p-6 text-sm text-muted-foreground">No clicks yet.</div>}
            {top.data?.map((t: any, i: number) => (
              <div key={i} className="p-4 flex items-center gap-3">
                <div className="text-2xl font-semibold text-muted-foreground w-8">{i + 1}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{t.job?.title ?? "(deleted job)"}</div>
                  <div className="text-xs text-muted-foreground">{t.job?.city ?? ""}</div>
                </div>
                <Badge>{t.count} clicks</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
