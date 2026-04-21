import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin } from "lucide-react";

type PublicJob = {
  id: string;
  title: string;
  location: string | null;
  description: string | null;
  employment_type: string | null;
  status: string;
  workspace_id: string;
  clients: { name: string } | null;
};

export default function CareersJobPublic() {
  const { workspaceId, jobId } = useParams<{ workspaceId: string; jobId: string }>();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!jobId) return;
      const { data } = await supabase
        .from("jobs")
        .select("id, title, location, description, employment_type, status, workspace_id, clients(name)")
        .eq("id", jobId)
        .maybeSingle();
      if (data && data.workspace_id === workspaceId && data.status === "open") {
        setJob(data as unknown as PublicJob);
      }
      setLoading(false);
    })();
  }, [jobId, workspaceId]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!job) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl mb-2">Position no longer available</h1>
          <p className="text-sm text-muted-foreground">This role may have been filled or closed.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to={`/careers/${workspaceId}`}>See open roles</Link>
          </Button>
        </div>
      </div>
    );
  }

  const mailto = `mailto:?subject=${encodeURIComponent(`Application: ${job.title}`)}&body=${encodeURIComponent(
    "Hi,\n\nI'd like to apply for the role.\n\nName:\nLinkedIn:\n\nThanks,"
  )}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to={`/careers/${workspaceId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All roles
          </Link>
          <div className="font-display tracking-tight">{job.clients?.name ?? "Careers"}</div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{job.clients?.name}</div>
        <h1 className="font-display text-4xl mb-3">{job.title}</h1>
        <div className="flex items-center gap-2 flex-wrap mb-8">
          {job.location && (
            <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {job.location}</Badge>
          )}
          {job.employment_type && <Badge variant="outline" className="capitalize">{job.employment_type}</Badge>}
        </div>

        <Card className="p-6">
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {job.description ?? "No description provided."}
          </div>
        </Card>

        <div className="mt-8 flex gap-2">
          <Button asChild>
            <a href={mailto}>Apply by email</a>
          </Button>
        </div>
      </main>
    </div>
  );
}
