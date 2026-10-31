/** Real hosted host/account-free guest acceptance. No provider keys or auth users created. */
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, request } from "@playwright/test";
import { SignalResponse } from "@livekit/protocol";
import WebSocket from "ws";
import proxyAgent from "next/dist/compiled/https-proxy-agent/index.js";
const target = process.env.SYRKA_PREVIEW_URL,
  sha = process.env.SYRKA_EXPECTED_SHA;
if (!target || !sha || !new URL(target).hostname.endsWith(".vercel.app"))
  throw Error("Specify exact Git-linked Preview and SHA.");
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
  actors[0]?.email.includes("+syrka-sessions-") &&
    actors[0].session?.access_token,
);
const proxy = process.env.HTTPS_PROXY
  ? { server: process.env.HTTPS_PROXY }
  : undefined;
const origin = new URL(target).origin;
const headers = {
  "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN,
};
const guestHeaders =
  process.env.SYRKA_QA_PUBLIC_GUEST === "true" ? {} : headers;
const host = await request.newContext({
  baseURL: target,
  proxy,
  timeout: 45000,
  extraHTTPHeaders: {
    ...headers,
    Authorization: `Bearer ${actors[0].session.access_token}`,
  },
});
const result = {
  expectedSha: sha,
  url: target,
  checks: [],
  media_verified: false,
  physical_devices_manually_verified: false,
  clients: [],
};
let browser,
  roomId,
  guestId,
  pages = [];
const check = (label, ok) => {
  assert(ok, label);
  result.checks.push(label);
  console.log(label + ": PASS");
};
async function hostApi(data, id) {
  const r = data
    ? await host.post("/workspace/api/sessions", { data })
    : await host.get("/workspace/api/sessions" + (id ? "?id=" + id : ""));
  const b = await r.json();
  assert(r.ok(), `Host API ${r.status()}: ${b.error || "failed"}`);
  return b;
}
async function guestApi(data, id = roomId) {
  const r = data
    ? await pages[1]
        .context()
        .request.post(target + "/workspace/api/sessions/guest", {
          data,
          headers: guestHeaders,
        })
    : await pages[1]
        .context()
        .request.get(target + "/workspace/api/sessions/guest?id=" + id, {
          headers: guestHeaders,
        });
  return { response: r, body: await r.json() };
}
async function manage(patch) {
  return hostApi({
    action: "member_update",
    roomId,
    user_id: guestId,
    guest_identity: true,
    patch,
  });
}
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
async function signaling(_page, url, token) {
  const u = new URL(url);
  u.pathname = "/rtc";
  for (const [k, v] of Object.entries({
    access_token: token,
    sdk: "js",
    version: "2.23.0",
    protocol: "16",
    auto_subscribe: "0",
  }))
    u.searchParams.set(k, v);
  return new Promise((resolve) => {
    const state = {
      joined: false,
      frames: 0,
      status: "timeout",
      handshakeStatus: undefined,
    };
    const socket = new WebSocket(
      u,
      proxy ? { agent: new proxyAgent.HttpsProxyAgent(proxy.server) } : {},
    );
    let complete = false;
    const done = (status) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      state.status = status;
      socket.close();
      resolve(state);
    };
    const timer = setTimeout(
      () => done(state.frames ? "frames" : "timeout"),
      6000,
    );
    socket.on("upgrade", (response) => {
      state.handshakeStatus = response.statusCode;
    });
    socket.on("unexpected-response", (req, response) => {
      state.handshakeStatus = response.statusCode;
      response.resume();
      req.destroy();
      done("rejected");
    });
    socket.on("message", (data) => {
      state.frames++;
      try {
        const msg = SignalResponse.fromBinary(new Uint8Array(data));
        if (msg.message.case === "join") state.joined = true;
      } catch {}
    });
    socket.on("error", () => done("network_error"));
    socket.on("close", () => done(state.frames ? "frames" : "closed"));
  });
}

try {
  const root = await hostApi();
  check(
    "Exact Git Preview SHA and configured LiveKit",
    root.deployment_sha === sha && root.capabilities.video,
  );
  const created = await hostApi({
    action: "create",
    data: {
      title: "QA account-free guest call",
      description: "Isolated fictional QA; safe to remove.",
      starts_at: new Date().toISOString(),
      timezone: "UTC",
      allow_guests: true,
    },
  });
  roomId = created.rooms[0].id;
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
    proxy,
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${process.env.SYRKA_QA_AUDIO || "/tmp/syrka-meeting-test.wav"}`,
      "--autoplay-policy=no-user-gesture-required",
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
    if (i === 0 || process.env.SYRKA_QA_PUBLIC_GUEST !== "true")
      await context.route(origin + "/**", (route) =>
        route.continue({
          headers: { ...route.request().headers(), ...headers },
        }),
      );
    await context.addInitScript(
      ({ origin, session, relay }) => {
        if (location.origin !== origin) return;
        if (session)
          localStorage.setItem(
            "sb-zguejzlseldovdssiumn-auth-token",
            JSON.stringify(session),
          );
        const Native = window.RTCPeerConnection;
        window.__syrkaMediaPCs = [];
        window.__syrkaIceErrors = [];
        window.__syrkaIceCandidates = [];
        window.RTCPeerConnection = class extends Native {
          constructor(...args) {
            if (relay) args[0] = { ...args[0], iceTransportPolicy: "relay" };
            super(...args);
            window.__syrkaMediaPCs.push(this);
            this.addEventListener("icecandidateerror", (e) =>
              window.__syrkaIceErrors.push({
                code: e.errorCode,
                category: /host lookup/i.test(e.errorText)
                  ? "HOST_LOOKUP_FAILED"
                  : "ICE_SERVER_ERROR",
              }),
            );
            this.addEventListener("icecandidate", (e) => {
              if (e.candidate)
                window.__syrkaIceCandidates.push({
                  type: e.candidate.type,
                  protocol: e.candidate.protocol,
                });
            });
          }
          setConfiguration(c) {
            super.setConfiguration(
              relay ? { ...c, iceTransportPolicy: "relay" } : c,
            );
          }
        };
      },
      {
        origin,
        session: i ? null : actors[0].session,
        relay: process.env.SYRKA_LIVEKIT_RELAY_TEST === "true",
      },
    );
    const page = await context.newPage();
    pages.push(page);
    result.clients.push({
      kind: i ? "account_free_guest" : "authenticated_host",
      authRequests: 0,
      socketFrames: 0,
    });
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.includes("/auth/v1/"))
        result.clients[i].authRequests++;
    });
    page.on("websocket", (s) => {
      if (new URL(s.url()).hostname.endsWith(".livekit.cloud"))
        s.on("framereceived", () => result.clients[i].socketFrames++);
    });
    await page.goto(target + "/workspace/sessions/meeting/" + roomId);
  }
  await pages[0]
    .getByRole("button", { name: "Start call", exact: true })
    .click();
  await pages[0].getByRole("toolbar", { name: "Meeting controls" }).waitFor();
  await pages[0].getByLabel("More call options", { exact: true }).click();
  await pages[0]
    .getByRole("button", { name: "Copy meeting invitation", exact: true })
    .click();
  check(
    "Host copied the canonical invitation",
    (await pages[0].evaluate(() => navigator.clipboard.readText())) ===
      target + "/workspace/sessions/meeting/" + roomId,
  );
  await pages[1]
    .getByRole("heading", { name: "QA account-free guest call", exact: true })
    .waitFor();
  check(
    "Guest invitation identifies the host",
    (await pages[1].getByText("Hosted by", { exact: false }).count()) > 0,
  );
  await pages[1]
    .getByRole("button", { name: "Preview camera and microphone", exact: true })
    .click();
  await pages[1]
    .getByRole("button", { name: "Stop device preview", exact: true })
    .waitFor();
  await pages[1]
    .getByRole("button", { name: "Stop device preview", exact: true })
    .click();
  await pages[1]
    .getByRole("textbox", { name: "Display name", exact: true })
    .fill("QA account-free visitor");
  await pages[1]
    .getByRole("button", { name: "Ask to join", exact: true })
    .click();
  await pages[1].getByText("Waiting for the host", { exact: false }).waitFor();
  const pending = await guestApi();
  check(
    "Waiting guest has no private meeting content",
    pending.response.ok() &&
      pending.body.admission === "waiting" &&
      !pending.body.room &&
      !pending.body.notes,
  );
  guestId = pending.body.user_id;
  check(
    "Waiting guest cannot mint media token",
    (await guestApi({ action: "token", roomId })).response.status() === 403,
  );
  check(
    "Guest cannot invoke host controls",
    (
      await guestApi({ action: "host_update", roomId, patch: { locked: true } })
    ).response.status() === 403,
  );
  const waitingHost = await hostApi(null, roomId);
  const member = waitingHost.members.find((m) => m.user_id === guestId);
  check(
    "Authenticated host sees scoped waiting identity",
    member?.guest_identity && member.status === "waiting",
  );
  await pages[0]
    .getByRole("button", { name: "Show participants", exact: true })
    .click();
  await pages[0]
    .locator(".session-member")
    .filter({ hasText: "QA account-free visitor" })
    .getByRole("button", { name: "Admit", exact: true })
    .click();
  check(
    "Host admits the waiting guest through the actual meeting interface",
    true,
  );
  await pages[1]
    .getByRole("toolbar", { name: "Meeting controls" })
    .waitFor({ timeout: 20000 });
  check(
    "Admission automatically opens real call without signup",
    result.clients[1].authRequests === 0,
  );
  check(
    "Guest holds no Supabase Auth session",
    await pages[1].evaluate(
      () => !localStorage.getItem("sb-zguejzlseldovdssiumn-auth-token"),
    ),
  );
  const gs = await guestApi();
  check(
    "Guest snapshot excludes notes/transcripts",
    gs.body.me?.guest_identity &&
      gs.body.note === null &&
      gs.body.segments.length === 0,
  );
  check(
    "Guest mobile layout fits viewport",
    await pages[1].evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  if (process.env.SYRKA_QA_PERSISTENCE === "true") {
    for (const [index, page] of pages.entries()) {
      await page.evaluate(() => {
        window.__syrkaPersistentFrame = document.querySelector(
          ".session-call-frame",
        );
      });
      await page
        .getByRole("button", { name: "Minimize call", exact: true })
        .click();
      await page.locator('[data-persistent-call="mini"]').waitFor();
      check(
        `Real-service browser ${index + 1} minimizes without replacing its call subtree`,
        await page.evaluate(
          () =>
            document.querySelector(".session-call-frame") ===
            window.__syrkaPersistentFrame,
        ),
      );
      await page
        .getByRole("button", { name: "Return to call", exact: true })
        .click();
      await page.locator('[data-persistent-call="full"]').waitFor();
      check(
        `Real-service browser ${index + 1} returns without replacing its call subtree`,
        await page.evaluate(
          () =>
            document.querySelector(".session-call-frame") ===
            window.__syrkaPersistentFrame,
        ),
      );
    }
    await manage({ can_share_screen: false });
    const restricted = await guestApi({ action: "token", roomId });
    assert(restricted.response.ok());
    const permissions = JSON.parse(
      Buffer.from(restricted.body.token.split(".")[1], "base64url").toString(),
    );
    check(
      "Host presentation restriction reaches actual guest JWT while preserving microphone and camera",
      JSON.stringify(permissions.video.canPublishSources) ===
        JSON.stringify(["camera", "microphone"]),
    );
    await manage({ can_share_screen: true });
  }
  const connected = await Promise.allSettled(
    pages.map((p) =>
      p.locator('[data-call-state="connected"]').waitFor({
        timeout: process.env.SYRKA_QA_SECURITY_ONLY === "true" ? 1 : 40000,
      }),
    ),
  );
  if (connected.every((r) => r.status === "fulfilled")) {
    for (const p of pages) {
      await p
        .getByRole("button", { name: "Unmute microphone", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Turn camera on", exact: true })
        .click();
    }
    for (let n = 0; n < 25; n++) {
      const stats = await Promise.all(pages.map(snapshot));
      stats.forEach((s, i) => (result.clients[i].transport = s));
      if (
        stats.every(
          (s) =>
            s.pcs.some(
              (pc) =>
                pc.inbound.some(
                  (t) =>
                    t.kind === "audio" && t.packets > 0 && t.audioEnergy > 0,
                ) && pc.inbound.some((t) => t.kind === "video" && t.frames > 0),
            ) &&
            s.pcs.some(
              (pc) =>
                pc.outbound.some((t) => t.kind === "audio" && t.packets > 0) &&
                pc.outbound.some((t) => t.kind === "video" && t.frames > 0),
            ) &&
            s.audioPlayback.some((a) => !a.paused && !a.muted && a.time > 0),
        )
      ) {
        result.media_verified = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } else {
    for (let i = 0; i < 2; i++)
      result.clients[i].transport = await snapshot(pages[i]);
  }
  result.media_status =
    process.env.SYRKA_QA_SECURITY_ONLY === "true"
      ? "NOT_TESTED_SECURITY_ONLY"
      : result.media_verified
        ? "PASS_ACTUAL_LIVEKIT_RTP"
        : "BLOCKED_MEDIA_TRANSPORT";
  for (let i = 0; i < 2; i++) {
    await pages[i].screenshot({
      path: `/tmp/syrka-scoped-guest-${i ? "mobile" : "desktop"}.png`,
    });
    if (
      !(await pages[i]
        .getByRole("button", { name: "Leave meeting", exact: true })
        .isVisible())
    )
      await pages[i].getByLabel("More call options", { exact: true }).click();
    await pages[i]
      .getByRole("button", { name: "Leave meeting", exact: true })
      .click();
    await pages[i]
      .locator(".session-call-frame")
      .waitFor({ state: "detached" });
  }
  check(
    "Guest can leave without losing scoped admission",
    (await guestApi()).body.me?.user_id === guestId,
  );
  await pages[1]
    .getByRole("button", { name: "Join meeting", exact: true })
    .click();
  await pages[1].getByRole("toolbar", { name: "Meeting controls" }).waitFor();
  if (
    !(await pages[1]
      .getByRole("button", { name: "Leave meeting", exact: true })
      .isVisible())
  )
    await pages[1].getByLabel("More call options", { exact: true }).click();
  await pages[1]
    .getByRole("button", { name: "Leave meeting", exact: true })
    .click();
  if (process.env.SYRKA_QA_GUEST_AUDIO === "true") {
    const pcm = await readFile(
      process.env.SYRKA_QA_PCM || "/tmp/syrka-meeting-test.pcm",
    );
    const batch = {
      roomId,
      start_ms: "0",
      end_ms: "4000",
      language: "en",
      request_id: randomUUID(),
      audio: {
        name: "guest.pcm",
        mimeType: "audio/pcm",
        buffer: pcm.subarray(0, 128000),
      },
    };
    const send = (data) =>
      pages[1]
        .context()
        .request.post(target + "/workspace/api/sessions/guest", {
          headers: guestHeaders,
          multipart: data,
          timeout: 90000,
        });
    await hostApi({
      action: "host_update",
      roomId,
      patch: { status: "live", transcribing: true },
    });
    await hostApi({ action: "consent", roomId, consent: true });
    const denied = await send(batch);
    check(
      "Guest audio is blocked before explicit guest consent",
      denied.status() === 403,
    );
    check(
      "Guest can explicitly consent",
      (
        await guestApi({ action: "consent", roomId, consent: true })
      ).response.ok(),
    );
    for (let offset = 0; offset < pcm.length; offset += 128000) {
      const part = pcm.subarray(offset, offset + 128000);
      if (part.length < 3200) break;
      const sent = await send({
        ...batch,
        request_id: randomUUID(),
        start_ms: String(Math.floor(offset / 32)),
        end_ms: String(Math.floor((offset + part.length) / 32)),
        audio: { name: "guest.pcm", mimeType: "audio/pcm", buffer: part },
      });
      const body = await sent.json();
      assert(
        sent.ok(),
        `Guest real ASR ${sent.status()}: ${body.error || "failed"}`,
      );
    }
    const snap = await hostApi(null, roomId);
    check(
      "Actual Qwen guest speech saved with timestamps and scoped attribution",
      snap.segments.some(
        (s) =>
          s.guest_speaker_id === guestId &&
          s.speaker_id === null &&
          s.original_text?.trim() &&
          s.end_ms > s.start_ms,
      ),
    );
    const job = await hostApi({
      action: "process",
      roomId,
      kind: "notes",
      request_id: randomUUID(),
    });
    let noteReady = false;
    for (let n = 0; n < 36; n++) {
      await new Promise((r) => setTimeout(r, 2500));
      const saved = await hostApi(null, roomId);
      const record = saved.jobs.find((j) => j.id === job.job_id);
      assert(
        record?.state !== "failed",
        `Guest notes ${record?.error || "provider failed"}`,
      );
      if (record?.state === "done") {
        check(
          "Actual Qwen notes from guest transcript save and reopen",
          !!saved.note?.body.overview?.length,
        );
        noteReady = true;
        break;
      }
    }
    assert(noteReady, "Guest notes exceeded acceptance deadline");
    const privateSnap = await guestApi();
    check(
      "Guest cannot read host notes or guest transcript",
      privateSnap.body.note === null && privateSnap.body.segments.length === 0,
    );
    await guestApi({ action: "consent", roomId, consent: false });
    check(
      "Guest consent revocation blocks new provider audio",
      (await send({ ...batch, request_id: randomUUID() })).status() === 403,
    );
    await hostApi({
      action: "host_update",
      roomId,
      patch: { transcribing: false },
    });
  }
  const minted = await guestApi({ action: "token", roomId });
  assert(minted.response.ok());
  const claims = JSON.parse(
    Buffer.from(minted.body.token.split(".")[1], "base64url").toString(),
  );
  check(
    "Guest JWT is room-scoped and lasts at most 60 seconds",
    claims.sub === `workspace:guest:${guestId}` &&
      claims.video.room === `syrka-workspace-${roomId}` &&
      claims.exp - claims.nbf <= 60,
  );
  const before = await signaling(pages[1], minted.body.url, minted.body.token);
  result.token_baseline = before;
  await manage({ status: "removed" });
  check(
    "Removed guest cannot mint new tokens",
    (await guestApi({ action: "token", roomId })).response.status() === 403,
  );
  const after = await signaling(pages[1], minted.body.url, minted.body.token);
  result.token_replay = after;
  check(
    "Revoked unexpired JWT rejected by actual LiveKit signaling",
    before.joined &&
      !after.joined &&
      [401, 403].includes(after.handshakeStatus) &&
      claims.exp > Date.now() / 1000,
  );
  await hostApi({ action: "host_update", roomId, patch: { status: "ended" } });
  check(
    "Host can end real meeting",
    (await hostApi(null, roomId)).room.status === "ended",
  );
  result.token_replay_after_end = await signaling(
    pages[1],
    minted.body.url,
    minted.body.token,
  );
  check(
    "Ending a meeting does not let an old guest JWT recreate its room",
    before.joined &&
      !result.token_replay_after_end.joined &&
      [401, 403].includes(result.token_replay_after_end.handshakeStatus) &&
      claims.exp > Date.now() / 1000,
  );
  result.status =
    process.env.SYRKA_QA_SECURITY_ONLY === "true"
      ? "PASS_GUEST_SECURITY_ONLY"
      : result.media_verified
        ? "PASS_ACCOUNT_FREE_MEDIA"
        : "BLOCKED_MEDIA_TRANSPORT";
  if (!result.media_verified && process.env.SYRKA_QA_SECURITY_ONLY !== "true")
    process.exitCode = 2;
} catch (error) {
  result.status = "FAILED";
  result.error = String(error.message)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[redacted]")
    .slice(0, 500);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (roomId)
    try {
      await hostApi({
        action: "host_update",
        roomId,
        patch: { status: "ended" },
      });
      await hostApi({ action: "delete", roomId });
      result.cleanup = "Own QA room removed";
    } catch {
      result.cleanup = "Operator cleanup required";
    }
  await host.dispose();
  result.checked_at = new Date().toISOString();
  await writeFile(
    "/tmp/syrka-scoped-guest-preview-acceptance.json",
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
