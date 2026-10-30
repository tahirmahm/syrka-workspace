# Persistent calling surface

Sessions uses a dedicated dark video surface while a call is active. The Workspace
sidebar and document navigation are hidden in that surface, with a restrained title,
connection state, floating bottom toolbar and collapsible participant/chat/notes/host
panels. The primary controls are mic, camera, share, people, chat, PiP, More and Leave.
More contains invitation, consent/notes/host controls, grid/speaker selection and
explicit browser Full Screen where supported. Device settings remain secondary.

The root App Router layout mounts `WorkspaceCallProvider`. Meeting routes register a
meeting descriptor; the provider mounts one keyed Meeting/LiveKitRoom subtree outside
route children. Navigation changes presentation and never moves/remounts that subtree.
No token, stream, document or transcript is stored in provider localStorage. A second
meeting cannot replace an active meeting. The existing single RoomAudioRenderer and
local tracks stay with the existing LiveKit room. Consent, expiry, room-ended and
removal polling continues while minimized, including while editing Write documents.
The existing Qwen provider adapters and informed-consent gates are unchanged.

Back uses normal browser history without trapping or inserting extra entries. Within
the same client-side Workspace app, calls minimize into a draggable, keyboard-movable
window, with status, video when available, mic, Return and Leave. The same root layout
covers Home, Write, Tables, Present, Sessions and Notes. External links, a hard reload,
tab close, cross-application root layouts and operating-system suspension are not
persistent navigation. Active calls install the browser's standard unload warning;
its display is subject to browser policy. No cross-tab or external-app persistence is
promised. Browser fullscreen exits on minimize/leave rather than obscuring Workspace.

## Presentation and permissions

All admitted permanent-account participants and account-free guests may publish camera,
microphone, screen and screen audio by default. The additive
`20261030230515_sessions_screen_permissions.sql` migration adds a host-controlled
`can_share_screen` flag (default true) to existing member and private guest records.
Existing host-only RLS and private deny-all access remain unchanged. The server includes
explicit publication-source grants in LiveKit JWTs and applies live source-permission
updates. Hosts can disable presentation independently of microphone/camera publication.
Only host-authenticated requests may alter these permissions.

Screen capture calls LiveKit's existing `setScreenShareEnabled` with audio requested,
system audio offered where supported, and local playback suppression requested. The
browser's chooser determines tab/window/monitor choices and whether an audio track is
actually supplied. Syrka reports when a capture contains no audio track. It does not
claim universal system-audio capture. Microphone and screen audio remain separate
LiveKit tracks; the configured audio renderer subscribes once. Qwen continues to process
only a consenting participant's microphone, not presentation audio or remote tracks.

A new presentation takes the main stage, with smaller cameras. Grid view can be selected
during a presentation. When sharing ends, the previous camera layout is restored.
Mobile focus keeps the local camera tile in a corner when it is not the focused tile.
Dynamic viewport heights and safe-area insets protect the stage and bottom controls.

## Picture-in-Picture and browser limits

The PiP control checks `document.pictureInPictureEnabled` and the actual video API.
It requests native PiP on an existing playable focused participant video (normally a
remote speaker/presentation), with no extra video/audio connection or audio renderer.
Native exit is detected; leaving/unmounting closes PiP. If no playable video or native
API is available, the call minimizes inside Workspace and explains the limitation.
An in-page floating call cannot appear over other apps or browser tabs.

| Browser family | Expected capability, subject to actual API/policy detection | Verification here |
| --- | --- | --- |
| Desktop Chromium | Standard video PiP may be available; tab audio depends on surface/chooser; system audio varies by OS | Chromium fullscreen and in-page fallback automated; physical native PiP/audio not verified |
| Desktop Firefox | Syrka falls back when the standard programmatic PiP API is absent; browser-owned PiP UI is separate | Not manually verified |
| Safari/macOS | Video PiP/fullscreen and capture support vary by version and permissions | Not manually verified |
| iPhone/iPad Safari | In-page fallback when standard API is absent; OS/background-media policies may suspend tracks; display capture may be absent | Responsive viewport tests only; no physical device claim |
| Android Chrome | PiP availability is device/context dependent; display capture and shared audio may be unavailable | Responsive viewport tests only; no physical device claim |

## Verification and release gate

Local lint, TypeScript, 56 unit/database tests, production build and native WebSocket
build smoke pass. All 56 browser regressions pass, including full-viewport desktop and
375px layouts, existing Workspace exports/editing, account-free admission, same-DOM and
single-token persistence through Back/Home/Write/return, keyboard movement, PiP fallback,
explicit Chromium fullscreen, explicit leave and server removal while minimized.
Fixture browser tests do not establish actual LiveKit media or native PiP acceptance.

The operator probe `scripts/verify-guest-call-preview.mjs` supports
`SYRKA_QA_PERSISTENCE=true`: both actual-service browsers minimize/restore without
replacing their call subtree, and host screen restrictions are verified in actual guest
JWTs. Existing real-service token removal/replay checks and optional Qwen audio/notes
checks remain. `SYRKA_QA_SECURITY_ONLY=true` explicitly skips media acceptance.

Before merge, run the real two-client media probe and physical iPhone/Android/desktop
checks. The managed runner's prior actual LiveKit attempts reached signaling but no RTP
with ICE 701 under its restricted network configuration. User-reported real-world calls
are not replaced or simulated; current new-UI media, native PiP outside the tab,
bidirectional shared-screen audio, mobile background behavior and connected recovery
must be reported as unverified until observed. Keep the existing PR draft.

Manual checklist: host Start call → fresh guest invitation/name/Ask to join → host Admit
→ verify two-way camera/mic → Back to Workspace → verify continuing sound → open Write,
Tables, Present and Notes → return without reconnecting → native PiP where available →
share a browser tab with audio as guest → verify presenter identity/video/audio at host
→ disable guest screen permission → leave/rejoin → end/remove and confirm disconnection.
No production merge, DNS change, replacement project or paid fallback is authorized.

## Actual hosted acceptance

[Sanitized service evidence](sessions-persistent-call-acceptance.json) records the
Git-linked `be957e643d0f7df339ac41a270e9111f58013562` Preview. Both independent
real-service browser contexts (normal host and account-free mobile guest) minimized
and restored the identical call subtree. No guest Auth request or session was used.
Host screen-source restriction produced a guest JWT permitting only camera/mic.
Actual LiveKit signaling accepted a token before removal and returned HTTP 401 for
the same still-unexpired token after removal and again after meeting termination.
Own QA rooms and assets were cleaned up.

Actual Qwen uploaded/realtime ASR, structured saved/reopened notes, consent revocation
and private-audio isolation passed on the unchanged adapters in source `358a8ef`.
Neither browser received RTP in the current runner; both emitted ICE 701. No claim
is made for continuing audible media during navigation, real shared audio delivery,
native PiP outside the tab or physical iOS/Android behavior. Those gates remain open.
