import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listBots,
  createBot,
  deleteBot,
  toggleBotActive,
  registerBotWebhook,
  getBotInfoForId,
} from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Webhook, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bots")({
  head: () => ({
    meta: [
      { title: "Bots — Amazon Warehouse Jobs Bot" },
      { name: "description", content: "Manage every Telegram bot — free or premium tier." },
    ],
  }),
  component: BotsPage,
});

function BotsPage() {
  const listFn = useServerFn(listBots);
  const createFn = useServerFn(createBot);
  const deleteFn = useServerFn(deleteBot);
  const toggleFn = useServerFn(toggleBotActive);
  const hookFn = useServerFn(registerBotWebhook);
  const infoFn = useServerFn(getBotInfoForId);

  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bots"], queryFn: () => listFn() });

  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [tier, setTier] = useState<"free" | "premium">("free");
  const [creating, setCreating] = useState(false);

  const add = async () => {
    if (!name.trim() || !token.trim()) {
      toast.error("Name and token are required");
      return;
    }
    setCreating(true);
    try {
      await createFn({ data: { name: name.trim(), bot_token: token.trim(), tier } });
      setName("");
      setToken("");
      setTier("free");
      qc.invalidateQueries({ queryKey: ["bots"] });
      toast.success("Bot added");
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["bots"] });
  };

  const toggle = async (id: string, active: boolean) => {
    await toggleFn({ data: { id, active } });
    qc.invalidateQueries({ queryKey: ["bots"] });
  };

  const register = async (id: string) => {
    const p = hookFn({ data: { id } });
    toast.promise(p, {
      loading: "Registering webhook…",
      success: "Webhook registered",
      error: (e) => String(e.message ?? e),
    });
    await p.catch(() => {});
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Bots</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add a bot</CardTitle>
          <CardDescription>
            Create the bot with @BotFather first, then paste its token here. Tier decides what link it
            sends on /start: <b>free</b> uses the tracked apply-redirect, <b>premium</b> sends the direct
            Amazon application-start link.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="UK Premium Bot" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Bot token</Label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AA..."
              type="password"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tier</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as "free" | "premium")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4">
            <Button onClick={add} disabled={creating}>
              {creating ? "Adding…" : "Add bot"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{q.data?.length ?? 0} bot(s)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {q.data?.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">No bots yet — add one above.</div>
            )}
            {q.data?.map((b: any) => (
              <BotRow
                key={b.id}
                bot={b}
                onDelete={() => remove(b.id)}
                onToggle={(active) => toggle(b.id, active)}
                onRegister={() => register(b.id)}
                infoFn={infoFn}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BotRow({
  bot,
  onDelete,
  onToggle,
  onRegister,
  infoFn,
}: {
  bot: any;
  onDelete: () => void;
  onToggle: (active: boolean) => void;
  onRegister: () => void;
  infoFn: (opts: { data: { id: string } }) => Promise<any>;
}) {
  const info = useQuery({
    queryKey: ["botInfo", bot.id],
    queryFn: () => infoFn({ data: { id: bot.id } }),
    enabled: false,
  });

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant={bot.tier === "premium" ? "default" : "secondary"}>{bot.tier}</Badge>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">
            {bot.name}
            {bot.telegram_username && (
              <span className="text-muted-foreground"> · @{bot.telegram_username}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{bot.maskedToken}</div>
        </div>
        <Switch checked={bot.active} onCheckedChange={onToggle} />
        <Button variant="outline" size="sm" onClick={onRegister}>
          <Webhook className="h-4 w-4 mr-1" /> Register webhook
        </Button>
        <Button variant="outline" size="sm" onClick={() => info.refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Check status
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {info.data && (
        <div className="text-xs bg-muted/50 rounded-md p-2 space-y-1">
          {info.data.error ? (
            <div className="text-destructive">{info.data.error}</div>
          ) : (
            <>
              <div>Webhook URL: <code>{info.data.hook?.url || "(not set)"}</code></div>
              <div>Pending updates: {info.data.hook?.pending_update_count ?? 0}</div>
              {info.data.hook?.last_error_message && (
                <div className="text-destructive">Last error: {info.data.hook.last_error_message}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}