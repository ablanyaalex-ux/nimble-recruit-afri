## Goal
Make it possible to add and test a Hiring Manager from the Team page without silently ending up with a user who can't see anything.

## Changes

### 1. Team page: hiring-manager-aware invite form (`src/pages/Team.tsx`)
- When the role select is set to **Hiring manager**, reveal two extra fields:
  - **Client** (required) — `Select` populated from `clients` in the current workspace.
  - **Name** (required) — used to create the `client_contacts` row.
  - Optional **Title**.
- On submit for `hiring_manager`:
  1. Insert a `client_contacts` row (`client_id`, `name`, `email`, `title`) so the trigger can link them on signup.
  2. Insert the `workspace_invites` row with role `hiring_manager`.
  3. Copy the invite link to clipboard (existing behavior).
- For other roles, behavior is unchanged.
- Add a short helper line under the role select explaining: "Hiring managers must be linked to a client to see its jobs and candidates."

### 2. Members list: surface linked client(s) for hiring managers
- In the existing Members section, for any member whose role is `hiring_manager`, query `client_contacts` by `user_id` and render the linked client name(s) as small badges next to their name.
- If a hiring manager has no linked contact, show a `destructive` badge "Not linked to a client" with a small "Link to client…" button that opens a popover to create the contact (same fields as above) for an existing workspace user. This recovers any HMs that were invited the wrong way previously.

### 3. ClientDetail: make the existing "Invite as hiring manager" more discoverable
- Move the action from the icon-only ghost button to a labeled `Button` ("Invite as hiring manager") and add a subtle helper sentence at the top of the Contacts section: "Invite a contact as a hiring manager to give them scoped access to this client's jobs."
- No logic change — `inviteAsHM` already does the right thing.

### 4. (Optional) AcceptInvite: better confirmation
- After accepting a `hiring_manager` invite, show a one-line confirmation listing which clients they were linked to (read from `client_contacts` where `user_id = auth.uid()`). Helps verify the link worked.

## Technical notes
- No schema changes required. `link_contact_to_user` trigger already fires on new `auth.users` and matches by lowercased email.
- RLS already allows workspace owners to insert `client_contacts` (via `can_edit_workspace`), and `workspace_invites` (via `has_workspace_role 'owner'`), so the new Team flow works with current policies.
- For the "Link to client" recovery flow on existing members, we insert a `client_contacts` row with the member's email and `user_id` set directly (owner has insert permission). We'll fetch the member's email via a new lightweight server function — or simpler, store/display via `profiles.display_name` and require the owner to type the email. Pick the simpler option: ask owner to confirm email when linking.

## Out of scope
- Changing the `hiring_manager` permission model.
- Multi-client hiring managers UI beyond showing badges (already supported by data model).
