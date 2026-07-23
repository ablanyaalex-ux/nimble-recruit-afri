## Goal
Surface offer creation directly in the Candidate Detail header, gated to the offer stage, so recruiters don't have to hunt through the Evaluation tab.

## Changes

### 1. Add a "Generate offer" action to the candidate header
In `src/pages/JobCandidate.tsx`, inside the header action row (around lines 589-614, alongside Schedule interview / Progress / Reject), add a new button:

- Label: **Generate offer** (icon: `Sparkles` or `FileSignature`)
- Visibility conditions (all must be true):
  - `canEdit` (owner/recruiter — matches OffersSection gate)
  - `!detail.rejected`
  - Candidate is at the **Offer stage** — detected via `milestoneForStage(currentStageObj) === "closing"` AND the stage is not already a terminal one (`accepted|hired|filled`). This covers "Offer", "Offer Accepted", etc., but we specifically want it live from the moment they enter Closing.
- Behavior: switches the drawer's tab to `evaluation`, scrolls to the Offers section, and opens the create-offer dialog inside `OffersSection`.

### 2. Wire the trigger into `OffersSection`
`src/components/pipeline/OffersSection.tsx` currently owns the "Generate offer" dialog state internally. Expose an imperative trigger so the header button can open it:

- Accept a new optional prop `openCreateSignal?: number` (a counter). When it increments, the section auto-opens the create dialog.
- Alternatively, forward a ref with an `openCreate()` method. The counter approach is simpler and matches existing patterns in this codebase.

In `JobCandidate.tsx`, hold `const [openOfferSignal, setOpenOfferSignal] = useState(0)`. The header button does:
```ts
setTab("evaluation");
setOpenOfferSignal(n => n + 1);
```
Pass `openCreateSignal={openOfferSignal}` to `<OffersSection />`.

### 3. Empty/disabled states
- If the candidate is in Closing but at a terminal stage (Hired / Accepted / Filled), don't show the button — an offer is already resolved.
- If the candidate isn't in Closing yet, don't show the button at all (avoids clutter). The existing OffersSection card inside Evaluation remains the fallback for edge cases.

### 4. No database or permissions changes
`canEdit` already resolves via `canEditWorkspace(currentRole)` and matches the existing OffersSection gate, so no RLS or role work is needed. The user confirmed they're Owner/Recruiter, so the button will render for them.

## Files touched
- `src/pages/JobCandidate.tsx` — add header button, tab switch, signal state.
- `src/components/pipeline/OffersSection.tsx` — accept `openCreateSignal` prop, open the create dialog on change.

## How to verify
1. Open a candidate whose stage maps to Closing (e.g., "Offer").
2. Confirm the **Generate offer** button appears in the header next to Progress/Reject.
3. Click it → the Evaluation tab activates and the create-offer dialog opens.
4. Move the candidate to "Offer Accepted" → button disappears (terminal state).
5. Move them back to an Interviews-milestone stage → button disappears (not yet in Closing).