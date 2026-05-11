# Stage Triggers for Pipeline

Add per-stage automations that fire when a candidate is moved into a stage. First trigger type: send email to the candidate.

## 1. Database

New table `stage_triggers`:
- `id` uuid pk
- `workspace_id` uuid (for RLS scoping)
- `stage_id` uuid → `workspace_pipeline_stages.id`
- `trigger_type` text check in (`'send_email'`, `'slack_notification'`, `'create_task'`) — only `send_email` implemented now
- `settings` jsonb (e.g. `{ subject, body }`)
- `enabled` boolean default true
- `created_by`, `created_at`, `updated_at`

RLS:
- View: workspace members
- Insert/Update/Delete: `can_edit_workspace`

No DB trigger — execution will be invoked from the client when the drag-and-drop succeeds (simpler, gets auth context, allows toast feedback). The edge function still re-verifies permissions and re-checks the candidate's current stage.

## 2. Edge Function `execute-stage-trigger`

Input: `{ jobCandidateId, stageKey }`
- Authenticated user must be workspace member with edit rights
- Loads job_candidate → job → workspace
- Resolves the `workspace_pipeline_stages` row by `(workspace_id, key)`
- Loads enabled `stage_triggers` for that stage
- For each `send_email` trigger: pulls candidate email + name, renders subject/body with `{{candidate_name}}`, `{{job_title}}` placeholders, sends via Resend (reuse pattern from `send-invite-email`, same `RESEND_API_KEY` + `INVITE_EMAIL_FROM`)
- Returns `{ executed: [{type, recipient}], skipped: [...] }`

## 3. UI

### JobDetail pipeline column header
- Add `MoreVertical` dropdown (recruiters/owners only) with "Manage triggers"
- Show `Zap` icon next to stage label when that stage has ≥1 enabled trigger
- Fetch all triggers for visible stages once on load (`stage_triggers` filtered by workspace), keyed by `stage_id`

### Manage Triggers dialog (`StageTriggersDialog.tsx`)
- Lists existing triggers for the stage with enable toggle + delete
- "Add trigger" form: trigger type select (only "Send email to candidate" enabled, others disabled "coming soon"), subject input, body textarea, helper text listing available placeholders
- Save inserts into `stage_triggers`

### Drag-and-drop handler
- After successful stage update, if target stage has triggers → `supabase.functions.invoke('execute-stage-trigger', ...)`
- Sonner toast on success: `"Automation triggered: Email sent to {name}"`; on failure show error but don't roll back the move

## 4. Files

- migration: create `stage_triggers` + RLS
- `supabase/functions/execute-stage-trigger/index.ts`
- `src/components/pipeline/StageTriggersDialog.tsx`
- edit `src/pages/JobDetail.tsx` — column header menu, Zap badge, fetch triggers, invoke edge function on drop

## Out of scope for this iteration
- Slack / create_task trigger types (UI shows them disabled)
- Retry/queue (single best-effort call; failures toast but don't block)
- Editing existing triggers (delete + recreate for v1)
