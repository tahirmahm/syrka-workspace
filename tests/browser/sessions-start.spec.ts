/** UI/API fixtures only: these assertions do not verify LiveKit media transport. */
import { test, expect, type Page } from "@playwright/test";
import type {
  Member,
  Segment,
  Job,
  SessionNote,
} from "../../src/lib/sessions/model";
import { AccessToken } from "livekit-server-sdk";
const host = "10000000-0000-4000-8000-000000000001",
  guest = "10000000-0000-4000-8000-000000000002",
  id = "10000000-0000-4000-8000-000000000010";
function session(actor: string, isGuest = false) {
  return {
    access_token: "fixture-token",
    refresh_token: "fixture-refresh",
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: actor, is_anonymous: isGuest },
  };
}
const caps = {
  video: true,
  ai: false,
  stt: true,
  recording: false,
  missing: [],
  speechFormat: "pcm",
  speechLanguages: ["en"],
};
const room = {
  id,
  owner_id: host,
  title: "Instant meeting",
  description: "",
  starts_at: new Date().toISOString(),
  timezone: "Europe/Prague",
  kind: "meeting",
  institution_id: null,
  offering_id: null,
  project: "",
  status: "scheduled",
  locked: false,
  allow_guests: true,
  transcribing: false,
  transcript_published: false,
  retention_days: 30,
  created_at: new Date().toISOString(),
};
async function fixture(page: Page, actor = host, isGuest = false) {
  const token = new AccessToken(
    "layout-only-key",
    "layout-only-signing-secret",
    { identity: `workspace:${actor}`, ttl: 300 },
  );
  token.addGrant({
    roomJoin: true,
    room: "layout-only",
    canPublish: true,
    canSubscribe: true,
  });
  const jwt = await token.toJwt();
  await page.routeWebSocket("wss://layout.invalid/**", () => {});
  const calls = {
    consent: false,
    transcribing: false,
    segments: [] as Segment[],
    jobs: [] as Job[],
    note: null as SessionNote | null,
    aiReady: false,
    create: 0,
    token: 0,
    request: 0,
    approved: !isGuest,
    removed: false,
    people: [] as Member[],
    actions: [] as Record<string, unknown>[],
  };
  await page.route("**/rest/v1/rpc/session_invitation", (r) =>
    r.fulfill({ json: { title: "Instant meeting", host_name: "Host" } }),
  );
  await page.route("**/workspace/api/sessions**", async (route) => {
    const input = route.request().postDataJSON();
    if (input) calls.actions.push(input);
    if (input?.action === "consent") {
      calls.consent = input.consent;
      return route.fulfill({ json: { ok: true } });
    }
    if (input?.action === "host_update") {
      if (input.patch.transcribing !== undefined)
        calls.transcribing = input.patch.transcribing;
      return route.fulfill({ json: { ok: true } });
    }
    if (input?.action === "member_update") {
      const member = calls.people.find(
        (member) => member.user_id === input.user_id,
      );
      if (member) Object.assign(member, input.patch);
      return route.fulfill({ json: { ok: true } });
    }
    if (input?.action === "create") {
      calls.create++;
      return route.fulfill({ json: { rooms: [room] } });
    }
    if (input?.action === "token") {
      calls.token++;
      return route.fulfill({
        json: { token: jwt, url: "wss://layout.invalid" },
      });
    }
    if (input?.action === "request_join") {
      calls.request++;
      return route.fulfill({ json: { ok: true } });
    }
    if (input) return route.fulfill({ json: { ok: true } });
    if (!new URL(route.request().url()).searchParams.has("id"))
      return route.fulfill({
        json: { rooms: [], capabilities: caps, user_id: actor },
      });
    if (isGuest && !calls.request)
      return route.fulfill({
        status: 401,
        json: { error: "Sign in to Workspace" },
      });
    if (calls.removed)
      return route.fulfill({ json: { admission: "removed", user_id: actor } });
    if (!calls.approved)
      return route.fulfill({ json: { admission: "waiting", user_id: actor } });
    const me = {
      room_id: id,
      user_id: actor,
      display_name: isGuest ? "Guest B" : "Host",
      is_guest: isGuest,
      guest_identity: isGuest,
      status: "approved",
      consent: calls.consent,
      can_publish: true,
    };
    return route.fulfill({
      json: {
        room: { ...room, transcribing: calls.transcribing },
        me,
        members: [me, ...calls.people],
        segments: calls.segments,
        note: calls.note,
        jobs: calls.jobs,
        cards: [],
        user_id: actor,
        capabilities: { ...caps, ai: calls.aiReady },
      },
    });
  });
  return calls;
}
test("Start call creates one cloud meeting and requests a real connection even after explicit demo selection", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.addInitScript((value) => {
    localStorage.setItem(
      "sb-zguejzlseldovdssiumn-auth-token",
      JSON.stringify(value),
    );
    sessionStorage.setItem("syrka-workspace-demo", "true");
  }, session(host));
  await page.goto("/workspace/sessions");
  await page.getByRole("button", { name: "Start call", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/workspace/sessions/meeting/${id}\\?start=1$`),
  );
  await expect(page.locator(".session-call-frame")).toBeVisible();
  expect(calls.create).toBe(1);
  expect(calls.token).toBe(1);
  expect(
    await page.evaluate(() => sessionStorage.getItem("syrka-workspace-demo")),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Leave meeting", exact: true })
    .click();
  await expect(page.locator(".session-call-frame")).toHaveCount(0);
});
test("demo Start call never creates a fictional or anonymous-host call", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto("/workspace/sessions");
  await page.evaluate(() =>
    sessionStorage.setItem("syrka-workspace-demo", "true"),
  );
  await page.reload();
  await page.getByRole("button", { name: "Start call", exact: true }).click();
  await expect(page.locator(".error[role=alert]")).toContainText(
    "Sign in to Workspace to start a real call",
  );
  expect(calls.create).toBe(0);
  expect(calls.token).toBe(0);
});
test("account-free guest requests admission, waits, then joins with a meeting-only consent panel", async ({
  page,
}) => {
  const calls = await fixture(page, guest, true);
  let signups = 0;
  await page.route("**/auth/v1/signup", (route) => {
    signups++;
    return route.fulfill({
      json: { ...session(guest, true), expires_in: 3600 },
    });
  });
  await page.goto(`/workspace/sessions/meeting/${id}`);
  await expect(
    page.getByText("Hosted by Host.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Display name", { exact: true }).fill("Guest B");
  await page.getByRole("button", { name: "Ask to join", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Admission requested", exact: true }),
  ).toBeDisabled();
  expect(signups).toBe(0);
  expect(calls.request).toBe(1);
  expect(calls.token).toBe(0);
  calls.approved = true;
  // Admission automatically opens the real connection flow; no account signup.
  await expect(page.locator(".session-call-frame")).toBeVisible({
    timeout: 12000,
  });
  await expect(page.locator(".session-call-frame")).toBeVisible();
  expect(calls.token).toBe(1);
  await page.getByLabel("More call options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Toggle transcription consent", exact: true })
    .click();
  await expect(
    page.getByText("Guest access is limited to this meeting.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText("Host controls", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Leave meeting", exact: true })
    .click();
});

test("local device preview selects devices and stops every track before joining (not a transport test)", async ({
  page,
}) => {
  await fixture(page);
  await page.addInitScript(() => {
    const qa = window as typeof window & {
      previewTracks?: MediaStreamTrack[];
      previewContext?: AudioContext;
    };
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 64;
          canvas.height = 64;
          canvas.getContext("2d")!.fillRect(0, 0, 64, 64);
          const camera = canvas.captureStream(10);
          const context = new AudioContext();
          qa.previewContext = context;
          const audio = context.createMediaStreamDestination().stream;
          const stream = new MediaStream([
            ...camera.getTracks(),
            ...audio.getTracks(),
          ]);
          qa.previewTracks = stream.getTracks();
          return stream;
        },
        enumerateDevices: async () => [
          {
            kind: "audioinput",
            deviceId: "qa-microphone",
            label: "QA microphone",
          },
          { kind: "videoinput", deviceId: "qa-camera", label: "QA camera" },
        ],
      },
    });
  });
  await page.goto(`/workspace/sessions/meeting/${id}`);
  await page
    .getByRole("button", { name: "Preview camera and microphone", exact: true })
    .click();
  await expect(
    page.getByLabel("Your local camera preview", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Pre-call microphone", { exact: true })
    .selectOption("qa-microphone");
  await expect(
    page.getByLabel("Your local camera preview", { exact: true }),
  ).toBeHidden();
  expect(
    await page.evaluate(() =>
      (
        window as typeof window & { previewTracks: MediaStreamTrack[] }
      ).previewTracks.every((t) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await page.evaluate(() =>
    (
      window as typeof window & { previewContext: AudioContext }
    ).previewContext.close(),
  );
});

test("a disabled guest invitation does not create an anonymous identity", async ({
  page,
}) => {
  const calls = await fixture(page, guest, true);
  let signups = 0;
  await page.route("**/rest/v1/rpc/session_invitation", (route) =>
    route.fulfill({ json: null }),
  );
  await page.route("**/auth/v1/signup", (route) => {
    signups++;
    return route.fulfill({
      status: 400,
      json: { error: "Should not be called" },
    });
  });
  await page.goto(`/workspace/sessions/meeting/${id}`);
  await page.getByLabel("Display name", { exact: true }).fill("Guest B");
  await page.getByRole("button", { name: "Ask to join", exact: true }).click();
  await expect(page.locator(".error[role=alert]")).toContainText(
    "Guest access is unavailable for this invitation",
  );
  expect(signups).toBe(0);
  expect(calls.request).toBe(0);
  expect(calls.token).toBe(0);
});

test("a declined lobby request is visible and cannot mint a media token", async ({
  page,
}) => {
  const calls = await fixture(page, guest, true);
  await page.route("**/auth/v1/signup", (route) =>
    route.fulfill({ json: { ...session(guest, true), expires_in: 3600 } }),
  );
  await page.goto(`/workspace/sessions/meeting/${id}`);
  await expect(
    page.getByText("Hosted by Host.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Display name", { exact: true }).fill("Guest B");
  await page.getByRole("button", { name: "Ask to join", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Admission requested", exact: true }),
  ).toBeDisabled();
  calls.removed = true;
  await expect(
    page.getByRole("button", { name: "Admission declined", exact: true }),
  ).toBeDisabled({ timeout: 12000 });
  expect(calls.token).toBe(0);
  await expect(page.locator(".error[role=alert]")).toContainText(
    "The host declined or removed your admission",
  );
});

test("mobile guest meeting has full-width content and readable touch-sized error dismissal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await fixture(page, guest, true);
  await page.route("**/workspace/api/sessions/guest", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 429,
        json: {
          error:
            "The waiting room is full. Please ask the host to make space, then try again.",
        },
      });
    return route.fulfill({ status: 401, json: { error: "Ask to join" } });
  });
  await page.goto(`/workspace/sessions/meeting/${id}`);
  await page.getByLabel("Display name", { exact: true }).fill("Mobile guest");
  await page.getByRole("button", { name: "Ask to join", exact: true }).click();
  const error = page.locator(".error[role=alert]");
  await expect(error).toContainText("waiting room is full");
  await expect(page.locator(".sidebar")).toBeHidden();
  const form = await page.locator(".session-form").boundingBox();
  expect(form!.width).toBeGreaterThan(330);
  const dismiss = error.getByRole("button", { name: "Dismiss", exact: true });
  expect((await dismiss.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await dismiss.click();
  await expect(error).toHaveCount(0);
  await page.getByLabel("Workspace navigation", { exact: true }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Mobile Workspace navigation" })
      .getByRole("link", { name: "Sessions", exact: true }),
  ).toBeVisible();
});

test("one persistent call DOM survives Home, document editing, Back and return without a second token (UI fixture, not RTP)", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.route("**/rest/v1/office_files**", async (route) =>
    route.fulfill({ json: [] }),
  );
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-zguejzlseldovdssiumn-auth-token",
        JSON.stringify(value),
      ),
    session(host),
  );
  await page.goto("/workspace/");
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Start call", exact: true }).click();
  await expect(page.locator('[data-persistent-call="full"]')).toBeVisible();
  await expect(page.locator(".session-call-frame")).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __callNode: Element | null }).__callNode =
      document.querySelector(".session-call-frame");
  });
  await page.goBack();
  await expect(page.locator('[data-persistent-call="mini"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Return to call", exact: true })
    .click();
  await expect(page.locator('[data-persistent-call="full"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Minimize call", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspace\/?$/);
  await expect(page.locator('[data-persistent-call="mini"]')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.querySelector(".session-call-frame") ===
        (window as unknown as { __callNode: Element }).__callNode,
    ),
  ).toBe(true);
  expect(calls.token).toBe(1);
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  await expect(page.locator(".tiptap")).toBeVisible();
  await expect(page.locator('[data-persistent-call="mini"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Return to call", exact: true })
    .click();
  expect(calls.token).toBe(1);
  await page
    .getByRole("button", { name: "Leave meeting", exact: true })
    .click();
  await expect(page.locator(".session-call-frame")).toHaveCount(0);
});

test("unsupported PiP falls back to the same floating call; keyboard repositioning and explicit leave work", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.addInitScript((value) => {
    localStorage.setItem(
      "sb-zguejzlseldovdssiumn-auth-token",
      JSON.stringify(value),
    );
    Object.defineProperty(document, "pictureInPictureEnabled", {
      get: () => false,
    });
  }, session(host));
  await page.goto(`/workspace/sessions/meeting/${id}?start=1`);
  await expect(page.locator('[data-persistent-call="full"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Picture-in-Picture", exact: true })
    .click();
  await expect(page.locator('[data-persistent-call="mini"]')).toBeVisible();
  const handle = page.getByRole("button", {
    name: "Move call window",
    exact: true,
  });
  const before = await handle.boundingBox();
  await handle.focus();
  await handle.press("ArrowLeft");
  expect((await handle.boundingBox())!.x).toBeLessThan(before!.x);
  expect(calls.token).toBe(1);
  await page
    .getByRole("button", { name: "Leave meeting", exact: true })
    .click();
  await expect(page.locator("[data-persistent-call]")).toHaveCount(0);
});

test("server removal still terminates a minimized call while Workspace is open", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-zguejzlseldovdssiumn-auth-token",
        JSON.stringify(value),
      ),
    session(host),
  );
  await page.goto(`/workspace/sessions/meeting/${id}?start=1`);
  await expect(page.locator(".session-call-frame")).toBeVisible();
  await page
    .getByRole("button", { name: "Minimize call", exact: true })
    .click();
  await expect(page.locator('[data-persistent-call="mini"]')).toBeVisible();
  calls.removed = true;
  await expect(page.locator("[data-persistent-call]")).toHaveCount(0, {
    timeout: 12000,
  });
  expect(calls.token).toBe(1);
});

test("explicit browser fullscreen exits on minimize without replacing the call (Chromium UI fixture)", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-zguejzlseldovdssiumn-auth-token",
        JSON.stringify(value),
      ),
    session(host),
  );
  await page.goto(`/workspace/sessions/meeting/${id}?start=1`);
  await expect(page.locator(".session-call-frame")).toBeVisible();
  await page.getByLabel("More call options", { exact: true }).click();
  await page.getByRole("button", { name: "Full Screen", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.fullscreenElement?.classList.contains("persistent-call") ??
          false,
      ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Minimize call", exact: true })
    .click();
  await expect(page.locator('[data-persistent-call="mini"]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  expect(calls.token).toBe(1);
  await page
    .getByRole("button", { name: "Leave meeting", exact: true })
    .click();
});

test("optional fullscreen exit without a Promise does not crash a minimized call", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.addInitScript((value) => {
    localStorage.setItem(
      "sb-zguejzlseldovdssiumn-auth-token",
      JSON.stringify(value),
    );
    const state = window as unknown as { __testFullscreen: Element | null };
    state.__testFullscreen = null;
    Object.defineProperty(document, "fullscreenElement", {
      get: () => state.__testFullscreen,
      configurable: true,
    });
    Object.defineProperty(document, "exitFullscreen", {
      value: () => {
        state.__testFullscreen = null;
      },
      configurable: true,
    });
  }, session(host));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/workspace/sessions/meeting/${id}?start=1`);
  await expect(page.locator(".session-call-frame")).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as { __testFullscreen: Element | null }
    ).__testFullscreen = document.querySelector(".persistent-call");
  });
  await page
    .getByRole("button", { name: "Minimize call", exact: true })
    .click();
  await expect(page.locator('[data-persistent-call="mini"]')).toBeVisible();
  await expect(page.locator("html#__next_error__")).toHaveCount(0);
  expect(calls.token).toBe(1);
  expect(errors).toEqual([]);
  await page
    .getByRole("button", { name: "Leave meeting", exact: true })
    .click();
});

test("mobile has four black-stage controls and all secondary actions in More", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const calls = await fixture(page);
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-zguejzlseldovdssiumn-auth-token",
        JSON.stringify(value),
      ),
    session(host),
  );
  await page.goto(`/workspace/sessions/meeting/${id}?start=1`);
  const frame = page.locator(".session-call-frame");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCSS("background-color", "rgb(0, 0, 0)");
  const toolbar = page.getByRole("toolbar", { name: "Meeting controls" });
  await expect(
    toolbar.locator(
      ":scope > button:visible, :scope > details > summary:visible",
    ),
  ).toHaveCount(4);
  expect(
    await toolbar
      .locator(
        ":scope > button:visible > span:first-of-type, :scope > details > summary:visible > span",
      )
      .allTextContents(),
  ).toEqual(["Mic", "Camera", "People", "More"]);
  await expect(
    page.getByRole("button", { name: "Enable Audio", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("More call options", { exact: true }).click();
  for (const name of [
    "Leave meeting",
    "Picture-in-Picture",
    "Open meeting chat",
    "Toggle transcript and notes",
    "Audio and camera settings",
    "Full Screen",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Leave meeting", exact: true }),
  ).toHaveCSS("background-color", "rgb(181, 45, 60)");
  await page
    .getByRole("button", { name: "Audio and camera settings", exact: true })
    .click();
  const settings = page.getByRole("complementary", {
    name: "Audio and camera settings",
  });
  await expect(settings).toBeVisible();
  expect((await settings.boundingBox())!.height).toBeLessThan(812 * 0.65);
  await page.getByRole("button", { name: "Close device settings" }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    toolbar.locator(
      ":scope > button:visible, :scope > details > summary:visible",
    ),
  ).toHaveCount(4);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(844);
  await page.getByLabel("More call options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Leave meeting", exact: true })
    .click();
  await expect(frame).toHaveCount(0);
  expect(calls.token).toBe(1);
});

test("People receives waiting requests, admits or denies, and manages approved guests without Host Controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await fixture(page);
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-zguejzlseldovdssiumn-auth-token",
        JSON.stringify(value),
      ),
    session(host),
  );
  await page.goto(`/workspace/sessions/meeting/${id}?start=1`);
  await expect(page.locator(".session-call-frame")).toBeVisible();
  calls.people.push({
    room_id: id,
    user_id: guest,
    display_name: "Waiting guest",
    status: "waiting",
    consent: false,
    can_publish: true,
    is_guest: true,
    guest_identity: true,
  });
  await expect(
    page.getByLabel("1 waiting guests", { exact: true }),
  ).toBeVisible({ timeout: 6000 });
  await page
    .getByRole("button", { name: "Show participants", exact: true })
    .click();
  const people = page.getByRole("complementary", { name: "People" });
  await expect(people).toBeVisible();
  expect((await people.boundingBox())!.height).toBeLessThan(844 * 0.65);
  const waiting = people.locator(".call-waiting-room");
  await expect(waiting).toContainText("Waiting guest");
  await waiting.getByRole("button", { name: "Admit", exact: true }).click();
  await expect(waiting).not.toContainText("Waiting guest");
  await expect(
    page.getByLabel("1 waiting guests", { exact: true }),
  ).toHaveCount(0);
  const admitted = people
    .locator(".call-admitted-person")
    .filter({ hasText: "Waiting guest" });
  await expect(admitted).toBeVisible();
  await expect(admitted).toContainText("Admitted");
  await admitted
    .getByRole("button", { name: "Mute microphone", exact: true })
    .click();
  expect(
    calls.actions.some(
      (action) =>
        action.action === "mute_member" &&
        action.user_id === guest &&
        action.guest_identity === true,
    ),
  ).toBe(true);
  await admitted.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(admitted).toHaveCount(0);
  calls.people.push({
    room_id: id,
    user_id: "10000000-0000-4000-8000-000000000003",
    display_name: "Denied guest",
    status: "waiting",
    consent: false,
    can_publish: true,
    is_guest: true,
    guest_identity: true,
  });
  await expect(waiting).toContainText("Denied guest", { timeout: 6000 });
  await waiting.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(waiting).not.toContainText("Denied guest");
  await page.getByRole("button", { name: "Close participants" }).click();
  await expect(people).toHaveCount(0);
  expect(calls.token).toBe(1);
  await page.getByLabel("More call options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Leave meeting", exact: true })
    .click();
});

test("copy invitation uses one compact one-second toast and clipboard errors remain readable", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const calls = await fixture(page);
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-zguejzlseldovdssiumn-auth-token",
        JSON.stringify(value),
      ),
    session(host),
  );
  await page.goto(`/workspace/sessions/meeting/${id}?start=1`);
  await expect(page.locator(".session-call-frame")).toBeVisible();
  await expect(page.getByPlaceholder("Message everyone…")).toBeVisible();
  await page.clock.install();
  const copy = async () => {
    await page.getByLabel("More call options", { exact: true }).click();
    await page
      .getByRole("button", { name: "Copy meeting invitation", exact: true })
      .click();
  };
  await copy();
  const toast = page.locator(".call-copy-toast");
  await expect(toast).toHaveText("Link copied");
  const bounds = (await toast.boundingBox())!;
  expect(bounds.height).toBeLessThan(40);
  expect(bounds.width).toBeLessThan(140);
  expect(bounds.y).toBeLessThan(80);
  await expect(page.locator(".call-copy-toast-host")).toHaveCSS(
    "pointer-events",
    "none",
  );
  await page.clock.fastForward(999);
  await expect(toast).toHaveCount(1);
  await page.clock.fastForward(1);
  await expect(toast).toHaveCount(0);
  await expect(page.locator(".call-copy-toast-host [role=status]")).toHaveText(
    "Link copied",
  );
  await copy();
  await page.clock.fastForward(600);
  await copy();
  await expect(toast).toHaveCount(1);
  await page.clock.fastForward(600);
  await expect(toast).toHaveCount(1);
  await page.clock.fastForward(400);
  await expect(toast).toHaveCount(0);
  await page.getByLabel("More call options", { exact: true }).click();
  await page.getByRole("button", { name: "Full Screen", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await copy();
  await expect(page.locator(":fullscreen .call-copy-toast")).toHaveText(
    "Link copied",
  );
  await page.clock.fastForward(1000);
  await expect(toast).toHaveCount(0);
  await page.evaluate(() => document.exitFullscreen());
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error("Clipboard blocked");
        },
      },
    }),
  );
  await copy();
  const error = page
    .getByRole("alert")
    .filter({ hasText: "Clipboard is unavailable" });
  await expect(error).toBeVisible();
  await page.clock.fastForward(3000);
  await expect(error).toBeVisible();
  expect(calls.token).toBe(1);
});

test("Live Transcript exposes explicit consent, enable controls, automatic segments and independent speech errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await fixture(page);
  calls.aiReady = true;
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-zguejzlseldovdssiumn-auth-token",
        JSON.stringify(value),
      ),
    session(host),
  );
  await page.goto(`/workspace/sessions/meeting/${id}?start=1`);
  await expect(page.locator(".session-call-frame")).toBeVisible();
  await page.getByLabel("More call options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Toggle transcript and notes", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Live transcription",
    exact: true,
  });
  await expect(
    panel.getByRole("heading", { name: "Live Transcript", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("status").first()).toHaveText("Off");
  await expect(
    panel.getByRole("button", { name: "Enable transcription", exact: true }),
  ).toBeDisabled();
  await panel.getByRole("checkbox").click();
  await expect(panel.getByRole("checkbox")).toBeChecked();
  await expect(
    panel.getByRole("button", { name: "Enable transcription", exact: true }),
  ).toBeEnabled();
  await panel
    .getByRole("button", { name: "Enable transcription", exact: true })
    .click();
  expect(
    calls.actions.some((a) => a.action === "consent" && a.consent === true),
  ).toBe(true);
  expect(calls.transcribing).toBe(true);
  calls.jobs = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      room_id: id,
      kind: "stt",
      state: "running",
      error: null,
      output: null,
      created_at: new Date().toISOString(),
    },
  ];
  await expect(panel.getByRole("status").first()).toHaveText("Processing", {
    timeout: 6000,
  });
  calls.jobs[0].state = "done";
  calls.segments = [
    {
      id: "20000000-0000-4000-8000-000000000002",
      room_id: id,
      speaker_id: host,
      speaker_name: "Host",
      start_ms: 0,
      end_ms: 4000,
      language: "en",
      original_text: "Fictional live speech appears without refreshing.",
      edited_text: null,
      important: false,
      created_at: new Date().toISOString(),
    },
  ];
  await expect(
    panel.getByRole("log", { name: "Live transcript segments" }),
  ).toContainText("Fictional live speech appears without refreshing.", {
    timeout: 6000,
  });
  await expect(panel.getByRole("log")).toContainText("00:00–00:04");
  await expect(
    panel.getByRole("button", {
      name: "Generate notes from transcript",
      exact: true,
    }),
  ).toBeEnabled();
  await panel
    .getByRole("button", {
      name: "Generate notes from transcript",
      exact: true,
    })
    .click();
  expect(
    calls.actions.some((a) => a.action === "process" && a.kind === "notes"),
  ).toBe(true);
  calls.note = {
    room_id: id,
    ai_generated: true,
    published: false,
    updated_at: new Date().toISOString(),
    body: {
      overview: [
        {
          text: "Fictional saved overview.",
          segment_ids: [calls.segments[0].id],
        },
      ],
      topics: [],
      decisions: [],
      actions: [],
      concepts: [],
      questions: [],
    },
  };
  await expect(panel).toContainText("Structured notes are saved.", {
    timeout: 6000,
  });
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  calls.jobs[0].state = "failed";
  calls.jobs[0].error =
    "Qwen speech service unavailable. Transcript preserved.";
  await expect(panel.getByRole("status").first()).toHaveText("Error", {
    timeout: 6000,
  });
  await expect(panel).toContainText("Qwen speech service unavailable");
  await expect(page.locator(".session-call-frame")).toBeVisible();
  expect(calls.token).toBe(1);
  await panel.locator(".speech-consent-details > summary").click();
  await panel.getByRole("checkbox").click();
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  await expect(panel.getByRole("status").first()).toHaveText("Off");
  await page.locator(".session-side-panel > summary").click();
  await expect(page.locator(".session-side-panel")).not.toHaveAttribute(
    "open",
    "",
  );
});
