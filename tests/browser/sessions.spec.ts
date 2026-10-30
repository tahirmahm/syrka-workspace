import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
test.beforeEach(async ({ page }) => {
  await page.goto("/workspace/sessions");
  await page.evaluate(() =>
    sessionStorage.setItem("syrka-workspace-demo", "true"),
  );
  await page.reload();
  await expect(page.locator(".session-notice strong").first()).toBeVisible();
});
test("Sessions and Notes demo is explicit and real exports reuse Write", async ({
  page,
}) => {
  await page.getByRole("link", { name: /Fictional seminar:/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Fictional seminar: institutions and public policy",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Join meeting", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save copy in Write", exact: true })
    .click();
  await expect(page.locator(".error[role=alert]")).toContainText(
    "editable copy",
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("syrka-office-v1")!).some(
        (f: { name: string }) => f.name.includes("Notes"),
      ),
    ),
  ).toBe(true);
  const docxPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "DOCX", exact: true }).click();
  const docx = await docxPending;
  const zip = await JSZip.loadAsync(await readFile((await docx.path())!));
  expect(await zip.file("word/document.xml")!.async("string")).toContain(
    "Models and evidence",
  );
  const pdfPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const pdf = await pdfPending;
  expect(
    (
      await PDFDocument.load(await readFile((await pdf.path())!))
    ).getPageCount(),
  ).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "00:18:20", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Search transcript")).toBeVisible();
  await page.getByLabel("Search transcript").fill("causal");
  await expect(page.locator(".session-transcript article")).toHaveCount(2);
});
test("schedule, import, search and timestamped download persist locally", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "New / schedule meeting", exact: true })
    .click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Fictional test meeting");
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await page.getByRole("link", { name: /Fictional test meeting/ }).click();
  await page
    .getByText("Import a permitted transcript", { exact: true })
    .click();
  await page.getByLabel("Transcript format").selectOption("vtt");
  await page
    .getByLabel("Transcript import text")
    .fill(
      "WEBVTT\n\n00:01:20.000 --> 00:01:24.000\nA source-grounded test passage." +
        String.fromCodePoint(0x1f642),
    );
  await page.getByRole("checkbox", { name: /permission to import/ }).check();
  await page
    .getByRole("button", { name: "Import transcript", exact: true })
    .click();
  await expect(page.locator(".session-transcript")).toContainText("00:01:20");
  await page.reload();
  await expect(page.locator(".session-transcript")).toContainText(
    "source-grounded test passage",
  );
  await expect(page.locator(".session-transcript")).toContainText(
    String.fromCodePoint(0x1f642),
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "SRT", exact: true }).click();
  const out = await pending;
  expect(await readFile((await out.path())!, "utf8")).toContain(
    "00:01:20,000 --> 00:01:24,000",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
test("the authenticated API rejects anonymous access and does not mint demo media tokens", async ({
  request,
}) => {
  const result = await request.get("/workspace/api/sessions");
  expect(result.status()).toBe(401);
  const token = await request.post("/workspace/api/sessions", {
    data: { action: "token", roomId: "00000000-0000-4000-8000-000000000010" },
  });
  expect(token.status()).toBe(401);
});

test("authorized keyword search, human note editing and flashcard editing persist", async ({
  page,
}) => {
  await page.getByLabel("Search sessions").fill("causal");
  const matches = page.getByRole("region", {
    name: "Transcript and note matches",
  });
  await expect(matches.getByRole("link").first()).toBeVisible();
  await matches.getByRole("link").first().click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByText("Review, edit & publish", { exact: true }).click();
  const overview = page.getByRole("group", { name: "overview", exact: true });
  await overview
    .getByRole("textbox")
    .fill("An edited, source-linked seminar overview.");
  await page
    .getByRole("button", { name: "Save private draft", exact: true })
    .click();
  await expect(page.locator(".session-notes")).toContainText(
    "An edited, source-linked seminar overview.",
  );
  await page.getByRole("button", { name: "Revision", exact: true }).click();
  await page.locator(".session-card summary").first().click();
  await page.getByRole("button", { name: "Edit card", exact: true }).click();
  await page
    .getByLabel("Question", { exact: true })
    .fill("Revised study question");
  await page.getByRole("button", { name: "Save card", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Revision", exact: true }).click();
  await expect(page.locator(".session-card summary").first()).toHaveText(
    "Revised study question",
  );
});
