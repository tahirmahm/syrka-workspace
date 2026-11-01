import { defineConfig } from "@playwright/test";
import base from "./playwright.webkit.config";
/** Native app UI coverage in desktop/mobile WebKit; not physical device evidence. */
export default defineConfig(base, { testMatch: /native\.spec\.ts/ });
