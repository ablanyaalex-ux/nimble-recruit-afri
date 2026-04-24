import type { WorkspaceRole } from "@/lib/workspace";

export const canEditWorkspace = (role: WorkspaceRole | null) =>
  role === "owner" || role === "recruiter";

export const isHiringManager = (role: WorkspaceRole | null) =>
  (role as string) === "hiring_manager";

export const canViewAllCandidates = (role: WorkspaceRole | null) =>
  role === "owner" || role === "recruiter" || role === "viewer";

export const canMoveStages = (role: WorkspaceRole | null) =>
  role === "owner" || role === "recruiter";

// Stage keys that hiring managers may NOT see (they only see from First Interview onward)
export const HM_HIDDEN_STAGE_KEYS = new Set<string>(["application", "reviewed", "sourced", "contacted", "screened"]);

export type PipelineStage = { key: string; label: string; position: number };

export const DEFAULT_STAGES: PipelineStage[] = [
  { key: "application", label: "Application", position: 1 },
  { key: "reviewed", label: "Reviewed", position: 2 },
  { key: "first_interview", label: "First Interview", position: 3 },
  { key: "second_interview", label: "Second Interview", position: 4 },
  { key: "offer", label: "Offer", position: 5 },
  { key: "offer_accepted", label: "Offer Accepted", position: 6 },
];

export const visibleStagesForRole = (
  role: WorkspaceRole | null,
  stages: PipelineStage[]
): PipelineStage[] =>
  isHiringManager(role) ? stages.filter((s) => !HM_HIDDEN_STAGE_KEYS.has(s.key)) : stages;

export const CANDIDATE_SOURCES = [
  "LinkedIn Recruiter",
  "Referral",
  "Applied",
  "Job Board",
  "Careers Page",
  "Headhunting",
  "Event / Networking",
  "Other",
] as const;
