export type JobStatus = "open" | "on_hold" | "closed" | "filled";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
  filled: "Filled",
};

// Color-coded badge classes per status. Uses semantic tokens where available
// and tailwind palette utilities tuned for both light and dark modes.
export const JOB_STATUS_BADGE: Record<JobStatus, string> = {
  open:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20",
  on_hold:
    "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20",
  closed:
    "border-transparent bg-destructive/15 text-destructive hover:bg-destructive/20",
  filled:
    "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20",
};

export const jobStatusBadgeClass = (status: string) =>
  JOB_STATUS_BADGE[(status as JobStatus)] ?? "";

export const jobStatusLabel = (status: string) =>
  JOB_STATUS_LABELS[(status as JobStatus)] ?? status.replace("_", " ");
