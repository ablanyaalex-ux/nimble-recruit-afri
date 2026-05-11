## Goal

Replace the markdown-based redaction flow with a true **PDF redaction** flow. The recruiter opens a candidate's CV in the Review stage, sees the PDF rendered page-by-page with **auto-detected black boxes** over PII, can adjust them (drag, resize, delete, draw new), and saves a new redacted PDF. Hiring managers see only that redacted PDF.

## What "PII" means here
Auto-detect and box: full name, email, phone, LinkedIn URL, location/address, age / date of birth, marital status, gender, nationality, photo. Recruiter can touch up anything we miss.

## Database

- Add `candidates.redacted_resume_path TEXT NULL` — storage path of the burned-in redacted PDF.
- Keep `anonymized_resume_summary` (no longer used for this flow, but harmless).
- Storage: reuse existing private `resumes` bucket. Redacted file stored at `redacted/<candidate_id>.pdf`.

## Backend

New edge function **`redact-resume-detect`** (`verify_jwt = false`, validates JWT in code):
- Input: `{ candidateId }`.
- Loads the original PDF from `resumes` bucket (service role).
- Uses Lovable AI Gateway with `google/gemini-2.5-pro` (vision) to return, **per page**, a JSON array of bounding boxes for PII, normalized to 0–1 of page width/height, with a `kind` label.
- Also passes the candidate's known full_name/email/phone/linkedin/location to anchor detection.
- Returns `{ pages: [{ width, height, boxes: [{x,y,w,h,kind}] }] }`. Does **not** mutate storage.

No edge function needed for save — the burn-in happens client-side with `pdf-lib`, then we upload via the standard storage client.

## Frontend

Install `pdfjs-dist` and `pdf-lib`.

New component **`src/components/pipeline/RedactPdfDialog.tsx`**:
- Opens from the existing "Customise redaction" button in Resume tab / Candidate Drawer (Review stage only).
- Loads the original PDF with pdfjs-dist, renders each page to a `<canvas>`.
- Calls `redact-resume-detect` once on open and overlays the returned boxes as semi-transparent black rectangles with handles.
- Toolbar: **Draw box** (drag on page), **Select** (click box → drag/resize/delete), **Reset boxes**, **Re-run auto-detect**.
- Save:
  1. Load original PDF with pdf-lib.
  2. For each box, draw an opaque black rectangle on the matching page.
  3. Upload the resulting bytes to `resumes/redacted/<candidateId>.pdf` (upsert).
  4. Update `candidates.redacted_resume_path`.
- Clear: deletes the redacted file + nulls the column.

Viewer changes (`JobCandidate.tsx`, `CandidateDrawer.tsx`):
- When viewer is a hiring manager AND `job_candidates.anonymized = true`:
  - Use `redacted_resume_path` for the signed URL. If missing, show "Recruiter hasn't prepared a redacted CV yet" instead of the original.
- Recruiters/owners always see the original PDF and the "Customise redaction" button.

Cleanup:
- Remove the markdown redaction UI bits tied to `anonymized_resume_summary` from the CV display path. The `RedactCvDialog` component and the markdown-redaction code paths can be deleted.
- `summarize-resume` reverts to a single-section executive brief (drop the `---FULL CV TEXT---` divider and `resume_full_text` extraction). The summary stays, but it is no longer the HM's CV view.

## File-level changes

- **Migration**: add `redacted_resume_path` to `candidates`.
- **New edge function**: `supabase/functions/redact-resume-detect/index.ts`.
- **Edit edge function**: `supabase/functions/summarize-resume/index.ts` — single brief, no full-text extraction.
- **New component**: `src/components/pipeline/RedactPdfDialog.tsx`.
- **Edit**: `src/pages/JobCandidate.tsx` — wire new dialog; HM sees redacted PDF.
- **Edit**: `src/components/pipeline/CandidateDrawer.tsx` — same wiring on the drawer's Profile/Resume area.
- **Delete**: `src/components/pipeline/RedactCvDialog.tsx` and its imports.

## Notes / trade-offs

- Auto-detect uses an LLM with vision; it is good but not perfect — that's exactly why the manual touch-up exists.
- Burn-in is done client-side, so no extra server cost; a 50-page CV is fine.
- The redacted PDF is a flat black-rectangle overlay, so removed text cannot be recovered by selecting/copying.
