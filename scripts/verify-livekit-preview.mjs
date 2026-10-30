/** Real application/LiveKit acceptance. Credentials remain in ignored operator fixtures. */
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium, request } from "@playwright/test";
const target = process.env.SYRKA_PREVIEW_URL,
  sha = process.env.SYRKA_EXPECTED_SHA;
if (!target || !sha || !new URL(target).hostname.endsWith(".vercel.app"))
  throw Error("Specify the exact Git-linked Preview URL and SHA.");
process.loadEnvFile(
  process.env.SYRKA_PREVIEW_ENV_FILE || "/tmp/syrka-workspace-browser.local",
);
const actors = JSON.parse(
  await readFile(
    process.env.SYRKA_QA_FIXTURE || "/tmp/syrka-sessions-qa-actors.json",
    "utf8",
  ),
);
assert(
  actors.length === 2 &&
    actors[0].id !== actors[1].id &&
    actors.every(
      (a) => a.email.includes("+syrka-sessions-") && a.session?.access_token,
    ),
);
let guestIdentityClient;
if (process.env.SYRKA_QA_GUEST === "true") {
  await import("./verify-guest-call-preview.mjs");
  process.exit(process.exitCode || 0);
}
const proxy = process.env.HTTPS_PROXY
  ? { server: process.env.HTTPS_PROXY }
  : undefined;
const clients = await Promise.all(
  actors.map((a) =>
    request.newContext({
      baseURL: target,
      proxy,
      timeout: 45000,
      extraHTTPHeaders: {
        Authorization: `Bearer ${a.session.access_token}`,
        "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN,
      },
    }),
  ),
);
const result = {
  url: target,
  expectedSha: sha,
  checks: [],
  media_verified: false,
  physical_devices_manually_verified: false,
  room: null,
  clients: [],
  clientKinds: ["account", process.env.SYRKA_QA_GUEST === "true" ? "anonymous_guest" : "account"],
  controls: "NOT_REACHED",
};
function check(label, ok) {
  assert(ok, label);
  result.checks.push(label);
  console.log(label + ": PASS");
}
async function api(actor, data, id) {
  const r = data
    ? await clients[actor].post("/workspace/api/sessions", { data })
    : await clients[actor].get(
        "/workspace/api/sessions" + (id ? "?id=" + id : ""),
      );
  const body = await r.json();
  if (!r.ok())
    throw Error(
      `Sessions API ${r.status()}: ${body.error || "Request failed"}`,
    );
  return body;
}
let browser,
  pages = [];
async function snapshot(page) {
  return page.evaluate(async () => {
    const pcs = window.__syrkaMediaPCs || [];
    const reports = await Promise.all(
      pcs.map(async (pc) => {
        const stats = [...(await pc.getStats())].map(([, value]) => value);
        const inbound = stats.filter(
          (s) => s.type === "inbound-rtp" && !s.isRemote,
        );
        const outbound = stats.filter(
          (s) => s.type === "outbound-rtp" && !s.isRemote,
        );
        return {
          connection: pc.connectionState,
          ice: pc.iceConnectionState,
          gathering: pc.iceGatheringState,
          icePolicy: pc.getConfiguration().iceTransportPolicy,
          iceServerSchemes: [
            ...new Set(
              (pc.getConfiguration().iceServers || []).flatMap((s) =>
                (Array.isArray(s.urls) ? s.urls : [s.urls]).map(
                  (u) => u.split(":")[0],
                ),
              ),
            ),
          ],
          inbound: inbound.map((s) => ({
            kind: s.kind,
            packets: s.packetsReceived || 0,
            bytes: s.bytesReceived || 0,
            frames: s.framesDecoded || 0,
            audioEnergy: s.totalAudioEnergy || 0,
          })),
          outbound: outbound.map((s) => ({
            kind: s.kind,
            packets: s.packetsSent || 0,
            bytes: s.bytesSent || 0,
            frames: s.framesEncoded || 0,
          })),
          candidates: stats
            .filter((s) =>
              ["local-candidate", "remote-candidate"].includes(s.type),
            )
            .map((s) => ({
              type: s.type,
              candidateType: s.candidateType,
              protocol: s.protocol,
              relayProtocol: s.relayProtocol,
            })),
        };
      }),
    );
    return {
      observedCandidates: window.__syrkaIceCandidates || [],
      iceErrors: window.__syrkaIceErrors || [],
      callState: document
        .querySelector("[data-call-state]")
        ?.getAttribute("data-call-state"),
      pcs: reports,
      audioPlayback: [...document.querySelectorAll("audio")].map((a) => ({
        paused: a.paused,
        muted: a.muted,
        time: a.currentTime,
      })),
      renderedVideos: [...document.querySelectorAll("video")].map((v) => ({
        width: v.videoWidth,
        height: v.videoHeight,
        time: v.currentTime,
      })),
    };
  });
}
try {
  const root = await api(0);
  check(
    "Exact Preview SHA and LiveKit configuration",
    root.deployment_sha === sha && root.capabilities.video,
  );
  const created = await api(0, {
    action: "create",
    data: {
      title: "QA LiveKit two authenticated browsers",
      description:
        "Isolated fictional QA recording; safe to remove with this fixture.",
      starts_at: new Date().toISOString(),
      timezone: "UTC",
    },
  });
  const id = created.rooms[0].id;
  result.room = id;
  if (guestIdentityClient) {
    const invitation = await guestIdentityClient.rpc("session_invitation", {room:id});
    check("Actual account-free guest can read only the opted-in invitation title and host name",
      !invitation.error && invitation.data?.title === "QA LiveKit two authenticated browsers" &&
      Object.keys(invitation.data).sort().join(",") === "host_name,title");
    const privateFiles = await guestIdentityClient.from("office_files").select("id").limit(1);
    check("Actual guest cannot read Workspace files", !privateFiles.error && privateFiles.data.length === 0);
  }

  const foreign = await clients[1].post("/workspace/api/sessions", {
    data: { action: "token", roomId: id },
  });
  check(
    "Invitation alone cannot mint a media token",
    [403, 404].includes(foreign.status()),
  );
  await api(1, {
    action: "request_join",
    roomId: id,
    display_name: "QA participant B",
  });
  const pendingSnapshot = await api(1, null, id);
  check(
    "Waiting-room status survives reload without exposing meeting content",
    pendingSnapshot.admission === "waiting" &&
      !pendingSnapshot.room &&
      !pendingSnapshot.segments,
  );
  const waiting = await clients[1].post("/workspace/api/sessions", {
    data: { action: "token", roomId: id },
  });
  check(
    "Waiting participant cannot obtain a room token",
    [403, 404].includes(waiting.status()),
  );
  const guestControl = await clients[1].post("/workspace/api/sessions", {
    data: { action: "host_update", roomId: id, patch: { locked: true } },
  });
  check(
    "Guest cannot invoke host controls",
    [403, 404].includes(guestControl.status()),
  );
  await api(0, {
    action: "member_update",
    roomId: id,
    user_id: actors[1].id,
    patch: { status: "approved", can_publish: false },
  });
  const blockedPublisher = await api(1, { action: "token", roomId: id });
  const restricted = JSON.parse(
    Buffer.from(blockedPublisher.token.split(".")[1], "base64url").toString(),
  );
  check(
    "Host-disabled publication is enforced in signed participant grants",
    restricted.video.canPublish === false &&
      restricted.video.canSubscribe === true,
  );
  await api(0, {
    action: "member_update",
    roomId: id,
    user_id: actors[1].id,
    patch: { can_publish: true },
  });
  for (let i = 0; i < 2; i++) {
    const minted = await api(i, { action: "token", roomId: id });
    const claims = JSON.parse(
      Buffer.from(minted.token.split(".")[1], "base64url").toString(),
    );
    check(
      `Authenticated actor ${i + 1} receives an isolated short-lived room grant without speech consent`,
      claims.sub === `workspace:${actors[i].id}` &&
        claims.video.room === `syrka-workspace-${id}` &&
        claims.video.roomJoin &&
        claims.exp - claims.nbf <= 300 &&
        typeof claims.name === "string",
    );
  }
  const audio = process.env.SYRKA_QA_AUDIO || "/tmp/syrka-meeting-test.wav";
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
    proxy,
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${audio}`,
      "--autoplay-policy=no-user-gesture-required",
      "--auto-select-desktop-capture-source=Entire screen",
      ...(process.env.SYRKA_LIVEKIT_RELAY_TEST === "true"
        ? ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"]
        : []),
    ],
  });
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({
      viewport: i ? { width: 375, height: 812 } : { width: 1440, height: 900 },
      permissions: [
        "camera",
        "microphone",
        "clipboard-read",
        "clipboard-write",
      ],
    });
    await context.route(new URL(target).origin + "/**", (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN,
        },
      }),
    );
    await context.addInitScript(
      ({ session, origin, relay }) => {
        if (location.origin !== origin) return;
        localStorage.setItem(
          "sb-zguejzlseldovdssiumn-auth-token",
          JSON.stringify(session),
        );
        sessionStorage.removeItem("syrka-workspace-demo");
        const Native = window.RTCPeerConnection;
        window.__syrkaIceCandidates = [];
        window.__syrkaIceErrors = [];
        window.__syrkaMediaPCs = [];
        window.RTCPeerConnection = class extends Native {
          setConfiguration(configuration) {
            super.setConfiguration(relay
              ? { ...configuration, iceTransportPolicy: "relay" }
              : configuration);
          }
          constructor(...args) {
            if (relay) args[0] = { ...args[0], iceTransportPolicy: "relay" };
            super(...args);
            window.__syrkaMediaPCs.push(this);
            this.addEventListener("icecandidate", (event) => {
              if (event.candidate)
                window.__syrkaIceCandidates.push({
                  type: event.candidate.type,
                  protocol: event.candidate.protocol,
                });
            });
            this.addEventListener("icecandidateerror", (event) => {
              window.__syrkaIceErrors.push({
                code: event.errorCode,
                category: /host lookup/i.test(event.errorText)
                  ? "HOST_LOOKUP_FAILED"
                  : /timed? ?out|timeout/i.test(event.errorText)
                    ? "REACHABILITY_TIMEOUT"
                    : /unauthorized/i.test(event.errorText)
                      ? "TURN_AUTH_REJECTED"
                      : "ICE_SERVER_ERROR",
              });
            });
          }
        };
      },
      {
        session: actors[i].session,
        origin: new URL(target).origin,
        relay: process.env.SYRKA_LIVEKIT_RELAY_TEST === "true",
      },
    );
    const page = await context.newPage();
    pages.push(page);
    const network = { requestedSockets: 0, receivedFrames: 0, hosts: [] };
    result.clients.push({ network });
    page.on("websocket", (socket) => {
      const host = new URL(socket.url()).hostname;
      if (!host.endsWith(".livekit.cloud")) return;
      network.requestedSockets++;
      if (!network.hosts.includes(host)) network.hosts.push(host);
      socket.on("framereceived", () => network.receivedFrames++);
    });
    await page.goto(`${target}/workspace/sessions/meeting/${id}`);
    await page
      .getByRole("heading", { name: "QA LiveKit two authenticated browsers" })
      .waitFor({ timeout: 30000 });
    const before = await api(i, null, id);
    check(
      `Browser actor ${i + 1} has its own approved application session`,
      before.user_id === actors[i].id &&
        before.me?.status === "approved" &&
        before.me.consent === false,
    );
    await page
      .getByRole("button", {
        name: i ? "Join meeting" : "Start call",
        exact: true,
      })
      .click();
    await page
      .getByRole("toolbar", { name: "Meeting controls" })
      .waitFor({ timeout: 30000 });
    const bounds = await page.locator(".session-call-frame").boundingBox();
    check(
      `Actor ${i + 1} video stage fits its viewport`,
      bounds &&
        bounds.x >= 0 &&
        bounds.x + bounds.width <= (i ? 375 : 1440) + 1 &&
        bounds.height <= 725,
    );
  }
  await pages[0]
    .getByRole("button", { name: "Copy meeting invitation", exact: true })
    .click();
  const invitation = await pages[0].evaluate(() =>
    navigator.clipboard.readText(),
  );
  check(
    "Copied invitation is the actual authorized meeting URL",
    invitation === `${target}/workspace/sessions/meeting/${id}`,
  );
  const connected = await Promise.allSettled(
    pages.map((p) =>
      p.locator('[data-call-state="connected"]').waitFor({ timeout: 40000 }),
    ),
  );
  if (connected.some((r) => r.status === "rejected")) {
    for (let i = 0; i < 2; i++)
      result.clients[i].transport = await snapshot(pages[i]);
    result.network_error_feedback = await Promise.all(
      pages.map(
        async (p) =>
          (await p
            .getByText("Taking longer than expected.", { exact: false })
            .count()) > 0 || (await p.getByRole("alert").count()) > 0,
      ),
    );
    result.reconnection = "NOT_REACHED_MEDIA_CONNECTION_BLOCKED";
    result.screen_share = "NOT_REACHED_MEDIA_CONNECTION_BLOCKED";
    result.status = "BLOCKED_MEDIA_TRANSPORT";
    result.error =
      "Authenticated LiveKit signaling reached the service, but ICE/media did not establish in this runner. No bidirectional audio/video acceptance claim.";
    process.exitCode = 2;
  } else {
    for (const page of pages) {
      await page
        .getByRole("button", { name: "Unmute microphone", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Turn camera on", exact: true })
        .click();
    }
    let valid = false;
    for (let n = 0; n < 30; n++) {
      const stats = await Promise.all(pages.map(snapshot));
      for (let i = 0; i < 2; i++) result.clients[i].transport = stats[i];
      valid = stats.every(
        (s) =>
          s.pcs.some(
            (pc) =>
              pc.inbound.some(
                (t) => t.kind === "audio" && t.packets > 0 && t.audioEnergy > 0,
              ) && pc.inbound.some((t) => t.kind === "video" && t.frames > 0),
          ) &&
          s.pcs.some(
            (pc) =>
              pc.outbound.some((t) => t.kind === "audio" && t.packets > 0) &&
              pc.outbound.some((t) => t.kind === "video" && t.frames > 0),
          ) &&
          s.audioPlayback.some((a) => !a.paused && !a.muted && a.time > 0) &&
          s.renderedVideos.some((v) => v.width > 0 && v.time > 0),
      );
      if (valid) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    check(
      "Both authenticated clients sent and received actual LiveKit audio/video with decoded frames and audio energy",
      valid,
    );
    result.media_verified = true;
    for (const page of pages) {
      await page
        .getByRole("button", { name: "Mute microphone", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Unmute microphone", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Unmute microphone", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Turn camera off", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Turn camera on", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Turn camera on", exact: true })
        .click();
    }
    check("Both clients can mute/unmute and turn cameras off/on", true);
    await api(0, {
      action: "member_update",
      roomId: id,
      user_id: actors[1].id,
      patch: { can_publish: false },
    });
    await pages[1]
      .getByText("The host has disabled", { exact: false })
      .waitFor();
    check("Host publication restriction reaches the connected guest", true);
    await api(0, {
      action: "member_update",
      roomId: id,
      user_id: actors[1].id,
      patch: { can_publish: true },
    });
    await pages[0].context().setOffline(true);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const observedReconnect = await pages[0]
      .locator(
        '[data-call-state="reconnecting"], [data-call-state="signalReconnecting"]',
      )
      .count();
    await pages[0].context().setOffline(false);
    await pages[0]
      .locator('[data-call-state="connected"]')
      .waitFor({ timeout: 45000 });
    result.reconnection = observedReconnect
      ? "SIGNAL_RECONNECT_OBSERVED_AND_RECOVERED"
      : "NETWORK_INTERRUPT_DID_NOT_TRIGGER_OBSERVABLE_RECONNECT";
    const screen = pages[0].getByRole("button", {
      name: "Share screen",
      exact: true,
    });
    result.screen_share = "NOT_SUPPORTED";
    if (await screen.count()) {
      await screen.click();
      const stop = pages[0].getByRole("button", {
        name: "Stop sharing screen",
        exact: true,
      });
      if (await stop.isVisible()) {
        await pages[1]
          .locator('[data-session-source="screen_share"] video')
          .waitFor({ timeout: 15000 });
        await stop.click();
        result.screen_share = "PUBLISHED_AND_RECEIVED";
      } else result.screen_share = "BROWSER_CAPTURE_DENIED";
    }
    result.controls = "PASS_MUTE_CAMERA_HOST_PERMISSIONS";
    result.status = "PASS_SYNTHETIC_LIVEKIT_MEDIA";
  }
  for (let i = 0; i < 2; i++) {
    await pages[i].screenshot({
      path: `/tmp/syrka-livekit-${i ? "mobile" : "desktop"}.png`,
    });
    await pages[i]
      .getByRole("button", { name: "Leave meeting", exact: true })
      .click();
    await pages[i]
      .locator(".session-call-frame")
      .waitFor({ state: "detached", timeout: 10000 });
    await pages[i].waitForFunction(
      () =>
        window.__syrkaMediaPCs.every((pc) => pc.connectionState === "closed"),
      {},
      { timeout: 10000 },
    );
    check(
      `Actor ${i + 1} can leave and close its peer connections`,
      await pages[i].evaluate(() =>
        window.__syrkaMediaPCs.every((pc) => pc.connectionState === "closed"),
      ),
    );
  }
} catch (error) {
  result.status = "FAILED";
  result.error = String(error.message)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[redacted]")
    .slice(0, 600);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (result.room) {
    try {
      await api(0, {
        action: "host_update",
        roomId: result.room,
        patch: { status: "ended" },
      });
      await api(0, { action: "delete", roomId: result.room });
      result.cleanup = "Own QA room and records removed";
    } catch {
      result.cleanup = "QA cleanup requires operator retry";
    }
  }
  await Promise.all(clients.map((c) => c.dispose()));
  result.checked_at = new Date().toISOString();
  await writeFile(
    "/tmp/syrka-livekit-preview-acceptance.json",
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: result.status,
      media_verified: result.media_verified,
      checks: result.checks,
      error: result.error,
    }),
  );
}
