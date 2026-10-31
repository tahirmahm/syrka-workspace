# Workspace Preview access and iOS startup fix

Manual testing address:
https://syrka-workspace-preview.vercel.app/workspace/sessions

This free alias targets the latest committed, Git-built `feature/sessions-notes`
Preview in the existing project. After a new Preview reaches READY, reassign the
alias and verify its runtime SHA. Production domains/DNS remain unchanged.

## Root cause

The reported “This page couldn’t load / Reload to try again, or go back” screen is
Next.js's built-in **client error boundary**, not a browser network error. The
previous short-address workaround misdiagnosed that screen and did not fix it.

The root call provider compared `document.fullscreenElement` with a null call ref.
When both were null it called `document.exitFullscreen()` during initial loading,
even with no call. Browsers without the standard method crashed with
`document.exitFullscreen is not a function`, reproducing the exact screenshot.
iOS browsers share WebKit and cannot be assumed to expose desktop fullscreen APIs.

The effect now requires a real owned fullscreen element and an available method.
It also tolerates synchronous errors, Promise rejection, and implementations that
return no Promise. Optional fullscreen UI cannot take down the Workspace or call.
No credentials, RLS, meeting data, LiveKit/Qwen backend or security headers changed.

## Verification

Browser regressions cover absent fullscreen APIs in light/dark mode across Home,
Sessions and Notes, plus a synchronous/non-Promise exit during a minimized call.
The original public Preview reproduced the exact Next.js screen in actual WebKit
with its native fullscreen capabilities, and in Chromium with the missing-API
profile. Both long and short deployed addresses failed in WebKit. This provides a
before/after regression rather than relying on HTTP 200 alone. Chromium and WebKit
engine smoke checks are separate from physical iPhone testing.

Run:

```sh
npx playwright test tests/browser/sessions-platform.spec.ts
npx playwright test --config playwright.webkit.config.ts
```

The normal suite continues to cover native Chromium fullscreen exit, call lifecycle,
guest admission, responsive layouts and existing Workspace applications. Physical
Safari/Chrome iPhone testing and the prior media/PiP acceptance gates still need device
verification; see `sessions-persistent-calls.md`. Keep the existing PR draft.
