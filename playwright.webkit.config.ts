import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
/** Capability smoke tests in WebKit; no physical iPhone/media claim. */
export default defineConfig(base, {
  testMatch: /sessions-platform\.spec\.ts/,
  use: {
    ...base.use,
    browserName: "webkit",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    launchOptions: {},
  },
});
