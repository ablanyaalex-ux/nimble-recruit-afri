## Interviews Module — Implementation Plan

A complete self-scheduling, scorecard, and AI-insights module for interviews.

### Phase 1 — Database Schema

New tables (all RLS-scoped to workspace via parent job):

- **`interviewer_availability`**: `user_id`, `workspace_id`, `day_of_week` (0-6), `start_time`, `end_time`, `buffer_minutes` (default 15). RLS: user manages own rows; workspace members can read.
- **`interview_schedules`**: `job_candidate_id`, `stage_id`, `workspace_id`, `interviewer_ids` (uuid[]), `status` (pending_scheduling/scheduled/completed/cancelled), `scheduled_at`, `duration_minutes` (default 45), `schedule_token` (unique, for public self-scheduling), `created_by`. RLS: workspace members read; recruiters edit.
- **`interview_scorecards`**: `interview_id` (FK), `interviewer_id`, `ratings` (jsonb), `overall_recommendation` (strong_hire/hire/no_hire/strong_no_hire), `notes`, `submitted_at`. Unique (interview_id, interviewer_id). RLS: scoped via parent interview's workspace.
- **`interview_recordings`**: `interview_id`, `transcript`, `ai_summary` (jsonb), `video_url`, `created_by`. RLS: workspace members read; recruiters edit.
- **`jobs` extension**: `interview_competencies` (jsonb array of `{key, label}`) for per-job scorecard rating dimensions.

### Phase 2 — Self-Scheduling Engine

- **Edge function `interview-scheduling`** (verify_jwt=false) with modes:
  - `slots(token)` → public: load interview, fetch each interviewer's `interviewer_availability` + existing `interview_schedules`, generate 30-min increments for next 14 days, intersect availability, subtract booked slots + buffer (15 min default).
  - `book(token, slot)` → public: update schedule to `scheduled`, insert pending scorecards, enqueue confirmation emails (candidate + each interviewer with `.ics` attachment), enqueue 24h reminder, enqueue post-interview feedback prompt at `scheduled_at + duration + 5min`.
  - `.ics` builder: simple VCALENDAR string in payload; drain function attaches it.
- **Stage-trigger integration**: extend `execute-stage-trigger` to detect "Interview" stages and create a pending `interview_schedules` row; emit candidate email containing `/schedule/:token` link.

### Phase 3 — Frontend

New routes in `App.tsx`:
- `/schedule/:token` (public) → `SchedulePublic.tsx` calendar grid of available slots, confirm dialog, success state.
- `/interviews` (auth) → `MyInterviews.tsx` "My Interviews" upcoming list, scorecard CTA.
- `/interviews/:id/scorecard/:interviewerId` (auth) → `ScorecardForm.tsx` with star-rated competencies + recommendation toggle.

New components:
- **`InterviewerAvailabilityDialog`** (Settings or Team page): weekly grid editor for current user's availability.
- **`JobCompetenciesDialog`** (JobDetail settings menu): edit job-level competency list.
- **`InterviewPanelDialog`** (CandidateDrawer): assign interviewers to a candidate's interview stage, create `interview_schedules` row, copy link, "Record Interview" upload to storage bucket.

Replace existing `Placeholder` `/interviews` route with `MyInterviews`.

### Phase 4 — AI Insights

- **Edge function `summarize-interview`** (verify_jwt=true): accepts `interview_id`. Fetches transcript + job description + `candidates.full_name` (scrubbed if `anonymized` flag on `job_candidates`). Calls Lovable AI Gateway `google/gemini-3-flash-preview` (gemini-2.0-pro not available; use closest supported reasoning model; document rationale). System prompt as specified, JSON-only response. Stores in `interview_recordings.ai_summary`.
- UI: "Generate AI Summary" button on recording card; renders the 5 sections.

### Phase 5 — Templates & Communication

- Reuse existing `templates` table; add `interview_invite` and `interview_reminder` to type union (text column, no enum change needed).
- Settings → Templates page already exists; placeholders supported: `{{candidate_name}}`, `{{job_title}}`, `{{interview_time}}`, `{{schedule_link}}`.
- Reminder enqueue handled in `book` mode (24h before).
- Drain function (`process-automations` mode `drain`) already sends; extend to attach `.ics` when payload contains `ics` field.

### Out of Scope (v1)

- Real video conferencing integration (Zoom/Teams) — placeholder upload only
- Audio transcription (assume transcript provided as text)
- Cross-timezone handling (assume workspace TZ = browser TZ)
- Calendar OAuth sync
- Drag-to-reschedule

### Key Files

**New migrations:** 1 file with all 4 tables + jobs column.

**New edge functions:** `interview-scheduling`, `summarize-interview`.

**Edited edge function:** `process-automations` (.ics attachment support), `execute-stage-trigger` (auto-create interview row).

**New pages:** `SchedulePublic.tsx`, `MyInterviews.tsx`, `ScorecardForm.tsx`.

**New components:** `InterviewerAvailabilityDialog.tsx`, `JobCompetenciesDialog.tsx`, `InterviewPanelDialog.tsx`.

**Edited:** `App.tsx`, `JobDetail.tsx`, `CandidateDrawer.tsx`, `AppSidebar.tsx`.
