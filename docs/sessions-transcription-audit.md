# Sessions transcription audit — 31 October 2026

## Confirmed cause in the existing Preview

Before QA, the latest five Workspace meetings had `transcribing=false`, no consenting signed-in members, zero transcript segments and no notes. The latest two-person meeting had one approved signed-in host and one approved scoped guest; neither had consented. There were no ASR jobs or guest audio batches for those meetings. The previous 24-hour job query returned no processing jobs. No private speech content was read to reach this conclusion, and no real participant consent or meeting settings were changed.

This is an activation/consent and discoverability problem in the observed meetings, rather than evidence of a failed Qwen request or lost transcript. Notes also require a transcript and an explicit generation request; they were not being generated automatically.

Runtime authenticated checks confirmed `ai=true`, `stt=true`, PCM speech mode and no missing configuration. The existing `SYRKA_AI_*` Secrets are present in Vercel Preview but are intentionally omitted/blanked by environment pulls. A blank pulled value is not a missing deployed credential. No duplicate QWEN variables, credential rotation, billing changes or paid fallback were introduced.

## Provider and persistence verification

An isolated test on the existing Git Preview authenticated two QA users and submitted fictional spoken PCM to the existing meeting endpoint. Actual `qwen3-asr-flash-realtime` responses produced two stored segments, attributed to the two authenticated microphone owners. Unshared transcript data was hidden from the second member; after explicit host sharing, that member could retrieve it. Actual `qwen3.8-flash` produced and saved structured notes from those ASR segments. Revoking consent prevented subsequent speech processing. The QA meeting was removed afterward. Redacted evidence: [baseline acceptance](verification/sessions-asr-baseline-2026-10-31.json).

Browser probes additionally exercised real getUserMedia/AudioContext/AudioWorklet processing with a fictional synthesized microphone fixture. The probe uses two isolated authenticated browser contexts and real Preview/provider/database requests. It is not a physical microphone test or a LiveKit RTP test. Early driver checks were corrected to stop after two submitted batches and compare authorized segment IDs rather than a changing segment total.

`scripts/verify-transcription-preview.mjs` repeats the bounded browser capture, account-free guest contribution, access controls and actual transcript-to-notes workflow. It requires the exact Git-linked Preview/SHA and private QA actor/audio fixtures; it does not create public test routes, expose provider keys, mock provider responses or modify real meetings. Latest deployment-specific results are reported on draft PR #4.

## Transport audit

The existing adapter's outbound WebSocket protocol matches the current [Qwen client events](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-client-events) and [server events](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-server-events):

1. Server-only Bearer authentication to the configured Singapore origin at `/api-ws/v1/realtime?model=qwen3-asr-flash-realtime`.
2. Wait for `session.created`, send `session.update` with PCM, 16,000 Hz, language and manual `turn_detection:null`, then wait for `session.updated`.
3. Send base64 PCM16 append events, commit, and finish after commit acknowledgment.
4. Consume completed transcript events; wait for `session.finished` and close. Empty/no-speech completions remain valid.

This remains bounded four-second microphone batches over authenticated HTTP, each using a short server-side outbound provider WebSocket. It is not a Vercel-hosted WebSocket server or continuous partial-word streaming. Typical display latency includes four-second capture, provider processing and two-second host/five-second member polling.

## Changes

- More → **Notes / Transcription** opens **Live Transcript** first. Missing consent, host enablement, microphone state, processing and errors are explicit. No controls consent on behalf of other people.
- A per-participant consent checklist and host Enable/Stop action sit above secondary host settings. Consent controls collapse once enabled; revocation remains accessible. Guests keep their existing consent-only/private-transcript policy.
- Timestamped recent segments update from the existing authorized polling and auto-follow unless the reader scrolls back. Full transcript/search/edit/export remain available below. Speaker labels identify microphone owners, not automated voice diarization; live times are batch intervals, not word-level alignments.
- Generate notes from transcript invokes the existing structured notes job and shows saved/job/error states. No automatic paid or alternate provider is used.
- Browser AudioContext suspension is exposed with a genuine Resume speech processing gesture. Capture cleanup is now available even if `resume()` has not resolved, is idempotent, and never stops the LiveKit microphone track. This is a hardening measure; it was not proven to be the cause on the user's phone.
- Local batch size and server-confirmed byte/character/segment counts are distinct. Listening reports a running local capture context, not proof that words were recognized. Processing reflects pending requests/jobs. Speech errors are isolated from calling connection errors.
- `[syrka-asr]` server logs and authorized job metadata contain model, transport, phase, event counts, byte/character counts, nonzero-input boolean and safe error/quota classification. They never contain audio, speech text, prompts, API keys, authentication headers or raw provider bodies.

## Validation and limits

Lint, TypeScript, production build, 65 unit/database tests, 68 Chromium browser tests, three WebKit startup tests and the native WebSocket trace/masked-frame check passed. New coverage verifies suspended capture cleanup/resume without stopping call media, PCM sizing/timestamps, redacted provider diagnostics, explicit consent/enablement, automatic transcript and notes updates, and an independent ASR error with the same call/token still present.

The real two-human LiveKit call with physical microphones, informed consent on each device and on-device transcript/notes display still needs acceptance. Browser synthetic audio, API success and signaling must not be described as that physical-media test. Account-free guests can contribute consented audio but cannot read private meeting transcripts/Workspace Notes under the existing policy. Signed-in participants need the host's transcript sharing permission. The draft PR remains unmerged; production, Campus, RLS, private Storage and provider billing configuration are unchanged.

## Deployed acceptance on application commit 4244f33

The complete `verify-transcription-preview.mjs` run passed against Git-linked Preview `4244f33113c270203ea033cf41434cf1658f26ad`. Each of two independent authenticated browser contexts captured exactly two nonzero 128,000-byte PCM batches through the real worklet and submitted them to the actual Preview/Qwen adapter. Each received server-confirmed byte counts, completed-event diagnostics, recognized character counts and persisted segment acknowledgments. Own-track speaker attribution and shared/unshared access were checked.

A newly admitted account-free guest explicitly consented, submitted a real fictional spoken PCM batch and produced a scoped guest-attributed segment. That guest still could not retrieve the private transcript or notes. Qwen generated structured notes from the resulting transcript. The actual transcript and saved Notes reopened in the authenticated Workspace UI, with no horizontal overflow at 390px or 1440px, including the expanded consent checklist.

After guest and signed-in consent revocation, subsequent ASR POSTs were rejected and existing segments remained intact. The host's `transcribing` flag need not be cleared: actual processing requires both that setting and current unanimous consent. A preliminary test assertion that expected the setting itself to become false was corrected to test these enforced behaviors.

Redacted deployed evidence: [browser/guest ASR and notes acceptance](verification/sessions-transcription-preview-2026-10-31.json). The test's source application is commit 4244f33; subsequent operator/evidence-only commits do not change application code. No physical two-human call, microphone, or LiveKit RTP certification is asserted by this result. Every QA meeting was deleted after the test.
