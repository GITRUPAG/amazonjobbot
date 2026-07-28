import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PackageSearch, Bell, Filter, BarChart3, Bot, Rocket } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Amazon Warehouse Jobs Alerts — Telegram Bot" },
    { name: "description", content: "Instant Telegram alerts for new Amazon warehouse jobs in the US and UK. Filter by city, warehouse, and keyword — never miss an opening." },
    { property: "og:title", content: "Amazon Warehouse Jobs Alerts — Telegram Bot" },
    { property: "og:description", content: "Instant Telegram alerts for new Amazon warehouse jobs in the US and UK. Filter by city, warehouse, and keyword." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <PackageSearch className="h-4 w-4" />
            </div>
            <span className="font-semibold">Amazon Warehouse Jobs Bot</span>
          </div>
          <Link to="/auth"><Button variant="outline" size="sm">Admin sign in</Button></Link>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 py-16 md:py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground mb-6">
          <Rocket className="h-3 w-3" /> US · UK
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          Never miss an Amazon warehouse job again.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          Real-time Telegram alerts for new Amazon warehouse openings in the US and UK.
          One public channel for everyone, plus a personal bot with your own filters.
        </p>
        <div className="mt-8 flex justify-center gap-2">
          <Link to="/auth"><Button size="lg">Open admin dashboard</Button></Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 pb-24 grid gap-4 md:grid-cols-3">
        {[
          { icon: Bell, title: "Instant alerts", body: "New jobs pushed to Telegram within minutes of appearing on Amazon." },
          { icon: Bot, title: "Public channel + DM bot", body: "Everyone follows one channel; power users get personalised DMs." },
          { icon: Filter, title: "Filter by city & keyword", body: "US, UK, city, or job keyword — subscribers choose what they see." },
          { icon: PackageSearch, title: "Deduped automatically", body: "Every job is posted once. No spam, no repeats." },
          { icon: BarChart3, title: "Full analytics", body: "Track jobs posted, subscribers, and click-throughs." },
          { icon: Rocket, title: "Admin-managed", body: "Keywords, locations, subscribers — all in a simple dashboard." },
        ].map((f) => (
          <div key={f.title} className="rounded-lg border p-5">
            <f.icon className="h-5 w-5 text-primary mb-3" />
            <div className="font-medium">{f.title}</div>
            <div className="text-sm text-muted-foreground mt-1">{f.body}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
