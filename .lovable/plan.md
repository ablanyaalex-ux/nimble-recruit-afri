## Sequential Approvals, Dynamic Forms & One-Click UX

Big feature — splitting into 4 layered phases on top of the existing `jobs.approval_status`, `job_application_questions`, `outbound_email_queue`, and `process-automations` infrastructure.

---

### Phase 1 — Schema

**New table `job_approval_steps`**
- `id`, `job_id` (FK jobs), `approver_id` (FK profiles/auth user), `step_order` int, `status` text default `'waiting'` (`waiting` | `pending` | `approved` | `rejected`), `token` text unique nullable, `token_expires_at` timestamptz nullable, `decided_at`, `note`, `created_at`
- Index on `(job_id, step_order)`, unique `(job_id, step_order)`, unique `token`
- RLS:
  - SELECT: workspace members of the parent job
  - INSERT/UPDATE/DELETE: `can_edit_workspace` on parent job's workspace
  - Public SELECT (anon) only via dedicated edge function using service role + token (no RLS exposure)

**`jobs` extension**
- Add `status` value default — keep existing `job_status` enum, but on wizard save set `status='draft'`, `approval_status='pending'`.
- Existing `approval_requested_from`, `approved_by`, `approval_decided_at` repurposed to track the *current* step's approver and final decision.

**Already exists** — `job_application_questions` (id, job_id, position, question_text, options[], is_knockout, fail_value, rejection_template_id). Keep, extend `fail_value` semantics to support multiple fails by reusing the existing TEXT column with comma-separated values (documented in code; avoids schema churn).

---

### Phase 2 — Job Creation Wizard

**New component `src/components/jobs/JobWizardDialog.tsx`** (replaces inline create flow on `Jobs.tsx`)
- shadcn `Dialog` + custom Stepper header (Step 1 / 2 / 3 with check icons)
- **Step 1 — Job Details**: title, client (Select), description (Textarea), location, employment_type, salary_min/max
- **Step 2 — Application Builder**: list of questions; each row has type (Short Text / Multiple Choice), question text, options (for MC), `is_knockout` checkbox, and when knockout → multi-select of fail options. "Add question" / drag-to-reorder (simple up/down buttons for v1).
- **Step 3 — Approval Chain**: ordered list of workspace members (fetched via `workspace_members` join `profiles`); add/remove/reorder. Empty chain = job goes straight to `approved` (escape hatch documented).
- "Back" / "Next" / final "Submit for approval" button. On submit:
  1. Insert job (`status='draft'`, `approval_status='pending'` if chain present, else `'approved'` + `status='open'`)
  2. Bulk insert `job_application_questions`
  3. Bulk insert `job_approval_steps` with `step_order` and `status='waiting'`
  4. Call `process-automations` `mode='advance_approval'` with `job_id` → kicks off step 1 (sets it to `pending`, generates token, enqueues email)

**`Jobs.tsx`** — replace existing "New job" trigger with the wizard.

---

### Phase 3 — Sequential Approval Engine

**`process-automations` extension** — add new mode `advance_approval`:
- Body: `{ mode: 'advance_approval', job_id, after_step? }`
- Logic:
  1. Find the next `waiting` step (lowest `step_order`)
  2. If none → set `jobs.approval_status='approved'`, `status='open'`, return
  3. Update that step: `status='pending'`, `token=crypto.randomUUID()`, `token_expires_at=now()+7d`
  4. Resolve approver email via `auth.users` (service role)
  5. Render approval email (subject + HTML body with deep link `${PUBLIC_URL}/approve/<token>`) and insert into `outbound_email_queue` with `scheduled_at=now()`
  6. Update `jobs.approval_requested_from = approver_id`

**New mode `decide_approval`** (called by the public approve route handler):
- Body: `{ token, decision: 'approved'|'rejected', note? }`
- Validates token + expiry, updates the step row (`status`, `decided_at`, `note`)
- If `approved` → call `advance_approval` recursively for next step
- If `rejected` → set `jobs.approval_status='rejected'`, `approval_decided_at=now()`, leave remaining steps `waiting` (history preserved)
- Returns `{ ok, job: { title, client_name }, decision }` (no auth needed; token is the auth)

**New mode `nudge_approval`**: re-enqueue the email for the currently `pending` step (rate-limited to 1/min via `attempts` field check).

---

### Phase 4 — Public Approve Route

**New page `src/pages/ApprovePublic.tsx`** at route `/approve/:token`
- Fetches job summary via a small new edge function `approve-step-info` (`mode='info'` on `process-automations`) — returns job title, client, description preview, approver name, expiry status, current decision (so revisits show "Already approved")
- Two big buttons: **Approve** / **Reject** (Reject opens textarea for note)
- Calls `process-automations decide_approval`. Shows confirmation card with check/x icon.
- Token-only auth — no Supabase session required. Add route in `App.tsx` outside the auth layout.

**Public Careers gate** — already filters `approval_status='approved'` in `CareersPublic.tsx`/`CareersJobPublic.tsx`. Re-verify and ensure detail page returns the existing "Position no longer available" 404 view when not approved.

---

### Phase 5 — Recruiter Visibility

**New component `src/components/jobs/ApprovalProgressCard.tsx`** rendered on `JobDetail.tsx`:
- Vertical step list with status icons:
  - ✅ approved → green check
  - ⏳ pending → amber clock + "Nudge" button (calls `process-automations nudge_approval`, shows toast)
  - ⚪ waiting → grey circle
  - ❌ rejected → red X + note tooltip
- Shows approver name + decided_at timestamp
- Visible only to recruiters/owners

**Application form & knockout** (already in `CareersJobPublic.tsx`) — fix the v1 `mailto` hack:
- Properly insert candidate via a new mode `submit_application` on `process-automations` (anon-callable, validates job is approved+open, creates candidate + job_candidate, evaluates knockout server-side, enqueues 24h rejection email when failed using `rejection_template_id`).
- Knockout fail check now supports multi-value `fail_value` (split on `,`).

---

### Files

**New**
- Migration: `job_approval_steps` table + RLS
- `src/components/jobs/JobWizardDialog.tsx`
- `src/components/jobs/ApprovalProgressCard.tsx`
- `src/pages/ApprovePublic.tsx`

**Edited**
- `src/App.tsx` — `/approve/:token` route
- `src/pages/Jobs.tsx` — open wizard
- `src/pages/JobDetail.tsx` — render `ApprovalProgressCard`
- `src/pages/CareersJobPublic.tsx` — real submission via edge function, multi-value knockout
- `supabase/functions/process-automations/index.ts` — add `advance_approval`, `decide_approval`, `nudge_approval`, `submit_application`, `info` modes

---

### Out of scope (v1)
- Editing the approval chain after submission (must reject & resubmit)
- Drag-and-drop reorder (use up/down buttons)
- Email templates for approval emails (hardcoded inline copy with `{{job_title}}` / `{{approver_name}}`)
- `JobApprovalsDialog` removal — leave existing dialog untouched, new flow supersedes it; will deprecate later

---

### Migration approval needed
Single new table `job_approval_steps` with RLS. Submitting now.