# Master Build Plan: Search, Agency Portal, Offer Suite

Large scope — I'll ship it in 4 sequenced phases so each phase can be reviewed and tested before the next.

## Phase 1 — Boolean CV Search & Pipeline Safeguards

**Boolean search (Candidates tab + Global Search)**
- Parser: tokenize input into `AND`, `OR`, `NOT`, quoted phrases, parenthesised groups. New util `src/lib/booleanSearch.ts` — pure function returning an AST + a `matches(text)` evaluator.
- Backend: expand server query to a broad prefilter (fetch candidates whose `full_name/email/headline/resume_full_text/notes` match ANY term), then evaluate the full boolean AST client-side against a combined haystack (name + title + tags + notes + resume_full_text).
- Tags: join `candidate_tags` in the prefetch so tag hits count.
- Highlighting: `HighlightedText` component that wraps matched terms/phrases in `<mark>` — used in candidate cards and drawer CV snippet.
- Snippet viewer: in Candidate Drawer, show a "Matches in CV" panel with up to 5 contextual snippets (±80 chars around each hit) when a search term is active.

**Pipeline safeguards**
- Lock: once any offer for a job_candidate has `status = 'accepted'`, hide Progress/Reject buttons and force the stage label to "Hired" in `CandidateDrawer`, `JobCandidate`, and pipeline cards. Enforced via a `useCandidateLock(jobCandidateId)` hook reading offers.
- Decline reason: replace freeform text on candidate decline with a required Select (Compensation, Counter-offer accepted, Role/scope, Location, Timing, Other → then required detail). Same on recruiter Withdraw.

## Phase 2 — Agency Submission Portal

**Schema (migration)**
- `agency_submission_links` (workspace_id, job_id, token, agency_name, agency_email, created_by, revoked_at, expires_at)
- `agency_submissions` (link_id, candidate_id, job_candidate_id, status, submitted_at, cv_url, notes)
- Public status enum for agencies: `received | screening | interviewing | offer_extended | hired | not_selected` — derived from internal stage via a mapping function `public_status_for_stage(stage)` so agencies never see internal stage names.
- RLS: no anon SELECT on either table. Everything goes through security-definer RPCs keyed by token.
- Storage: reuse `resumes` bucket; upload path prefixed `agency/<link_id>/…`.

**Edge functions**
- `agency-submit` (verify_jwt=false): accepts token + candidate payload + CV file signed URL, creates candidate + job_candidate at `application` stage, records `agency_submissions` row.
- `agency-status` (verify_jwt=false): given token, returns the agency's own submissions with public status only.

**UI**
- Recruiter: Job detail → new "Agency Links" section to create/revoke links, copy submit URL + tracker URL.
- Public `/submit-candidate/:token`: minimal branded form (name, email, phone, LinkedIn, CV upload, notes). No workspace UI.
- Public `/agency/track/:token`: read-only table of that agency's candidates + public status badges. No comments/scorecards/other agencies.

## Phase 3 — Org Mode Toggle (In-House vs Agency Workspace)

- Add `workspaces.organization_type` = `inhouse | agency_workspace` (default `inhouse`).
- Workspace Settings UI toggle (owner only).
- Job approval flow (`job_approval_steps`) short-circuits when `agency_workspace`.
- Offer flow: skip `internal_approval` state — Draft → Approved automatically; recruiter can Send instantly. Agency Submission Links only surfaced in `inhouse` mode.

## Phase 4 — Offer Branding, Template Editor & Signing Audit

**Branding (Settings → Offer Templates)**
- New table `offer_branding` (workspace_id PK, logo_url, primary_color, footer_text).
- Storage bucket `offer-assets` (public) for logos.
- Settings page section with logo upload, color picker, footer textarea.

**Template editor**
- Extend `templates` table with `kind = 'offer'` templates already; add WYSIWYG editor (TipTap — already in stack for MentionTextarea) supporting tokens `{{candidate_name}} {{job_title}} {{salary}} {{start_date}} {{expiry_date}}`.
- `OfferDialog` → "Load template" dropdown + rich-text body field; token substitution on preview/send.

**PDF**
- `offerPdf.ts` reads branding (logo drawn top-left, primary color used for header banner + accents, footer_text on every page).
- Certificate of Completion page: already partially built — verify Envelope UUID, IP, UA, UTC timestamps, signature image, and full audit trail from `activity_logs` render correctly. Add missing rows (Approved by, Sent by, Viewed timestamps if present).

**Signing portal (`/offer/:token`)**
- Confirm typed (cursive font) + drawn canvas both persist, capture IP (via `record_offer_view`) and UA, envelope UUID auto-generated on first approval.

---

## Technical notes (skippable for non-devs)

- Boolean parser is a small recursive-descent implementation — no new deps.
- Full-CV text search stays client-evaluated on top of a Postgres `ilike` prefilter to avoid needing `pg_trgm`/FTS migrations; performance is fine at MVP scale (results capped at 200 rows).
- All new RPCs use `security definer` with `set search_path = public` per project conventions.
- New public tables get explicit `GRANT`s alongside RLS per project rules.
- Agency public views only ever go through security-definer RPCs — never direct table selects from the anon key.

---

**Proposed sequencing:** ship Phase 1 first (highest-value, lowest-risk), then 2, 3, 4. Reply with "go" to start Phase 1, or tell me to reorder / drop a phase.
