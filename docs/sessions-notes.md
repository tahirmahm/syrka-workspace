# Sessions and Notes: implementation and release gate

This is an additive feature branch, not a claim of a completed communications service. Existing editors, file models, authentication and public file-processing tools are preserved.

## Implemented paths

- `/workspace/tools/sessions`: meeting list, schedule, UTC weekly occurrences, project labels, secure-link admission.
- `/workspace/tools/notes`: authorized keyword search over meetings, transcripts and structured notes.
- `/workspace/tools/sessions/meeting/[id]`: host admission/removal/publish permissions, lock/end, consent, transcript imports/corrections, source links, human-reviewed notes, personal folders/bookmarks and editable spaced-review flashcards.
- Notes export through the existing Write document model to editable DOCX, PDF, Markdown and TXT; save a separate editable copy in the existing Workspace library. Transcript TXT/SRT/VTT exports preserve timestamps. Originals are not overwritten.
- Campus course Sessions section, staff scheduling, enrolled-student entry, instructor publication and My Lecture Notes dashboard/route. Campus links open the shared meeting UI with `?source=campus`.
- Maintained LiveKit client and server SDK integration. VideoConference supplies camera/microphone, device selection, screen share, participant list, chat and connection UI. Browser receives only a short-lived participant token; server verifies membership before issuing it.
- Configured eligible AI adapters provide structured, source-validated summaries, retrieval Q&A, explanations, tutoring, practice questions, flashcards, follow-up drafts and separate translations. These operations are disabled until an eligible provider is configured. No fabricated result substitutes for a failed provider.

## Data boundaries

Workspace uses only `zguejzlseldovdssiumn`. Campus uses only `pftbpimhyophitfuzcxn`. Identical-looking user IDs are never treated as a shared identity. Workspace requests verify a bearer token with its own Auth service. Campus requests verify its `/cam` scoped session cookies. The canonical same-origin `https://www.syrka.co` hosts both paths; the Campus cookie is sent to `/cam/api/sessions`, not to the Workspace server. No service-role keys are used in normal requests.

Both migrations add `session_rooms`, members, segments, revisions, notes, jobs, cards and annotations. Private helpers implement admission and daily usage accounting. RLS enforces ownership, enrolled-course access, faculty assignments and explicit publication. Revoked Campus membership/enrollment removes lecture access. Transcript originals and correction history are immutable to clients. Original imported speaker names are unverified; local speech chunks are attributed only to the authenticated microphone track owner, not inferred diarization.

Shared server protocol modules are vendored in both repos. After editing them run `node scripts/sync-sessions.mjs ../syrka-campus` from Workspace. The generated SHA-256 manifests let reviewers compare the copies. Neither build requires the other repo.

## Provider audit: 29 October 2026

Official Qwen Coding Plan documentation: https://www.alibabacloud.com/help/en/model-studio/coding-plan

- Singapore Token/Coding Plan endpoint: `https://coding-intl.dashscope.aliyuncs.com/v1`; keys start `sk-sp-`.
- The documented plan explicitly prohibits automated scripts, **application backends** and other non-interactive use. It is a personal interactive programming-tool subscription. Therefore the supplied key is not installed or invoked for Sessions.
- Current listed models: `qwen3.7-plus`, `qwen3.6-plus`, `qwen3.5-plus`, `kimi-k2.5`, `glm-5`, `MiniMax-M2.5`. No speech-recognition or embedding models are included in this list. Documentation says Lite renewals were discontinued and existing subscriptions work only until expiry. Account-specific entitlement/expiry is not verified.
- Application code rejects Coding Plan keys/endpoints. It never switches them to a Pay-As-You-Go endpoint. An eligible application API or written provider entitlement is required to enable AI. A Qwen application endpoint must be configured explicitly; there is no default billable endpoint.

LiveKit official docs: https://docs.livekit.io/intro/basics/connect/ and https://livekit.io/pricing

- Existing endpoint: `wss://syrka-sessions-2ja3fujk.livekit.cloud`.
- Build is listed at $0/month; account plan, quotas and egress entitlement have not been independently confirmed. Do not enable Ship or recording egress.
- The directive requires replacing the chat-exposed secret before production. No exposed credential is committed or installed in production by this branch.

Groq speech docs: https://console.groq.com/docs/speech-to-text and https://console.groq.com/docs/rate-limits

- An optional, disabled-by-default adapter supports the documented `whisper-large-v3-turbo` model, or configured `whisper-large-v3`. This is **not** part of the Qwen subscription and is not provisioned.
- Chunked microphone capture yields near-real-time final segments, not streaming interim captions or automatic diarization. Original language is retained. All admitted participants must consent before chunks can be processed; revocation stops further accepted processing. Already-sent processing cannot be recalled.
- Without eligible free STT credentials or separately available open-source worker compute, live/post-meeting audio transcription is unavailable. Manual TXT/SRT/VTT transcript import works. No separate paid speech service or worker was activated.

## Configuration (server-side only)

`.env.example` documents empty values. Do not paste keys into source, logs, tickets or client variables.

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: rotated existing-project credentials.
- `SYRKA_FREE_TIER_CONFIRMED=true`: operator has verified selected account's free entitlement. Absent/false disables provider calls, including media. This flag does not turn a paid account into a free one.
- `SYRKA_AI_DAILY_BUDGET=0`: nonzero monetary spend is disallowed. Do not enable overages/Pay-As-You-Go.
- `SYRKA_AI_PROVIDER=groq|gemini|qwen`, `SYRKA_AI_MODEL`, `SYRKA_AI_API_KEY`; `SYRKA_AI_BASE_URL` / `QWEN_BASE_URL` for explicitly authorized Qwen application endpoints. `QWEN_API_KEY` alone does not enable inference. Coding Plan credentials are rejected.
- Optional fallback uses `SYRKA_AI_FALLBACK_PROVIDER`, `MODEL`, `API_KEY`, `BASE_URL` with the same eligibility requirements.
- Optional STT: `SYRKA_STT_PROVIDER=groq`, `SYRKA_STT_API_KEY`, `SYRKA_STT_MODEL`. Enable only after confirming an eligible free account and consent/privacy policy.

Configure both existing Vercel projects independently: Campus calls its own token/AI API. Do not copy Workspace database credentials to Campus. Do not create replacement projects.

## Processing and retention limits

Jobs are persisted with an idempotency key and atomic claim; failures remain visible and leave transcripts intact. Each model request has a 35-second timeout, at most two attempts and 5,000 output tokens. Chunking uses 12,000-character chunks and a maximum of 12 chunks with hierarchical note consolidation. Retrieval uses up to 18 matching passages. Server/database daily caps are 20 AI jobs and 600 speech chunks per user, survive session deletion and cannot be reset by client edits. Usage is recorded in note-job outputs when the provider returns token counts. These are application guards, not provider billing guarantees.

Execution uses Next `after()` within a 300-second function window, **not a durable unattended queue**. Very long jobs can outlive that window and require operator review/retry. There is no exactly-once external model-call guarantee after process termination. A durable worker with authorized compute is still needed for unattended long lectures and complete per-request token accounting/budget reservation. Do not market this as an unlimited lecture processor.

Retention days restrict the transcript API's default window. Authorized hosts can explicitly delete ended sessions and cascaded records. Physical expiry/purge scheduling is not implemented; the setting is not a guarantee of automatic erasure. There is no recording storage/playback/egress implementation.

## Rollout

1. Run lint, typecheck, unit/SQL tests, production build and browser tests in both repositories. Workspace SQL tests use disposable PGlite; Campus tests run existing migrations plus the additive migration in disposable PGlite. Never run the test harness against hosted user data.
2. Commit/push both feature branches and open coordinated PRs. Check upstream before pushing. Review additive schema and RLS before release.
3. Apply only the Workspace Sessions migration to Workspace, and only the Campus Sessions migration to Campus. Use an authorized project connection. Run hosted advisors and verify RLS with disposable test actors. Campus project access was denied by the currently connected Supabase account; that migration cannot yet be installed.
4. Configure rotated LiveKit secrets, confirm free account entitlement and an eligible AI/STT setup through server-only Vercel environment variables. Do not reuse exposed secrets or activate paid fallback services.
5. Merge reviewed GitHub changes to main; let the existing Git integrations deploy. Verify Vercel deployment metadata matches each Git SHA and preserve `/`, `/workspace`, `/workspace/tools`, `/cam`. Do not deploy independently or change DNS.
6. Run the mandatory real two-user professional meeting and instructor/student class journeys, consent/revocation, media/device/screenshare/chat/removal, real STT, genuine AI, publication, student revision and failure/quota recovery. Until observed, tests A/B are **blocked**, not passed.

## Remaining scope

Recording/secure playback, durable workers, physical retention purge, automatic end-of-meeting note generation, delivered invitations/calendar sync, DST-aware wall-clock recurrences, project foreign-key integration (current project is a label), cross-lecture AI comparison/material attachments, semantic search, richer quiz types and saved quiz attempts, institutional policy administration, ontology ID/Roadmaps API integration and verified competence evidence remain unavailable. Existing ontology contracts were not found; no identifiers or qualifications are invented. Attendance is not proficiency. Follow-up messages are drafts only, never sent automatically.

No purchase, plan change, paid API activation, DNS change, replacement cloud project or changes to Passport/Roadmap were performed. Existing paid Qwen subscription costs are external to this implementation; it cannot be used to serve these backend requests under the documented plan terms. Expected newly enabled infrastructure cost: $0 while the gates remain off; production capacity beyond free entitlement requires explicit approval and a separate estimate.

## Verification record (local feature branch)

- Workspace: lint, TypeScript, production build and 25 unit/SQL tests passed. Existing 33 editor/tool browser regressions passed. All four new Sessions browser tests passed, including keyword search, human note and flashcard edits/reload, timestamp imports, anonymous API rejection and format-aware DOCX/PDF export parsing. A stale test label (`Study` versus the actual `Revision` tab) was corrected and the affected suite rerun successfully.
- Campus: lint, strict TypeScript, production build, 19 unit/SQL tests and two unconfigured/mobile browser checks passed. These are not hosted instructor/student acceptance tests.
- Simulated unavailable AI provider: two bounded attempts, recoverable error, unchanged transcript. SQL tests cover idempotent reservations, quotas, publication and tenant revocation. No actual Qwen inference or speech-recognition quality benchmark was run.
- Workspace's hosted pre-release security advisor reported only existing leaked-password-protection disabled; it was not enabled because of the free-tier restriction. [Supabase password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Campus advisor remains inaccessible. The new migration has not been assessed on either hosted database because it has not been applied there.
- Real two-participant meeting and online-class acceptance tests A/B remain blocked. Recording, provider latency/accuracy and cloud quota enforcement are not verified. Acceptance test C is simulated locally; D is verified against disposable SQL, not hosted Auth actors for these new tables.
