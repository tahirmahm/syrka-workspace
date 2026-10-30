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

Guests use Supabase Anonymous Sign-ins: a temporary authenticated identity without
registration, email or password. The owner must enable this provider in existing
Workspace project `zguejzlseldovdssiumn`. This setting was observed disabled during
implementation; the connected integration cannot change Auth configuration.
Do not replace the project, add service-role browser keys or bypass admission.

The additive guest-admission migration and `20261030180649_sessions_guest_metadata_privacy.sql` are applied to
Workspace and matches hosted migration history. Existing rooms default to guest
access off. New ordinary Workspace meetings explicitly enable guest requests; the
host can disable them or lock requests. Campus classes do not enable public guests.
The only public invitation lookup returns an opted-in meeting title and host display
name, with a 60-requests/minute/room budget. Knowing a UUID never grants media access.

Guests enter a name, preview devices locally, request admission and wait. Declined or removed requests are reported explicitly and close any active call. Supabase
retains its IP signup rate limit; SQL caps guest join attempts and pending members.
After host approval, the normal server mints a five-minute room/identity/publish-scoped
LiveKit token. Refresh retains the guest identity; leaving cleans up local media.
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
devices, Ask to join, admit from host controls, Join meeting, enable both microphones
and cameras, verify audible speech and video in both directions, toggle devices,
share a screen where supported, leave/rejoin as guest, revoke speech consent, then
end for everyone. With consent, speak fictional test content, generate notes, reopen
and export them as host. An unrelated browser must not read either meeting's records.

Campus project `pftbpimhyophitfuzcxn` was retried and still returns permission denied
through the connected Supabase integration. No replacement or hosted Campus schema
changes were made. Campus class-to-dashboard acceptance remains blocked.

Anonymous identities persist in Supabase Auth until explicitly pruned; clearing a
browser/signing out loses the guest's ability to recover that identity. Existing
meeting retention/deletion is unchanged. The private invitation rate ledger has explicit deny-all RLS and no client grants.
The existing leaked-password advisor requires Pro and was not upgraded.

## Local verification

Workspace lint, TypeScript, 51 unit/database tests, production build, native
WebSocket masked-frame build smoke and all 51 browser tests passed. These include
instant cloud creation/connection requests despite stale demo state, no anonymous
or fictional hosting, guest waiting/denial, local device cleanup, mobile layout,
redirects, notes and the existing Write/Tables/Present/Tools regressions.
Mocked browser signaling is explicitly not real media acceptance.
Campus lint, strict TypeScript, 19 unit/database tests, build, native WebSocket smoke
and both setup/mobile browser tests passed. Shared helper updates retain Campus
course authorization and do not apply the Workspace guest migration to Campus.
