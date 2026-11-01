# Calendar & Forms implementation

Branch: feature/calendar-forms. Baseline: verified Sessions Preview d87142c (stacked; Sessions draft stays unmerged).

Milestones:
1. Additive schema, ownership/sharing policies, signed server broker, deterministic calendar/Forms models and contracts.
2. Calendar views/editor, recurrence exceptions/DST, calendars, ICS, durable in-app reminders and Sessions links.
3. Forms library/builder/respondent/immutable versions, branching, secure attachments, assessments, analytics and Tables datasets.
4. Optional consented Qwen proposals/drafts; governed integration proposals and exports.
5. Database/browser/real-service acceptance, screenshots and Git-linked Preview. No production merge or DNS changes.

Target reviewed: existing Syrka Workspace Supabase zguejzlseldovdssiumn, Postgres 17, public office/session tables already have RLS. New names use native_ and native_private; existing records/policies are preserved. pg_cron/pg_net were inspected, then enabled by the reviewed additive migration. Migrations must pass local ownership/anonymous/atomicity tests before applying to this target.

Security architecture: ordinary account operations use verified Supabase JWT and RLS. Public Forms and scheduled worker operations use short-lived purpose-bound server-HMAC envelopes, with the signing key held only in Vercel server Secrets and a non-client-readable private DB configuration row. Published question versions are immutable and never publicly expose answer keys. Anonymous eligibility/attempt identities remain private. Upload objects are in a separate private bucket, capability-scoped to a pending response session; only server-validated attachment registrations can be submitted. Downloads remain permissioned and unscanned files are not presented as malware-free.

Reminders: derived occurrence/reminder outbox, rolling server-generated timezone-correct cache, atomic idempotent Postgres in-app delivery and scheduled server refill/cleanup. Browser notifications, if permitted while open, are supplementary. No unsupported email-delivery promise.

External integrations: versioned proposals require user review. Native Records are not institutional authority. Calendar imports are static unless an actual OAuth sync adapter is configured. No Campus/Roadmaps/Passport database changes or credentials copied from those apps.
