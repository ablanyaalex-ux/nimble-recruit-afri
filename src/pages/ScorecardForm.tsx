import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const RECOMMENDATIONS = [
  { value: "strong_hire", label: "Strong hire" },
  { value: "hire", label: "Hire" },
  { value: "no_hire", label: "No hire" },
  { value: "strong_no_hire", label: "Strong no hire" },
] as const;

type Competency = { key: string; label: string };

export default function ScorecardForm() {
  const { interviewId, interviewerId } = useParams<{ interviewId: string; interviewerId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [meta, setMeta] = useState<{ candidate: string; job: string } | null>(null);

  const isOwn = user?.id === interviewerId;

  async function load() {
    if (!interviewId || !interviewerId) return;
    const { data: interview } = await supabase
      .from("interview_schedules")
      .select("id, job_candidates(candidates(full_name), jobs(title, interview_competencies))")
      .eq("id", interviewId).maybeSingle();
    const jc: any = interview?.job_candidates;
    setMeta({ candidate: jc?.candidates?.full_name ?? "", job: jc?.jobs?.title ?? "" });
    const comps = (jc?.jobs?.interview_competencies ?? []) as Competency[];
    setCompetencies(comps.length ? comps : [
      { key: "technical", label: "Technical skills" },
      { key: "communication", label: "Communication" },
      { key: "culture", label: "Culture fit" },
    ]);
    const { data: card } = await supabase
      .from("interview_scorecards")
      .select("ratings, overall_recommendation, notes")
      .eq("interview_id", interviewId).eq("interviewer_id", interviewerId).maybeSingle();
    if (card) {
      setRatings((card.ratings as Record<string, number>) ?? {});
      setRecommendation(card.overall_recommendation);
      setNotes(card.notes ?? "");
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [interviewId, interviewerId]);

  async function save(submit: boolean) {
    if (!isOwn) { toast.error("You can only edit your own scorecard"); return; }
    setSaving(true);
    const { error } = await supabase.from("interview_scorecards").upsert({
      interview_id: interviewId,
      interviewer_id: interviewerId,
      ratings,
      overall_recommendation: recommendation,
      notes,
      submitted_at: submit ? new Date().toISOString() : null,
    }, { onConflict: "interview_id,interviewer_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(submit ? "Scorecard submitted" : "Saved");
    if (submit) navigate("/interviews");
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        eyebrow="Interview"
        title={`Scorecard — ${meta?.candidate ?? ""}`}
        subtitle={meta?.job}
      />
      <Card className="p-6 space-y-6">
        <div className="space-y-4">
          {competencies.map((c) => (
            <div key={c.key} className="flex items-center justify-between">
              <Label className="text-sm">{c.label}</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!isOwn}
                    onClick={() => setRatings({ ...ratings, [c.key]: n })}
                    className={cn(
                      "h-8 w-8 grid place-items-center rounded-md transition",
                      (ratings[c.key] ?? 0) >= n ? "text-amber-500" : "text-muted-foreground/40",
                      isOwn && "hover:text-amber-500"
                    )}
                  >
                    <Star className="h-5 w-5" fill={(ratings[c.key] ?? 0) >= n ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <Label className="text-sm">Overall recommendation</Label>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {RECOMMENDATIONS.map((r) => (
              <Button
                key={r.value}
                type="button"
                variant={recommendation === r.value ? "default" : "outline"}
                disabled={!isOwn}
                onClick={() => setRecommendation(r.value)}
                size="sm"
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-sm">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!isOwn}
            rows={5}
            placeholder="Strengths, concerns, follow-up areas..."
          />
        </div>

        {isOwn && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => save(false)} disabled={saving}>Save draft</Button>
            <Button onClick={() => save(true)} disabled={saving || !recommendation}>Submit scorecard</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
