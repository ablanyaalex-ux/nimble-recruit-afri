import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, MapPin, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type PublicJob = {
  id: string;
  title: string;
  location: string | null;
  description: string | null;
  employment_type: string | null;
  status: string;
  approval_status: string;
  workspace_id: string;
  clients: { name: string } | null;
};

type Question = {
  id: string;
  position: number;
  question_text: string;
  options: string[] | null;
  is_knockout: boolean;
  fail_value: string | null;
  rejection_template_id: string | null;
};

export default function CareersJobPublic() {
  const { workspaceId, jobId } = useParams<{ workspaceId: string; jobId: string }>();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  // application form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (!jobId) return;
      const { data } = await supabase
        .from("jobs")
        .select("id, title, location, description, employment_type, status, approval_status, workspace_id, clients(name)")
        .eq("id", jobId)
        .maybeSingle();
      if (data && data.workspace_id === workspaceId && data.status === "open" && (data as any).approval_status === "approved") {
        setJob(data as unknown as PublicJob);
        const { data: qs } = await supabase
          .from("job_application_questions")
          .select("id, position, question_text, options, is_knockout, fail_value, rejection_template_id")
          .eq("job_id", jobId)
          .order("position");
        setQuestions((qs ?? []) as Question[]);
      }
      setLoading(false);
    })();
  }, [jobId, workspaceId]);

  const submit = async () => {
    if (!job) return;
    if (!name.trim() || !email.trim()) return toast.error("Name and email required");
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("process-automations", {
      body: {
        mode: "submit_application",
        jobId: job.id,
        name,
        email,
        phone,
        answers,
      },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? "Could not submit application");
    }
    setDone(true);
    toast.success("Application received");
  };

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

        {done ? (
          <Card className="p-8 mt-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
            <h2 className="font-display text-xl mb-2">Thanks for applying</h2>
            <p className="text-sm text-muted-foreground">We'll review your application and get back to you.</p>
          </Card>
        ) : !showForm ? (
          <div className="mt-8">
            <Button onClick={() => setShowForm(true)}>Apply for this role</Button>
          </div>
        ) : (
          <Card className="p-6 mt-8 space-y-4">
            <h2 className="font-display text-xl">Application</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Full name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>

            {questions.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                {questions.map((q) => (
                  <div key={q.id} className="space-y-2">
                    <Label>{q.question_text}</Label>
                    {q.options && q.options.length > 0 ? (
                      <Select value={answers[q.id] ?? ""} onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}>
                        <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {q.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Textarea rows={3} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))} />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="ghost" onClick={() => setShowForm(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={submit} disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
