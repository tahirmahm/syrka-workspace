/** Layout/interaction fixtures only. Real LiveKit transport is verified separately by the Preview operator harness. */
import { test, expect } from "@playwright/test";
import { AccessToken } from "livekit-server-sdk";
const id = "10000000-0000-4000-8000-000000000010";
const actor = "10000000-0000-4000-8000-000000000001";
async function fixture(page: import("@playwright/test").Page) {
  const token = new AccessToken(
    "layout-only-key",
    "layout-only-signing-secret",
    { identity: actor, ttl: 300 },
  );
  token.addGrant({
    roomJoin: true,
    room: "layout-only",
    canPublish: true,
    canSubscribe: true,
  });
  const jwt = await token.toJwt();
  const me = {
    room_id: id,
    user_id: actor,
    display_name: "Layout host",
    status: "approved",
    consent: false,
    can_publish: true,
  };
  const room = {
    id,
    owner_id: actor,
    title: "Layout verification fixture",
    description: "UI fixtures do not establish calling acceptance.",
    starts_at: new Date().toISOString(),
    timezone: "UTC",
    kind: "meeting",
    institution_id: null,
    offering_id: null,
    project: "",
    status: "scheduled",
    locked: false,
    transcribing: false,
    transcript_published: false,
    created_at: new Date().toISOString(),
    retention_days: 30,
  };
  await page.routeWebSocket("wss://layout.invalid/**", () => {});
  await page.route("**/workspace/api/sessions**", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === "token")
      return route.fulfill({
        json: { token: jwt, url: "wss://layout.invalid" },
      });
    if (body?.action === "host_update") {
      Object.assign(room, body.patch);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        room,
        me,
        members: [me],
        segments: [],
        jobs: [],
        cards: [],
        note: null,
        user_id: actor,
        capabilities: {
          video: true,
          ai: false,
          stt: false,
          recording: false,
          missing: [],
        },
      },
    });
  });
  await page.goto(`/workspace/sessions/meeting/${id}`);
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
]) {
  test(`calling layout stays bounded and can be cancelled without AI at ${viewport.width}px (not a media test)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await fixture(page);
    await page.getByRole("button", { name: "Start call" }).click();
    const frame = page.locator(".session-call-frame");
    await expect(frame).toBeVisible();
    await page.screenshot({
      path: `/tmp/syrka-call-layout-${viewport.width}.png`,
    });
    const box = (await frame.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(725);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    await expect(
      page.getByRole("toolbar", { name: "Meeting controls" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Unmute microphone", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Show participants" }).click();
    await expect(
      page.getByRole("complementary", { name: "Connected participants" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open meeting chat" }).click();
    await expect(
      page.getByRole("complementary", { name: "Meeting chat" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send message", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Toggle transcript and notes" })
      .click();
    await expect(page.locator(".session-side-panel")).toHaveAttribute(
      "open",
      "",
    );
    await expect(
      page.getByText("Host controls", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Leave meeting", exact: true })
      .click();
    await expect(frame).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "You left the meeting" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
}
test("an invitation can open sign-in without losing its URL or offering a fake demo call", async ({
  page,
}) => {
  await page.route("**/workspace/api/sessions**", (route) =>
    route.fulfill({ status: 401, json: { error: "Sign in to Workspace" } }),
  );
  const path = `/workspace/sessions/meeting/${id}`;
  await page.goto(path);
  await page
    .getByRole("button", { name: "Sign in without leaving this invitation" })
    .click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Try demo/ })).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe(path);
});
test("pending admission survives reload without displaying private meeting details", async ({
  page,
}) => {
  await page.route("**/workspace/api/sessions**", (route) =>
    route.fulfill({ json: { admission: "waiting", user_id: actor } }),
  );
  await page.goto(`/workspace/sessions/meeting/${id}`);
  await expect(
    page.getByRole("button", { name: "Admission requested", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Waiting for the host" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Admission requested", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".session-heading")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Join meeting", exact: true }),
  ).toHaveCount(0);
});
test("loss of application authorization cancels the call and clears private meeting content", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: "Start call" }).click();
  await expect(page.locator(".session-call-frame")).toBeVisible();
  await page.unroute("**/workspace/api/sessions**");
  await page.route("**/workspace/api/sessions**", (route) =>
    route.fulfill({
      status: 401,
      json: { error: "Your Workspace session expired. Sign in again." },
    }),
  );
  await expect(page.locator(".session-call-frame")).toHaveCount(0, {
    timeout: 10000,
  });
  await expect(
    page.getByRole("heading", {
      name: "Layout verification fixture",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Sign in without leaving this invitation",
    }),
  ).toBeVisible();
});
