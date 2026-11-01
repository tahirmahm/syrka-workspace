import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) {
  test(`Calendar persists recurring events and exceptions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/workspace/calendar");
    await page
      .getByRole("button", { name: "Try demo — no account needed" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Calendar", exact: true }),
    ).toBeVisible();
    if (width === 390)
      await page
        .getByRole("button", { name: "Calendars", exact: true })
        .click();
    await page.getByLabel("New calendar name").fill("University");
    await page
      .getByRole("button", { name: "Add calendar", exact: true })
      .click();
    await page.getByRole("button", { name: "New event", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Event editor" });
    await dialog.getByLabel("Title", { exact: true }).fill("Economics seminar");
    await dialog.getByLabel("Start", { exact: true }).fill("2026-11-02T09:00");
    await dialog.getByLabel("End", { exact: true }).fill("2026-11-02T10:00");
    await dialog.getByLabel("Timezone", { exact: true }).fill("Europe/Prague");
    await dialog
      .getByRole("combobox", { name: "Repeat", exact: true })
      .selectOption("weekly");
    await dialog.getByLabel("Stop after occurrences (optional)").fill("4");
    await dialog.getByRole("button", { name: "Save event" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByLabel("Navigate to date").fill("2026-11-02");
    await expect(
      page.getByRole("button", { name: /Economics seminar/ }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: /Economics seminar/ }).first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Economics seminar/ })
      .first()
      .click();
    await dialog.getByLabel("Title", { exact: true }).fill("Special seminar");
    await dialog.getByRole("button", { name: "Save event" }).click();
    await expect(
      page.getByRole("button", { name: /Special seminar/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Economics seminar/ }).first(),
    ).toBeVisible();
    for (const v of ["week", "day", "agenda", "month"]) {
      await page.getByLabel("Calendar view").selectOption(v);
      await expect(page.locator(".calendar-main")).toBeVisible();
    }
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-native-theme",
      "dark",
    );
    await page.screenshot({
      path: `docs/native/images/calendar-${width}-dark.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await page.screenshot({
      path: `docs/native/images/calendar-${width}-light.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  test(`Forms builder, branching and recovery at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/workspace/forms");
    await page
      .getByRole("button", { name: "Try demo — no account needed" })
      .click();
    await page.getByRole("button", { name: /Event registration/ }).click();
    await expect(
      page.getByRole("heading", { name: "Event registration", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page
      .getByLabel("Form title", { exact: true })
      .fill("University registration");
    await page
      .getByRole("button", { name: "Add question", exact: true })
      .click();
    const card = page.locator(".native-question-card").last();
    await card.getByLabel("Question", { exact: true }).fill("Study programme");
    await card
      .getByRole("combobox", { name: "Type", exact: true })
      .selectOption("single");
    await card.getByLabel("Options (one per line)").fill("Economics\nHistory");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "Economics", exact: true }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "Economics", exact: true }).check();
    await page.getByRole("button", { name: "Close preview" }).click();
    await page.reload();
    await expect(page.getByLabel("Form title", { exact: true })).toHaveValue(
      "University registration",
    );
    await expect(page.locator(".native-question-card")).toHaveCount(4);
    await page.screenshot({
      path: `docs/native/images/forms-${width}-light.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page.screenshot({
      path: `docs/native/images/forms-${width}-dark.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Publish", exact: true }),
    ).toBeDisabled();
  });
}
test("Native apps are accessible through Workspace navigation without changing Sessions ordering", async ({
  page,
}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Try demo — no account needed" })
    .click();
  await expect(
    page
      .locator(".sidebar")
      .getByRole("link", { name: "Calendar", exact: true }),
  ).toHaveAttribute("href", "/workspace/calendar");
  await expect(
    page.locator(".sidebar").getByRole("link", { name: "Forms", exact: true }),
  ).toHaveAttribute("href", "/workspace/forms");
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Calendar", exact: true })
    .click();
  await expect(
    page
      .locator(".sidebar")
      .getByRole("link", { name: "Calendar", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Workspace navigation", { exact: true }).click();
  await page
    .getByRole("navigation", { name: "Mobile Workspace navigation" })
    .getByRole("link", { name: "Forms", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Forms", exact: true }),
  ).toBeVisible();
});
