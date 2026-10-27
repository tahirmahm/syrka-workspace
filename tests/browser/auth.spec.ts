import { test, expect } from "@playwright/test";
test("registration validates fields, submits to Workspace Auth and displays SMTP failures", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "New to Syrka? Create an account",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".auth-error")).toContainText("valid email");
  await page.getByLabel("Email", { exact: true }).fill("student@example.net");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".auth-error")).toContainText("8 characters");
  let submitted = false;
  await page.route("**/auth/v1/signup**", (route) => {
    const request = route.request();
    expect(new URL(request.url()).hostname).toBe(
      "zguejzlseldovdssiumn.supabase.co",
    );
    expect(new URL(request.url()).searchParams.get("redirect_to")).toBe(
      "http://127.0.0.1:3000/auth/callback",
    );
    expect(request.postDataJSON().email).toBe("student@example.net");
    submitted = true;
    return route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        msg: "Email address not authorized",
        code: "email_address_not_authorized",
      }),
    });
  });
  await page
    .getByLabel("Password", { exact: true })
    .fill("LongTestPassword!123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".auth-error")).toContainText(
    "only allows verification messages",
  );
  expect(submitted).toBe(true);
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Make room for good work." }),
  ).toHaveCount(0);
});
test("expired verification errors are visible rather than silently entering demo", async ({
  page,
}) => {
  await page.goto(
    "/auth/callback#error=access_denied&error_description=This%20confirmation%20link%20has%20expired",
  );
  await expect(
    page.getByRole("heading", { name: "Link could not be verified." }),
  ).toBeVisible();
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText(
    "expired",
  );
  await expect(
    page.getByRole("heading", { name: "Make room for good work." }),
  ).toHaveCount(0);
});
