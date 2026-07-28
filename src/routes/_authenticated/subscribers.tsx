import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listSubscribers, updateSubscriberStatus } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/subscribers")({
  head: () => ({ meta: [
    { title: "Subscribers — Amazon Warehouse Jobs Bot" },
    { name: "description", content: "Manage Telegram subscribers of the bot." },
    { property: "og:title", content: "Subscribers — Amazon Warehouse Jobs Bot" },
    { property: "og:description", content: "Manage Telegram subscribers of the bot." },
  ] }),
  component: SubscribersPage,
});

function SubscribersPage() {
  const list = useServerFn(listSubscribers);
  const upd = useServerFn(updateSubscriberStatus);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["subs"], queryFn: () => list() });

  const setStatus = async (id: string, status: any) => {
    await upd({ data: { id, status } });
    qc.invalidateQueries({ queryKey: ["subs"] });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Subscribers</h1>
      <Card>
        <CardHeader><CardTitle className="text-sm">{q.data?.length ?? 0} total</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {q.data?.length === 0 && <div className="p-6 text-sm text-muted-foreground">No subscribers yet. Share your bot's Telegram link so users can /start it.</div>}
            {q.data?.map((s: any) => (
              <div key={s.id} className="p-4 grid gap-2 md:grid-cols-[1fr_auto] items-center">
                <div>
                  <div className="font-medium text-sm">
                    {s.first_name || s.username || `User ${s.telegram_user_id}`}
                    {s.username && <span className="text-muted-foreground"> · @{s.username}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Regions: {(s.regions ?? []).join(", ") || "(all)"} · Cities: {(s.cities ?? []).join(", ") || "(any)"} · Keywords: {(s.keywords ?? []).join(", ") || "(any)"}
                  </div>
                  <div className="text-xs text-muted-foreground">Joined {new Date(s.joined_at).toLocaleDateString()}</div>
                </div>
                <div className="flex gap-2 items-center">
                  <Badge variant={s.status === "active" ? "default" : s.status === "banned" ? "destructive" : "secondary"}>{s.status}</Badge>
                  {s.status !== "active" && <Button variant="outline" size="sm" onClick={() => setStatus(s.id, "active")}>Activate</Button>}
                  {s.status === "active" && <Button variant="outline" size="sm" onClick={() => setStatus(s.id, "paused")}>Pause</Button>}
                  {s.status !== "banned" && <Button variant="ghost" size="sm" onClick={() => setStatus(s.id, "banned")}>Ban</Button>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
