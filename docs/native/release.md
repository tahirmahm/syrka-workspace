# Calendar & Forms Preview release verification

Verification date: 1 November 2026. This is a functional initial release on `feature/calendar-forms`, stacked on the verified Sessions baseline `d87142ce8f832799f53d1f169124fcc2444398ae`. [Draft PR #5](https://github.com/tahirmahm/syrka-workspace/pull/5) targets `feature/sessions-notes`; neither draft PR is merged. Final tested source commit: `9899bf0af3e5899257daf62c31f51f5b7e7c4493`.

Preview entry points: [Calendar](https://syrka-calendar-forms-preview.vercel.app/workspace/calendar) and [Forms](https://syrka-calendar-forms-preview.vercel.app/workspace/forms). The alias belongs to the existing `syrka-workspace` Vercel project and is updated only to a ready, Git-linked feature deployment. The ready deployment and authenticated runtime both reported application SHA `9899bf0af3e5899257daf62c31f51f5b7e7c4493`; the complete hosted acceptance run passed on that immutable deployment. Production, `syrka.co` routing and the Sessions QA alias are unchanged.

## Delivered workflows

Calendar provides cloud persistence and explicit local demo mode; month/week/day/agenda views; multiple calendars and account-ID sharing; event editing, recurrence masters and single-occurrence exceptions; Prague daylight-saving handling; conflicts; static ICS import/export; durable in-app reminders; legitimate existing Sessions links; reviewed integration proposals and optional consented Qwen schedule proposals. The Calendar UI does not silently save AI suggestions.

Forms provides a searchable library, templates, a 24-type builder with sections and validated branching, preview, undo/redo, optimistic autosave and local recovery. Immutable published schemas preserve historical answer meaning. Public respondents can submit without an account; account-only eligibility, closing and response limits are enforced server-side. Private bounded attachments, receipts, response review, actual distributions, CSV/XLSX exports and a new editable Tables snapshot are implemented. Optional Qwen drafts remain editable and require review before publication.

Calendar appears directly beneath Sessions in desktop/mobile navigation; Forms is launched from Tools, as requested. Both have scoped, persistent light/dark appearance. Existing Write, Tables, Present, Tools, file models, account authentication and the persistent Sessions call provider remain in place. No calling backend or verified Qwen speech pipeline was replaced.

## Observed checks

| Check | Observed result |
|---|---|
| Lint, TypeScript and production build | Passed on tested source `9899bf0`. |
| Unit and database suite | 84 passed, including recurrence/DST, branching, format handling, RLS, broker signatures, immutable versions, retries and attachment permissions. |
| Chromium browser regressions | 74 passed, covering the existing suite and six native-app tests. |
| WebKit native-app regressions | 6 passed. |
| WebKit Sessions capability regressions | 3 passed. |
| Real Supabase core journey | Passed again with two temporary authenticated QA accounts and an unauthenticated mobile browser context: isolation, public submission, private upload/download, immutable versions, XLSX reopen and Tables snapshot. |
| Durable reminders | Actual server cron inserted a due notification; repeated delivery did not duplicate it. Signed worker refill returned HTTP 200. |
| Real Calendar management UI | Passed after correcting the self-lookup RLS `INSERT … RETURNING` issue: calendar creation/rename/default, recurrence exception and legitimate Sessions link. |
| Actual Qwen provider API | Final hosted calendar and form requests both returned HTTP 200, model `qwen3.8-flash`, with schema-valid output. No paid fallback. |
| Complete hosted AI review/save journey | Passed: calendar count stayed unchanged before review, explicit approval saved one event; the generated form draft was edited/autosaved while its published version stayed unchanged. |

Browser screenshots and viewport tests use automated browsers, including a 390 px mobile viewport. They are not physical iPhone/Android verification. No new physical-device calling/media test, external calendar OAuth connection, desktop Office application interoperability test or cross-app institutional integration is claimed by this release.

## Data and security

The target is the existing Workspace Supabase project `zguejzlseldovdssiumn`. Changes are additive `native_*` tables/functions and a private `native_private` schema, with owner/shared-calendar RLS, immutable form versions, authenticated owner response access and short-lived server-signed public submission operations. No service-role credential is exposed to browsers. Existing Workspace user records, Sessions policies and Campus/Roadmaps databases are preserved.

Public uploads use a separate private bucket, byte/type/size validation and response-bound capabilities. Pending filenames are withheld from owners until submission. Expired-object cleanup is restricted to Storage deletion operations, not read/list/sign access. Private recurrence overrides are filtered for viewers, and reminder replacement checks the current event revision under a database lock. Ten reviewed additive migrations are applied; INSERT/UPSERT RETURNING and forged-owner checks pass; see [security and operations](security.md).

Reminders are durable **in-app** notifications, not email or OS push. Qwen uses Workspace's existing server-only general-purpose configuration, explicit processing consent, schema validation and Free Quota Only guards. Core editing remains usable when AI is unavailable. Both isolated QA sessions were revoked, their two guarded QA users/owned records removed, and all 14 QA upload objects deleted through the real Storage API. The cleanup worker returned HTTP 200 with zero failures; database verification found zero remaining QA objects and zero garbage entries. Private fixture/key duplicates were removed from temporary files.

The initial hosted rerun hit duplicate synthetic event titles left by earlier QA runs. The acceptance harness now uses unique titles; the full rerun passed. This was a test-fixture collision, not a calling or persistence failure. [Redacted machine-readable evidence](verification.json).

## Screenshots

| Workflow | Evidence |
|---|---|
| Calendar desktop light/dark | [Light](images/calendar-1440-light.png), [dark](images/calendar-1440-dark.png), [week view](images/calendar-week-desktop.png) |
| Calendar mobile light/dark | [Light](images/calendar-390-light.png), [dark](images/calendar-390-dark.png), [agenda](images/calendar-agenda-mobile.png) |
| Forms desktop light/dark | [Light](images/forms-1440-light.png), [dark](images/forms-1440-dark.png) |
| Forms mobile light/dark | [Light](images/forms-390-light.png), [dark](images/forms-390-dark.png) |
| Real public submission | [Mobile form](images/respond-live-mobile.png), [receipt](images/respond-live-mobile-receipt.png) |
| Actual cloud Calendar and reviewed AI | [Recurring cloud event](images/calendar-live-cloud.png), [approved schedule](images/calendar-ai-reviewed.png), [editable form draft](images/forms-ai-reviewed.png) |
| Real responses and spreadsheet | [Response analysis](images/responses-live-desktop.png), [Tables snapshot](images/tables-live-snapshot.png) |

These use synthetic QA material, not private customer documents or answers.

## Remaining product scope

The full master roadmap is **not complete**. Calendar does not yet provide Google/Outlook OAuth sync, CalDAV subscriptions, “this and future” recurrence edits, graphical duration resizing, automatic Sessions room/notes linkage, email/push reminders or live institutional integrations. Existing Sessions invitations can be attached; Calendar does not create fictional meeting URLs.

Forms does not yet provide organisational/invite-only roles, shared editors, editable submissions, email receipts, embedding, calculated fields, manual grading, timed/attempt-limited quizzes, live Tables refresh or AI response-theme analysis. Analytics/exports are visibly bounded to the latest 10,000 responses. Attachments are not malware scanned. Practice scores are not official Campus grades. Manual versioned contracts and reviewed import/export workflows are distinguished from live integration in [contracts](contracts.md); [README](README.md) contains the detailed capability limits.

The newly supplied professional-suite and command/source documents were reviewed as reference material. No suite-wide command registry, Create/PDF overhaul or unrelated redesign was implemented as part of this Calendar/Forms release.

## Final sign-off fields

- Tested code SHA: `9899bf0af3e5899257daf62c31f51f5b7e7c4493`.
- Pushed; Git-linked Preview READY, authenticated runtime SHA matched.
- Hosted Calendar/Forms/AI acceptance: passed. Signed refill HTTP 200, ten reminder masters processed, zero failures; actual scheduled notifications observed.
- Temporary QA cleanup: complete (two users, owned records and 14 Storage objects).
- Production merge/promotion: not requested and not performed.
