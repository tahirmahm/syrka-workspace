/** Explicit development transport probe. No account records, production credentials or AI calls. */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { chromium } from "@playwright/test";
const fixture = process.env.SYRKA_LIVEKIT_FIXTURE_PATH;
if (!fixture)
  throw Error(
    "Set SYRKA_LIVEKIT_FIXTURE_PATH to an ignored, private development credential JSON file.",
  );
const config = JSON.parse(await readFile(fixture, "utf8"));
const url = new URL(config.LIVEKIT_URL);
url.protocol = "https:";
const service = new RoomServiceClient(
  url.toString(),
  config.LIVEKIT_API_KEY,
  config.LIVEKIT_API_SECRET,
  { requestTimeout: 10 },
);
const name = `syrka-development-probe-${randomUUID()}`;
let browser,
  server,
  created = false;
let pages = [];
const watchdog = setTimeout(async () => {
  for (const page of pages)
    console.error(
      "Bounded probe phase:",
      JSON.stringify(
        await page
          .evaluate(async () => ({
            ...window.probe,
            pcs: await Promise.all(
              (window.probePcs || []).map(async (pc) => ({
                state: pc.connectionState,
                ice: pc.iceConnectionState,
                gathering: pc.iceGatheringState,
                candidates: [...(await pc.getStats())]
                  .map(([, s]) => s)
                  .filter((s) =>
                    ["local-candidate", "remote-candidate"].includes(s.type),
                  )
                  .map((s) => ({
                    type: s.type,
                    candidateType: s.candidateType,
                    protocol: s.protocol,
                    relayProtocol: s.relayProtocol,
                  })),
              })),
            ),
          }))
          .catch(() => null),
      ),
    );
  console.error("LiveKit probe exceeded the bounded network deadline.");
  void browser?.close();
}, 60000);
const sdk = await readFile(
  new URL(
    "../node_modules/livekit-client/dist/livekit-client.umd.js",
    import.meta.url,
  ),
);
try {
  await service.createRoom({ name, emptyTimeout: 30, maxParticipants: 2 });
  created = true;
  console.log(
    "Existing LiveKit credentials authenticated; isolated test room created.",
  );
  server = createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url === "/sdk.js" ? "text/javascript" : "text/html",
    );
    res.end(
      req.url === "/sdk.js"
        ? sdk
        : '<!doctype html><title>Private LiveKit development probe</title><script src="/sdk.js"></script>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      ...(process.env.SYRKA_LIVEKIT_RELAY_TEST === "true"
        ? ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"]
        : []),
    ],
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" }
      : undefined,
  });
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({ permissions: ["camera", "microphone"] }),
    ),
  );
  pages = await Promise.all(contexts.map((c) => c.newPage()));
  for (const page of pages) {
    page.on("requestfailed", (req) => {
      const u = new URL(req.url());
      console.error(
        "Network failure:",
        u.hostname + u.pathname,
        req.failure()?.errorText,
      );
    });
    page.on("websocket", (socket) => {
      const u = new URL(socket.url());
      console.log("WebSocket requested:", u.hostname + u.pathname);
    });
  }
  await Promise.all(
    pages.map(async (page, index) => {
      const token = new AccessToken(
        config.LIVEKIT_API_KEY,
        config.LIVEKIT_API_SECRET,
        { identity: `development-probe:${index}:${name}`, ttl: 90 },
      );
      token.addGrant({
        roomJoin: true,
        room: name,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      await page.goto(address);
      await page.evaluate(
        async ({ url, token, relay }) => {
          window.probePcs = [];
          const NativePC = window.RTCPeerConnection;
          window.RTCPeerConnection = class extends NativePC {
            constructor(...args) {
              super(...args);
              window.probePcs.push(this);
            }
          };
          const { Room, RoomEvent } = window.LivekitClient;
          window.probe = {
            state: "connecting",
            audioPackets: 0,
            videoPackets: 0,
            chat: false,
          };
          const room = new Room();
          window.probeRoom = room;
          room.on(RoomEvent.DataReceived, () => (window.probe.chat = true));
          try {
            await room.connect(url, token, {
              maxRetries: 0,
              ...(relay ? { rtcConfig: { iceTransportPolicy: "relay" } } : {}),
              peerConnectionTimeout: 15000,
              websocketTimeout: 15000,
            });
            window.probe.state = "signaling-connected";
            await room.localParticipant.setMicrophoneEnabled(true);
            window.probe.state = "microphone-published";
            await room.localParticipant.setCameraEnabled(true);
            window.probe.state = "connected";
          } catch (e) {
            window.probe.state = "failed";
            window.probe.error = e.name;
            window.probe.reason = String(e.message)
              .replace(/https?:[^ ]+|wss?:[^ ]+/g, "[endpoint]")
              .slice(0, 160);
          }
        },
        {
          url: config.LIVEKIT_URL,
          token: await token.toJwt(),
          relay: process.env.SYRKA_LIVEKIT_RELAY_TEST === "true",
        },
      );
    }),
  );
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(
        () => window.probe.state === "connected",
        {},
        { timeout: 25000 },
      ),
    ),
  );
  await Promise.all(
    pages.map((page) =>
      page.evaluate(async () => {
        await window.probeRoom.localParticipant.publishData(
          new TextEncoder().encode("Development probe chat"),
          { reliable: true },
        );
      }),
    ),
  );
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(
        async () => {
          for (const participant of window.probeRoom.remoteParticipants.values())
            for (const publication of participant.trackPublications.values()) {
              const stats = await publication.track?.getReceiverStats();
              if (!stats) continue;
              if (publication.kind === "audio")
                window.probe.audioPackets = stats.packetsReceived || 0;
              if (publication.kind === "video")
                window.probe.videoPackets = stats.packetsReceived || 0;
            }
          return (
            window.probe.audioPackets > 0 &&
            window.probe.videoPackets > 0 &&
            window.probe.chat
          );
        },
        {},
        { timeout: 20000 },
      ),
    ),
  );
  console.log(
    JSON.stringify({
      transport: "PASS",
      participants: await Promise.all(
        pages.map((page) => page.evaluate(() => window.probe)),
      ),
      scope:
        "LiveKit transport only; not Supabase-authenticated application acceptance",
    }),
  );
} catch (error) {
  for (const page of pages) {
    const state = await page.evaluate(() => window.probe).catch(() => null);
    if (state)
      console.error("Development media probe state:", JSON.stringify(state));
  }
  console.error(
    JSON.stringify({
      transport: "BLOCKED_OR_FAILED",
      error: error.name,
      scope:
        "No application acceptance claim; inspect network/media prerequisites",
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (created)
    await service
      .deleteRoom(name)
      .catch(() =>
        console.error(
          "Test room cleanup failed; inspect the isolated development-probe room.",
        ),
      );
}
