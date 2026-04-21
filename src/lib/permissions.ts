import type { WorkspaceRole } from "@/lib/workspace";

export const canEditWorkspace = (role: WorkspaceRole | null) =>
  role === "owner" || role === "recruiter";

export const isHiringManager = (role: WorkspaceRole | null) =>
  (role as string) === "hiring_manager";

export const canViewAllCandidates = (role: WorkspaceRole | null) =>
  role === "owner" || role === "recruiter" || role === "viewer";

export const canMoveStages = (role: WorkspaceRole | null) =>
  role === "owner" || role === "recruiter";

export const STAGE_LABELS: Record<string, string> = {
  application: "Application",
  sourced: "Sourced",
  contacted: "Contacted",
  screened: "Screened",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export const STAGES = [
  "application",
  "sourced",
  "contacted",
  "screened",
  "interview",
  "offer",
  "hired",
  "rejected",
] as const;

export type Stage = (typeof STAGES)[number];

// Hiring managers see only candidates from Screened onward
export const HM_VISIBLE_STAGES: Stage[] = ["screened", "interview", "offer", "hired", "rejected"];

export const visibleStagesForRole = (role: WorkspaceRole | null): readonly Stage[] =>
  isHiringManager(role) ? HM_VISIBLE_STAGES : STAGES;
