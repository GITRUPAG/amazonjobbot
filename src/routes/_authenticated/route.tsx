import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { LayoutDashboard, Briefcase, Search, Users, BarChart3, Settings, LogOut, PackageSearch } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/keywords", label: "Keywords", icon: Search },
  { to: "/subscribers", label: "Subscribers", icon: Users },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

function AuthedLayout() {
  const router = useRouter();
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };
  return (
    <div className="min-h-screen flex bg-muted/20">
      <Toaster />
      <aside className="w-60 border-r bg-background hidden md:flex flex-col">
        <div className="p-4 flex items-center gap-2 border-b">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <PackageSearch className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Amazon Jobs Bot</div>
            <div className="text-xs text-muted-foreground">Admin</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-foreground"
              activeProps={{ className: "active" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="md:hidden flex items-center gap-2 border-b bg-background px-4 py-3">
          <PackageSearch className="h-5 w-5 text-primary" />
          <span className="font-semibold">Admin</span>
          <div className="ml-auto flex gap-1 overflow-x-auto">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="text-xs px-2 py-1 rounded hover:bg-accent">
                {n.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="p-6 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
