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
import { ArrowLeft, MapPin, CheckCircle2, Upload, Sparkles, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type StdField = { enabled: boolean; required: boolean };
type FormConfig = {
  standard_fields: {
    full_name: StdField; email: StdField; phone: StdField; location: StdField; address: StdField;
  };
  allow_cv_parsing: boolean;
  require_cv: boolean;
};

const DEFAULT_CONFIG: FormConfig = {
  standard_fields: {
    full_name: { enabled: true, required: true },
    email: { enabled: true, required: true },
    phone: { enabled: true, required: false },
    location: { enabled: false, required: false },
    address: { enabled: false, required: false },
  },
  allow_cv_parsing: true,
  require_cv: false,
};

type PublicJob = {
  id: string;
  title: string;
  location: string | null;
  description: string | null;
  employment_type: string | null;
  status: string;
  approval_status: string;
  workspace_id: string;
  application_form_config: FormConfig | null;
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  const [locationField, setLocationField] = useState("");
  const [address, setAddress] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const config: FormConfig = job?.application_form_config ?? DEFAULT_CONFIG;
  const sf = config.standard_fields;

  useEffect(() => {
    (async () => {
      if (!jobId) return;
      const { data } = await supabase
        .from("jobs")
        .select("id, title, location, description, employment_type, status, approval_status, workspace_id, application_form_config, clients(name)")
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

  const handleResumeChange = async (file: File | null) => {
    setResumeFile(file);
    if (!file || !config.allow_cv_parsing) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is over 5 MB — autofill skipped.");
      return;
    }
    setParsing(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("parse-resume-public", {
        body: { fileBase64, mimeType: file.type, fileName: file.name },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error ?? "Couldn't autofill from CV");
        return;
      }
      const parsed = data as { name?: string; email?: string; phone?: string; location?: string };
      let filled = 0;
      if (parsed.name && !name.trim()) { setName(parsed.name); filled++; }
      if (parsed.email && !email.trim()) { setEmail(parsed.email); filled++; }
      if (parsed.phone && !phone.trim() && sf.phone.enabled) { setPhone(parsed.phone); filled++; }
      if (parsed.location && !locationField.trim() && sf.location.enabled) { setLocationField(parsed.location); filled++; }
      if (filled > 0) toast.success(`Autofilled ${filled} field${filled > 1 ? "s" : ""} from your CV.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not parse CV");
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    if (!job) return;
    const errors: string[] = [];
    if (sf.full_name.enabled && sf.full_name.required && !name.trim()) errors.push("Full name");
    if (sf.email.enabled && sf.email.required && !email.trim()) errors.push("Email");
    if (sf.phone.enabled && sf.phone.required && !phone.trim()) errors.push("Phone");
    if (sf.location.enabled && sf.location.required && !locationField.trim()) errors.push("Location");
    if (sf.address.enabled && sf.address.required && !address.trim()) errors.push("Address");
    if (config.require_cv && !resumeFile) errors.push("CV / resume");
    if (errors.length) {
      toast.error(`Please complete: ${errors.join(", ")}`);
      return;
    }
    setSubmitting(true);
    try {
      let resumeBase64: string | null = null;
      let resumeMime: string | null = null;
      let resumeName: string | null = null;
      if (resumeFile) {
        if (resumeFile.size > 8 * 1024 * 1024) {
          toast.error("CV must be under 8 MB");
          setSubmitting(false);
          return;
        }
        resumeBase64 = await fileToBase64(resumeFile);
        resumeMime = resumeFile.type;
        resumeName = resumeFile.name;
      }
      const { data, error } = await supabase.functions.invoke("process-automations", {
        body: {
          mode: "submit_application",
          jobId: job.id,
          name,
          email,
          phone,
          location: locationField || null,
          address: address || null,
          answers,
          resumeBase64,
          resumeMime,
          resumeName,
        },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error ?? "Could not submit application");
        return;
      }
      setDone(true);
      toast.success("Application received");
    } finally {
      setSubmitting(false);
    }
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

            {/* CV upload first to enable autofill */}
            <div className="space-y-2">
              <Label>
                CV / Resume {config.require_cv && <span className="text-destructive">*</span>}
              </Label>
              {!resumeFile ? (
                <label className="flex items-center justify-center gap-2 border border-dashed rounded-md px-4 py-6 cursor-pointer hover:bg-muted/40 transition">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Upload PDF, DOCX or TXT {config.allow_cv_parsing && "— we'll autofill your details"}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    onChange={(e) => handleResumeChange(e.target.files?.[0] ?? null)}
                  />
                </label>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0 text-sm">
                    {parsing ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> :
                      config.allow_cv_parsing ? <Sparkles className="h-4 w-4 text-primary shrink-0" /> :
                      <Upload className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="truncate">{resumeFile.name}</span>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setResumeFile(null)} disabled={parsing}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {parsing && <p className="text-xs text-muted-foreground">Reading your CV…</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {sf.full_name.enabled && (
                <div className="space-y-2">
                  <Label>Full name {sf.full_name.required && <span className="text-destructive">*</span>}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}
              {sf.email.enabled && (
                <div className="space-y-2">
                  <Label>Email {sf.email.required && <span className="text-destructive">*</span>}</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              )}
              {sf.phone.enabled && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Phone {sf.phone.required && <span className="text-destructive">*</span>}</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              )}
              {sf.location.enabled && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Location {sf.location.required && <span className="text-destructive">*</span>}</Label>
                  <Input
                    value={locationField}
                    onChange={(e) => setLocationField(e.target.value)}
                    placeholder="City, Country"
                  />
                </div>
              )}
              {sf.address.enabled && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Address {sf.address.required && <span className="text-destructive">*</span>}</Label>
                  <Textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, city, postcode, country"
                  />
                </div>
              )}
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
              <Button onClick={submit} disabled={submitting || parsing}>
                {submitting ? "Submitting…" : "Submit application"}
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
