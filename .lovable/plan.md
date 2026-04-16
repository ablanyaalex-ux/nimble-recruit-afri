
# TalentFlow ATS — v1 Plan

A mobile-first, offline-capable Applicant Tracking System for African freelance and solo recruiters, with team collaboration built in from day one.

## Design direction
- **Style:** Light, airy, editorial. White background, generous whitespace, refined serif accents (e.g. Fraunces or Instrument Serif for headings) paired with a clean sans (Inter) for body.
- **Palette:** Soft neutrals — off-white base, warm grey text, single muted accent (deep ink/indigo) for actions. Subtle borders, no heavy shadows.
- **Mobile-first:** Bottom tab navigation on mobile, sidebar on desktop. Large tap targets, swipe gestures on candidate cards (swipe to advance stage), pull-to-refresh.
- **Density:** Spacious cards, never cramped tables on mobile. Lists collapse to essentials with progressive disclosure.

## Core features (v1)

**1. Auth & Workspaces**
- Email + password sign up / sign in
- On first login: create a workspace (agency name)
- Invite teammates by email with roles: Owner, Recruiter, Viewer
- Personal profile: name, avatar, role

**2. Clients**
- Add clients (company name, contact person, email, phone, notes)
- View all roles per client
- Track agreed fee % or flat fee per client

**3. Jobs (roles)**
- Create job tied to a client: title, location, type (full-time/contract), salary range, description, status (Open / On hold / Filled / Closed)
- Pipeline view per job: Applied → Screening → Interview → Offer → Hired (+ Rejected lane)
- Drag candidates between stages on desktop; swipe/tap-menu on mobile

**4. Candidates & CV parsing**
- Upload CV (PDF/DOC/DOCX) from phone — camera scan or file picker
- Auto-extract: name, email, phone, location, skills, years of experience, last role (via AI)
- Manual edit/override of any extracted field
- Global candidate database, searchable across all jobs (skills, location, name, keyword)
- Tag candidates, attach to multiple jobs
- Timeline of activity per candidate (stage changes, notes, interviews)

**5. Interviews & notes**
- Schedule interview (date, time, type: phone/video/in-person, link)
- Structured note template (strengths, concerns, recommendation, rating 1–5)
- Calendar-style view of upcoming interviews
- Optional reminder notifications

**6. Mobile + offline**
- Installable PWA (Add to Home Screen)
- Local cache of recent jobs, candidates, and notes via IndexedDB
- Queue mutations (new candidates, stage moves, notes) when offline; sync automatically when back online
- Visible "offline" indicator + pending sync count

**7. Dashboard**
- Today: upcoming interviews, candidates awaiting action
- Open jobs at a glance with pipeline counts
- Recently added candidates

## Out of scope for v1 (suggest as follow-ups)
- Invoicing & commission payouts
- Email/WhatsApp candidate outreach
- Career page / public job board
- Analytics & reporting
- Calendar sync (Google/Outlook)
- AI candidate-to-job matching score

## Tech approach
- **Frontend:** React + Vite + Tailwind, shadcn/ui components restyled to editorial aesthetic
- **Backend:** Lovable Cloud (auth, Postgres, storage for CVs, edge functions)
- **CV parsing:** Edge function calling Lovable AI Gateway (Gemini) for resume extraction
- **Offline:** vite-plugin-pwa + IndexedDB (Dexie) mutation queue
- **Roles:** Separate `user_roles` table with `has_role()` security definer function (avoids RLS recursion)

## Build order
1. Auth, workspace creation, team invites, base layout (mobile bottom nav + desktop sidebar) with editorial styling
2. Clients + Jobs CRUD with pipeline view
3. Candidates CRUD + CV upload + AI parsing
4. Drag/swipe pipeline + candidate detail with timeline
5. Interview scheduling + notes
6. Dashboard
7. PWA install + offline cache + sync queue
