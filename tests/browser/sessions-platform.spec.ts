/** Browser capability regressions; no LiveKit media acceptance claim. */
import { test, expect } from "@playwright/test";
for (const colorScheme of ["light", "dark"] as const) {
  test(`Workspace loads without fullscreen APIs in ${colorScheme} mode (iOS capability profile)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => {
      Object.defineProperty(document, "exitFullscreen", {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(document, "fullscreenElement", {
        get: () => null,
        configurable: true,
      });
      Object.defineProperty(Element.prototype, "requestFullscreen", {
        value: undefined,
        configurable: true,
      });
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/workspace/api/sessions**", (route) =>
      route.fulfill({ status: 401, json: { error: "Sign in to Workspace" } }),
    );
    for (const path of [
      "/workspace",
      "/workspace/sessions",
      "/workspace/tools/notes",
    ]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("html#__next_error__")).toHaveCount(0);
      await expect(
        page.getByText("This page couldn’t load", { exact: true }),
      ).toHaveCount(0);
      await expect(page.locator("body")).not.toBeEmpty();
    }
    expect(errors).toEqual([]);
  });
}

test("fresh browser startup hydrates Sessions without the global error boundary", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/workspace/api/sessions**", (route) =>
    route.fulfill({ status: 401, json: { error: "Sign in to Workspace" } }),
  );
  await page.goto("/workspace/sessions", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Syrka Sessions", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html#__next_error__")).toHaveCount(0);
  expect(errors).toEqual([]);
});
