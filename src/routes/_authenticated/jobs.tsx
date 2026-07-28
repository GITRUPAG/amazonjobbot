import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listJobs } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({ meta: [
    { title: "Jobs — Amazon Warehouse Jobs Bot" },
    { name: "description", content: "Most recent Amazon warehouse jobs scraped for the bot." },
    { property: "og:title", content: "Jobs — Amazon Warehouse Jobs Bot" },
    { property: "og:description", content: "Most recent Amazon warehouse jobs scraped for the bot." },
  ] }),
  component: JobsPage,
});

function JobsPage() {
  const fn = useServerFn(listJobs);
  const q = useQuery({ queryKey: ["jobs"], queryFn: () => fn() });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Recent Jobs</h1>
      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Last 100 scraped</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {q.data?.length === 0 && <div className="p-6 text-sm text-muted-foreground">No jobs yet. Run a scrape from the dashboard.</div>}
            {q.data?.map((j: any) => (
              <div key={j.id} className="p-4 flex items-start gap-3">
                <Badge variant={j.region === "US" ? "default" : "secondary"}>{j.region}</Badge>
                <div className="flex-1 min-w-0">
                  <a href={j.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{j.title}</a>
                  <div className="text-xs text-muted-foreground truncate">
                    {[j.warehouse, j.city, j.state].filter(Boolean).join(", ")}
                    {j.job_type ? ` • ${j.job_type}` : ""}
                    {j.pay_rate ? ` • ${j.pay_rate}` : ""}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(j.scraped_at).toLocaleString()}
                  {j.broadcast_at && <div className="text-emerald-600">Broadcast ✓</div>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
