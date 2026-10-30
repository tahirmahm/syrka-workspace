# Instant calling and guest admission — implementation and acceptance

Workspace keeps Sessions in the main sidebar at `/workspace/sessions`. **Start call**
creates a real hosted meeting as the signed-in host, then opens its canonical URL
with a host-only initial connection request. It never creates an anonymous-host or
fictional call. Scheduled meetings remain available through **New meeting**.
Existing meetings also have **Start call** or **Rejoin call** as appropriate.

An explicit local demo is never a communications backend. A valid permanent account
starting or scheduling a meeting clears a stale demo selection; a real invitation
uses the cloud path rather than looking up a fictional local room. Demo examples
remain intentionally available, without simulated participants or media.

Guests now use server-managed, meeting-scoped admission records, without Supabase
Auth signup, registration, email or password. This removes the observed
`anonymous_provider_disabled` failure rather than depending on an Auth setting.
The server sets a four-hour opaque HttpOnly, Secure, SameSite=Lax cookie scoped to
the guest API; only its SHA-256 hash is stored in a private RLS-protected table.
No service-role key or new environment variable is needed. Existing authenticated
accounts and older anonymous records remain intact.

The additive guest-admission migration and `20261030180649_sessions_guest_metadata_privacy.sql` are applied to
Workspace and matches hosted migration history. Existing rooms default to guest
access off. New ordinary Workspace meetings explicitly enable guest requests; the
host can disable them or lock requests. Campus classes do not enable public guests.
The only public invitation lookup returns an opted-in meeting title and host display
name, with a 60-requests/minute/room budget. Knowing a UUID never grants media access.

Guests enter a name, preview devices locally, request admission and wait. Declined or removed requests are reported explicitly and close any active call. Supabase
is not contacted for guest authentication. SQL caps new requests (30/room/hour),
pending guests (10/room), token requests (120/guest/hour), and audio usage.
After host approval, the guest gateway mints a maximum 60-second room/identity/publish-scoped
LiveKit token and connects automatically with microphone/camera initially off. Refresh retains the guest identity; leaving cleans up local media.
Browser device preview is explicitly local, muted, and stopped on selection changes,
joining or unmount. Selected devices are passed to LiveKit capture defaults. Meeting
microphone/camera publication still requires the user to enable those controls.

Guest API actions are limited to admission, token, consent and their own audio
batches. RLS additionally prevents guest hosting, Workspace file access, private
Storage, shared notes, personal cards/annotations, transcript reads and AI job
creation. Host/student records retain their original owner/course predicates.
Guests can consent to their own near-real-time microphone transcription; all admitted
participants must consent and revocation blocks subsequent batches. Calling does not
require AI or speech consent. Existing Qwen protocols/models are unchanged.

Host controls retain admit/deny/remove, lock, publishing permissions, transcription
and end-for-everyone. A server-only mute operation uses LiveKit's published audio
track API; it never remotely unmutes a microphone. Ending is available for scheduled
as well as live meetings, and polling closes a call when its host ends the session.
These code paths must still pass real media acceptance before being called operational.

## Release gates and manual device checklist

Keep Workspace PR #4 and Campus PR #8 draft. Actual two-way audio/video, guest rejoin,
screen-share delivery, remote host mute/removal and post-connect recovery require a
WebRTC-capable runner/device test. Prior signaling/ICE results are in the dated
calling report; no physical microphone/camera/speaker acceptance is claimed.

Manual test on iPhone Safari, Android Chrome and desktop: sign in as host, choose
Start call, copy invitation, open it without an account in a second browser, choose
devices, Ask to join, admit from host controls, wait for automatic connection, enable both microphones
and cameras, verify audible speech and video in both directions, toggle devices,
share a screen where supported, leave/rejoin as guest, revoke speech consent, then
end for everyone. With consent, speak fictional test content, generate notes, reopen
and export them as host. An unrelated browser must not read either meeting's records.

Campus project `pftbpimhyophitfuzcxn` was retried and still returns permission denied
through the connected Supabase integration. No replacement or hosted Campus schema
changes were made. Campus class-to-dashboard acceptance remains blocked.

New guests create no Auth users. Expired/removed credentials cannot mint tokens;
clearing cookies loses the guest identity. Private guest records cascade with their
meeting on deletion; existing retention is unchanged. Removed participants receive
an explicit LiveKit token revocation cutoff 30 seconds ahead of removal (within
Cloud's required 60-second window), plus blocked credential renewal. Token issuance
rechecks admission after remote room provisioning.
Revocation and real media still require actual hosted acceptance evidence. The private invitation rate ledger has explicit deny-all RLS and no client grants.
The existing leaked-password advisor requires Pro and was not upgraded.

## Local verification

Workspace lint, TypeScript, 55 unit/database tests, production build, native
WebSocket masked-frame build smoke and all 52 browser tests passed. These include
instant cloud creation/connection requests despite stale demo state, no anonymous
or fictional hosting, guest waiting/denial, local device cleanup, mobile layout,
redirects, notes and the existing Write/Tables/Present/Tools regressions.
Mocked browser signaling is explicitly not real media acceptance.
Campus lint, strict TypeScript, 19 unit/database tests, build, native WebSocket smoke
and both setup/mobile browser tests passed. Shared helper updates retain Campus
course authorization and do not apply the Workspace guest migration to Campus.

## Previous hosted acceptance (before scoped guest replacement)

Application source `438438438e7b6f71eaf6701f68abff9fb9cfa66f` is READY at
https://syrka-workspace-jxofh8uia-tahirmahmood439wel-gmailcoms-projects.vercel.app/workspace/sessions.
Campus source `975563cf070dc3b9b646eb33c656459a888028f7` is READY at
https://syrka-campus-e4jg8dn0q-tahirmahmood439wel-gmailcoms-projects.vercel.app/cam.

**Verified against actual Workspace Preview:** clicking Start call in a normal
QA account while a stale demo flag was present created a hosted owned meeting,
restored the approved host membership, cleared demo mode, minted a real token and
mounted the actual LiveKit SDK. Nine real signaling frames arrived. The call stayed
connecting; this does not prove media delivery. Leave cancelled the connection.
The exact QA-created instant meeting was ended and deleted.

**Verified with actual Qwen:** filetrans recognized fictional uploaded WAV audio
with timestamps; qwen3.8-flash generated and saved structured notes; an authenticated
browser reopened them. Realtime-model PCM batches produced persisted own-track
transcripts and another generated note. No processing before all consent, revocation,
user isolation and direct private Storage isolation passed. Uploaded speaker identities
remain unknown. This provider/audio test is separate from a live-call-to-notes test.

**Actual two-client media NOT verified:** two distinct permanent Auth contexts passed
admission, signed grants, host privilege denials, invitations and viewport checks.
Both default and enforced-relay attempts received real signaling but failed ICE with
701 and no audio/video RTP or playback. Both left and closed peer connections.
The runner has an HTTP proxy and no general TCP grants/VPN. Observed failure is at
ICE/media reachability; exact behavior on ordinary user networks is not established.
Microphone/video exchange, screen-share delivery, connected remote mute/removal,
guest rejoin and post-connect recovery have not passed real media acceptance.

**Actual account-free guest NOT verified:** the real Supabase Auth request returned
HTTP 422 / `anonymous_provider_disabled`. Connected Supabase tools have no Auth-config
mutation; CLI has no management access token. Qwen keys cannot change Supabase Auth.
Anonymous Sign-ins must be enabled in the existing Workspace project before the
hosted guest test can proceed. RLS, UI and API guest tests pass locally; that is not
a substitute for hosted guest authentication. No insecure guest bypass was added.

**Campus NOT verified:** connector access remains denied for the existing project.
No Campus migration or fictional class records were substituted. Physical iPhone,
Android, microphone, camera and speaker testing is unavailable and not claimed.

All probes used authorized Vercel Preview access, not a public production release.
Both draft PRs remain unmerged. Production DNS, main branches, credentials, paid
fallback and paid services were not changed. Sanitized machine-readable evidence
is committed under `docs/verification/sessions-*-2026-10-30.json`. Only own QA meeting
records and audio fixtures were removed. Later report-only commits do not change
application code; the exact exercised application SHA above is retained for audit.

## Scoped guest release verification

Migration `20261030191130_sessions_scoped_guests.sql` is applied to the existing
Workspace database. The SQL tests cover no Auth-user creation, admission enforcement,
foreign-room rejection, host-only management, consent, private-data isolation and
revocation. Browser tests cover automatic connection after admission and full-width
mobile errors/navigation. Existing desktop navigation is preserved.

Run the actual hosted acceptance separately from mocked browser tests:

```sh
SYRKA_PREVIEW_URL=https://<git-preview>.vercel.app \
SYRKA_EXPECTED_SHA=<commit-sha> \
node scripts/verify-guest-call-preview.mjs
```

Use the existing ignored QA fixture and origin-scoped Vercel Preview access. This
probe uses a normally authenticated host and a fresh browser guest, counts Auth
requests, checks actual LiveKit RTP, and separately replays an unexpired JWT before
and after host removal. A signaling-only result is not media acceptance. It writes
private operator evidence to `/tmp/syrka-scoped-guest-preview-acceptance.json`.

Calling is independent of Qwen availability and consent. Guest speech requires
explicit consent from every admitted participant and a second server-side consent
check when persisting each result. Guests cannot retrieve private notes/transcripts.
No paid fallback has been enabled. Hosted results will be recorded after deployment.
