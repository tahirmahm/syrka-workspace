import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import jsQR from "jsqr";
import { readFile } from "node:fs/promises";
async function pdf(name: string, widths: number[]) {
  const doc = await PDFDocument.create();
  for (const width of widths) doc.addPage([width, 200]);
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(await doc.save()),
  };
}
async function result(page: Page) {
  const pending = page.waitForEvent("download");
  await page
    .locator(".tool-results > .tool-output")
    .getByRole("button", { name: "Download", exact: true })
    .click();
  return readFile((await (await pending).path())!);
}
async function image(page: Page, mime = "image/png") {
  return Buffer.from(
    await page.evaluate((mime) => {
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 80;
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#467758";
      c.fillRect(0, 0, 120, 80);
      c.fillStyle = "#f7dac2";
      c.fillRect(15, 15, 40, 35);
      return canvas.toDataURL(mime).split(",")[1];
    }, mime),
    "base64",
  );
}
test("public catalogue, search, categories and mobile navigation", async ({
  page,
}) => {
  await page.goto("/workspace/tools");
  await expect(
    page.getByRole("heading", { name: "Tools for everyday work." }),
  ).toBeVisible();
  await expect(page.locator(".tool-card")).toHaveCount(10);
  await page.getByLabel("Search tools").fill("merge");
  await expect(page.locator(".tool-card")).toHaveCount(1);
  await page.getByLabel("Search tools").fill("");
  await page.getByRole("button", { name: "Images", exact: true }).click();
  await expect(page.locator(".tool-card")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(
    page.locator(".sidebar").getByRole("link", { name: "Tools", exact: true }),
  ).toBeVisible();
});
test("PDF merge preserves reordered pages; split extracts selected order", async ({
  page,
}) => {
  await page.goto("/workspace/tools/merge-pdf");
  await page
    .getByLabel("Upload files")
    .setInputFiles([
      await pdf("first.pdf", [101, 102]),
      await pdf("second.pdf", [203]),
    ]);
  await expect(page.locator(".tool-files li")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Move first.pdf down", exact: true })
    .click();
  await page.getByRole("button", { name: "Merge PDFs", exact: true }).click();
  const merged = await PDFDocument.load(await result(page));
  expect(merged.getPages().map((p) => p.getWidth())).toEqual([203, 101, 102]);
  await page.goto("/workspace/tools/split-pdf");
  await page
    .getByLabel("Upload files")
    .setInputFiles(await pdf("pages.pdf", [101, 102, 103]));
  await expect(page.getByText("3 pages", { exact: true })).toBeVisible();
  await page.getByLabel("Pages to include").fill("3, 1");
  await page.getByRole("button", { name: "Extract pages" }).click();
  expect(
    (await PDFDocument.load(await result(page)))
      .getPages()
      .map((p) => p.getWidth()),
  ).toEqual([103, 101]);
  await page.getByLabel("Pages to include").fill("0");
  await page.getByRole("button", { name: "Extract pages" }).click();
  await expect(page.locator(".tool-error[role=alert]")).toContainText(
    "between 1 and 3",
  );
});
test("images become valid landscape PDFs and PDF pages become PNGs and ZIP", async ({
  page,
}) => {
  await page.goto("/workspace/tools/images-to-pdf");
  const png = await image(page);
  await page.getByLabel("Upload files").setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: png },
    { name: "two.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(page.locator(".tool-files li")).toHaveCount(2);
  await page.getByLabel("Orientation").selectOption("landscape");
  await page.getByRole("button", { name: "Create PDF" }).click();
  const out = await PDFDocument.load(await result(page));
  expect(out.getPageCount()).toBe(2);
  expect(out.getPages()[0].getWidth()).toBeGreaterThan(
    out.getPages()[0].getHeight(),
  );
  await page.goto("/workspace/tools/pdf-to-images");
  await page
    .getByLabel("Upload files")
    .setInputFiles(await pdf("pages.pdf", [101, 102]));
  await expect(page.getByText("2 pages", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Convert pages" }).click();
  const zip = await JSZip.loadAsync(await result(page));
  expect(Object.keys(zip.files)).toEqual(["page-1.png", "page-2.png"]);
  const bytes = await zip.file("page-1.png")!.async("nodebuffer");
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  await expect(page.getByAltText("page-1.png")).toBeVisible();
});
test("image compression reports real sizes and conversion generates the selected encoding", async ({
  page,
}) => {
  await page.goto("/workspace/tools/compress-image");
  const png = await image(page);
  await page
    .getByLabel("Upload files")
    .setInputFiles({ name: "picture.png", mimeType: "image/png", buffer: png });
  await page
    .getByRole("button", { name: "Compress image", exact: true })
    .click();
  const compressed = await result(page);
  expect(compressed.subarray(0, 4).toString()).toBe("RIFF");
  const label =
    compressed.length < png.length
      ? "smaller"
      : compressed.length > png.length
        ? "larger"
        : "Same file size";
  await expect(page.locator(".tool-size-comparison")).toContainText(label);
  await page.goto("/workspace/tools/convert-image");
  await page
    .getByLabel("Upload files")
    .setInputFiles({ name: "picture.png", mimeType: "image/png", buffer: png });
  for (const [mime, signature] of [
    ["image/jpeg", "jpeg"],
    ["image/webp", "webp"],
    ["image/png", "png"],
  ]) {
    await page.getByLabel("Output format").selectOption(mime);
    await page
      .getByRole("button", { name: "Convert image", exact: true })
      .click();
    const data = await result(page);
    if (signature === "jpeg")
      expect([...data.subarray(0, 2)]).toEqual([255, 216]);
    if (signature === "webp")
      expect(data.subarray(8, 12).toString()).toBe("WEBP");
    if (signature === "png") expect(data.subarray(1, 4).toString()).toBe("PNG");
  }
});
test("word count is instant and QR codes decode to the exact input", async ({
  page,
}) => {
  await page.goto("/workspace/tools/word-counter");
  await page.getByLabel("Your text").fill("Hello world!\n\nCafé time.");
  await expect(page.locator(".word-stats > div").first()).toHaveText("4Words");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".word-stats > div").first()).toHaveText("0Words");
  await page.goto("/workspace/tools/qr-code-generator");
  await page
    .getByLabel("Website URL", { exact: true })
    .fill("https://example.com/syrka?student=1");
  await expect(page.getByAltText("Generated QR code")).toBeVisible();
  const decoded = await page
    .getByAltText("Generated QR code")
    .evaluate((node: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = node.naturalWidth;
      canvas.height = node.naturalHeight;
      const c = canvas.getContext("2d")!;
      c.drawImage(node, 0, 0);
      return {
        pixels: Array.from(
          c.getImageData(0, 0, canvas.width, canvas.height).data,
        ),
        width: canvas.width,
        height: canvas.height,
      };
    });
  expect(
    jsQR(new Uint8ClampedArray(decoded.pixels), decoded.width, decoded.height)
      ?.data,
  ).toBe("https://example.com/syrka?student=1");
  for (const format of ["PNG", "SVG"]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: `Download ${format}` }).click();
    const data = await readFile((await (await pending).path())!);
    if (format === "SVG") expect(data.toString()).toContain("<svg");
    else expect(data.subarray(1, 4).toString()).toBe("PNG");
  }
  await page.getByLabel("Website URL", { exact: true }).fill("invalid");
  await expect(page.locator(".tool-error[role=alert]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PNG" })).toHaveCount(
    0,
  );
});
test("invalid files never upload and show an actionable error", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.goto("/workspace/tools/split-pdf");
  await page
    .getByLabel("Upload files")
    .setInputFiles({
      name: "bad.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("corrupt"),
    });
  await expect(page.locator(".tool-error[role=alert]")).toContainText(
    "not a valid PDF",
  );
  await page.goto("/workspace/tools/convert-image");
  await page
    .getByLabel("Upload files")
    .setInputFiles({
      name: "bad.png",
      mimeType: "image/png",
      buffer: Buffer.from("corrupt"),
    });
  await expect(page.locator(".tool-error[role=alert]")).toContainText(
    "corrupted",
  );
  expect(posts).toEqual([]);
});
