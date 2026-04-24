import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Mail, Phone, Linkedin, Tag, Send, Star, FileText, MessageSquare, ClipboardList, ExternalLink, MapPin, Sparkles, RefreshCw, ChevronRight, X, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { canMoveStages, visibleStagesForRole } from "@/lib/permissions";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { PageContainer } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Detail = {
  id: string;
  stage: string;
  rejected: boolean;
  rejection_reason: string | null;
  candidate_id: string;
  job_id: string;
  jobs: { workspace_id: string; client_id: string; title: string } | null;
  candidates: {
    full_name: string;
    email: string | null;
    phone: string | null;
    headline: string | null;
    linkedin_url: string | null;
    resume_path: string | null;
    notes: string | null;
    source: string | null;
    location: string | null;
    resume_summary: string | null;
  };
};

type Comment = {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
  author?: { display_name: string | null } | null;
};

type Feedback = {
  id: string;
  rating: number | null;
  recommendation: string | null;
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  author_id: string;
  created_at: string;
  author?: { display_name: string | null } | null;
};

type MentionableUser = { id: string; display_name: string | null };

function HeaderField({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}<span>{label}</span>
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}

export default function JobCandidate() {
  const { jobId, jobCandidateId } = useParams<{ jobId: string; jobCandidateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentRole } = useWorkspace();
  const canMove = canMoveStages(currentRole);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [mentionables, setMentionables] = useState<MentionableUser[]>([]);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [fbForm, setFbForm] = useState({ rating: "", recommendation: "", strengths: "", concerns: "", notes: "" });
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [progressing, setProgressing] = useState(false);

  const { stages: allStages } = usePipelineStages(detail?.jobs?.workspace_id);
  const stages = visibleStagesForRole(currentRole, allStages);

  const refresh = async () => {
    if (!jobCandidateId) return;
    setLoading(true);
    const { data } = await supabase
      .from("job_candidates")
      .select("id, stage, rejected, rejection_reason, candidate_id, job_id, jobs(workspace_id, client_id, title), candidates(full_name, email, phone, headline, linkedin_url, resume_path, notes, source, location, resume_summary)")
      .eq("id", jobCandidateId)
      .single();
    if (data) {
      setDetail(data as unknown as Detail);
      setSummary((data.candidates as any)?.resume_summary ?? null);
      if (data.candidates?.resume_path) {
        const { data: signed } = await supabase.storage
          .from("resumes")
          .createSignedUrl(data.candidates.resume_path, 600);
        setResumeUrl(signed?.signedUrl ?? null);
      } else {
        setResumeUrl(null);
      }
    }

    const [cRes, fRes] = await Promise.all([
      supabase.from("candidate_comments").select("id, body, author_id, created_at").eq("job_candidate_id", jobCandidateId).order("created_at", { ascending: true }),
      supabase.from("interview_feedback").select("*").eq("job_candidate_id", jobCandidateId).order("created_at", { ascending: false }),
    ]);

    if (cRes.data) {
      const ids = Array.from(new Set(cRes.data.map((c) => c.author_id)));
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      setComments(cRes.data.map((c) => ({ ...c, author: byId.get(c.author_id) ?? null })));
    }
    if (fRes.data) {
      const ids = Array.from(new Set(fRes.data.map((f) => f.author_id)));
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      setFeedback(fRes.data.map((f) => ({ ...f, author: byId.get(f.author_id) ?? null })));
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [jobCandidateId]);

  useEffect(() => {
    const loadMentionables = async () => {
      if (!detail?.jobs) return;
      const { workspace_id, client_id } = detail.jobs;
      const [memRes, hmRes] = await Promise.all([
        supabase.from("workspace_members").select("user_id").eq("workspace_id", workspace_id),
        supabase.from("client_contacts").select("user_id").eq("client_id", client_id).not("user_id", "is", null),
      ]);
      const ids = Array.from(new Set([
        ...(memRes.data ?? []).map((m) => m.user_id),
        ...(hmRes.data ?? []).map((c) => c.user_id as string),
      ]));
      if (ids.length === 0) return setMentionables([]);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      setMentionables(profiles ?? []);
    };
    loadMentionables();
  }, [detail]);

  const moveStage = async (stage: string) => {
    if (!detail) return;
    const { error } = await supabase.from("job_candidates").update({ stage: stage as any }).eq("id", detail.id);
    if (error) return toast.error(error.message);
    toast.success("Stage updated.");
    setDetail({ ...detail, stage });
  };

  const postComment = async () => {
    if (!detail || !user || !newComment.trim()) return;
    setPosting(true);
    const { data: c, error } = await supabase
      .from("candidate_comments")
      .insert({ job_candidate_id: detail.id, author_id: user.id, body: newComment.trim() })
      .select("id")
      .single();
    if (error || !c) { setPosting(false); return toast.error(error?.message ?? "Failed"); }

    const text = newComment.trim();
    const mentioned: string[] = [];
    for (const u of mentionables) {
      if (!u.display_name) continue;
      const re = new RegExp(`@${u.display_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(text) && u.id !== user.id) mentioned.push(u.id);
    }
    if (mentioned.length) {
      await supabase.from("comment_mentions").insert(mentioned.map((id) => ({ comment_id: c.id, mentioned_user_id: id })));
    }

    setNewComment("");
    setPosting(false);
    refresh();
  };

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !user) return;
    const { error } = await supabase.from("interview_feedback").insert({
      job_candidate_id: detail.id,
      author_id: user.id,
      rating: fbForm.rating ? parseInt(fbForm.rating) : null,
      recommendation: (fbForm.recommendation || null) as any,
      strengths: fbForm.strengths || null,
      concerns: fbForm.concerns || null,
      notes: fbForm.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Feedback submitted.");
    setFbForm({ rating: "", recommendation: "", strengths: "", concerns: "", notes: "" });
    refresh();
  };

  if (loading) return <PageContainer><p className="text-sm text-muted-foreground">Loading…</p></PageContainer>;
  if (!detail) return <PageContainer><p>Candidate not found.</p></PageContainer>;

  const c = detail.candidates;
  const currentStage = stages.find((s) => s.key === detail.stage)?.label ?? detail.stage;

  return (
    <PageContainer>
      <Link to={`/jobs/${jobId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to {detail.jobs?.title ?? "job"}
      </Link>

      {/* Header card */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div className="min-w-0">
            <h1 className="font-display text-3xl md:text-4xl tracking-tight leading-tight">{c.full_name}</h1>
            {c.headline && <p className="text-sm text-muted-foreground mt-1">{c.headline}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{currentStage}</Badge>
            {canMove && (
              <Select value={detail.stage} onValueChange={moveStage}>
                <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {resumeUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={resumeUrl} target="_blank" rel="noreferrer"><Download className="h-3 w-3" /> Resume</a>
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HeaderField icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={c.email ? <a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : <span className="text-muted-foreground">—</span>} />
          <HeaderField icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={c.phone ? <a className="hover:underline" href={`tel:${c.phone}`}>{c.phone}</a> : <span className="text-muted-foreground">—</span>} />
          <HeaderField icon={<Tag className="h-3.5 w-3.5" />} label="Source" value={c.source ? <span className="capitalize">{c.source.replace(/_/g, " ")}</span> : <span className="text-muted-foreground">—</span>} />
          <HeaderField icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn" value={c.linkedin_url ? <a className="hover:underline" href={c.linkedin_url} target="_blank" rel="noreferrer">View profile</a> : <span className="text-muted-foreground">—</span>} />
        </div>
      </Card>

      <Tabs defaultValue="resume">
        <TabsList>
          <TabsTrigger value="resume"><FileText className="h-3.5 w-3.5" /> Resume</TabsTrigger>
          <TabsTrigger value="cover">Cover letter</TabsTrigger>
          <TabsTrigger value="interviews"><ClipboardList className="h-3.5 w-3.5" /> Interviews ({feedback.length})</TabsTrigger>
          <TabsTrigger value="scorecard"><Star className="h-3.5 w-3.5" /> Scorecard</TabsTrigger>
          <TabsTrigger value="comments"><MessageSquare className="h-3.5 w-3.5" /> Comments ({comments.length})</TabsTrigger>
        </TabsList>


        <TabsContent value="resume" className="mt-4">
          <Card className="p-4">
            {resumeUrl && c.resume_path ? (
              (() => {
                const isPdf = /\.pdf($|\?)/i.test(c.resume_path);
                const fileName = c.resume_path.split("/").pop() ?? "resume";
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="text-sm font-medium truncate">{fileName}</div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <a href={resumeUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Open</a>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={resumeUrl} download={fileName}><Download className="h-3 w-3" /> Download</a>
                        </Button>
                      </div>
                    </div>
                    {isPdf ? (
                      <iframe src={resumeUrl} className="w-full h-[70vh] rounded-md border" title="Resume" />
                    ) : (
                      <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                        Inline preview isn't available for this file type. Use “Open” or “Download” above to view it.
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="text-sm text-muted-foreground">No resume uploaded for this candidate.</p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="cover" className="mt-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">No cover letter on file.</p>
          </Card>
        </TabsContent>

        <TabsContent value="interviews" className="mt-4 space-y-3">
          {feedback.length === 0 && <p className="text-sm text-muted-foreground">No interview feedback yet. Add it from the Scorecard tab.</p>}
          {feedback.map((f) => (
            <Card key={f.id} className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>{f.author?.display_name ?? "Someone"} • {new Date(f.created_at).toLocaleDateString()}</span>
                <div className="flex items-center gap-2">
                  {f.rating && (
                    <span className="inline-flex items-center gap-0.5">
                      {Array.from({ length: f.rating }).map((_, i) => <Star key={i} className="h-3 w-3 fill-current text-primary" />)}
                    </span>
                  )}
                  {f.recommendation && <Badge variant="outline" className="capitalize">{f.recommendation.replace("_", " ")}</Badge>}
                </div>
              </div>
              {f.strengths && <p className="text-sm mt-2"><strong>Strengths:</strong> {f.strengths}</p>}
              {f.concerns && <p className="text-sm mt-1"><strong>Concerns:</strong> {f.concerns}</p>}
              {f.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{f.notes}</p>}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="scorecard" className="mt-4 space-y-3">
          {feedback.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Average rating</div>
                  <div className="font-display text-3xl mt-1">
                    {(feedback.filter(f => f.rating).reduce((a, f) => a + (f.rating ?? 0), 0) / Math.max(1, feedback.filter(f => f.rating).length)).toFixed(1)}
                    <span className="text-base text-muted-foreground"> / 5</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Reviews</div>
                  <div className="font-display text-3xl mt-1">{feedback.length}</div>
                </div>
              </div>
              <div className="space-y-2 pt-3 mt-3 border-t">
                {feedback.map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{f.author?.display_name ?? "Someone"}</span>
                    <div className="flex items-center gap-2">
                      {f.rating && (
                        <span className="inline-flex items-center gap-0.5">
                          {Array.from({ length: f.rating }).map((_, i) => <Star key={i} className="h-3 w-3 fill-current text-primary" />)}
                        </span>
                      )}
                      {f.recommendation && <Badge variant="outline" className="capitalize text-[10px]">{f.recommendation.replace("_", " ")}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card className="p-4">
            <div className="font-display text-base mb-3">Add interview feedback</div>
            <form onSubmit={submitFeedback} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Rating (1-5)</Label>
                  <Select value={fbForm.rating} onValueChange={(v) => setFbForm({ ...fbForm, rating: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Recommendation</Label>
                  <Select value={fbForm.recommendation} onValueChange={(v) => setFbForm({ ...fbForm, recommendation: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strong_yes">Strong yes</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="strong_no">Strong no</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Strengths</Label>
                <Textarea rows={2} value={fbForm.strengths} onChange={(e) => setFbForm({ ...fbForm, strengths: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Concerns</Label>
                <Textarea rows={2} value={fbForm.concerns} onChange={(e) => setFbForm({ ...fbForm, concerns: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} value={fbForm.notes} onChange={(e) => setFbForm({ ...fbForm, notes: e.target.value })} />
              </div>
              <Button type="submit" size="sm">Submit feedback</Button>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="comments" className="mt-4 space-y-3">
          {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
          {comments.map((c) => (
            <Card key={c.id} className="p-3">
              <div className="text-xs text-muted-foreground mb-1">
                {c.author?.display_name ?? "Someone"} • {new Date(c.created_at).toLocaleString()}
              </div>
              <div className="text-sm whitespace-pre-wrap">{c.body}</div>
            </Card>
          ))}
          <div className="space-y-2">
            <Textarea
              placeholder="Write a comment… use @name to mention"
              rows={3}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            {mentionables.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Mention: {mentionables.filter((u) => u.display_name).map((u) => `@${u.display_name}`).slice(0, 5).join(", ")}
              </p>
            )}
            <Button size="sm" onClick={postComment} disabled={posting || !newComment.trim()}>
              <Send className="h-3 w-3" /> Post
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
