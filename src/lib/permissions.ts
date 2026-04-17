import type { WorkspaceRole } from "@/lib/workspace";

export const canEditWorkspace = (role: WorkspaceRole | null) =>
  role === "owner" || role === "recruiter";

export const isHiringManager = (role: WorkspaceRole | null) => role === "hiring_manager";

export const canViewAllCandidates = (role: WorkspaceRole | null) =>
  role === "owner" || role === "recruiter" || role === "viewer";

export const canMoveStages = (role: WorkspaceRole | null) =>
  role === "owner" || role === "recruiter";

export const STAGE_LABELS: Record<string, string> = {
  sourced: "Sourced",
  contacted: "Contacted",
  screened: "Screened",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export const STAGES = [
  "sourced",
  "contacted",
  "screened",
  "interview",
  "offer",
  "hired",
  "rejected",
] as const;

export type Stage = (typeof STAGES)[number];
