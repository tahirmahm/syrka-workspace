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

LiveKit `useChat` remains the only chat transport and history owner. More → Chat opens a compact composer; tapping a floating bubble or its history control opens the full log. New comments fade out after seven seconds, at most three at once. Screen presentations, secondary panels, minimized mode and detected mobile keyboard appearance suppress bubbles. The composer follows VisualViewport keyboard geometry. Hide live comments is a per-call option in More; reduced-motion disables animation, and a polite screen-reader status announces the newest visible comment.

Sending is limited in the standard client to one message per 1.5 seconds and 2,000 characters. Receive-side bubble suppression also limits each sender to one bubble per 1.5 seconds, truncates displayed text to 500 characters and bounds the visible queue. These are presentation/client flood protections, not a new server-enforced chat rate limiter; host removal and existing LiveKit participant data permissions remain the moderation boundary. Full history retains received messages even when their bubbles are suppressed or expire. Existing retention is memory-only for the current connected call, with no database archive or replay for late joiners/reloads. Real separate-device chat/media and mobile keyboard behavior require manual device acceptance; simulated component tests do not establish that result.

### Automated run — 31 October 2026

- Lint and TypeScript: passed with no warnings/errors.
- Unit/database: 61 tests in 20 files passed.
- Production build and native WebSocket trace/masked-frame round trip: passed.
- Chromium browser regressions: 64 passed, including the live-comment harness and an actual native Chromium PiP lifecycle using a synthetic Canvas MediaStream.
- WebKit startup/iOS-capability regressions: 3 passed after restoring missing user-owned browser libraries in the resumed runner. The initial WebKit launch failed before application execution because those temporary libraries had disappeared; the rerun passed.
- Emoji UI scan of Sessions components: no matches.
- No new physical-device, hosted two-client RTP or provider-response certification is asserted by these runs. Existing calling backend, Qwen pipeline and consent authorization were preserved. The previous managed-runner ICE 701/media restriction remains a separate transport acceptance limitation; physical-device review stays pending.
