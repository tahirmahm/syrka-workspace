import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/workspace");
  const demo = page.getByRole("button", {
    name: "Try demo — no account needed",
    exact: true,
  });
  await expect(demo).toBeVisible();
  await demo.click();
  await page
    .getByRole("button", { name: "Open A fresh start", exact: true })
    .click();
  await expect(page.locator(".tiptap")).toBeVisible();
});
test("Write formatting and page settings persist across reopening", async ({
  page,
}) => {
  await page.locator(".tiptap").click();
  await page.keyboard.press("Control+a");
  await page.getByLabel("Font family", { exact: true }).selectOption("Georgia");
  await page.getByLabel("Font size", { exact: true }).selectOption("18pt");
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  await page.getByLabel("Page size", { exact: true }).selectOption("LETTER");
  await page.getByLabel("Orientation", { exact: true }).selectOption("true");
  await page.getByRole("tab", { name: "Insert", exact: true }).click();
  await page.getByLabel("Header", { exact: true }).fill("Academic header");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to files" }).click();
  await page
    .getByRole("button", { name: "Open A fresh start", exact: true })
    .click();
  await expect(page.locator(".tiptap span").first()).toHaveCSS(
    "font-family",
    "Georgia",
  );
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  await expect(page.getByLabel("Page size", { exact: true })).toHaveValue(
    "LETTER",
  );
  await expect(page.getByLabel("Orientation", { exact: true })).toHaveValue(
    "true",
  );
  await expect(page.locator(".write-running-header")).toHaveText(
    "Academic header",
  );
});
test("English autocorrect is opt-in, undoable and disabled for Urdu", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page.getByRole("checkbox", { name: /Autocorrect common/ }).check();
  await page.locator(".tiptap").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("i teh ");
  await expect(page.locator(".tiptap")).toContainText("I the");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".tiptap")).toContainText("teh");
  await page.getByLabel("Document language").selectOption("ur");
  await page.locator(".tiptap").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("i teh ");
  await expect(page.locator(".tiptap")).toContainText("i teh");
});
test("named versions can be restored without losing the version list", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  page.once("dialog", (d) => d.accept("Before revision"));
  await page
    .getByRole("button", { name: "Save named version", exact: true })
    .click();
  await page.locator(".tiptap").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Added revision");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restore Before revision" }).click();
  await expect(page.locator(".tiptap")).not.toContainText("Added revision");
  await expect(
    page.getByRole("button", { name: "Restore Before revision" }),
  ).toBeVisible();
});
test("print preview paginates a long essay and keeps Workspace isolated", async ({
  page,
}) => {
  await page.locator(".tiptap").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(
    Array.from({ length: 45 }, (_, i) =>
      `Essay paragraph ${i + 1}. Evidence and critical reflection form an academic argument. `.repeat(
        5,
      ),
    ).join("\n\n"),
  );
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Print preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print / Save PDF", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const preview = page.frameLocator('iframe[title="Paginated document"]');
  expect(await preview.locator(".pagedjs_page").count()).toBeGreaterThan(1);
  await expect(preview.locator(".pagedjs_page").first()).toContainText(
    "Essay paragraph 1",
  );
  await page.getByRole("button", { name: "Close preview" }).click();
  await expect(page.locator(".tiptap")).toContainText("Essay paragraph 45");
});
test("DOCX imports editable content, saves and exports it again", async ({
  page,
}) => {
  const D = await import("docx");
  const file = await D.Packer.toBuffer(
    new D.Document({
      sections: [
        {
          children: [
            new D.Paragraph({
              heading: D.HeadingLevel.HEADING_1,
              text: "Imported research",
            }),
            new D.Paragraph({
              children: [
                new D.TextRun({
                  text: "Editable imported evidence",
                  bold: true,
                  font: "Georgia",
                  size: 36,
                }),
              ],
            }),
          ],
        },
      ],
    }),
  );
  await page.getByRole("tab", { name: "Insert", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Import document", { exact: true }).setInputFiles({
    name: "research.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: file,
  });
  await expect(page.locator(".tiptap h1")).toHaveText("Imported research");
  await expect(page.locator(".tiptap strong")).toHaveText(
    "Editable imported evidence",
  );
  await expect(page.locator(".tiptap strong")).toHaveCSS(
    "font-family",
    "Georgia",
  );
  await page.getByRole("button", { name: "Back to files" }).click();
  await page
    .getByRole("button", { name: "Open A fresh start", exact: true })
    .click();
  await expect(page.locator(".tiptap")).toContainText(
    "Editable imported evidence",
  );
  await page.getByLabel("Download A fresh start", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Word document (.docx)", exact: true })
    .click();
  const download = await pending;
  const { readFile } = await import("node:fs/promises");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  expect(await zip.file("word/document.xml")!.async("string")).toContain(
    "Editable imported evidence",
  );
});
test("a newer interrupted draft requires an explicit recovery decision", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Back to files" }).click();
  await page.evaluate(() => {
    const files = JSON.parse(localStorage.getItem("syrka-office-v1")!);
    const f = files.find((x: { kind: string }) => x.kind === "doc");
    localStorage.setItem(
      `syrka-write-recovery-v1:${f.owner_id}:${f.id}`,
      JSON.stringify({
        ...f,
        updated_at: new Date(Date.now() + 1000).toISOString(),
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Recovered interrupted assignment" },
              ],
            },
          ],
        },
      }),
    );
  });
  await page
    .getByRole("button", { name: "Open A fresh start", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore draft", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".tiptap")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(page.locator(".tiptap")).toHaveText(
    "Recovered interrupted assignment",
  );
  await page.getByRole("button", { name: "Back to files" }).click();
  await page
    .getByRole("button", { name: "Open A fresh start", exact: true })
    .click();
  await expect(page.locator(".tiptap")).toHaveText(
    "Recovered interrupted assignment",
  );
});
import { writeFixtures } from "../fixtures/write";
for (const fixture of writeFixtures)
  test(`representative document: ${fixture.name}`, async ({ page }) => {
    test.setTimeout(60000);
    if (fixture.name === "Reader’s Diary")
      await page.setViewportSize({ width: 1280, height: 1500 });
    await page.evaluate((f) => {
      const files = JSON.parse(localStorage.getItem("syrka-office-v1")!);
      const doc = files.find((x: { kind: string }) => x.kind === "doc");
      doc.content = f.content;
      localStorage.setItem("syrka-office-v1", JSON.stringify(files));
    }, fixture);
    await page.reload();
    await page
      .getByRole("button", { name: "Open A fresh start", exact: true })
      .click();
    await expect(page.locator(".tiptap")).toBeVisible();
    await page.getByRole("button", { name: "Print", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Print / Save PDF", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    const preview = page.frameLocator('iframe[title="Paginated document"]');
    const pages = preview.locator(".pagedjs_page");
    expect(await pages.count()).toBeGreaterThan(0);
    if (fixture.name === "Pages and headers")
      expect(await pages.count()).toBe(3);
    if (fixture.name === "Reader’s Diary")
      await expect(pages.first()).toHaveScreenshot("readers-diary.png", {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    await page.getByRole("button", { name: "Close preview" }).click();
    await page.getByLabel("Download A fresh start", { exact: true }).click();
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Word document (.docx)", exact: true })
      .click();
    const dl = await pending;
    const { readFile } = await import("node:fs/promises");
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await readFile((await dl.path())!));
    expect(await zip.file("word/document.xml")!.async("string")).toContain(
      "<w:body>",
    );
    if (fixture.name === "Reader’s Diary") {
      await page.getByLabel("Download A fresh start", { exact: true }).click();
      const pendingPdf = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "PDF document (.pdf)", exact: true })
        .click();
      const pdf = await pendingPdf;
      const buffer = await readFile((await pdf.path())!);
      const { PDFDocument } = await import("pdf-lib");
      expect((await PDFDocument.load(buffer)).getPageCount()).toBe(1);
      await page.goto("/workspace/tools/pdf-to-images");
      await page.getByLabel("Upload files").setInputFiles({
        name: "diary.pdf",
        mimeType: "application/pdf",
        buffer,
      });
      await expect(page.getByText("1 pages", { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: "Convert pages", exact: true })
        .click();
      await expect(
        page.getByAltText("page-1.png", { exact: true }),
      ).toBeVisible();
      await page.getByAltText("page-1.png", { exact: true }).evaluate((el) => {
        Object.assign((el as HTMLElement).style, {
          width: "794px",
          maxWidth: "none",
          height: "auto",
          maxHeight: "none",
          borderRadius: "0",
        });
      });
      await expect(
        page.getByAltText("page-1.png", { exact: true }),
      ).toHaveScreenshot("readers-diary-exported-pdf.png", {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    }
  });
test("Write ribbon remains usable on mobile and via keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(page.getByLabel("Document language")).toBeVisible();
  await page.getByLabel("Document language").focus();
  await expect(page.getByLabel("Document language")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Find text")).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
