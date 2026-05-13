import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, Mail, Phone, Linkedin, Tag, Send, Star, FileText, MessageSquare, ClipboardList, ExternalLink, MapPin, Sparkles, RefreshCw, ChevronRight, X, Undo2, Pencil, Briefcase, MoreHorizontal, ShieldOff, CheckCircle2, AlertCircle, ArrowRightCircle, FileSearch, Quote, CalendarPlus, History, ChevronDown } from "lucide-react";
import { ScheduleInterviewDialog } from "@/components/interviews/ScheduleInterviewDialog";
import { CandidateInterviewsTab } from "@/components/interviews/CandidateInterviewsTab";
import { CandidateInterviewTimeline } from "@/components/interviews/CandidateInterviewTimeline";
import { CandidateStagesTimeline } from "@/components/pipeline/CandidateStagesTimeline";
import { CandidateActivityFeed } from "@/components/pipeline/CandidateActivityFeed";
import { CandidateDocuments } from "@/components/pipeline/CandidateDocuments";
import { SendEmailDialog } from "@/components/pipeline/SendEmailDialog";
import { OffersSection } from "@/components/pipeline/OffersSection";
import { Activity, GitBranch, ClipboardCheck, FolderOpen, MessageCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AnonymiseCvDialog } from "@/components/pipeline/AnonymiseCvDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { canEditWorkspace, canMoveStages, CANDIDATE_SOURCES, isHiringManager, visibleStagesForRole } from "@/lib/permissions";
import { Switch } from "@/components/ui/switch";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { PageContainer } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RejectionReasonPopover } from "@/components/pipeline/RejectionReasonPopover";
import { MentionTextarea } from "@/components/pipeline/MentionTextarea";
import { CommentBody } from "@/components/pipeline/CommentBody";
import { parseMentionedUserIds, type MentionableUser } from "@/lib/mentions";
import { anonymizeName } from "@/lib/anonymize";

import { toast } from "sonner";

type Detail = {
  id: string;
  stage: string;
  rejected: boolean;
  rejection_reason: string | null;
  candidate_id: string;
  job_id: string;
  anonymized: boolean;
  match_score: number | null;
  match_verdict: string | null;
  match_rationale: string | null;
  match_breakdown: { skills_matched?: string[]; gaps?: string[]; next_steps?: string[] } | null;
  jobs: { workspace_id: string; client_id: string; title: string; description: string | null } | null;
  candidates: {
    full_name: string;
    email: string | null;
    phone: string | null;
    headline: string | null;
    linkedin_url: string | null;
    resume_path: string | null;
    redacted_resume_path: string | null;
    redaction_rects: any;
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

type JobOption = {
  id: string;
  title: string;
  status: string;
  clients: { name: string } | null;
};

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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentRole } = useWorkspace();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rescheduleInterviewId, setRescheduleInterviewId] = useState<string | null>(null);
  const [interviewsRefresh, setInterviewsRefresh] = useState(0);
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam ?? "summary";
  const [emailOpen, setEmailOpen] = useState(false);
  const canMove = canMoveStages(currentRole);
  const canEdit = canEditWorkspace(currentRole);
  const isHM = isHiringManager(currentRole);

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
  const [redactedResumeUrl, setRedactedResumeUrl] = useState<string | null>(null);
  const [redactedPath, setRedactedPath] = useState<string | null>(null);
  const [anonymiseOpen, setAnonymiseOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [progressing, setProgressing] = useState(false);
  const [editCandidateOpen, setEditCandidateOpen] = useState(false);
  const [editCandidateForm, setEditCandidateForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    headline: "",
    location: "",
    linkedin_url: "",
    source: "none",
    notes: "",
  });
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [addToJobOpen, setAddToJobOpen] = useState(false);
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [loadingJobOptions, setLoadingJobOptions] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [targetStage, setTargetStage] = useState("application");
  const [addingToJob, setAddingToJob] = useState(false);
  const [docCount, setDocCount] = useState(0);
  const [cvOpen, setCvOpen] = useState(true);

  const { stages: allStages } = usePipelineStages(detail?.jobs?.workspace_id);
  const stages = visibleStagesForRole(currentRole, allStages);

  useEffect(() => {
    if (stages.length > 0 && !stages.some((stage) => stage.key === targetStage)) {
      setTargetStage(stages[0].key);
    }
  }, [stages, targetStage]);

  const refresh = async () => {
    if (!jobCandidateId) return;
    setLoading(true);
    const { data } = await supabase
      .from("job_candidates")
      .select("id, stage, rejected, rejection_reason, candidate_id, job_id, anonymized, match_score, match_verdict, match_rationale, match_breakdown, jobs(workspace_id, client_id, title, description), candidates(full_name, email, phone, headline, linkedin_url, resume_path, redacted_resume_path, redaction_rects, notes, source, location, resume_summary)")
      .eq("id", jobCandidateId)
      .single();
    if (data) {
      setDetail(data as unknown as Detail);
      setSummary((data.candidates as any)?.resume_summary ?? null);
      const rPath = (data.candidates as any)?.redacted_resume_path ?? null;
      setRedactedPath(rPath);
      if (data.candidates?.resume_path) {
        const { data: signed } = await supabase.storage
          .from("resumes")
          .createSignedUrl(data.candidates.resume_path, 600);
        setResumeUrl(signed?.signedUrl ?? null);
      } else {
        setResumeUrl(null);
      }
      if (rPath) {
        const { data: rs } = await supabase.storage.from("resumes").createSignedUrl(rPath, 600);
        setRedactedResumeUrl(rs?.signedUrl ?? null);
      } else {
        setRedactedResumeUrl(null);
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

  // Realtime: refresh stage/rejection state when the candidate row updates elsewhere (e.g. Kanban)
  useEffect(() => {
    if (!jobCandidateId) return;
    const ch = supabase
      .channel(`jc-${jobCandidateId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "job_candidates", filter: `id=eq.${jobCandidateId}` },
        (payload) => {
          const row = payload.new as any;
          setDetail((prev) => prev ? { ...prev, stage: row.stage, rejected: row.rejected, rejection_reason: row.rejection_reason } : prev);
          setInterviewsRefresh((n) => n + 1);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [jobCandidateId]);

  useEffect(() => {
    const loadMentionables = async () => {
      if (!detail?.jobs) return;
      const { workspace_id, client_id } = detail.jobs;
      const [memRes, hmRes] = await Promise.all([
        supabase.from("workspace_members").select("user_id, role").eq("workspace_id", workspace_id),
        supabase.from("client_contacts").select("user_id, name, title").eq("client_id", client_id).not("user_id", "is", null),
      ]);
      const memberRows = (memRes.data ?? []).filter((m) => ["owner", "recruiter"].includes(String(m.role)));
      const hmRows = (hmRes.data ?? []).filter((c) => c.user_id);
      const ids = Array.from(new Set([
        ...memberRows.map((m) => m.user_id),
        ...hmRows.map((c) => c.user_id as string),
      ].filter((id) => id !== user?.id)));
      if (ids.length === 0) return setMentionables([]);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));
      const people = new Map<string, MentionableUser>();

      for (const member of memberRows) {
        if (member.user_id === user?.id) continue;
        const profile = profilesById.get(member.user_id);
        people.set(member.user_id, {
          id: member.user_id,
          display_name: profile?.display_name ?? null,
          role_label: "Recruiter",
        });
      }
      for (const contact of hmRows) {
        const userId = contact.user_id as string;
        if (userId === user?.id) continue;
        const profile = profilesById.get(userId);
        people.set(userId, {
          id: userId,
          display_name: contact.name || profile?.display_name || null,
          role_label: "Hiring manager",
          subtitle: contact.title,
        });
      }
      setMentionables(Array.from(people.values()).sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? "")));
    };
    loadMentionables();
  }, [detail, user?.id]);

  const moveStage = async (stage: string) => {
    if (!detail) return;
    const { error } = await supabase.from("job_candidates").update({ stage: stage as any }).eq("id", detail.id);
    if (error) return toast.error(error.message);
    toast.success("Stage updated.");
    setDetail({ ...detail, stage });
  };

  const toggleAnonymized = async (next: boolean) => {
    if (!detail) return;
    const { error } = await supabase
      .from("job_candidates")
      .update({ anonymized: next } as any)
      .eq("id", detail.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Candidate anonymised for hiring managers." : "Candidate details revealed.");
    setDetail({ ...detail, anonymized: next });
  };

  const progressCandidate = async () => {
    if (!detail) return;
    const idx = stages.findIndex((s) => s.key === detail.stage);
    const next = stages[idx + 1];
    if (!next) return toast.info("Already at the final stage.");
    setProgressing(true);
    const { error } = await supabase
      .from("job_candidates")
      .update({ stage: next.key as any, rejected: false, rejected_at: null, rejected_by: null })
      .eq("id", detail.id);
    setProgressing(false);
    if (error) return toast.error(error.message);
    toast.success(`Progressed to ${next.label}.`);
    setDetail({ ...detail, stage: next.key, rejected: false });
  };

  const rejectCandidate = async (rawReason: string) => {
    if (!detail || !user) return;
    const reason = rawReason.trim();
    if (!reason) {
      toast.error("Please select a rejection reason.");
      return false;
    }
    setProgressing(true);
    const { error } = await supabase
      .from("job_candidates")
      .update({
        rejected: true,
        rejected_at: new Date().toISOString(),
        rejected_by: user.id,
        rejection_reason: reason,
      })
      .eq("id", detail.id);
    setProgressing(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Candidate rejected.");
    setDetail({ ...detail, rejected: true, rejection_reason: reason });
    return true;
  };

  const unrejectCandidate = async () => {
    if (!detail) return;
    setProgressing(true);
    const { error } = await supabase
      .from("job_candidates")
      .update({ rejected: false, rejected_at: null, rejected_by: null, rejection_reason: null })
      .eq("id", detail.id);
    setProgressing(false);
    if (error) return toast.error(error.message);
    toast.success("Candidate un-rejected.");
    setDetail({ ...detail, rejected: false, rejection_reason: null });
  };

  const openEditCandidate = () => {
    if (!detail) return;
    setEditCandidateForm({
      full_name: detail.candidates.full_name,
      email: detail.candidates.email ?? "",
      phone: detail.candidates.phone ?? "",
      headline: detail.candidates.headline ?? "",
      location: detail.candidates.location ?? "",
      linkedin_url: detail.candidates.linkedin_url ?? "",
      source: detail.candidates.source ?? "none",
      notes: detail.candidates.notes ?? "",
    });
    setEditCandidateOpen(true);
  };

  const saveCandidateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const fullName = editCandidateForm.full_name.trim();
    if (!fullName) return toast.error("Full name is required.");

    setSavingCandidate(true);
    const { error } = await supabase
      .from("candidates")
      .update({
        full_name: fullName,
        email: editCandidateForm.email.trim() || null,
        phone: editCandidateForm.phone.trim() || null,
        headline: editCandidateForm.headline.trim() || null,
        location: editCandidateForm.location.trim() || null,
        linkedin_url: editCandidateForm.linkedin_url.trim() || null,
        source: editCandidateForm.source === "none" ? null : editCandidateForm.source,
        notes: editCandidateForm.notes.trim() || null,
      })
      .eq("id", detail.candidate_id);
    setSavingCandidate(false);
    if (error) return toast.error(error.message);
    toast.success("Candidate updated.");
    setEditCandidateOpen(false);
    refresh();
  };

  const loadJobOptions = async () => {
    if (!detail?.jobs) return;
    setLoadingJobOptions(true);
    setJobOptions([]);
    const [jobsRes, existingRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, title, status, clients(name)")
        .eq("workspace_id", detail.jobs.workspace_id)
        .neq("id", detail.job_id)
        .order("created_at", { ascending: false }),
      supabase.from("job_candidates").select("job_id").eq("candidate_id", detail.candidate_id),
    ]);
    setLoadingJobOptions(false);
    if (jobsRes.error) return toast.error(jobsRes.error.message);
    if (existingRes.error) return toast.error(existingRes.error.message);

    const alreadyAttached = new Set((existingRes.data ?? []).map((row) => row.job_id));
    const availableJobs = ((jobsRes.data ?? []) as unknown as JobOption[]).filter((job) => !alreadyAttached.has(job.id));
    setJobOptions(availableJobs);
    setSelectedJobId("");
    setTargetStage(stages[0]?.key ?? "application");
  };

  const openAddToJob = () => {
    setAddToJobOpen(true);
    loadJobOptions();
  };

  const addCandidateToJob = async () => {
    if (!detail || !user || !selectedJobId) return;
    setAddingToJob(true);
    const { error } = await supabase.from("job_candidates").insert({
      job_id: selectedJobId,
      candidate_id: detail.candidate_id,
      added_by: user.id,
      stage: targetStage,
    });
    setAddingToJob(false);
    if (error) return toast.error(error.message);
    toast.success("Candidate added to job.");
    setAddToJobOpen(false);
    setSelectedJobId("");
  };

  const generateSummary = async (force = false) => {
    if (!detail) return;
    setSummaryLoading(true);
    const { data, error } = await supabase.functions.invoke("summarize-resume", {
      body: { candidateId: detail.candidate_id, jobCandidateId: detail.id, force },
    });
    setSummaryLoading(false);
    if (error) {
      const msg = (error as any)?.context?.error || (error as any)?.message || "Failed to generate summary";
      return toast.error(msg);
    }
    if ((data as any)?.summary) setSummary((data as any).summary);
    if ((data as any)?.summary) {
      if (!(data as any).cached) toast.success("Summary generated.");
    } else if ((data as any)?.error) {
      toast.error((data as any).error);
    }
  };

  const generateMatch = async (force = false) => {
    if (!detail) return;
    setMatchLoading(true);
    const { data, error } = await supabase.functions.invoke("match-candidate", {
      body: { jobCandidateId: detail.id, force },
    });
    setMatchLoading(false);
    if (error) {
      const msg = (error as any)?.context?.error || (error as any)?.message || "Failed to score match";
      return toast.error(msg);
    }
    if ((data as any)?.error) return toast.error((data as any).error);
    const score = (data as any)?.score;
    const verdict = (data as any)?.verdict;
    const rationale = (data as any)?.rationale;
    if (typeof score === "number") {
      setDetail({ ...detail, match_score: score, match_verdict: verdict ?? null, match_rationale: rationale ?? null, match_breakdown: (data as any)?.breakdown ?? null });
      if (!(data as any).cached) toast.success("Match score generated.");
    }
  };

  const removeAnonymisation = async () => {
    if (!detail) return;
    const { error: cErr } = await supabase
      .from("candidates")
      .update({ redacted_resume_path: null, redaction_rects: [] as any })
      .eq("id", detail.candidate_id);
    if (cErr) return toast.error(cErr.message);
    const { error: jErr } = await supabase
      .from("job_candidates")
      .update({ anonymized: false } as any)
      .eq("id", detail.id);
    if (jErr) return toast.error(jErr.message);
    setRedactedPath(null);
    setRedactedResumeUrl(null);
    setDetail({ ...detail, anonymized: false, candidates: { ...detail.candidates, redacted_resume_path: null, redaction_rects: [] } });
    toast.success("Anonymisation removed.");
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
    const mentioned = parseMentionedUserIds(text, mentionables, user.id);
    if (mentioned.length) {
      const { error: mentionError } = await supabase
        .from("comment_mentions")
        .insert(mentioned.map((id) => ({ comment_id: c.id, mentioned_user_id: id })));
      if (mentionError) {
        setPosting(false);
        return toast.error(`Comment posted, but mentions failed: ${mentionError.message}`);
      }
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
  // Once a recruiter saves redactions, the candidate is anonymised — the redacted
  // view applies to everyone (recruiters and HMs) so what you see is what HMs see.
  const showRedactedView = !!detail.anonymized && !!redactedPath;
  const hideForHM = showRedactedView;
  const displayName = showRedactedView ? anonymizeName(c.full_name) : c.full_name;
  const displaySummary = summary;
  const isPdfResume = !!c.resume_path && /\.pdf($|\?)/i.test(c.resume_path);
  const cvUrlToShow = showRedactedView ? redactedResumeUrl : resumeUrl;
  const cvPathToShow = showRedactedView ? redactedPath : c.resume_path;

  return (
    <PageContainer>
      <Link to={`/app/jobs/${jobId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to {detail.jobs?.title ?? "job"}
      </Link>

      {/* Header card */}
      <Card className={`p-6 mb-6 ${detail.rejected ? "border-destructive/40" : ""}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div className="min-w-0">
            <h1 className="font-display text-3xl md:text-4xl tracking-tight leading-tight">{displayName}</h1>
            {!hideForHM && c.headline && <p className="text-sm text-muted-foreground mt-1">{c.headline}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {detail.rejected && <Badge variant="destructive">Rejected</Badge>}
            <Badge variant="secondary">{currentStage}</Badge>
            {detail.anonymized && <Badge variant="outline">Anonymised</Badge>}
            {canMove && (
              <Select value={detail.stage} onValueChange={moveStage}>
                <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {canMove && !detail.rejected && (
              <>
                <Button size="sm" variant="outline" onClick={() => { setRescheduleInterviewId(null); setScheduleOpen(true); }}>
                  <CalendarPlus className="h-3.5 w-3.5" /> Schedule interview
                </Button>
                {!isHM && (
                  <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
                    <Mail className="h-3.5 w-3.5" /> Send email
                  </Button>
                )}
                <Button size="sm" onClick={progressCandidate} disabled={progressing}>
                  <ChevronRight className="h-3.5 w-3.5" /> Progress
                </Button>
                <RejectionReasonPopover disabled={progressing} align="end" onReasonSelect={rejectCandidate}>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={progressing}>
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </RejectionReasonPopover>
              </>
            )}
            {canMove && detail.rejected && (
              <Button size="sm" variant="outline" onClick={unrejectCandidate} disabled={progressing}>
                <Undo2 className="h-3.5 w-3.5" /> Un-reject
              </Button>
            )}

            {!isHM && (canEdit || canMove || resumeUrl) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <MoreHorizontal className="h-3.5 w-3.5" /> More actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Candidate</DropdownMenuLabel>
                  {canEdit && (
                    <>
                      <DropdownMenuItem onClick={openEditCandidate}>
                        <Pencil className="h-3.5 w-3.5" /> Edit candidate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={openAddToJob}>
                        <Briefcase className="h-3.5 w-3.5" /> Add to job
                      </DropdownMenuItem>
                    </>
                  )}
                  {resumeUrl && !hideForHM && (
                    <DropdownMenuItem asChild>
                      <a href={resumeUrl} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5" /> Download resume
                      </a>
                    </DropdownMenuItem>
                  )}
                  {canMove && isPdfResume && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setAnonymiseOpen(true)}>
                        <ShieldOff className="h-3.5 w-3.5" />
                        {detail.anonymized ? "Edit anonymisation" : "Anonymise candidate"}
                      </DropdownMenuItem>
                      {detail.anonymized && (
                        <DropdownMenuItem
                          onClick={removeAnonymisation}
                          className="text-destructive focus:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" /> Remove anonymisation
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {hideForHM ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <HeaderField icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={<span className="text-muted-foreground">Redacted</span>} />
            <HeaderField icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={<span className="text-muted-foreground">Redacted</span>} />
            <HeaderField icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={<span className="text-muted-foreground">Redacted</span>} />
            <HeaderField icon={<Tag className="h-3.5 w-3.5" />} label="Source" value={c.source ? <span className="capitalize">{c.source.replace(/_/g, " ")}</span> : <span className="text-muted-foreground">—</span>} />
            <HeaderField icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn" value={<span className="text-muted-foreground">Redacted</span>} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <HeaderField icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={c.email ? <a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : <span className="text-muted-foreground">—</span>} />
            <HeaderField icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={c.phone ? <a className="hover:underline" href={`tel:${c.phone}`}>{c.phone}</a> : <span className="text-muted-foreground">—</span>} />
            <HeaderField icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={c.location ? c.location : <span className="text-muted-foreground">—</span>} />
            <HeaderField icon={<Tag className="h-3.5 w-3.5" />} label="Source" value={c.source ? <span className="capitalize">{c.source.replace(/_/g, " ")}</span> : <span className="text-muted-foreground">—</span>} />
            <HeaderField icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn" value={c.linkedin_url ? <a className="hover:underline" href={c.linkedin_url} target="_blank" rel="noreferrer">View profile</a> : <span className="text-muted-foreground">—</span>} />
          </div>
        )}
        {detail.rejected && detail.rejection_reason && (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="text-[11px] uppercase tracking-wider text-destructive font-medium mb-1">Rejection reason</div>
            <div className="text-sm whitespace-pre-wrap">{detail.rejection_reason}</div>
          </div>
        )}
      </Card>

      <Tabs defaultValue={initialTab} onValueChange={(v) => setSearchParams(v === "summary" ? {} : { tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="summary"><FileText className="h-3.5 w-3.5" /> Summary</TabsTrigger>
          <TabsTrigger value="stages"><GitBranch className="h-3.5 w-3.5" /> Stages</TabsTrigger>
          <TabsTrigger value="evaluation"><ClipboardCheck className="h-3.5 w-3.5" /> Evaluation</TabsTrigger>
          <TabsTrigger value="documents">
            <FolderOpen className="h-3.5 w-3.5" /> Documents{c.resume_path || docCount > 0 ? ` (${(c.resume_path ? 1 : 0) + docCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="comments">
            <MessageCircle className="h-3.5 w-3.5" /> Comments{comments.length > 0 ? ` (${comments.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="activity"><Activity className="h-3.5 w-3.5" /> Activity</TabsTrigger>
        </TabsList>


        <TabsContent value="summary" className="mt-4 space-y-4">
          {c.resume_path && (
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <div className="font-display text-base">AI summary</div>
                  {hideForHM && <Badge variant="outline" className="text-[10px]">Anonymised</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {summary ? (
                    <Button size="sm" variant="ghost" onClick={() => generateSummary(true)} disabled={summaryLoading}>
                      <RefreshCw className={`h-3 w-3 ${summaryLoading ? "animate-spin" : ""}`} /> Regenerate
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => generateSummary(false)} disabled={summaryLoading}>
                      <Sparkles className="h-3 w-3" /> {summaryLoading ? "Generating…" : "Generate summary"}
                    </Button>
                  )}
                </div>
              </div>
              {summaryLoading && !summary ? (
                <p className="text-sm text-muted-foreground">Reading the resume and writing a brief… this can take ~10–20s.</p>
              ) : displaySummary ? (
                <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{displaySummary}</div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <>Click <em>Generate summary</em> to get an AI-written brief of this resume.</>
                </p>
              )}
            </Card>
          )}

          {c.resume_path && (
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <div className="font-display text-base">AI job-fit score</div>
                  {detail.match_verdict && (
                    <Badge
                      variant={detail.match_verdict === "good" ? "default" : detail.match_verdict === "cautious" ? "secondary" : "destructive"}
                      className="capitalize"
                    >
                      {detail.match_verdict} match
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {detail.match_score != null ? (
                    <Button size="sm" variant="ghost" onClick={() => generateMatch(true)} disabled={matchLoading || !detail.jobs?.description}>
                      <RefreshCw className={`h-3 w-3 ${matchLoading ? "animate-spin" : ""}`} /> Re-score
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => generateMatch(false)} disabled={matchLoading || !detail.jobs?.description}>
                      <Sparkles className="h-3 w-3" /> {matchLoading ? "Scoring…" : "Score match"}
                    </Button>
                  )}
                </div>
              </div>
              {!detail.jobs?.description ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
                  <div className="rounded-full bg-muted p-3">
                    <FileSearch className="h-6 w-6 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">No job description yet</div>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Add a job description to see a detailed match breakdown.
                    </p>
                  </div>
                </div>
              ) : matchLoading && detail.match_score == null ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                  <Skeleton className="h-16 w-full" />
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-5/6" />
                        <Skeleton className="h-3 w-4/6" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : detail.match_score != null ? (
                <div className="space-y-4">
                  <div className="flex items-baseline gap-2">
                    <div className="font-display text-4xl tracking-tight">{detail.match_score}</div>
                    <div className="text-sm text-muted-foreground">/ 100</div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full transition-all ${detail.match_verdict === "good" ? "bg-primary" : detail.match_verdict === "cautious" ? "bg-amber-500" : "bg-destructive"}`}
                      style={{ width: `${detail.match_score}%` }}
                    />
                  </div>

                  {detail.match_rationale && (
                    <div
                      className={`relative rounded-md border-l-4 bg-muted/40 p-4 pl-5 ${
                        detail.match_verdict === "good"
                          ? "border-l-primary"
                          : detail.match_verdict === "cautious"
                            ? "border-l-amber-500"
                            : "border-l-destructive"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Quote className="h-3.5 w-3.5" aria-hidden />
                        Insight summary
                      </div>
                      <p className="text-sm italic leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {detail.match_rationale}
                      </p>
                    </div>
                  )}

                  {detail.match_breakdown &&
                    (detail.match_breakdown.skills_matched?.length ||
                      detail.match_breakdown.gaps?.length ||
                      detail.match_breakdown.next_steps?.length) ? (
                    <div className="grid gap-3 pt-1 sm:grid-cols-3">
                      <Card className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500" aria-hidden />
                          <div className="text-sm font-medium">Skills matched</div>
                          <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                            {detail.match_breakdown.skills_matched?.length ?? 0}
                          </Badge>
                        </div>
                        {detail.match_breakdown.skills_matched && detail.match_breakdown.skills_matched.length > 0 ? (
                          <ul className="space-y-2 text-sm leading-snug text-foreground/90">
                            {detail.match_breakdown.skills_matched.map((s, i) => (
                              <li key={i} className="flex gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500 mt-0.5" aria-hidden />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">None identified.</p>
                        )}
                      </Card>

                      <Card className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" aria-hidden />
                          <div className="text-sm font-medium">Potential gaps</div>
                          <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                            {detail.match_breakdown.gaps?.length ?? 0}
                          </Badge>
                        </div>
                        {detail.match_breakdown.gaps && detail.match_breakdown.gaps.length > 0 ? (
                          <ul className="space-y-2 text-sm leading-snug text-foreground/90">
                            {detail.match_breakdown.gaps.map((s, i) => (
                              <li key={i} className="flex gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" aria-hidden />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">None identified.</p>
                        )}
                      </Card>

                      <Card className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <ArrowRightCircle className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden />
                          <div className="text-sm font-medium">Suggested next steps</div>
                          <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                            {detail.match_breakdown.next_steps?.length ?? 0}
                          </Badge>
                        </div>
                        {detail.match_breakdown.next_steps && detail.match_breakdown.next_steps.length > 0 ? (
                          <ul className="space-y-2 text-sm leading-snug text-foreground/90">
                            {detail.match_breakdown.next_steps.map((s, i) => (
                              <li key={i} className="flex gap-2">
                                <ArrowRightCircle className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" aria-hidden />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">None suggested.</p>
                        )}
                      </Card>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Click <em>Score match</em> to have AI compare this CV to the job requirements and rate the fit out of 100.
                </p>
              )}
            </Card>
          )}


          <Card className="p-4">
            <div className="font-display text-base mb-2">Cover letter</div>
            <p className="text-sm text-muted-foreground">No cover letter on file.</p>
          </Card>
        </TabsContent>

        <TabsContent value="stages" className="mt-4">
          <CandidateStagesTimeline
            jobCandidateId={jobCandidateId!}
            stages={allStages}
            currentStage={detail.stage}
            refreshKey={interviewsRefresh}
          />
        </TabsContent>

        <TabsContent value="evaluation" className="mt-4 space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-display text-base flex items-center gap-2">
                <CalendarPlus className="h-4 w-4 text-primary" /> Interviews
              </div>
              {canMove && !detail.rejected && (
                <Button size="sm" variant="outline" onClick={() => { setRescheduleInterviewId(null); setScheduleOpen(true); }}>
                  <CalendarPlus className="h-3.5 w-3.5" /> Schedule
                </Button>
              )}
            </div>
            <CandidateInterviewsTab
              key={interviewsRefresh}
              jobCandidateId={jobCandidateId!}
              onSchedule={() => { setRescheduleInterviewId(null); setScheduleOpen(true); }}
              onReschedule={(id) => { setRescheduleInterviewId(id); setScheduleOpen(true); }}
            />
          </Card>

          {detail.jobs && (
            <OffersSection
              workspaceId={detail.jobs.workspace_id}
              jobId={detail.job_id}
              jobCandidateId={detail.id}
              candidateId={detail.candidate_id}
              canEdit={canEdit}
              onOfferAccepted={() => {
                toast.success("🎉 Offer accepted! Candidate moved to Hired.");
                refresh();
              }}
            />
          )}

          <Card className="p-4">
            <div className="font-display text-base mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Interview timeline
            </div>
            <CandidateInterviewTimeline key={`tl-${interviewsRefresh}`} jobCandidateId={jobCandidateId!} />
          </Card>

          {feedback.length > 0 && (
            <Card className="p-4">
              <div className="font-display text-base mb-3 flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" /> Scorecard
              </div>
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
            <div className="font-display text-base mb-3 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" /> Feedback ({feedback.length})
            </div>
            <div className="space-y-3">
              {feedback.length === 0 && <p className="text-sm text-muted-foreground">No interview feedback yet. Add it below.</p>}
              {feedback.map((f) => (
                <div key={f.id} className="rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
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
                  {f.strengths && <p className="text-sm mt-1"><strong>Strengths:</strong> {f.strengths}</p>}
                  {f.concerns && <p className="text-sm mt-1"><strong>Concerns:</strong> {f.concerns}</p>}
                  {f.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{f.notes}</p>}
                </div>
              ))}
            </div>
            <form onSubmit={submitFeedback} className="space-y-3 mt-4 pt-4 border-t">
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

        <TabsContent value="documents" className="mt-4 space-y-4">
          {c.resume_path && (
            <Collapsible open={cvOpen} onOpenChange={setCvOpen}>
              <Card className="p-4">
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full text-left">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {showRedactedView ? "Redacted CV" : "CV / Resume"}
                        {redactedPath && !showRedactedView && (
                          <span className="ml-2 text-xs text-muted-foreground">(redacted version available)</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {showRedactedView
                          ? "Personal identifiers have been blacked out directly on the CV."
                          : "The original CV as uploaded."}
                      </p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${cvOpen ? "" : "-rotate-90"}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 pt-3 border-t">
                    {cvUrlToShow && cvPathToShow ? (
                      (() => {
                        const isPdf = /\.pdf($|\?)/i.test(cvPathToShow);
                        const fileName = (cvPathToShow.split("/").pop() ?? "resume").replace(/^[a-f0-9-]+\.pdf$/i, "resume.pdf");
                        return (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="text-sm text-muted-foreground truncate">{fileName}</div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" asChild>
                                  <a href={cvUrlToShow} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Open</a>
                                </Button>
                                {!showRedactedView && (
                                  <Button size="sm" variant="outline" asChild>
                                    <a href={cvUrlToShow} download={fileName}><Download className="h-3 w-3" /> Download</a>
                                  </Button>
                                )}
                              </div>
                            </div>
                            {isPdf ? (
                              <iframe src={cvUrlToShow} className="w-full h-[70vh] rounded-md border" title="Resume" />
                            ) : (
                              <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                                Inline preview isn't available for this file type. Use "Open" above to view it.
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : showRedactedView && !redactedPath ? (
                      <p className="text-sm text-muted-foreground">A redacted CV hasn't been generated yet.</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No resume uploaded for this candidate.</p>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {detail.jobs && (
            <CandidateDocuments
              jobCandidateId={detail.id}
              candidateId={detail.candidate_id}
              workspaceId={detail.jobs.workspace_id}
              canEdit={canEdit}
              onDocCountChange={setDocCount}
            />
          )}
        </TabsContent>

        <TabsContent value="comments" className="mt-4 space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-display text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" /> Comments ({comments.length})
              </div>
            </div>
            <div className="space-y-3">
              {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
              {comments.map((c) => {
                const mine = c.author_id === user?.id;
                const initials = (c.author?.display_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <div key={c.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                    <div className="h-7 w-7 shrink-0 rounded-full bg-muted grid place-items-center text-[10px] font-semibold text-muted-foreground">
                      {initials || "·"}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${mine ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"}`}>
                      <div className={`text-[11px] mb-0.5 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {c.author?.display_name ?? "Someone"} · {new Date(c.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </div>
                      <div className="text-sm">
                        <CommentBody text={c.body} users={mentionables} />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="space-y-2 pt-3 border-t">
                <MentionTextarea
                  value={newComment}
                  onChange={setNewComment}
                  users={mentionables}
                  placeholder="Write a comment… type @ to mention"
                  rows={3}
                  disabled={posting}
                />
                <div className="flex items-center justify-end">
                  <Button size="sm" onClick={postComment} disabled={posting || !newComment.trim()}>
                    <Send className="h-3 w-3" /> Post
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <CandidateActivityFeed
            jobCandidateId={jobCandidateId!}
            stages={allStages}
            refreshKey={interviewsRefresh}
          />
        </TabsContent>
      </Tabs>

      <ScheduleInterviewDialog
        open={scheduleOpen}
        onOpenChange={(v) => { setScheduleOpen(v); if (!v) setRescheduleInterviewId(null); }}
        jobCandidateId={jobCandidateId ?? null}
        existingInterviewId={rescheduleInterviewId}
        onCreated={() => { setInterviewsRefresh((n) => n + 1); setRescheduleInterviewId(null); setSearchParams({ tab: "interviews" }, { replace: true }); }}
      />

      <Dialog open={editCandidateOpen} onOpenChange={setEditCandidateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit candidate</DialogTitle></DialogHeader>
          <form onSubmit={saveCandidateInfo} className="space-y-4">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input
                value={editCandidateForm.full_name}
                onChange={(e) => setEditCandidateForm({ ...editCandidateForm, full_name: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editCandidateForm.email}
                  onChange={(e) => setEditCandidateForm({ ...editCandidateForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={editCandidateForm.phone}
                  onChange={(e) => setEditCandidateForm({ ...editCandidateForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Headline</Label>
                <Input
                  value={editCandidateForm.headline}
                  onChange={(e) => setEditCandidateForm({ ...editCandidateForm, headline: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={editCandidateForm.location}
                  onChange={(e) => setEditCandidateForm({ ...editCandidateForm, location: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>LinkedIn URL</Label>
                <Input
                  value={editCandidateForm.linkedin_url}
                  onChange={(e) => setEditCandidateForm({ ...editCandidateForm, linkedin_url: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Select
                  value={editCandidateForm.source}
                  onValueChange={(value) => setEditCandidateForm({ ...editCandidateForm, source: value })}
                >
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No source</SelectItem>
                    {CANDIDATE_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>{source}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={editCandidateForm.notes}
                onChange={(e) => setEditCandidateForm({ ...editCandidateForm, notes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditCandidateOpen(false)} disabled={savingCandidate}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingCandidate || !editCandidateForm.full_name.trim()}>
                {savingCandidate ? "Saving…" : "Save candidate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={addToJobOpen} onOpenChange={setAddToJobOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add candidate to another job</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {loadingJobOptions ? (
              <p className="text-sm text-muted-foreground">Loading available jobs…</p>
            ) : jobOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This candidate is already on every other available job in this workspace.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Job</Label>
                  <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                    <SelectTrigger><SelectValue placeholder="Choose job" /></SelectTrigger>
                    <SelectContent>
                      {jobOptions.map((job) => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.title}{job.clients?.name ? ` — ${job.clients.name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={targetStage} onValueChange={setTargetStage}>
                    <SelectTrigger><SelectValue placeholder="Pipeline stage" /></SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.key} value={stage.key}>{stage.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAddToJobOpen(false)} disabled={addingToJob}>
              Cancel
            </Button>
            <Button onClick={addCandidateToJob} disabled={addingToJob || loadingJobOptions || !selectedJobId || jobOptions.length === 0}>
              {addingToJob ? "Adding…" : "Add to job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <AnonymiseCvDialog
        open={anonymiseOpen}
        onOpenChange={setAnonymiseOpen}
        candidateId={detail.candidate_id}
        jobCandidateId={detail.id}
        resumePath={c.resume_path}
        initialRects={Array.isArray(c.redaction_rects) ? c.redaction_rects : []}
        onSaved={({ redactedPath, anonymized }) => {
          setDetail((prev) => prev ? { ...prev, anonymized, candidates: { ...prev.candidates, redacted_resume_path: redactedPath || null } } : prev);
          if (redactedPath) {
            setRedactedPath(redactedPath);
            supabase.storage.from("resumes").createSignedUrl(redactedPath, 600).then(({ data }) => setRedactedResumeUrl(data?.signedUrl ?? null));
          } else {
            setRedactedPath(null);
            setRedactedResumeUrl(null);
          }
          refresh();
        }}
      />

      {detail.jobs && (
        <SendEmailDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          workspaceId={detail.jobs.workspace_id}
          candidateId={detail.candidate_id}
          jobCandidateId={detail.id}
          candidateName={detail.candidates.full_name}
          candidateEmail={detail.candidates.email}
          jobTitle={detail.jobs.title}
          onSent={() => setInterviewsRefresh((n) => n + 1)}
        />
      )}
    </PageContainer>
  );
}
