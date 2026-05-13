import type { PipelineStage } from "@/lib/permissions";

export type MilestoneKey = "application" | "screen" | "assessment" | "interviews" | "closing";

export const MILESTONES: { key: MilestoneKey; label: string }[] = [
  { key: "application", label: "Application" },
  { key: "screen", label: "Screen" },
  { key: "assessment", label: "Assessment" },
  { key: "interviews", label: "Interviews" },
  { key: "closing", label: "Closing" },
];

const RULES: { key: MilestoneKey; match: RegExp }[] = [
  { key: "closing", label: /offer|accepted|hired|closed|filled/i } as any,
  { key: "interviews", label: /interview|panel|onsite|final/i } as any,
  { key: "assessment", label: /assess|test|portfolio|task|exercise|challenge/i } as any,
  { key: "screen", label: /screen|recruiter call|chat|phone/i } as any,
  { key: "application", label: /appl|cv|resume|review|new/i } as any,
];

export function milestoneForStage(stage: Pick<PipelineStage, "key" | "label">): MilestoneKey {
  const hay = `${stage.key} ${stage.label}`.toLowerCase();
  for (const r of RULES) {
    if ((r as any).label.test(hay)) return r.key;
  }
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
