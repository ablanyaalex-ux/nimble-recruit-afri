export type JobStatus = "open" | "on_hold" | "closed" | "filled";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
  filled: "Filled",
};

/**
 * Tailwind classes for color-coded job status badges.
 * Uses neutral palette colors directly — these are status semantics
 * (success/warning/danger) intentionally outside the brand tokens.
 */
export function jobStatusBadgeClass(status: JobStatus): string {
  switch (status) {
    case "open":
      return "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20";
    case "on_hold":
      return "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20";
    case "closed":
      return "border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20";
    case "filled":
      return "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20";
  }
}
