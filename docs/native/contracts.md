# Native integration contracts, version 1

These are explicit, user-reviewed hand-offs. No integration here writes to another Syrka application's database, synchronizes an external account or verifies a credential. Existing Mail source (`lib/integrations/contracts.ts`, branch `feat/syrka-mail`) currently declares `syrka.mail.action/1` with calendar status `contract-required`. Its adapter must map an approved Mail action into the CalendarAction below using the user's Workspace authorization. Roadmaps' `docs/qwen-free-quota.md` was inspected: its project-specific quota policy and credentials are not inherited by Workspace.

## CalendarAction

`src/lib/native/contracts.ts` exports the authoritative Zod schema. Authenticated `POST /workspace/api/native/proposals` accepts it using the user's Workspace Supabase Bearer token. It only creates a pending proposal, never an event. Calendar → Integration proposals also imports JSON locally or into the signed-in account. The user chooses a destination calendar and explicitly approves or rejects. `(owner_id, source, idempotency_key)` prevents repeated imports; the approved event has the stable proposal ID. Imported Campus/Roadmaps/Mail content is a personal copy, never an authoritative timetable modification or a completion signal.

```json
{
  "contract": "syrka.calendar-action.v1",
  "source": "campus",
  "idempotency_key": "course-economics-exam-2026-v1",
  "issued_at": "2026-11-01T12:00:00Z",
  "requires_review": true,
  "event": {
    "title": "Economics exam preparation",
    "description": "Review this proposed personal study block.",
    "start_local": "2026-11-10T14:00",
    "end_local": "2026-11-10T15:00",
    "time_zone": "Europe/Prague",
    "category": "exam",
    "references": []
  }
}
```

Supported sources: Mail, Campus, Sessions, Dashboard, Roadmaps, Passport, manual. HTTPS/Workspace references contain a source app, record ID, label and authorized destination URL. A label or source field is not proof that a foreign system actually issued a proposal. No arbitrary callback URL, user-supplied credential or trusted-automation flag is executed. Destinations must validate their own permissions and negotiate OAuth/server identity before enabling automatic transfer.

## Sessions

Events can attach a legitimate existing invitation URL and open it. Existing session ownership, guest admission, Qwen consent and LiveKit permissions still apply. Calendar does not mint a fictional room or bypass admission. Automatic room creation and authorized transcript/notes metadata adapters are not connected in this release.

## Forms → Tables

`Copy snapshot to Tables` writes a **new, explicitly editable** `office_files` workbook. Its `syrkaResponseSnapshot` metadata contains `syrka.form-response-table.v1`, form/version IDs, export timestamp and refresh instructions. Stable response IDs, timestamps, question IDs and schema version are preserved. CSV neutralizes spreadsheet formula injection; XLSX and Tables use explicit string cells. Refresh means creating another snapshot; no automatic linked-table overwrite or live sync is claimed.

## Campus assessments

`syrka.grade-proposal.v1` requires form/version/response IDs, course reference, score/max, `status: unverified_practice_result`, `authoritative: false`, `requires_instructor_review: true` and export timestamp. This release defines the schema but does not transfer grades. Campus must validate instructor/course access and retain authority over official grades. Ordinary survey analytics are never grades.

## Roadmaps / Passport

`syrka.assessment-proposal.v1` uses `kind: self_assessment`, `verified: false`, `requires_user_approval: true`. This release defines the schema; it does not publish responses to Passport or mark capabilities/milestones complete. A self-assessment cannot become a verified credential through this contract.

## External calendars / Dashboard / scanning

`CalendarProviderAdapter` distinguishes `static_import` and `oauth_sync`, with future Google, Outlook and CalDAV adapters. Only static ICS is implemented. No OAuth connection buttons are displayed. Dashboard summary version is reserved as `syrka.workspace-summary.v1`; no unauthorized cross-app feed is exposed. Attachment scanner hook version is reserved as `syrka.attachment-scan.v1`; no scanner is connected, and downloads explicitly warn that files are unscanned.
