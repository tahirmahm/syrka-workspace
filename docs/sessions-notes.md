# Syrka Sessions and Notes — feature branch release record

**Latest status:** Real Qwen uploaded/realtime audio → saved Notes acceptance passed in Preview. LiveKit media delivery and Campus hosted acceptance remain separate open gates. Earlier sections are a dated development record; see the final Qwen acceptance section and machine-readable evidence.

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

## Observed Preview acceptance — 30 October 2026, 04:39 UTC

Workspace Git-linked Preview at commit `74e2024bb89989ff08aa137231bb6e3d9c07d9a2` is READY. Campus Preview at `90a13fce766e1beeab052e5392640eb2b72a0a67` is READY. Production remains on main (`2e7cda3` Workspace / `82b020b` Campus); neither draft PR was merged.

Actual authenticated Workspace server checks passed with two isolated, normally registered QA accounts:

- Deployment SHA matches the expected Git commit.
- User B cannot read user A's private meeting (404).
- A permitted text transcript import persists in hosted Postgres.
- Manually authored Notes save and reopen with source references intact.
- User B cannot overwrite user A's Notes.
- The QA session and its records were deleted after verification.

**AI/audio acceptance did not pass.** The deployed server recognizes the API key, model, free-tier confirmation and protected-quota flags, but rejects `SYRKA_AI_BASE_URL` as an invalid Singapore OpenAI-compatible endpoint. This is invalid runtime configuration, not a missing key or an assumption about the user's quota. Vercel records this variable as a Secret, so its value cannot be read back through the operator CLI. No actual Qwen transcription or generated-notes response has been verified. The normal failure is visible and does not fall back to demo, a paid model, or another provider.

Correct the Preview variable to the endpoint shown for the general-purpose Singapore key: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` or `https://YOUR_ACTUAL_WORKSPACE_ID.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`. Replace the workspace placeholder; do not include quotes or `/chat/completions`. Do not post the API key. Runtime environment updates require a subsequent automatic Git Preview build. Re-run `scripts/verify-sessions-preview.mjs` with that exact Preview URL and SHA and private QA fixtures.

LiveKit's development API authenticated and created an isolated room, but the two-browser audio/video transport probe exceeded its bounded deadline. Its room was cleaned up. Credential validation is not proof of media delivery; the meeting-to-audio-to-notes demonstration remains unverified.

The Campus connector was retried: it lists only organization `xxwikrftscbssryvcydh` (Syrka), containing Workspace and Syrka.V12. `get_project` and SQL access to Campus `pftbpimhyophitfuzcxn` return permission denied. Browser-dashboard access has not transferred to the connector. Reconnect it using an account/organization authorization that includes the existing Campus project; no replacement project was created and no Campus hosted migration or student/instructor acceptance is claimed.

Latest local checks: Workspace lint, typecheck, 35 unit/database tests, production build, and all 37 browser regression tests passed. Campus lint, strict TypeScript, 19 unit/database tests and production build passed; the prior two setup/mobile browser checks also passed. Hosted Workspace notes policies were split into action-specific policies without changing authorization, and the missing room foreign-key index was added. The hosted migration filenames match history. Advisors show no new security warnings; existing leaked-password protection is a paid-tier limitation and remains unchanged. Unused new indexes are informational.

Free-only controls and development-only LiveKit scope remain in place. No DNS, production release, account upgrade or paid fallback was performed. The API acceptance harness distinguishes manually saved notes from actual provider-generated notes.

## Current QwenCloud endpoint correction — 30 October 2026

The user provided `https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1`, which is an official Singapore endpoint. The prior validator allowed only older Alibaba endpoints and therefore rejected a valid current QwenCloud endpoint. The previous statement that the configured endpoint was necessarily invalid was too broad. The validator now accepts the exact current regional hostname and its documented Singapore alias `maas.qwencloudapi.com`, while rejecting Token Plan endpoints, other regions and lookalike domains. Existing legacy endpoints remain compatible. No credential value was read or exposed.

Verified official documentation: [Regions and endpoints](https://docs.qwencloud.com/developer-guides/getting-started/regions), [Qwen ASR API](https://docs.qwencloud.com/api-reference/speech-recognition/qwen-asr/api-reference), [Realtime WebSocket overview](https://docs.qwencloud.com/api-reference/realtime-api/websocket-overview). Filetrans and realtime use their existing API paths on the configured regional origin; no provider or paid fallback is introduced.

Vercel's most recent user redeploy observed before this correction targeted `main`/Production at unchanged main commit `2e7cda3`, rather than the feature branch. This code correction is deployed only through a new automatic Git-linked feature Preview. Campus access and two-client LiveKit media delivery remain separate acceptance gates.

## Qwen acceptance passed — 30 October 2026

The combined real-provider test passed against Git-linked Workspace Preview **`ccca9eb17da568aacfd7808d34e867c2272e0e4d`** at https://syrka-workspace-bt1birky9-tahirmahmood439wel-gmailcoms-projects.vercel.app/workspace/tools/sessions. All configuration diagnostics pass with the current Singapore QwenCloud URL. No API key was read back or exposed and no paid fallback was enabled.

Verified using locally generated fictional English audio and two normally authenticated, isolated QA actors:

- Private WAV upload → actual `qwen3-asr-flash-filetrans` response → saved sentence timestamps and recognized speech.
- Actual `qwen3.8-flash` structured notes → source-reference validation → persisted Notes → authenticated browser reopening the real Notes interface. An earlier verified generated note reported 510 input / 1081 output tokens, four overview claims, one topic and two actions; it remained unpublished for human review.
- Actual `qwen3-asr-flash-realtime` PCM-batch responses → persisted transcript with authenticated own-track attribution → another actual Qwen-generated saved note.
- No recognition before every admitted participant consents; revocation blocks the next batch. An additional direct check confirmed HTTP 400 with an explicit consent error and no changes to existing transcript or jobs.
- User B cannot read user A's private meeting or overwrite its notes. A direct Storage test also verified that the current host can upload/read private audio while another user cannot download the same object; its fixture was deleted.

The realtime failure was a production bundling defect, not a missing key: Next's bundled `ws` used an empty optional `bufferutil` module, causing a TypeError when masking outbound frames. Both applications now use `serverExternalPackages: ["ws"]`. `node scripts/verify-websocket-build.mjs` verifies the production trace includes the native runtime and performs a real localhost masked-frame round trip. Protocol handling now also waits for session creation before configuration, sends session.finish after commit acknowledgement, handles item-specific failures and reports bounded stages without private payloads. Mocked unit protocol tests alone did not catch the native bundling defect; the build smoke test and real Preview calls do.

Latest checks passed: Workspace lint, typecheck, 38 unit/database tests, production build, native transport build smoke and all 37 browser regressions; Campus lint, strict TypeScript, 19 unit/database tests, production build, native transport build smoke and both setup/mobile browser checks. One initial parallel local browser invocation collided on port 3000; sequential execution passed. There is no remaining observed Qwen failure in the combined acceptance run.

**This is Qwen API/audio-to-Notes acceptance, not a passed two-client LiveKit meeting.** Actual LiveKit media delivery and browser microphone-to-provider capture remain separate gates. Uploaded speakers are unknown; live attribution identifies the authenticated microphone owner, not diarization or verified voice identity. Live timestamps represent batch intervals. Only the fictional English fixture was tested against the real models; other supported languages have not all been verified. This is bounded near-real-time batching, not continuous word-by-word streaming.

Campus hosted access and the instructor → class → published Notes → student dashboard workflow remain blocked independently. No Campus database migration was applied during this work. Both PRs stay drafts, with no merge, production promotion, DNS changes, service upgrade or paid fallback. Temporary QA session/audio records are removed after verification; existing user files are preserved. QA identities remain private for the remaining development acceptance tests.

Evidence in the Workspace repository: `docs/acceptance/sessions-preview-2026-10-30.json` (combined pass), `qwen-realtime-2026-10-30.json` (focused realtime pass), `qwen-uploaded-notes-2026-10-30.json` (earlier upload/Notes pass within a then-failing realtime run), and `private-audio-2026-10-30.json` (direct Storage isolation).

To rerun only realtime recognition without spending more upload quota, use the operator harness with `SYRKA_QA_REALTIME_ONLY=true`, an exact Git-linked Preview URL/SHA and private QA fixtures. Unset it for the full combined workflow. The final evidence/documentation commit does not change the tested application runtime.
