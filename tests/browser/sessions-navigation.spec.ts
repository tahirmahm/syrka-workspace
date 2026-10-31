import { test, expect } from "@playwright/test";

for (const width of [1440, 375]) {
  test(`Sessions is a first-class app before Tools at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.goto("/workspace");
    await page
      .getByRole("button", { name: "Try demo — no account needed" })
      .click();
    const sidebar = page.locator(".sidebar");
    const sessions = sidebar.getByRole("link", {
      name: "Sessions",
      exact: true,
    });
    await expect(sessions).toBeVisible();
    const bounds = await sessions.boundingBox();
    expect(
      bounds && bounds.x >= 0 && bounds.x + bounds.width <= width,
    ).toBeTruthy();
    await expect(sessions).toHaveAttribute("href", "/workspace/sessions");
    await expect(sessions.locator("svg")).toHaveCount(1);
    expect(
      await sessions.evaluate((node) =>
        node.nextElementSibling?.textContent?.trim(),
      ),
    ).toBe("Tools");
    await sessions.click();
    await expect(page).toHaveURL(/\/workspace\/sessions$/);
    if (width === 375)
      await page.getByLabel("Workspace navigation", { exact: true }).click();
    const currentNav =
      width === 375
        ? page.getByRole("navigation", { name: "Mobile Workspace navigation" })
        : sidebar;
    await expect(
      currentNav.getByRole("link", { name: "Sessions", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      currentNav.getByRole("link", { name: "Tools", exact: true }),
    ).not.toHaveAttribute("aria-current");
    await expect(page.locator(".breadcrumb")).toHaveText(
      /Workspace\s*Sessions/,
    );
    await expect(page.locator(".breadcrumb")).not.toContainText("Tools");
    await currentNav.getByRole("link", { name: "Tools", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\/tools$/);
    await expect(
      page
        .locator(".tool-card")
        .getByRole("heading", { name: "Sessions", exact: true }),
    ).toHaveCount(0);
    await expect(sessions).not.toHaveAttribute("aria-current");
    await expect(sessions).toBeVisible();
    await page.goto("/workspace/tools/notes");
    if (width === 375)
      await page.getByLabel("Workspace navigation", { exact: true }).click();
    await expect(
      currentNav.getByRole("link", { name: "Sessions", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".breadcrumb")).toContainText("Sessions");
  });
}

test("legacy Sessions URLs preserve invitation IDs, query values and transcript anchors", async ({
  page,
}) => {
  const id = "10000000-0000-4000-8000-000000000010";
  for (const prefix of ["/workspace/tools/sessions", "/tools/sessions"]) {
    for (const suffix of ["", `/meeting/${id}`]) {
      await page.goto(
        `${prefix}${suffix}?source=campus&view=notes&tag=first&tag=second&search=a%20b#segment-evidence`,
      );
      const url = new URL(page.url());
      expect(url.pathname).toBe(`/workspace/sessions${suffix}`);
      expect(url.searchParams.get("source")).toBe("campus");
      expect(url.searchParams.get("view")).toBe("notes");
      expect(url.searchParams.getAll("tag")).toEqual(["first", "second"]);
      expect(url.searchParams.get("search")).toBe("a b");
      expect(url.hash).toBe("#segment-evidence");
    }
  }
});
