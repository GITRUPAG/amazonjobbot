import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listQueries, upsertQuery, deleteQuery } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/keywords")({
  head: () => ({ meta: [
    { title: "Keywords & Locations — Amazon Warehouse Jobs Bot" },
    { name: "description", content: "Manage the keywords and locations the bot scrapes." },
    { property: "og:title", content: "Keywords & Locations — Amazon Warehouse Jobs Bot" },
    { property: "og:description", content: "Manage the keywords and locations the bot scrapes." },
  ] }),
  component: KeywordsPage,
});

function KeywordsPage() {
  const list = useServerFn(listQueries);
  const save = useServerFn(upsertQuery);
  const del = useServerFn(deleteQuery);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["queries"], queryFn: () => list() });

  const [region, setRegion] = useState<"US" | "UK">("US");
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("");

  const add = async () => {
    try {
      await save({ data: { region, keyword: keyword || null, city: city || null, active: true } });
      setKeyword(""); setCity("");
      qc.invalidateQueries({ queryKey: ["queries"] });
      toast.success("Added");
    } catch (e: any) { toast.error(e.message); }
  };

  const toggle = async (row: any) => {
    await save({ data: { id: row.id, region: row.region, keyword: row.keyword, city: row.city, active: !row.active } });
    qc.invalidateQueries({ queryKey: ["queries"] });
  };

  const remove = async (id: string) => {
    await del({ data: { id } });
    qc.invalidateQueries({ queryKey: ["queries"] });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Keywords & Locations</h1>
      <Card>
        <CardHeader><CardTitle className="text-sm">Add search target</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Region</Label>
            <Select value={region} onValueChange={(v) => setRegion(v as "US" | "UK")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="US">US</SelectItem>
                <SelectItem value="UK">UK</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Keyword (optional)</Label>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="warehouse" />
          </div>
          <div className="space-y-1.5">
            <Label>City (optional)</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="London" />
          </div>
          <div className="flex items-end"><Button onClick={add} className="w-full">Add</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Active queries</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {q.data?.length === 0 && <div className="p-6 text-sm text-muted-foreground">No queries yet.</div>}
            {q.data?.map((row: any) => (
              <div key={row.id} className="p-4 flex items-center gap-3">
                <Badge variant={row.region === "US" ? "default" : "secondary"}>{row.region}</Badge>
                <div className="flex-1 text-sm">
                  <div className="font-medium">{row.keyword || "(all warehouse)"} {row.city ? `— ${row.city}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={row.active} onCheckedChange={() => toggle(row)} />
                  <Button variant="ghost" size="icon" onClick={() => remove(row.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
