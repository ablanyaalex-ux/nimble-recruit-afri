import type { PipelineStage } from "@/lib/permissions";

export type MilestoneKey = "application" | "screening" | "interviews" | "closing";

export const MILESTONES: { key: MilestoneKey; label: string }[] = [
  { key: "application", label: "Application" },
  { key: "screening", label: "Screening" },
  { key: "interviews", label: "Interviews" },
  { key: "closing", label: "Closing" },
];

const RULES: { key: MilestoneKey; match: RegExp }[] = [
  { key: "closing", match: /offer|accepted|hired|closed|filled|reject/i },
  { key: "interviews", match: /interview|panel|onsite|final/i },
  { key: "screening", match: /screen|recruiter call|chat|phone|assess|test|portfolio|task|exercise|challenge|reviewed?/i },
  { key: "application", match: /appl|cv|resume|new/i },
];

export function milestoneForStage(stage: Pick<PipelineStage, "key" | "label">): MilestoneKey {
  const hay = `${stage.key} ${stage.label}`.toLowerCase();
  for (const r of RULES) if (r.match.test(hay)) return r.key;
  return "application";
}

export type MilestoneGroup = {
  key: MilestoneKey;
  label: string;
  stages: PipelineStage[];
};

export function groupStagesByMilestone(stages: PipelineStage[]): MilestoneGroup[] {
  const map = new Map<MilestoneKey, PipelineStage[]>();
  for (const s of stages) {
    const k = milestoneForStage(s);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(s);
  }
  return MILESTONES.filter((m) => map.has(m.key)).map((m) => ({
    key: m.key,
    label: m.label,
    stages: map.get(m.key)!,
  }));
}
