import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSetting, registerTelegramWebhook } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [
    { title: "Settings — Amazon Warehouse Jobs Bot" },
    { name: "description", content: "Configure the Telegram channel, welcome message and scrape schedule." },
    { property: "og:title", content: "Settings — Amazon Warehouse Jobs Bot" },
    { property: "og:description", content: "Configure the Telegram channel, welcome message and scrape schedule." },
  ] }),
  component: SettingsPage,
});

function SettingsPage() {
  const load = useServerFn(getSettings);
  const save = useServerFn(updateSetting);
  const hook = useServerFn(registerTelegramWebhook);
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: () => load() });

  const [channelId, setChannelId] = useState("");
  const [welcome, setWelcome] = useState("");
  const [interval, setInterval] = useState(10);

  useEffect(() => {
    if (!s.data) return;
    setChannelId(s.data.channel_id ?? "");
    setWelcome(s.data.welcome_message ?? "");
    setInterval(Number(s.data.scrape_interval_min ?? 10));
  }, [s.data]);

  const saveAll = async () => {
    try {
      await Promise.all([
        save({ data: { key: "channel_id", value: channelId } }),
        save({ data: { key: "welcome_message", value: welcome } }),
        save({ data: { key: "scrape_interval_min", value: interval } }),
      ]);
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Saved");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telegram channel</CardTitle>
          <CardDescription>Set the channel where every new job is broadcast. Use the channel username (e.g. <code>@amazonukjobsalert</code>) or numeric chat ID. Leave empty to disable channel posting. Your bot must be an admin of this channel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Channel ID / @username</Label>
          <Input value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="@your_channel" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Welcome message</CardTitle>
          <CardDescription>Sent when a user starts a DM with your bot via /start.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={5} value={welcome} onChange={(e) => setWelcome(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scrape schedule (informational)</CardTitle>
          <CardDescription>The database scheduler runs every 10 minutes by default. Change the cron job separately if you want a different cadence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Interval (minutes)</Label>
          <Input type="number" value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={saveAll}>Save changes</Button>
        <Button variant="outline" onClick={async () => {
          const p = hook();
          toast.promise(p, { loading: "Registering…", success: "Telegram webhook registered", error: (e) => String(e.message ?? e) });
        }}>Register Telegram webhook</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Handoff notes</CardTitle>
          <CardDescription>What your client needs to know.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>1. Create the bot with @BotFather on Telegram and share the token — we've connected it via the Telegram connector.</p>
          <p>2. Add the bot as admin of the public channel, then paste the channel @username above.</p>
          <p>3. Click "Register Telegram webhook" so incoming DMs are handled.</p>
          <p>4. Use the Keywords page to add regions/cities/keywords you want scraped. Warehouse (fulfillment-center) jobs in US and UK are on by default.</p>
          <p>5. Add the client's account as admin by signing them up on the auth page and inserting a row in the user_roles table with role 'admin'.</p>
        </CardContent>
      </Card>
    </div>
  );
}
