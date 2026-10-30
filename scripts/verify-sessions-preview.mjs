/** Operator-only real Preview acceptance. Supply private QA fixtures; never target production. */
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { request, chromium } from "@playwright/test";
const target = process.env.SYRKA_PREVIEW_URL,
  expected = process.env.SYRKA_EXPECTED_SHA;
if (!target || !expected || !new URL(target).hostname.endsWith(".vercel.app"))
  throw Error(
    "Specify the exact Git-linked Preview URL and expected commit SHA.",
  );
process.loadEnvFile(
  process.env.SYRKA_PREVIEW_ENV_FILE || "/tmp/syrka-workspace-browser.local",
);
const oidc = process.env.VERCEL_OIDC_TOKEN;
if (!oidc)
  throw Error("Refresh the project-scoped development OIDC credential.");
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
  throw Error("Supply exactly two isolated verified QA actors.");
const wav = await readFile(
    process.env.SYRKA_QA_AUDIO || "/tmp/syrka-meeting-test.wav",
  ),
  pcm = await readFile(
    process.env.SYRKA_QA_PCM || "/tmp/syrka-meeting-test.pcm",
  );
const result = {
  url: target,
  expectedSha: expected,
  rooms: [],
  checks: [],
  media: "not verified by this API/audio acceptance harness",
};
const clients = await Promise.all(
  actors.map((actor) =>
    request.newContext({
      baseURL: target,
      extraHTTPHeaders: {
        Authorization: `Bearer ${actor.session.access_token}`,
        "x-vercel-trusted-oidc-idp-token": oidc,
      },
      proxy: process.env.HTTPS_PROXY
        ? { server: process.env.HTTPS_PROXY }
        : undefined,
      timeout: 90000,
    }),
  ),
);
const api = async (index, payload, id) => {
  const response = payload
    ? await clients[index].post("/workspace/api/sessions", { data: payload })
    : await clients[index].get(
        "/workspace/api/sessions" + (id ? "?id=" + id : ""),
      );
  const data = await response
    .json()
    .catch(() => ({ error: "Non-JSON response; check Preview protection" }));
  if (!response.ok())
    throw Error(
      `Sessions API ${response.status()}: ${data.error || "request failed"}`,
    );
  return data;
};
const check = (name, ok) => {
  if (!ok) throw Error("Acceptance failed: " + name);
  result.checks.push(name);
  console.log(name + ": PASS");
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const create = async (title) => {
  const data = await api(0, {
    action: "create",
    data: {
      title,
      starts_at: new Date().toISOString(),
      timezone: "Europe/Prague",
      description:
        "Isolated fictional QA recording; safe to remove with this fixture.",
    },
  });
  const id = data.rooms[0].id;
  result.rooms.push(id);
  return id;
};
const notes = async (room) => {
  const job = await api(0, {
    action: "process",
    roomId: room,
    kind: "notes",
    request_id: randomUUID(),
  });
  for (let i = 0; i < 36; i++) {
    await wait(2500);
    const snap = await api(0, null, room);
    const record = snap.jobs.find((j) => j.id === job.job_id);
    if (record?.state === "failed")
      throw Error("Actual notes provider failed: " + record.error);
    if (record?.state === "done") {
      check(
        "Actual Qwen structured notes persisted",
        !!snap.note?.body.overview?.length,
      );
      return snap;
    }
  }
  throw Error("Notes processing exceeded the acceptance deadline.");
};
let browser;
try {
  const root = await api(0);
  check(
    "Preview SHA matches the requested Git commit",
    root.deployment_sha === expected,
  );
  console.log("Preview capabilities:", JSON.stringify(root.capabilities));
  check(
    "Preview has real AI, speech and development media capability",
    root.capabilities.ai && root.capabilities.stt && root.capabilities.video,
  );
  const room = await create("QA fictional uploaded meeting");
  const foreign = await clients[1].get("/workspace/api/sessions?id=" + room);
  check("User B cannot read user A private meeting", foreign.status() === 404);
  const prepared = await api(0, {
    action: "prepare_audio",
    roomId: room,
    size: wav.length,
    extension: "wav",
    confirmed: true,
  });
  const uploaded = await fetch(prepared.url, {
    method: "PUT",
    headers: { "Content-Type": "audio/wav" },
    body: wav,
  });
  check("Real audio uploaded to private storage", uploaded.ok);
  const queued = await api(0, {
    action: "transcribe_uploaded",
    roomId: room,
    path: prepared.path,
    language: "en",
    confirmed: true,
    request_id: randomUUID(),
  });
  let imported;
  for (let i = 0; i < 48; i++) {
    await wait(2500);
    const polled = await api(0, {
      action: "poll_uploaded",
      roomId: room,
      job_id: queued.job_id,
    });
    if (polled.state === "done") {
      imported = await api(0, null, room);
      break;
    }
    if (polled.state === "failed") throw Error("File transcription failed.");
  }
  check(
    "Actual qwen3-asr-flash-filetrans response saved sentence timestamps",
    !!imported?.segments.length &&
      imported.segments.every((s) => s.end_ms > s.start_ms),
  );
  check(
    "Uploaded speaker identities remain unverified",
    imported.segments.every((s) => s.speaker_id === null),
  );
  check(
    "Real speech content recognized",
    /research|draft|friday|fictional/i.test(
      imported.segments.map((s) => s.original_text).join(" "),
    ),
  );
  const saved = await notes(room);
  result.uploadedTranscriptHash = createHash("sha256")
    .update(JSON.stringify(saved.segments))
    .digest("hex");
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY }
      : undefined,
  });
  const context = await browser.newContext();
  await context.route(new URL(target).origin + "/**", (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        "x-vercel-trusted-oidc-idp-token": oidc,
      },
    }),
  );
  await context.addInitScript(
    ({ session, origin }) => {
      if (location.origin === origin) {
        localStorage.setItem(
          "sb-zguejzlseldovdssiumn-auth-token",
          JSON.stringify(session),
        );
        sessionStorage.removeItem("syrka-workspace-demo");
      }
    },
    { session: actors[0].session, origin: new URL(target).origin },
  );
  const page = await context.newPage();
  await page.goto(
    target + "/workspace/tools/sessions/meeting/" + room + "?view=notes",
  );
  await page
    .getByRole("heading", { name: "Overview", exact: true })
    .waitFor({ timeout: 30000 });
  check("Saved real notes appear in the Workspace Notes interface", true);
  const live = await create("QA fictional consenting live audio");
  await api(1, {
    action: "request_join",
    roomId: live,
    display_name: "QA participant B",
  });
  await api(0, {
    action: "member_update",
    roomId: live,
    user_id: actors[1].id,
    patch: { status: "approved" },
  });
  await api(0, {
    action: "host_update",
    roomId: live,
    patch: { status: "live", transcribing: true },
  });
  await api(0, { action: "consent", roomId: live, consent: true });
  const batch = {
    roomId: live,
    start_ms: "0",
    end_ms: "4000",
    language: "en",
    request_id: randomUUID(),
    audio: {
      name: "microphone.pcm",
      mimeType: "audio/pcm",
      buffer: pcm.subarray(0, 128000),
    },
  };
  const denied = await clients[0].post("/workspace/api/sessions", {
    multipart: batch,
  });
  check("No live recognition before all participants consent", !denied.ok());
  await api(1, { action: "consent", roomId: live, consent: true });
  for (let offset = 0; offset < pcm.length; offset += 128000) {
    const part = pcm.subarray(offset, offset + 128000);
    if (part.length < 3200) break;
    const response = await clients[0].post("/workspace/api/sessions", {
      multipart: {
        roomId: live,
        start_ms: String(Math.floor(offset / 32)),
        end_ms: String(Math.floor((offset + part.length) / 32)),
        language: "en",
        request_id: randomUUID(),
        audio: { name: "microphone.pcm", mimeType: "audio/pcm", buffer: part },
      },
    });
    const data = await response.json();
    if (!response.ok())
      throw Error("Actual realtime ASR failed: " + data.error);
  }
  const snap = await api(0, null, live);
  check(
    "Actual qwen3-asr-flash-realtime result persisted with own-track attribution",
    snap.segments.length > 0 &&
      snap.segments.every((s) => s.speaker_id === actors[0].id),
  );
  await notes(live);
  await api(1, { action: "consent", roomId: live, consent: false });
  const revoked = await clients[0].post("/workspace/api/sessions", {
    multipart: { ...batch, request_id: randomUUID() },
  });
  check(
    "Consent revocation blocks subsequent live speech processing",
    !revoked.ok(),
  );
  result.status = "PASS_AUDIO_NOTES_AND_SECURITY";
} catch (error) {
  result.status = "FAILED_OR_BLOCKED";
  result.error = String(error.message).slice(0, 600);
  console.error(result.error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.all(clients.map((c) => c.dispose()));
  await writeFile(
    "/tmp/syrka-sessions-preview-acceptance.json",
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: result.status,
      checks: result.checks,
      media: result.media,
    }),
  );
}
