import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, MapPin, Briefcase, Building2, Sparkles, ArrowRight, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "All",
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "Marketing",
  "Operations",
  "Finance",
  "People",
  "Other",
];

type MarketplaceJob = {
  id: string;
  workspace_id: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  remote_policy: string | null;
  marketplace_category: string | null;
  marketplace_summary: string | null;
  marketplace_published_at: string | null;
  salary_min: number | null;
  salary_max: number | null;
  description: string | null;
  clients: { name: string } | null;
};

function timeAgo(d?: string | null) {
  if (!d) return "";
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(d).toLocaleDateString();
}

function fmtSalary(min: number | null, max: number | null) {
  if (!min && !max) return null;
  const f = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
  if (min && max) return `${f(min)}–${f(max)}`;
  return f((min || max)!);
}

export default function Marketplace() {
  const [jobs, setJobs] = useState<MarketplaceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("jobs")
        .select(
          "id, workspace_id, title, location, employment_type, remote_policy, marketplace_category, marketplace_summary, marketplace_published_at, salary_min, salary_max, description, clients(name)",
        )
        .eq("marketplace_status", "public")
        .eq("status", "open")
        .eq("approval_status", "approved")
        .order("marketplace_published_at", { ascending: false, nullsFirst: false })
        .limit(200);
      setJobs((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (cat !== "All" && (j.marketplace_category ?? "Other") !== cat) return false;
      if (!needle) return true;
      return (
        j.title.toLowerCase().includes(needle) ||
        (j.clients?.name ?? "").toLowerCase().includes(needle) ||
        (j.location ?? "").toLowerCase().includes(needle) ||
        (j.marketplace_summary ?? "").toLowerCase().includes(needle)
      );
    });
  }, [jobs, q, cat]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-30 bg-background/80">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link to="/jobs" className="flex items-center gap-2 font-display text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Talentboard</span>
            <Badge variant="secondary" className="ml-1 text-[10px] uppercase">Marketplace</Badge>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/post-job"><PlusCircle className="h-4 w-4" /> Post a job</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-background" />
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-14 md:py-20 text-center">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Find your next opportunity
          </h1>
          <p className="mt-3 text-muted-foreground md:text-lg max-w-xl mx-auto">
            Curated roles from companies hiring right now. No clutter, no spam.
          </p>
          <div className="mt-7 flex items-center gap-2 max-w-xl mx-auto bg-card border border-border rounded-xl shadow-sm p-1.5">
            <Search className="h-4 w-4 ml-2 text-muted-foreground shrink-0" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, company, location..."
              className="border-0 focus-visible:ring-0 shadow-none h-10"
            />
            <Button size="sm" className="h-9">Search</Button>
          </div>
        </div>
      </section>

      {/* Categories */}
      <div className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex gap-2 overflow-x-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                cat === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading..." : `${filtered.length} open role${filtered.length === 1 ? "" : "s"}`}
          </p>
        </div>

        {!loading && filtered.length === 0 && (
          <Card className="p-12 text-center">
            <Briefcase className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No jobs match your search</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different keyword or category.</p>
          </Card>
        )}

        <div className="grid gap-3">
          {filtered.map((j) => {
            const salary = fmtSalary(j.salary_min, j.salary_max);
            return (
              <Link
                key={j.id}
                to={`/careers/${j.workspace_id}/${j.id}`}
                className="group"
              >
                <Card className="p-5 transition-all hover:border-primary/50 hover:shadow-md">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="truncate">{j.clients?.name ?? "Confidential"}</span>
                        <span>·</span>
                        <span>{timeAgo(j.marketplace_published_at)}</span>
                      </div>
                      <h3 className="mt-1 font-display text-lg group-hover:text-primary transition-colors truncate">
                        {j.title}
                      </h3>
                      {j.marketplace_summary && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {j.marketplace_summary}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {j.marketplace_category && (
                          <Badge variant="secondary" className="text-[10px]">{j.marketplace_category}</Badge>
                        )}
                        {j.employment_type && (
                          <Badge variant="outline" className="text-[10px] capitalize">{j.employment_type}</Badge>
                        )}
                        {j.remote_policy && (
                          <Badge variant="outline" className="text-[10px] capitalize">{j.remote_policy}</Badge>
                        )}
                        {j.location && (
                          <Badge variant="outline" className="text-[10px]">
                            <MapPin className="h-3 w-3" /> {j.location}
                          </Badge>
                        )}
                        {salary && (
                          <Badge variant="outline" className="text-[10px]">{salary}</Badge>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-border/60 mt-12">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 text-xs text-muted-foreground flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} Talentboard Marketplace</span>
          <div className="flex gap-4">
            <Link to="/post-job" className="hover:text-foreground">Post a job</Link>
            <Link to="/auth" className="hover:text-foreground">For recruiters</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
