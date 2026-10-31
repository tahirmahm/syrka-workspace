/** Actual browser PCM -> authenticated Preview -> Qwen -> persisted transcript/notes.
 * Uses isolated QA identities and fictional synthesized microphone audio. Does NOT certify LiveKit RTP or physical participants.
 */
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import ts from "typescript";
const target = process.env.SYRKA_PREVIEW_URL,
  expected = process.env.SYRKA_EXPECTED_SHA;
if (!target || !expected || !new URL(target).hostname.endsWith(".vercel.app"))
  throw Error("Specify exact Git Preview URL and expected SHA.");
const actors = JSON.parse(
  await readFile(
    process.env.SYRKA_QA_FIXTURE || "/tmp/syrka-sessions-qa-actors.json",
    "utf8",
  ),
);
if (
  actors.length !== 2 ||
  actors.some(
    (a) => !a.session?.access_token || !a.email.includes("+syrka-sessions-"),
  )
)
  throw Error("Two isolated QA sessions required.");
const result = {
  sha: expected,
  url: target,
  checks: [],
  batches: [],
  audio_source: "fictional synthesized microphone fixture",
  physical_participants_verified: false,
  livekit_rtp_verified: false,
};
let room, browser;
async function api(i, data, id) {
  const r = await fetch(
    target + "/workspace/api/sessions" + (id ? "?id=" + id : ""),
    {
      method: data ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + actors[i].session.access_token,
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    },
  );
  const b = await r.json();
  if (!r.ok)
    throw Error(`Sessions HTTP ${r.status}: ${b.error || "request failed"}`);
  return b;
}
const check = (name, ok) => {
  if (!ok) throw Error("Failed: " + name);
  result.checks.push(name);
  console.log(name + ": PASS");
};
try {
  const root = await api(0);
  check(
    "Exact Preview runtime SHA and enabled free-quota PCM speech/AI",
    root.deployment_sha === expected &&
      root.capabilities.stt &&
      root.capabilities.ai &&
      root.capabilities.speechFormat === "pcm",
  );
  room = (
    await api(0, {
      action: "create",
      data: {
        title: "QA browser speech capture audit",
        starts_at: new Date().toISOString(),
        timezone: "UTC",
      },
    })
  ).rooms[0].id;
  await api(1, {
    action: "request_join",
    roomId: room,
    display_name: "QA microphone B",
  });
  await api(0, {
    action: "member_update",
    roomId: room,
    user_id: actors[1].id,
    patch: { status: "approved" },
  });
  for (let i = 0; i < 2; i++)
    await api(i, { action: "consent", roomId: room, consent: true });
  await api(0, {
    action: "host_update",
    roomId: room,
    patch: { status: "live", transcribing: true },
  });
  const helper = ts.transpileModule(
    await readFile("src/lib/sessions/pcm.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY }
      : undefined,
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${process.env.SYRKA_QA_AUDIO || "/tmp/syrka-meeting-test.wav"}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ permissions: ["microphone"] });
    const page = await context.newPage();
    await page.route("**/workspace/qa-speech-capture", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<button>Capture consenting QA audio</button>",
      }),
    );
    await page.goto(target + "/workspace/qa-speech-capture");
    await page.addScriptTag({ content: "window.exports={};" + helper });
    await page.evaluate(
      ({ target, token, room, index }) => {
        window.__capture = { batches: [], states: [], sent: 0 };
        document.querySelector("button").onclick = async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
            });
            window.__qaStream = stream;
            const stop = await window.exports.capturePcm(
              stream.getAudioTracks()[0],
              async (blob, start, end) => {
                if (window.__capture.sent >= 2) return;
                window.__capture.sent++;
                if (window.__capture.sent === 2) {
                  window.__qaStop?.();
                  stream.getTracks().forEach((t) => t.stop());
                }
                try {
                  const signal = new Int16Array(await blob.arrayBuffer()).some(
                    (v) => v !== 0,
                  );
                  const form = new FormData();
                  form.set("roomId", room);
                  form.set("start_ms", String(index * 20000 + start));
                  form.set("end_ms", String(index * 20000 + end));
                  form.set("language", "en");
                  form.set("request_id", crypto.randomUUID());
                  form.set("audio", blob, "microphone.pcm");
                  const r = await fetch(target + "/workspace/api/sessions", {
                    method: "POST",
                    headers: { Authorization: "Bearer " + token },
                    body: form,
                  });
                  const d = await r.json();
                  window.__capture.batches.push({
                    status: r.status,
                    bytes: blob.size,
                    nonzero_audio: signal,
                    received_bytes: d.audio_bytes,
                    characters: d.characters,
                    saved_segments: d.saved_segments,
                    asr: d.asr,
                    error: r.ok ? undefined : d.error,
                  });
                } catch (e) {
                  window.__capture.error = e.message;
                }
              },
              new Date().toISOString(),
              (state) => window.__capture.states.push(state),
            );
            window.__qaStop = stop;
          } catch (e) {
            window.__capture.error = e.message;
          }
        };
      },
      { target, token: actors[i].session.access_token, room, index: i },
    );
    await page
      .getByRole("button", { name: "Capture consenting QA audio" })
      .click();
    await page.waitForFunction(
      () => window.__capture.error || window.__capture.batches.length >= 2,
      {},
      { timeout: 50000 },
    );
    await page.evaluate(() => {
      window.__qaStop?.();
      window.__qaStream?.getTracks().forEach((t) => t.stop());
    });
    const sample = await page.evaluate(() => window.__capture);
    if (sample.error) throw Error("Browser capture failed: " + sample.error);
    check(
      "Actual browser worklet microphone batches reach ASR for QA identity " +
        (i + 1),
      sample.states.includes("running") &&
        sample.batches.length >= 2 &&
        sample.batches.every(
          (b) => b.status === 200 && b.nonzero_audio && b.bytes === 128000,
        ),
    );
    result.batches.push({ participant: i + 1, ...sample });
    await context.close();
  }
  let snapshot = await api(0, null, room);
  check(
    "Both authenticated microphone owners have persisted recognized speech",
    snapshot.segments.length >= 2 &&
      new Set(snapshot.segments.map((s) => s.speaker_id)).size === 2,
  );
  result.transcript = {
    segments: snapshot.segments.length,
    characters: snapshot.segments.reduce(
      (n, s) => n + s.original_text.length,
      0,
    ),
    sha256: createHash("sha256")
      .update(snapshot.segments.map((s) => s.original_text).join("\n"))
      .digest("hex"),
  };
  check(
    "Unshared transcript remains private",
    (await api(1, null, room)).segments.length === 0,
  );
  await api(0, {
    action: "host_update",
    roomId: room,
    patch: { transcript_published: true },
  });
  const shared = await api(1, null, room);
  check(
    "Authorized shared transcript retrieval works",
    snapshot.segments.every((s) => shared.segments.some((t) => t.id === s.id)),
  );
  const guestRequest = async (data, cookie) => {
    const r = await fetch(target + "/workspace/api/sessions/guest", {
      method: data ? "POST" : "GET",
      headers: {
        Origin: target,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify({ roomId: room, ...data }) } : {}),
    });
    return { r, body: await r.json() };
  };
  const request = await guestRequest(
    { action: "request_join", display_name: "QA scoped guest" },
    undefined,
  );
  const cookie = request.r.headers.get("set-cookie")?.split(";")[0];
  if (!request.r.ok || !cookie) throw Error("QA scoped guest request failed");
  const guestId = request.body.user_id;
  await api(0, {
    action: "member_update",
    roomId: room,
    user_id: guestId,
    guest_identity: true,
    patch: { status: "approved" },
  });
  const consent = await guestRequest(
    { action: "consent", consent: true },
    cookie,
  );
  check("Account-free guest explicitly consents", consent.r.ok);
  await api(0, {
    action: "host_update",
    roomId: room,
    patch: { transcribing: true },
  });
  const form = new FormData();
  const pcm = await readFile(
    process.env.SYRKA_QA_PCM || "/tmp/syrka-meeting-test.pcm",
  );
  form.set("roomId", room);
  form.set("start_ms", "40000");
  form.set("end_ms", "44000");
  form.set("language", "en");
  form.set("request_id", randomUUID());
  form.set(
    "audio",
    new Blob([pcm.subarray(0, 128000)], { type: "audio/pcm" }),
    "guest.pcm",
  );
  const gr = await fetch(target + "/workspace/api/sessions/guest", {
    method: "POST",
    headers: { Origin: target, Cookie: cookie },
    body: form,
  });
  const gd = await gr.json();
  check("Actual scoped guest ASR accepts consented speech", gr.ok);
  result.guest_audio = {
    http: gr.status,
    received_bytes: gd.audio_bytes,
    characters: gd.characters,
    saved_segments: gd.saved_segments,
    asr: gd.asr,
  };
  const withGuest = await api(0, null, room);
  check(
    "Guest speech persisted with scoped microphone-owner attribution",
    withGuest.segments.some(
      (s) => s.guest_speaker_id === guestId && s.original_text.length > 0,
    ),
  );
  const guestView = await fetch(
    target + "/workspace/api/sessions/guest?id=" + room,
    { headers: { Cookie: cookie } },
  );
  const guestBody = await guestView.json();
  check(
    "Account-free guest cannot retrieve private transcript or notes",
    guestView.ok && guestBody.segments.length === 0 && !guestBody.note,
  );
  const job = await api(0, {
    action: "process",
    roomId: room,
    kind: "notes",
    request_id: randomUUID(),
  });
  let done = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    snapshot = await api(0, null, room);
    const j = snapshot.jobs.find((j) => j.id === job.job_id);
    if (j?.state === "failed") throw Error("Notes failed: " + j.error);
    if (j?.state === "done") {
      done = !!snapshot.note?.body.overview?.length;
      break;
    }
  }
  check(
    "qwen3.8-flash notes generated from browser-captured speech and saved",
    done,
  );
  result.notes = {
    overview: snapshot.note.body.overview.length,
    topics: snapshot.note.body.topics.length,
    actions: snapshot.note.body.actions.length,
  };
  const view = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await view.addInitScript(
    ({ session, origin }) => {
      if (location.origin === origin)
        localStorage.setItem(
          "sb-zguejzlseldovdssiumn-auth-token",
          JSON.stringify(session),
        );
    },
    { session: actors[0].session, origin: new URL(target).origin },
  );
  const screen = await view.newPage();
  await screen.goto(target + "/workspace/sessions/meeting/" + room, {
    waitUntil: "domcontentloaded",
  });
  await screen
    .getByRole("heading", { name: "Live Transcript", exact: true })
    .waitFor({ timeout: 30000 });
  await screen
    .locator(".session-tabs")
    .getByRole("button", { name: "Notes", exact: true })
    .click();
  await screen
    .getByRole("heading", { name: "Overview", exact: true })
    .waitFor();
  check(
    "Actual saved transcript and Qwen notes reopen in authenticated Workspace UI",
    (await screen
      .getByRole("log", { name: "Live transcript segments" })
      .locator("article")
      .count()) > 0,
  );
  await screen.locator(".speech-consent-details>summary").click();
  result.layouts = [];
  for (const width of [390, 1440]) {
    await screen.setViewportSize({ width, height: 844 });
    const overflow = await screen.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    result.layouts.push({ width, overflow });
    check("Authenticated transcript/notes UI fits " + width + "px", !overflow);
  }
  await view.close();
  await guestRequest({ action: "consent", consent: false }, cookie);
  form.set("request_id", randomUUID());
  const deniedGuest = await fetch(target + "/workspace/api/sessions/guest", {
    method: "POST",
    headers: { Origin: target, Cookie: cookie },
    body: form,
  });
  check(
    "Guest revocation prevents new external speech processing",
    [400, 403].includes(deniedGuest.status),
  );
  await api(1, { action: "consent", roomId: room, consent: false });
  form.set("request_id", randomUUID());
  const deniedMember = await fetch(target + "/workspace/api/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + actors[0].session.access_token },
    body: form,
  });
  check(
    "Signed-in member revocation blocks all new ASR",
    [400, 403].includes(deniedMember.status),
  );
  check(
    "Revocation leaves the existing transcript intact",
    (await api(0, null, room)).segments.length === withGuest.segments.length,
  );
  result.status = "PASS";
} catch (e) {
  result.status = "FAIL";
  result.error = e.message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (room) {
    try {
      await api(0, {
        action: "host_update",
        roomId: room,
        patch: { status: "ended" },
      });
      await api(0, { action: "delete", roomId: room });
      result.cleanup = "Own QA meeting removed";
    } catch {
      result.cleanup = "Own QA cleanup required";
    }
  }
  result.checked_at = new Date().toISOString();
  await writeFile(
    "/tmp/syrka-browser-asr-acceptance.json",
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: result.status,
      error: result.error,
      checks: result.checks,
      transcript: result.transcript,
      notes: result.notes,
      cleanup: result.cleanup,
    }),
  );
}
