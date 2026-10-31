# Sessions mobile calling refinement

The existing application-level LiveKit connection remains the sole room owner. Route navigation and panel changes do not recreate it. Qwen, consent, scoped guest credentials and server admission checks are unchanged.

## Interface

At widths up to 900px the primary toolbar contains exactly Mic, Camera, People and More. More contains Leave (red), sharing, PiP, Chat, Notes/consent, devices, fullscreen where supported and secondary meeting settings. Host termination retains its explicit confirmation. Calling surfaces use black (#000000) and neutral #141414/#242424; Workspace retains its light theme.

People shows the host's waiting guests first, with Admit/Deny, followed by admitted members and existing server-authorized mute, remove and publishing permissions. Opening People refreshes membership immediately; active hosts refresh every two seconds, other clients every five seconds. This is HTTP polling, not a new realtime subscription. Waiting counts come from the authenticated server snapshot. Guests cannot receive host controls through this presentation layer.

People, Chat, devices and notes overlay the video stage. Narrow-screen panels are dismissible bottom sheets. Small two-person calls default to focused video with a local tile; explicit grid and screen presentations remain available.

## Native Picture-in-Picture and audio

An explicit PiP click uses the existing playable LiveKit VideoTrack element. The adapter probes the standard video API, then WebKit's `webkitSupportsPresentationMode`, `webkitSetPresentationMode` and actual `webkitPresentationMode`. WebKit's setter returns void; entry is checked after its presentation-mode event or a short timeout. Unsupported, blocked and ignored requests fall back to the explicitly labelled Workspace floating window. There is no second room, cloned media stream or second audio renderer. Leaving cleans up owned native presentation; returning does not reconnect.

API references: [standard video PiP](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestPictureInPicture), [WebKit video IDL](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/HTMLVideoElement.idl). API availability does not guarantee that a particular Safari/iOS MediaStream may enter native PiP. Real iPhone Safari, Android Chrome and system-background playback require device testing. Workspace floating mode only persists within Workspace; no operating-system restrictions are bypassed.

Enable Audio appears only when a subscribed, unmuted remote audio track exists and LiveKit reports playback blocked. Its user gesture calls the existing room's startAudio; it disappears when playback is enabled. This reports browser playback permission, not proof that speakers physically emitted sound.

## Verification boundaries

Automated coverage includes People admission/denial/mute/removal, the mobile four-button toolbar in portrait and landscape, black background, overlay geometry, secondary actions, navigation persistence and native API adapter success/failure/cleanup. Adapter tests simulate platform APIs; they do not constitute physical-device native PiP verification. Hosted LiveKit transport and physical microphone/camera/speaker checks must be reported separately. The draft PR remains unmerged pending remaining acceptance checks.

## Floating live chat

LiveKit `useChat` remains the only chat transport and history owner. The compact “Message everyone…” composer is available above the controls by default. More → Chat and the composer history button open the full log; closing the composer leaves More available to restore it. Tapping a floating bubble also opens history. New comments fade out after seven seconds, at most three at once; focus, hover and touch pause fading until interaction ends. Screen presentations, secondary panels and detected mobile keyboard appearance suppress full bubbles. Minimized calls show a small recent-message indicator that restores the call and history, rather than full bubbles. The composer follows VisualViewport keyboard geometry. Hide live comments is a per-call option in More; reduced-motion disables animation, and a polite screen-reader status announces the newest visible comment.

Sending is limited in the standard client to one message per 1.5 seconds and 2,000 characters. Receive-side bubble suppression also limits each sender to one bubble per 1.5 seconds, truncates displayed text to 500 characters and bounds the visible queue. These are presentation/client flood protections, not a new server-enforced chat rate limiter; host removal and existing LiveKit participant data permissions remain the moderation boundary. Full history retains received messages even when their bubbles are suppressed or expire. Existing retention is memory-only for the current connected call, with no database archive or replay for late joiners/reloads. Real separate-device chat/media and mobile keyboard behavior require manual device acceptance; simulated component tests do not establish that result.

### Automated run — 31 October 2026

- Lint and TypeScript: passed with no warnings/errors.
- Unit/database: 61 tests in 20 files passed.
- Production build and native WebSocket trace/masked-frame round trip: passed.
- Chromium browser regressions: 64 passed, including the live-comment harness and an actual native Chromium PiP lifecycle using a synthetic Canvas MediaStream.
- WebKit startup/iOS-capability regressions: 3 passed after restoring missing user-owned browser libraries in the resumed runner. The initial WebKit launch failed before application execution because those temporary libraries had disappeared; the rerun passed.
- Emoji UI scan of Sessions components: no matches.
- No new physical-device, hosted two-client RTP or provider-response certification is asserted by these runs. Existing calling backend, Qwen pipeline and consent authorization were preserved. The previous managed-runner ICE 701/media restriction remains a separate transport acceptance limitation; physical-device review stays pending.

## Copy confirmations and composer refinement

Copy success uses a single portal-based, pointer-transparent “Link copied” pill below the top safe area. The visual toast fades and unmounts after exactly 1,000ms; repeated success restarts that one toast rather than stacking. A separate polite assistive status retains the announcement. Clipboard failures use the existing persistent, dismissible error alert. Other error lifetimes are unchanged.

The default composer keeps Enter/Send available, preserves text while secondary panels open, and follows VisualViewport resize/scroll and window resize without changing the room connection. Incoming bubbles use local receipt lifetime rather than trusting sender clock synchronization. All message content remains React-escaped text; existing memory-only chat retention and approved-participant LiveKit data permissions are unchanged. Receive-side limits protect the overlay, while modified clients are still governed by existing LiveKit permission/removal controls rather than a new messaging server.

Focused regression coverage verifies 1,000ms toast dismissal, persistent assistive announcement, duplicate replacement, persistent clipboard errors, paused expiry, escaped HTML, compact minimized notifications, denied data sending and default input presence. Real separate-device chat delivery, physical keyboard/audio/video and native iOS/Android PiP are not asserted by these simulated browser tests.

### Notification refinement verification — 31 October 2026

Lint, TypeScript, production build, 61 unit/database tests, 67 Chromium browser regressions, three WebKit startup regressions and the production WebSocket masked-frame check passed. These runs include exact toast timing and replacement, longer-lived copy errors, paused expiry, safe rendering, keyboard geometry, data-permission-disabled input, minimized notifications and 2,005-message deduplication history. Physical devices and real two-client chat/media were not re-certified in this run; the PR remains draft pending that acceptance.
