import { test, expect } from "@playwright/test";
import { build } from "vite";
import path from "node:path";
let bundle = "";
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    oxc: { jsx: { runtime: "automatic" } },
    logLevel: "error",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.resolve("tests/fixtures/live-comments-harness.tsx"),
        formats: ["iife"],
        name: "CommentsHarness",
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output)) throw Error("Missing test bundle");
  bundle = output.output
    .filter((c) => c.type === "chunk")
    .map((c) => c.code)
    .join("\n");
});
test("live comments expire without deleting history, cap flooding, respect overlays and allow accessible chat input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/comments-harness", (r) =>
    r.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("/comments-harness");
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(
    () => document.body.dataset.commentsReady === "true",
  );
  const receive = async (text: string, sender: string) =>
    page.evaluate(
      ({ text, sender }) =>
        window.dispatchEvent(
          new CustomEvent("qa-comment", { detail: { text, sender } }),
        ),
      { text, sender },
    );
  await receive("Hello from guest", "Guest");
  await expect(
    page.getByRole("button", { name: "Open chat: Guest: Hello from guest" }),
  ).toBeVisible();
  await receive("Suppressed flood", "Guest");
  await expect(page.locator(".call-live-comment")).toHaveCount(1);
  await receive("Second", "Host");
  await receive("Third", "Student");
  await receive("Fourth", "Visitor");
  await expect(page.locator(".call-live-comment")).toHaveCount(3);
  await page.locator(".call-live-comment").last().click();
  await expect(page.getByRole("log")).toContainText("Hello from guest");
  await expect(page.getByRole("log")).toContainText("Suppressed flood");
  await page.getByRole("button", { name: "Close history" }).click();
  await expect(page.locator(".call-live-comment")).toHaveCount(0, {
    timeout: 9000,
  });
  await page.getByRole("button", { name: "Open full chat history" }).click();
  await expect(page.getByRole("log")).toContainText("Fourth");
  await page.getByRole("button", { name: "Close history" }).click();
  await page.getByLabel("Call message", { exact: true }).fill("Typed reply");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByLabel("Call message", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator(".call-live-comment")).toContainText("Typed reply");
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: 500,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.getByRole("region", { name: "Live comments" })).toHaveCSS(
    "bottom",
    "418px",
  );
  await expect(page.locator(".call-live-comment")).toHaveCount(1);
  await expect(page.locator(".call-live-comment")).toContainText("Typed reply");
  await expect(
    page.getByRole("form", { name: "Send a call comment" }),
  ).toHaveCSS("bottom", "356px");
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: window.innerHeight,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await page.getByRole("button", { name: "Hide live comments" }).click();
  await expect(page.getByRole("region", { name: "Live comments" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Collapse message input" }).click();
  await expect(page.getByLabel("Call message", { exact: true })).toHaveCount(0);
});

test("comment interaction pauses expiry; safe text, minimized notifications and data permissions are preserved", async ({
  page,
}) => {
  await page.route("**/comments-harness", (r) =>
    r.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("/comments-harness");
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(
    () => document.body.dataset.commentsReady === "true",
  );
  await page.clock.install();
  const text = '<img src=x onerror="window.__injected=true">';
  await page.evaluate(
    (text) =>
      window.dispatchEvent(
        new CustomEvent("qa-comment", { detail: { text, sender: "Guest" } }),
      ),
    text,
  );
  const comment = page.locator(".call-live-comment");
  await expect(comment).toContainText(text);
  await expect(comment.locator("img")).toHaveCount(0);
  await page.clock.fastForward(6000);
  await comment.focus();
  await page.clock.fastForward(10000);
  await expect(comment).toHaveCount(1);
  await page.getByPlaceholder("Message everyone…").focus();
  await page.clock.fastForward(1250);
  await expect(comment).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("qa-comment", {
        detail: { text: "Mini notification", sender: "Host" },
      }),
    ),
  );
  await expect(comment).toHaveCount(1);
  await page
    .getByRole("button", { name: "Minimize call", exact: true })
    .click();
  await expect(comment).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Return to call chat" }),
  ).toContainText("1 new");
  await page
    .getByRole("button", { name: "Minimize call", exact: true })
    .click();
  await page.getByRole("button", { name: "Change chat permission" }).click();
  await expect(page.getByLabel("Call message", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
});

test("long chat history is not replayed into live comments after deduplication is bounded", async ({
  page,
}) => {
  await page.route("**/comments-harness", (r) =>
    r.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("/comments-harness");
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(
    () => document.body.dataset.commentsReady === "true",
  );
  await page.clock.install();
  await page.evaluate(() => {
    for (let i = 0; i < 2005; i++)
      window.dispatchEvent(
        new CustomEvent("qa-comment", {
          detail: { text: `Old ${i}`, sender: "Old guest" },
        }),
      );
  });
  await expect(page.locator(".call-live-comment")).toHaveCount(1);
  await page.clock.fastForward(8000);
  await expect(page.locator(".call-live-comment")).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("qa-comment", {
        detail: { text: "Only new message", sender: "New guest" },
      }),
    ),
  );
  await expect(page.locator(".call-live-comment")).toHaveCount(1);
  await expect(page.locator(".call-live-comment")).toHaveText(
    "New guestOnly new message",
  );
});

test("native Chromium PiP presents and cleans up a real synthetic MediaStream (not physical-device verification)", async ({
  page,
}) => {
  const { readFile } = await import("node:fs/promises");
  const ts = await import("typescript");
  const helper = ts.transpileModule(
    await readFile("src/lib/sessions/native-pip.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  await page.route("**/native-pip-harness", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<canvas width="320" height="240"></canvas><video autoplay muted playsinline></video><button>Native PiP</button>',
    }),
  );
  await page.goto("/native-pip-harness");
  await page.addScriptTag({ content: "window.exports={};" + helper });
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas")!,
      video = document.querySelector("video")!,
      ctx = canvas.getContext("2d")!;
    setInterval(() => {
      ctx.fillStyle = "blue";
      ctx.fillRect(0, 0, 320, 240);
    }, 50);
    video.srcObject = canvas.captureStream(15);
    void video.play();
    document.querySelector("button")!.onclick = async () => {
      const api = (
        window as unknown as {
          exports: {
            enterNativePip: (v: HTMLVideoElement) => Promise<string>;
            activeNativePip: (v: HTMLVideoElement) => boolean;
            exitNativePip: (v: HTMLVideoElement) => Promise<void>;
          };
        }
      ).exports;
      try {
        const kind = await api.enterNativePip(video);
        const active = api.activeNativePip(video);
        await api.exitNativePip(video);
        document.body.dataset.result = JSON.stringify({
          kind,
          active,
          cleaned: !api.activeNativePip(video),
          sameStream: !!video.srcObject,
        });
      } catch (e) {
        document.body.dataset.result = JSON.stringify({ error: String(e) });
      }
    };
  });
  await page.waitForFunction(
    () => document.querySelector("video")!.videoWidth > 0,
  );
  await page.getByRole("button", { name: "Native PiP" }).click();
  await page.waitForFunction(() => !!document.body.dataset.result);
  expect(
    JSON.parse((await page.locator("body").getAttribute("data-result"))!),
  ).toEqual({
    kind: "standard",
    active: true,
    cleaned: true,
    sameStream: true,
  });
});
