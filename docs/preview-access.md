# Workspace Preview access

Use the short manual-testing address:

https://syrka-workspace-preview.vercel.app/workspace/sessions

This is a free Vercel alias on the existing `syrka-workspace` project. It targets an
already committed, Git-built `feature/sessions-notes` Preview. It is not a production
release and does not change `syrka.co`, production DNS, authentication or protection.
After a new feature-branch Preview reaches READY, reassign this alias to that exact
Git deployment and check its runtime SHA before sharing the link.

The reported iPhone in-app browser showed a native “This page couldn’t load” screen.
The deployment itself returned HTTP 200 and the application loaded in fresh mobile
Chromium contexts on both the original long deployment address and the short alias:
correct Sessions title/heading, no page errors or failed requests, no horizontal
overflow, and no pre-existing authentication cookies. The precise cause on that
physical device was not reproduced; this address is a tested alternative, not a
claim that a Safari engine bug or the user's network was diagnosed.

If the in-app viewer still cannot open it, use its Safari/open-in-browser control to
open this same short address in Safari. Calling and permissions should be tested in
the full browser. No camera, microphone, third-party cookies or account is required
just to load an invitation. Hosts authenticate normally; guests enter their name and
wait for admission. The account-free meeting and media acceptance gates remain as
documented in `sessions-persistent-calls.md`.

Physical iPhone Safari is unavailable here. A WebKit runtime download succeeded, but
launch was blocked by missing system libraries and lack of package-install permission;
no Safari/WebKit pass is claimed. Do not weaken security headers or disable deployment
protection to work around an unconfirmed browser-level failure.
