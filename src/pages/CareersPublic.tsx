import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

type Job = {
  id: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  clients: { name: string } | null;
};

export default function CareersPublic() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!workspaceId) return;
      const { data } = await supabase
        .from("jobs")
        .select("id, title, location, employment_type, clients(name)")
        .eq("workspace_id", workspaceId)
        .eq("status", "open")
        .order("created_at", { ascending: false });
      setJobs((data ?? []) as unknown as Job[]);
      setLoading(false);
    })();
  }, [workspaceId]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <h1 className="font-display text-3xl tracking-tight">Open roles</h1>
          <p className="text-sm text-muted-foreground mt-1">Find your next opportunity.</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : jobs.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No open roles right now. Check back soon.</Card>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => (
              <Link key={j.id} to={`/careers/${workspaceId}/${j.id}`}>
                <Card className="p-4 hover:border-primary/40 transition-colors">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{j.clients?.name ?? "Role"}</div>
                  <div className="font-display text-lg">{j.title}</div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {j.location && (
                      <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {j.location}</Badge>
                    )}
                    {j.employment_type && <Badge variant="outline" className="capitalize">{j.employment_type}</Badge>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
