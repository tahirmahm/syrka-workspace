import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/workspace");
  const demo = page.getByRole("button", {
    name: "Try demo — no account needed",
    exact: true,
  });
  if (await demo.count()) await demo.click();
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
