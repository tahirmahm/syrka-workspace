# Sessions calling acceptance — 30 October 2026

This is a feature-branch change, not a production release. Keep Workspace PR #4
and Campus PR #8 in draft until actual bidirectional LiveKit media acceptance
and the hosted Campus instructor/student checks pass.

## Implementation

The existing LiveKit client and project remain in use. Sessions now has a bounded
video stage, actual participant camera/screen-share tiles, microphone/camera/share
controls, speaker-unlock feedback, connection status, participant and ephemeral
chat panels, invitation copying, and collapsible transcript/notes/host controls.
Mobile prioritizes the stage with an accessible bottom toolbar. Devices start off;
calling does not depend on AI configuration or speech-processing consent.

Invitations retain their URL during account sign-in. Pending guests receive only
their own waiting status. The deployed test exposed an important difference from
the original unit fixture: existing RLS permits waiting members to read the
invitation row. The API now handles both visible and hidden invitation rows,
without returning the private meeting snapshot. Existing SQL policies remain intact.

Leaving also cancels a pending connection. Application authorization loss clears
the call and private snapshot. SDK errors have safe user-facing messages and a
slow-connection notice; a successful token is never displayed as a connected call.
The existing LiveKit auto-reconnection remains in use.

Tokens are signed server-side, expire in five minutes, and scope the authenticated
identity to the application and room. Waiting/removed participants and ended rooms
cannot obtain a token. Publication permission comes from membership; host controls
use the server room-management API. Configured media URLs reject embedded secrets,
query strings and fragments. No LiveKit API secret is returned to the client.
Development-only credential gating remains; these credentials are not promoted
to production. No paid services, DNS changes or replacement projects are involved.

Transcription retains explicit all-participant consent. Revocation stops new local
audio capture/requests; server checks independently reject subsequent batches.
Qwen adapters and models remain unchanged. Calling is independent of transcription.

All product controls use existing Lucide/SVG icons. Native file inputs are visually
hidden behind accessible SVG upload controls. An AST-based guard rejects emoji UI
literals, including escaped forms, while transcripts and user messages retain Unicode.

## Verification and limitations

Workspace: lint, TypeScript, 46 unit/database tests, production build, native
WebSocket build smoke, and 42 browser regressions passed. Campus: lint,
`npx tsc --noEmit` (no `typecheck` npm script exists), 19 unit/database tests,
production build, native WebSocket smoke, and two browser tests passed.
Browser layout fixtures are explicitly not media acceptance tests.

Run `scripts/verify-livekit-preview.mjs` against an exact Git Preview SHA with two
private, normally authenticated QA accounts. It exercises real admission, server
permissions and browser sessions before checking actual LiveKit RTP packets,
decoded video frames, audio energy and playback in both directions. Synthetic
camera/audio hardware is used only as the source; transport must use LiveKit.
Credentials and participant JWTs must remain private. The probe deletes its own room.
Physical microphone, camera and speaker playback have not been manually verified.

Campus project `pftbpimhyophitfuzcxn` still returns “You do not have permission to
perform this action” through the connected Supabase integration. Browser dashboard
access does not establish connector access. No hosted Campus migration or fictional
course records were substituted; course-linked acceptance remains blocked.

## Actual updated Preview results

Source commit `d0c305df67b7146c59ce015aea8c978e8560039a` was tested at
https://syrka-workspace-dmasqn184-tahirmahmood439wel-gmailcoms-projects.vercel.app/workspace/tools/sessions.
Campus source commit `64c8fb18a413435afc9af484af8a5c74408c5a60` has a READY Git Preview at
https://syrka-campus-jerpzr9vf-tahirmahmood439wel-gmailcoms-projects.vercel.app/cam.

Real Qwen acceptance passed on that exact Workspace SHA: uploaded fictional WAV
→ actual filetrans sentence timestamps → actual structured notes → saved/reopened
Notes UI; actual realtime-model PCM batches → own-track attributed transcript →
another actual structured note. All-member consent and subsequent revocation were
verified. Upload diarization is not verified: uploaded speakers remain unknown.
Own-track attribution identifies the authenticated recording track, not independently
verified human speaker identity. A separate direct Storage check confirmed owner
upload/read and rejection of another authenticated user's download.

The default two-authenticated-browser media probe passed admission, scoped token,
publication-grant, invitation copy, desktop/mobile stage bounds and clean leave
checks. Both clients received real LiveKit WebSocket frames (50 and 42), including
regional failover. However, ICE reported repeated code 701 errors, no relay candidate
was established, and no inbound/outbound audio or video RTP was observed. No remote
video frames or speaker playback were observed. **Two-way calling acceptance failed.**
Microphone/camera operation, screen-share delivery, connected host enforcement and
reconnection after successful media therefore remain unverified.

The runner's network policy exposes an HTTP proxy but has no general TCP domain/IP
grant or VPN. The observed failure is media/ICE reachability, separate from successful
application authentication, token minting and LiveKit signaling. This is evidence of
a runner transport blocker; it is not sufficient to assign an exact production root
cause or claim that normal user devices will connect. Complete acceptance on a
WebRTC-capable runner with permitted UDP/TURN-TLS egress before merging either PR.

Relay-only retest also failed with ICE 701 and no RTP. The probe enforces relay
policy on both peer construction and SDK configuration updates; recorded policies
are `relay` for both clients. Both again received signaling (48 and 42 frames),
showed network feedback and closed their peer connections on leave. Sanitized
machine-readable evidence is in `docs/verification/sessions-*-2026-10-30.json`.
No QA meeting records or private audio fixtures were retained after these checks.

Changed application files: `src/components/sessions/live-stage.tsx`, `meeting.tsx`,
`src/components/auth.tsx`, `src/components/tools/shell.tsx`,
`src/app/globals.css`, the three Sessions/Notes route wrappers,
`src/lib/sessions/client.ts`, shared `server.ts` and `manifest.json`.
Operator probes and admission/token, emoji and browser regressions accompany them.
Campus receives only shared server safeguards/manifest plus this acceptance report;
its existing course UI and authorization model are preserved.
