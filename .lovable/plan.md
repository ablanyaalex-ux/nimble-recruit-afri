## Recruitment Automation & Governance — Implementation Plan

Big multi-part feature. Building it in **4 phases**, each independently testable. Phases 3 and 4 layer onto a shared `outbound_email_queue` + `process-automations` edge function.

---

### Phase 1 — Templates with Live Preview

**DB (`templates`)**
- `id`, `workspace_id`, `type` ('email' | 'job_description' | 'offer_letter'), `name`, `content` (text), `created_by`, `created_at`, `updated_at`
- RLS: SELECT = workspace members, INSERT/UPDATE/DELETE = `can_edit_workspace`

**UI: `/settings/templates`**
- New page `src/pages/SettingsTemplates.tsx`, route added in `App.tsx`, nav entry under settings/sidebar
- Layout: left list of templates (filter by type tabs), right editor pane
- Editor: name input, type select, content `Textarea` (plain text/markdown for v1; HTML if email)
- **Preview toggle (Switch)**: when on, runs `content.replace(/\{\{(\w+)\}\}/g, ...)` against mock data `{ candidate_name: "John Doe", job_title: "Software Engineer", company_name: "Acme Corp", stage: "Interview" }`. Rendered in a styled card.
- Helper text listing supported placeholders.

---

### Phase 2 — Job Approval Workflow

**DB (`jobs` extension)**
- Add `approval_status` text default `'approved'` (so existing jobs don't disappear) check in (`'draft','pending','approved','rejected'`)
- Add `approved_by` uuid, `approval_requested_from` uuid, `approval_decided_at` timestamptz, `approval_note` text

**Public careers gate**
- `CareersPublic.tsx` and `CareersJobPublic.tsx`: filter `.eq('approval_status','approved').eq('status','open')`. Detail page returns NotFound when not approved.

**JobDetail "Approvals" tab**
- New tab between existing tabs. Visible to recruiters/owners only.
- Recruiter view: select workspace owner from dropdown → "Request approval" button → sets `approval_status='pending'`, `approval_requested_from=<owner>`. Status badge.
- Owner view (when `approval_requested_from = me` or owner role): "Approve" / "Reject" buttons + optional note. Sets `approval_status` accordingly + `approved_by`, `approval_decided_at`.
- Read-only history line ("Approved by X on …").

---

### Phase 3 — Shared Email Queue + `process-automations` edge function

**DB (`outbound_email_queue`)**
- `id`, `workspace_id`, `candidate_id` (nullable), `job_candidate_id` (nullable), `template_id` (nullable), `payload` jsonb (`{ to, subject, body }` already-rendered), `scheduled_at` timestamptz, `status` ('pending'|'sent'|'failed'|'cancelled'), `attempts` int default 0, `last_error` text, `sent_at`, `created_by`, `created_at`
- RLS: SELECT/INSERT/UPDATE/DELETE = `can_edit_workspace` scoped via workspace_id; INSERT also allowed via service-role (edge functions).
- Index on `(status, scheduled_at)`

**Edge function `process-automations`**
- Two modes (single function, `mode` in body):
  - `enqueue`: render a template with provided vars + insert into queue at `scheduled_at`
  - `drain`: pulls `pending` rows where `scheduled_at <= now()`, sends via Resend (reuse `RESEND_API_KEY` + `INVITE_EMAIL_FROM` like `execute-stage-trigger`), marks sent/failed
- Drain triggered manually via a small "Run queue" admin button on Settings → Automations (good enough for v1; cron is out of scope unless requested).
- Validates auth + workspace edit rights for `enqueue` calls.

---

### Phase 4 — Knockout Questions + Stage Triggers (template-aware)

**DB (`job_application_questions`)**
- `id`, `job_id`, `position` int, `question_text`, `options` text[] (nullable for free-text), `is_knockout` bool, `fail_value` text (the option that disqualifies), `rejection_template_id` uuid → templates(id)
- RLS: SELECT public for approved+open jobs (so the public form works), full edit via `can_edit_workspace`.

**JobDetail "Application form" sub-section** (in existing settings/edit area)
- CRUD UI for questions; mark knockout + select rejection template.

**Public application form (`CareersJobPublic`)**
- Render questions, on submit:
  1. Insert candidate + `job_candidates` row as today
  2. If any knockout failed → set `job_candidates.rejected=true, rejection_reason='Knockout question'`, then call `process-automations` with `mode=enqueue`, scheduled_at = `now() + 24h`, payload rendered from `rejection_template_id`.
  3. Otherwise create normally.

**Stage Triggers — extend existing `stage_triggers`**
- Add columns: `template_id` uuid (nullable, replaces inline subject/body when set), `delay_minutes` int default 0
- `StageTriggersDialog`: when adding a trigger, allow choosing **template** (preferred) or inline subject/body (existing). Add "Send delay" select (immediate / 1h / 24h).
- Update `execute-stage-trigger`: instead of sending directly, call `process-automations enqueue` with `scheduled_at = now() + delay_minutes`. Existing immediate path still works (delay=0 still goes through queue, but `drain` picks it up).
  - **Compromise:** keep the immediate Resend send for delay=0 to preserve current toast UX; only enqueue when delay>0. (Documented in code.)

---

### Files

**New**
- `supabase/migrations/<ts>_templates_approvals_queue_questions.sql` (single migration covers all four schema changes)
- `supabase/functions/process-automations/index.ts`
- `src/pages/SettingsTemplates.tsx`
- `src/components/automations/TemplatePicker.tsx` (reused by stage triggers + questions)
- `src/components/jobs/JobApprovalsTab.tsx`
- `src/components/jobs/JobQuestionsEditor.tsx`

**Edited**
- `src/App.tsx` — route for `/settings/templates`
- `src/components/app/AppSidebar.tsx` — Templates nav link
- `src/pages/JobDetail.tsx` — Approvals tab, questions editor entry, pass templates into `StageTriggersDialog`
- `src/pages/CareersPublic.tsx`, `src/pages/CareersJobPublic.tsx` — approval gate + render application questions + knockout flow
- `src/components/pipeline/StageTriggersDialog.tsx` — template + delay
- `supabase/functions/execute-stage-trigger/index.ts` — route delayed sends through queue

---

### Out of scope (v1)
- Cron-based queue draining (manual "Run queue" button instead — can add pg_cron later)
- Rich HTML editor (plain text + `{{placeholders}}`)
- Approval email notifications (in-app only)
- Editing knockout questions after candidates have applied gracefully (we just keep history)

---

### Migration approval
Schema changes are large (1 templates table, 4 columns on jobs, 1 queue table, 1 questions table, 2 columns on stage_triggers). I'll submit them as **one migration** for atomicity — please approve.