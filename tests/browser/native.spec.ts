import { test, expect } from "@playwright/test";
test.use({ timezoneId: "Europe/Prague" });
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
    if (!(await page.getByLabel("Navigate to date").isVisible()))
      await page
        .getByRole("button", { name: "Calendars", exact: true })
        .click();
    await page.getByLabel("Navigate to date").fill("2026-11-02");
    for (const v of ["week", "day", "agenda", "month"]) {
      await page.getByLabel("Calendar view").selectOption(v);
      await expect(page.locator(".calendar-main")).toBeVisible();
      if (v === "week" && width === 1440) {
        await page.locator(".view-week").evaluate((el) => {
          el.scrollTop = 180;
        });
        await page.screenshot({
          path: "docs/native/images/calendar-week-desktop.png",
          fullPage: true,
        });
      }
      if (v === "agenda" && width === 390)
        await page.screenshot({
          path: "docs/native/images/calendar-agenda-mobile.png",
          fullPage: true,
        });
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
test("Calendar follows Sessions and Forms launches through Tools on desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/workspace");
  await page
    .getByRole("button", { name: "Try demo — no account needed" })
    .click();
  const sidebar = page.locator(".sidebar");
  const calendar = sidebar.getByRole("link", { name: "Calendar", exact: true });
  await expect(calendar).toHaveAttribute("href", "/workspace/calendar");
  expect(
    await calendar.evaluate((node) =>
      node.previousElementSibling?.textContent?.trim(),
    ),
  ).toBe("Sessions");
  expect(
    await calendar.evaluate((node) =>
      node.nextElementSibling?.textContent?.trim(),
    ),
  ).toBe("Tools");
  await expect(
    sidebar.getByRole("link", { name: "Forms", exact: true }),
  ).toHaveCount(0);
  await sidebar.getByRole("link", { name: "Tools", exact: true }).click();
  const forms = page
    .locator(".tool-card")
    .filter({ has: page.getByRole("heading", { name: "Forms", exact: true }) });
  await expect(forms).toHaveAttribute("href", "/workspace/forms");
  await expect(forms.locator("svg")).toHaveCount(2);
  await forms.click();
  await expect(
    page.getByRole("heading", { name: "Forms", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("link", { name: "Tools", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    sidebar.getByRole("link", { name: "Forms", exact: true }),
  ).toHaveCount(0);
  await calendar.click();
  await expect(calendar).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Workspace navigation", { exact: true }).click();
  const mobileNav = page.getByRole("navigation", {
    name: "Mobile Workspace navigation",
  });
  await expect(
    mobileNav.getByRole("link", { name: "Forms", exact: true }),
  ).toHaveCount(0);
  expect(
    await mobileNav
      .getByRole("link", { name: "Sessions", exact: true })
      .evaluate((node) => node.nextElementSibling?.textContent?.trim()),
  ).toBe("Calendar");
  await mobileNav.getByRole("link", { name: "Tools", exact: true }).click();
  await forms.click();
  await expect(
    page.getByRole("heading", { name: "Forms", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Workspace navigation", { exact: true }).click();
  await expect(
    mobileNav.getByRole("link", { name: "Tools", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("Spring gap creation reports an error and 23:00 appointments cross midnight correctly", async ({
  page,
}) => {
  await page.goto("/workspace/calendar");
  await page
    .getByRole("button", { name: "Try demo — no account needed" })
    .click();
  if (
    await page
      .getByRole("button", { name: "Calendars", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "Calendars", exact: true }).click();
  await page.getByLabel("New calendar name").fill("Timezone checks");
  await page.getByRole("button", { name: "Add calendar", exact: true }).click();
  await page.getByLabel("Navigate to date").fill("2026-03-29");
  await page.getByLabel("Calendar view").selectOption("day");
  await page
    .getByRole("button", {
      name: "Create event on 2026-03-29 at 2:00",
      exact: true,
    })
    .click();
  await expect(page.locator(".native-error")).toContainText("does not exist");
  await page
    .getByRole("button", {
      name: "Create event on 2026-03-29 at 23:00",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Event editor" })
      .getByLabel("End", { exact: true }),
  ).toHaveValue("2026-03-30T00:00");
  await page.getByRole("checkbox", { name: /All day/ }).check();
  await expect(
    page
      .getByRole("dialog", { name: "Event editor" })
      .getByLabel("Start", { exact: true }),
  ).toHaveValue("2026-03-29");
  await expect(
    page
      .getByRole("dialog", { name: "Event editor" })
      .getByLabel("End", { exact: true }),
  ).toHaveValue("2026-03-30");
});
