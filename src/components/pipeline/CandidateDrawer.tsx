import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { canMoveStages } from "@/lib/permissions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Send, Star } from "lucide-react";
import { toast } from "sonner";

type Props = {
  jobCandidateId: string | null;
  onClose: () => void;
  onChanged: () => void;
};

type Detail = {
  id: string;
  stage: string;
  candidate_id: string;
  candidates: {
    full_name: string;
    email: string | null;
    phone: string | null;
    headline: string | null;
    linkedin_url: string | null;
    resume_path: string | null;
    notes: string | null;
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

export function CandidateDrawer({ jobCandidateId, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const { currentRole } = useWorkspace();
  const canMove = canMoveStages(currentRole);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [mentionables, setMentionables] = useState<MentionableUser[]>([]);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [fbForm, setFbForm] = useState({
    rating: "",
    recommendation: "",
    strengths: "",
    concerns: "",
    notes: "",
  });

  const refresh = async () => {
    if (!jobCandidateId) return;
    const { data } = await supabase
      .from("job_candidates")
      .select("id, stage, candidate_id, candidates(full_name, email, phone, headline, linkedin_url, resume_path, notes)")
      .eq("id", jobCandidateId)
      .single();
    if (data) {
      setDetail(data as unknown as Detail);
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
      supabase
        .from("candidate_comments")
        .select("id, body, author_id, created_at")
        .eq("job_candidate_id", jobCandidateId)
        .order("created_at", { ascending: true }),
      supabase
        .from("interview_feedback")
        .select("*")
        .eq("job_candidate_id", jobCandidateId)
        .order("created_at", { ascending: false }),
    ]);

    if (cRes.data) {
      const ids = Array.from(new Set(cRes.data.map((c) => c.author_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      setComments(cRes.data.map((c) => ({ ...c, author: byId.get(c.author_id) ?? null })));
    }
    if (fRes.data) {
      const ids = Array.from(new Set(fRes.data.map((f) => f.author_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      setFeedback(fRes.data.map((f) => ({ ...f, author: byId.get(f.author_id) ?? null })));
    }
  };

  useEffect(() => {
    if (!jobCandidateId) {
      setDetail(null);
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCandidateId]);

  // Load mentionable users (workspace members + linked hiring managers for this job's client)
  useEffect(() => {
    const loadMentionables = async () => {
      if (!detail) return;
      const { data: jc } = await supabase
        .from("job_candidates")
        .select("jobs(workspace_id, client_id)")
        .eq("id", detail.id)
        .single();
      const wsId = (jc as any)?.jobs?.workspace_id;
      const clientId = (jc as any)?.jobs?.client_id;
      if (!wsId) return;

      const [memRes, hmRes] = await Promise.all([
        supabase.from("workspace_members").select("user_id").eq("workspace_id", wsId),
        supabase.from("client_contacts").select("user_id").eq("client_id", clientId).not("user_id", "is", null),
      ]);
      const ids = Array.from(new Set([
        ...(memRes.data ?? []).map((m) => m.user_id),
        ...(hmRes.data ?? []).map((c) => c.user_id as string),
      ]));
      if (ids.length === 0) return setMentionables([]);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      setMentionables(profiles ?? []);
    };
    loadMentionables();
  }, [detail]);

  const moveStage = async (stage: string) => {
    if (!detail) return;
    const { error } = await supabase.from("job_candidates").update({ stage: stage as any }).eq("id", detail.id);
    if (error) return toast.error(error.message);
    toast.success("Stage updated.");
    onChanged();
    refresh();
  };

  const postComment = async () => {
    if (!detail || !user || !newComment.trim()) return;
    setPosting(true);
    const { data: c, error } = await supabase
      .from("candidate_comments")
      .insert({ job_candidate_id: detail.id, author_id: user.id, body: newComment.trim() })
      .select("id")
      .single();
    if (error || !c) {
      setPosting(false);
      return toast.error(error?.message ?? "Failed");
    }

    // Parse @mentions from text by matching display names
    const text = newComment.trim();
    const mentioned: string[] = [];
    for (const u of mentionables) {
      if (!u.display_name) continue;
      const re = new RegExp(`@${u.display_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(text) && u.id !== user.id) mentioned.push(u.id);
    }
    if (mentioned.length) {
      await supabase.from("comment_mentions").insert(
        mentioned.map((id) => ({ comment_id: c.id, mentioned_user_id: id }))
      );
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

  return (
    <Sheet open={!!jobCandidateId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {detail && (
          <>
            <SheetHeader>
              <SheetTitle className="font-display text-2xl">{detail.candidates.full_name}</SheetTitle>
              {detail.candidates.headline && (
                <p className="text-sm text-muted-foreground">{detail.candidates.headline}</p>
              )}
            </SheetHeader>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="capitalize">{detail.stage}</Badge>
              {canMove && (
                <Select value={detail.stage} onValueChange={moveStage}>
                  <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["application", "sourced", "contacted", "screened", "interview", "offer", "hired", "rejected"].map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {resumeUrl && (
                <Button size="sm" variant="outline" asChild>
                  <a href={resumeUrl} target="_blank" rel="noreferrer"><Download className="h-3 w-3" /> Resume</a>
                </Button>
              )}
            </div>

            <Tabs defaultValue="comments" className="mt-6">
              <TabsList>
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="feedback">Feedback ({feedback.length})</TabsTrigger>
                <TabsTrigger value="profile">Profile</TabsTrigger>
              </TabsList>

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

              <TabsContent value="feedback" className="mt-4 space-y-3">
                {feedback.map((f) => (
                  <Card key={f.id} className="p-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                      <span>{f.author?.display_name ?? "Someone"} • {new Date(f.created_at).toLocaleDateString()}</span>
                      <div className="flex items-center gap-2">
                        {f.rating && (
                          <span className="inline-flex items-center gap-0.5">
                            {Array.from({ length: f.rating }).map((_, i) => (
                              <Star key={i} className="h-3 w-3 fill-current text-primary" />
                            ))}
                          </span>
                        )}
                        {f.recommendation && (
                          <Badge variant="outline" className="capitalize">{f.recommendation.replace("_", " ")}</Badge>
                        )}
                      </div>
                    </div>
                    {f.strengths && <p className="text-sm mt-2"><strong>Strengths:</strong> {f.strengths}</p>}
                    {f.concerns && <p className="text-sm mt-1"><strong>Concerns:</strong> {f.concerns}</p>}
                    {f.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{f.notes}</p>}
                  </Card>
                ))}
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

              <TabsContent value="profile" className="mt-4 space-y-3">
                <Card className="p-4 space-y-3 text-sm">
                  <div><Label className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label><p>{detail.candidates.email ?? "—"}</p></div>
                  <div><Label className="text-xs uppercase tracking-wider text-muted-foreground">Phone</Label><p>{detail.candidates.phone ?? "—"}</p></div>
                  <div><Label className="text-xs uppercase tracking-wider text-muted-foreground">LinkedIn</Label><p className="truncate">{detail.candidates.linkedin_url ?? "—"}</p></div>
                  <div><Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label><p className="whitespace-pre-wrap">{detail.candidates.notes ?? "—"}</p></div>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
