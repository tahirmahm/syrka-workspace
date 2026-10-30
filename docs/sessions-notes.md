# Syrka Sessions and Notes — feature branch release record

## Current decisions (30 October 2026, Europe/Prague)

Continue the existing `feature/sessions-notes` branches and draft PRs Workspace #4 / Campus #8. Do not merge or promote to production until acceptance passes. Preserve existing editors, academic features, identities, storage and DNS.

The user has confirmed in their Singapore Benefits dashboard that these general-purpose API benefits are ACTIVE with 100% remaining at confirmation, Free Quota Only enabled, expiring **29 January 2027**:

- `qwen3.8-flash`, `qwen3.8-max`: 1M tokens each.
- `qwen3-asr-flash`, `qwen3-asr-flash-filetrans`, `qwen3-asr-flash-realtime`, `fun-asr`, `fun-asr-realtime`: 36,000 seconds each.
- `qwen-audio-3.1-asr-flash`, `qwen-audio-3.1-asr-flash-filetrans`, `qwen-audio-3.1-asr-flash-streaming`: 1M tokens each.

This is an operator account entitlement confirmation, not a guarantee of remaining quota after subsequent calls. Do not activate Pay-As-You-Go or paid fallback. The restricted Coding Plan key remains rejected. General-purpose credentials use the **existing `SYRKA_AI_*` names**, not duplicate keys. QWEN key/URL aliases remain optional compatibility only; canonical variables win.

The user explicitly allows the existing exposed LiveKit credentials for **development testing**, without rotation. They are scoped only to Workspace Preview branch `feature/sessions-notes`. `LIVEKIT_DEVELOPMENT_ONLY=true` blocks media capability when `VERCEL_ENV=production`. Do not copy those credentials to production. No new LiveKit project was created.

## Model and transport choices

- Summaries, lecture notes, action items, tutoring, questions and flashcards: **`qwen3.8-flash`**, OpenAI-compatible chat completions, JSON Schema structured outputs, thinking disabled for bounded latency, Zod/source-reference validation. No automatic model/provider fallback.
- Uploaded audio: **`qwen3-asr-flash-filetrans`**, DashScope asynchronous task API. The exact body uses **`input.file_url` (singular)**, `X-DashScope-Async: enable`, language, channel 0, `enable_words:true`, `enable_itn:false`. Poll `/api/v1/tasks/{id}`, then retrieve the provider-owned result JSON. Preserve sentence begin/end timestamps and detected language. No verified speaker attribution is available for this model; uploaded speakers remain explicitly unknown.
- Live microphone: **`qwen3-asr-flash-realtime`**, server-side outbound WebSocket, `/api-ws/v1/realtime?model=...`. Session update specifies mono signed PCM16 at 16 kHz, language and manual mode. Send append events, commit, receive completed transcript, finish and wait for session.finished. Never pass the general-purpose key to the browser.
- Vercel-safe live implementation captures four-second microphone batches using AudioWorklet, sends each by authenticated HTTP, and opens a bounded outbound provider connection for that batch. This is **near-real-time batch delivery using the Realtime model**, not one uninterrupted conversational socket or word-by-word streaming UI. Timestamps identify microphone batch intervals. Calls are bounded to 35 seconds; no self-hosted WebSocket server or in-memory cross-invocation session is required. Audio batches are not retained.
- Optional Audio 3.x adapter is implemented separately: native `/api/v1/services/aigc/multimodal-generation/generation`, input_audio Base64 Data URI, parameters matching actual container and language hints. `qwen-audio-3.0-asr-flash` and its streaming variant have no published free quota and remain blocked. The approved 3.1 non-streaming alternative is compatible but is not the selected live/upload pipeline. No automatic paid substitution occurs.
- Urdu is not listed for the selected recognition models; it is omitted from their active speech language controls. Unicode Urdu documents/transcript imports remain supported. Do not claim arbitrary-language ASR or automatic diarization.

Official references checked:

- [Model prices and quotas](https://www.alibabacloud.com/help/en/model-studio/model-pricing)
- [Free Quota Only and exhaustion behavior](https://www.alibabacloud.com/help/en/model-studio/new-free-quota)
- [Structured outputs](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)
- [File transcription API](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-api-reference)
- [Realtime client events](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-client-events) and [server events](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-server-events)
- [Audio 3.x HTTP API](https://www.alibabacloud.com/help/en/model-studio/fun-asr-flash-recorded-speech-recognition-http-api)
- [Realtime authentication](https://www.alibabacloud.com/help/en/model-studio/realtime-token-authentication)
- [LiveKit connection](https://docs.livekit.io/intro/basics/connect/)

## Configuration

Keep secrets server-side in the existing Vercel project. Do not print/decrypt secrets to diagnose scope. Inspect variable names, target environments and Git branch metadata instead.

Canonical text configuration:

```
SYRKA_AI_PROVIDER=qwen
SYRKA_AI_MODEL=qwen3.8-flash
SYRKA_AI_API_KEY=<general-purpose Singapore key>
SYRKA_AI_BASE_URL=https://<workspace>.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
SYRKA_FREE_TIER_CONFIRMED=true
SYRKA_AI_DAILY_BUDGET=0
SYRKA_AI_FREE_QUOTA_ONLY_CONFIRMED=true
SYRKA_STT_FREE_QUOTA_ONLY_CONFIRMED=true
SYRKA_FREE_QUOTA_EXPIRES_AT=2027-01-29T00:00:00Z
SYRKA_STT_PROVIDER=qwen
SYRKA_STT_MODEL=qwen3-asr-flash-realtime
SYRKA_STT_UPLOAD_MODEL=qwen3-asr-flash-filetrans
```

The two model-specific confirmation flags record the user's verified provider Free Quota Only setting. They do not themselves enable that provider-side protection. Inference fails closed when confirmation is absent or the conservative expiry cutoff is reached. Quota/auth/rate errors are actionable and are not retried onto paid fallback. Each text call has at most two attempts, 5,000 output tokens and a 35-second timeout. Do not log raw provider responses containing private source text or request credentials.

The existing five Qwen variables were initially Production-only. Their scopes were expanded to Preview **without reading or replacing their values**. Production values were preserved. All additional development/media flags are branch-scoped Preview only. A new Git-linked deployment is needed for runtime environment updates. The prior Preview's environment is not evidence of missing saved project configuration.

## Architecture and security

Workspace uses `zguejzlseldovdssiumn`; Campus uses `pftbpimhyophitfuzcxn`. They never share Auth identities. Workspace verifies its bearer token with Auth; Campus verifies its own `/cam` cookies and active DB memberships/faculty assignments/enrollment. The canonical same-origin UI at www.syrka.co calls the appropriate app's API. No service-role credential is used for normal requests.

Routes: `/workspace/tools/sessions`, `/workspace/tools/notes`, `/workspace/tools/sessions/meeting/[id]`; Campus course Sessions section and `/cam/lecture-notes` with automatic instructor-published notes on the student dashboard.

Migrations are additive. RLS protects rooms, admission, immutable transcript originals/revisions, publication, jobs, personal cards and annotations. Draft notes are host-only; enrolled Campus students see published materials according to course access. Revoked enrollment/faculty membership removes access. Live STT requires consent from every approved participant before processing and again before insertion. Attribution is to the authenticated local microphone owner, not speaker identity inference; speech played into that microphone can still be another person's voice.

Private uploaded audio uses a separate `session-audio` bucket, 20 MB limit, audio MIME allowlist and randomized owner/room paths. Only the current host can create, read or delete their own room's temporary uploads. Upload processing requires explicit participant-permission attestation. Signed URLs let Qwen fetch the object for a limited period; they are not stored in public records or logs. Audio is deleted after successful or failed processing. Interrupted submissions may require host cleanup; this is not automatic physical retention enforcement.

Provider task bindings are HMAC-signed over job, room, actor, task, path, language and expiry. Client-writable job metadata cannot authorize a forged task ID or read another task. Result downloads are restricted to provider-owned HTTPS hosts. Sentence IDs derive deterministically from job/index, so repeated polls cannot duplicate imported transcript rows. Async provider tasks can finish independently; polling resumes while opening the host's session. No always-running worker is claimed.

Daily application caps: 20 AI jobs, 20 uploaded-file jobs and 1,800 four-second speech batches per user. Usage ledger survives session deletion. Shared provider quota remains the final free-only limit. Notes/export copies reuse Write; original files are not overwritten. Export DOCX/PDF/MD/TXT and timestamped TXT/SRT/VTT. Existing eight local file tools stay local; Sessions and Notes are explicit cloud features.

Shared modules are vendored to Campus through `node scripts/sync-sessions.mjs ../syrka-campus`; SHA-256 manifests track their integrity. Builds do not depend on the sibling checkout.

## Verification and rollout gates

The foundational migrations, RLS, demo transcripts, note editing, search, exports and revision cards were previously tested locally. Current changes add model-specific wire-format tests, paid-model exclusion, quota failure handling, HMAC tamper checks and private upload RLS tests. Live tests must record the exact deployed SHA and actual provider responses; fixtures are never substituted for those acceptance results.

The committed foundational Workspace migration was applied to the dedicated project during Preview testing; its filename now matches the recorded hosted migration version. Existing files/Auth data were not migrated or overwritten. The committed private-audio/job migration was also applied to Workspace after local SQL/RLS verification. Migration filenames match the recorded hosted versions. Campus hosted access is still denied by the current connected Supabase account; do not target another project to bypass that boundary.

Two temporary, uniquely named QA accounts were registered through normal signup using the controlled mailbox, then authenticated through normal password login. These actors are isolated from real users; only their own created test sessions/files should be cleaned up. Verification links may already be consumed by email processing; login/session checks, not an expired-link result alone, determine whether confirmation succeeded.

The LiveKit API accepted the existing development credentials and an isolated room creation. The initial two-browser transport probe timed out in this environment. This is **not a passed audio/video acceptance test**. Diagnose signaling/ICE/proxy separately and do not treat credential validation as proof of media delivery.

Before release: pass actual Workspace meeting → authorized audio → provider transcript → source-grounded notes → saved Notes, then Campus instructor → class → published notes → student dashboard, plus user/tenant isolation, revocation and failure recovery. Keep both PRs as drafts until those acceptance tests pass. Use GitHub pushes and existing automatic Vercel Git previews only; do not create independent deployments, merge PRs, change DNS or activate paid services.

## Remaining scope

Recording/egress/playback, a continuously streamed transcription UI, unattended long-running summary workers, automatic physical retention purging, calendar delivery/invitation emails, DST-aware recurrence, real project foreign keys, cross-lecture comparison, semantic retrieval and ontology/Roadmaps identifiers remain unimplemented. Attendance and AI notes are not proficiency, qualifications or public Career Passport evidence. No external messages/tasks are sent automatically.
