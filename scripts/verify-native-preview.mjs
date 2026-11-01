/** Real-service acceptance. Requires isolated QA actors provisioned by the operator; never logs credentials. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
import ExcelJS from "exceljs";
const target = process.env.SYRKA_PREVIEW_URL || "http://127.0.0.1:3000",
  fixture = JSON.parse(
    await fs.readFile(
      process.env.SYRKA_QA_ACTORS_FILE || "/tmp/syrka-native-actors.json",
      "utf8",
    ),
  );
const local = await fs.readFile(".env.local", "utf8");
const env = Object.fromEntries(
  local
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL,
  key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(url).hostname, "zguejzlseldovdssiumn.supabase.co");
const report = { target, checks: {}, fixture_ids: {}, ai: {} };
async function json(endpoint, method = "GET", body, access) {
  const res = await fetch(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(endpoint.startsWith(url) ? { apikey: key } : {}),
      ...(access ? { Authorization: "Bearer " + access } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const value = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, value };
}
async function db(path, method = "GET", body, actor = 0) {
  const r = await json(
    url + "/rest/v1/" + path,
    method,
    body,
    fixture.actors[actor].session.access_token,
  );
  assert(
    r.ok,
    `Database request failed (${r.status}): ${JSON.stringify(r.value)}`,
  );
  return r.value;
}
for (const actor of fixture.actors) {
  const r = await json(url + "/auth/v1/token?grant_type=password", "POST", {
    email: actor.email,
    password: actor.password,
  });
  assert(r.ok, "QA sign-in failed");
  actor.session = r.value;
}
await fs.writeFile(
  process.env.SYRKA_QA_ACTORS_FILE || "/tmp/syrka-native-actors.json",
  JSON.stringify(fixture),
  { mode: 0o600 },
);
const owner = fixture.actors[0],
  calendarId = randomUUID(),
  eventId = randomUUID(),
  formId = randomUUID(),
  token = randomUUID();
report.fixture_ids = { calendarId, eventId, formId };
await fs.writeFile(
  "/tmp/syrka-native-service-report.json",
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
await db("native_calendars", "POST", {
  id: calendarId,
  owner_id: owner.id,
  name: "QA University",
  colour: "#5379b8",
  time_zone: "Europe/Prague",
  is_default: true,
});
const due = new Date(Math.ceil(Date.now() / 60000) * 60000 + 60000);
const data = {
  id: eventId,
  calendar_id: calendarId,
  title: "QA scheduled reminder",
  description: "Synthetic acceptance event",
  start_local: due.toISOString().slice(0, 16),
  end_local: new Date(+due + 3600000).toISOString().slice(0, 16),
  time_zone: "UTC",
  all_day: false,
  location: "",
  meeting_url: "",
  attendees: [],
  category: "class",
  visibility: "private",
  recurrence: null,
  references: [],
  reminders: [0],
  dst_policy: "earlier",
  source: null,
  revision: 0,
};
await db("native_events", "POST", {
  id: eventId,
  calendar_id: calendarId,
  owner_id: owner.id,
  data,
  revision: 0,
});
let r = await json(
  target + "/workspace/api/native/calendar",
  "POST",
  { id: eventId },
  owner.session.access_token,
);
assert(r.ok, `Reminder seed failed: ${JSON.stringify(r.value)}`);
report.checks.reminder_seed = r.value;
const hidden = await db(`native_events?id=eq.${eventId}`, "GET", undefined, 1);
assert.equal(hidden.length, 0);
report.checks.calendar_cross_account = "passed";
await db("native_calendar_shares", "POST", {
  calendar_id: calendarId,
  user_id: fixture.actors[1].id,
  role: "viewer",
});
assert.equal(
  (await db(`native_events?id=eq.${eventId}`, "GET", undefined, 1)).length,
  0,
);
report.checks.shared_private_event_hidden = "passed";
const q1 = randomUUID(),
  q2 = randomUUID(),
  q3 = randomUUID();
const question = (id, type, title, extra = {}) => ({
  id,
  type,
  title,
  description: "",
  required: true,
  options: ["Student", "Employer"],
  rows: [],
  min: null,
  max: null,
  show_if: null,
  points: 0,
  ...extra,
});
let schema = {
  title: "QA University registration",
  description: "Synthetic acceptance form. No real applicant data.",
  questions: [
    question(q1, "single", "Role"),
    question(q2, "short", "Study programme", {
      show_if: { question: q1, operator: "equals", value: "Student" },
    }),
    question(q3, "file", "Supporting note"),
  ],
  confirmation: "Your QA response was saved.",
  quiz: false,
};
let form = {
  id: formId,
  owner_id: owner.id,
  title: schema.title,
  draft: schema,
  revision: 0,
  status: "draft",
  public_token: token,
  access: "public",
  max_responses: 2,
  one_per_user: false,
};
await db("native_forms", "POST", form);
r = await json(
  target + "/workspace/api/native/forms",
  "POST",
  { form_id: formId, revision: 0 },
  owner.session.access_token,
);
assert(r.ok, `Publish failed: ${JSON.stringify(r.value)}`);
const version = r.value.version.id;
report.checks.publish = "passed";
r = await json(target + "/workspace/api/native/public?token=" + token);
assert(r.ok, "Anonymous form load failed");
assert.equal(r.value.schema.questions[0].correct, undefined);
report.checks.public_without_account = "passed";
const identity = {
  response_id: randomUUID(),
  receipt: randomBytes(32).toString("hex"),
};
const upload = new FormData();
upload.set(
  "file",
  new File(["Synthetic QA attachment."], "qa-note.txt", { type: "text/plain" }),
);
upload.set("token", token);
upload.set("question_id", q3);
upload.set("answers", JSON.stringify({ [q1]: "Student" }));
upload.set("response_id", identity.response_id);
upload.set("receipt", identity.receipt);
const uploaded = await fetch(target + "/workspace/api/native/upload", {
  method: "POST",
  body: upload,
});
const attachment = await uploaded.json();
assert(uploaded.ok, `Upload failed: ${JSON.stringify(attachment)}`);
report.checks.private_upload = "passed";
const submission = {
  token,
  version_id: version,
  ...identity,
  answers: {
    [q1]: "Student",
    [q2]: "Economics / اردو / العربية",
    [q3]: attachment.id,
  },
  website: "",
};
r = await json(target + "/workspace/api/native/public", "POST", submission);
assert(r.ok, `Public response failed: ${JSON.stringify(r.value)}`);
r = await json(target + "/workspace/api/native/public", "POST", submission);
assert(r.ok, "Duplicate retry should return same receipt");
const stored = await db(`native_responses?form_id=eq.${formId}`);
assert.equal(stored.length, 1);
assert.equal(stored[0].answers[q2], submission.answers[q2]);
assert.equal(
  (await db(`native_responses?form_id=eq.${formId}`, "GET", undefined, 1))
    .length,
  0,
);
report.checks.public_submission_retry_and_isolation = "passed";
const stolen = await json(target + "/workspace/api/native/public", "POST", {
  ...submission,
  response_id: randomUUID(),
  receipt: randomBytes(32).toString("hex"),
});
assert.equal(stolen.ok, false);
report.checks.cross_response_attachment_rejected = "passed";
schema = {
  ...schema,
  title: "QA Registration version two",
  questions: schema.questions.map((q) =>
    q.id === q2 ? { ...q, title: "Reworded study programme" } : q,
  ),
};
await db("native_forms?id=eq." + formId, "PATCH", {
  draft: schema,
  title: schema.title,
  revision: 1,
});
r = await json(
  target + "/workspace/api/native/forms",
  "POST",
  { form_id: formId, revision: 1 },
  owner.session.access_token,
);
assert(r.ok, "Second publish failed");
assert.notEqual(r.value.version.id, version);
const old = await db("native_form_versions?id=eq." + version);
assert.equal(old[0].schema.questions[1].title, "Study programme");
report.checks.immutable_historical_version = "passed";
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Europe/Prague",
  });
  await context.addInitScript(
    ({ session }) =>
      localStorage.setItem(
        "sb-zguejzlseldovdssiumn-auth-token",
        JSON.stringify(session),
      ),
    { session: owner.session },
  );
  const page = await context.newPage();
  await page.goto(target + "/workspace/forms/" + formId + "/responses");
  await page
    .getByRole("combobox", { name: "Response schema version" })
    .selectOption(version);
  await page.getByRole("button", { name: "XLSX", exact: true }).waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "XLSX", exact: true }).click();
  const download = await downloadPromise;
  const destination = "/tmp/syrka-native-qa.xlsx";
  await download.saveAs(destination);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(destination);
  assert.equal(
    workbook.worksheets[0].getCell("A2").value,
    identity.response_id,
  );
  report.checks.xlsx_reopened_with_actual_response = "passed";
  await page.screenshot({
    path: "docs/native/images/responses-live-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Copy snapshot to Tables" }).click();
  await page.waitForURL(/\/workspace\?file=|\/workspace$/);
  await page.getByText("Import CSV", { exact: true }).waitFor();
  report.checks.tables_snapshot_opened = "passed";
  await page.screenshot({
    path: "docs/native/images/tables-live-snapshot.png",
    fullPage: true,
  });
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const gp = await guest.newPage();
  await gp.goto(target + "/workspace/respond/" + token);
  await gp.getByRole("radio", { name: "Employer", exact: true }).check();
  await gp.screenshot({
    path: "docs/native/images/respond-live-mobile.png",
    fullPage: true,
  });
  report.checks.mobile_public_respondent = "passed";
  assert.equal(
    await gp.evaluate(() =>
      localStorage.getItem("sb-zguejzlseldovdssiumn-auth-token"),
    ),
    null,
  );
  await gp
    .getByLabel("Supporting note", { exact: true })
    .setInputFiles({
      name: "guest-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Second synthetic QA attachment."),
    });
  await gp.getByText("Uploaded: guest-note.txt", { exact: false }).waitFor();
  await gp
    .getByRole("button", { name: "Submit response", exact: true })
    .click();
  await gp
    .getByRole("heading", { name: "Response received", exact: true })
    .waitFor();
  report.checks.account_free_mobile_ui_submission = "passed";
  await gp.screenshot({
    path: "docs/native/images/respond-live-mobile-receipt.png",
    fullPage: true,
  });
  await guest.close();
  await context.close();
} finally {
  await browser.close();
}
if (process.env.SYRKA_TEST_AI === "true") {
  for (const action of ["calendar", "form"]) {
    const body =
      action === "calendar"
        ? {
            action,
            consent: true,
            prompt:
              "Propose one one-hour study session tomorrow at 14:00, and no other events.",
            date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            zone: "Europe/Prague",
          }
        : {
            action,
            consent: true,
            prompt:
              "Create a two-question university event registration form with name and email only.",
          };
    const result = await json(
      target + "/workspace/api/native/ai",
      "POST",
      body,
      owner.session.access_token,
    );
    report.ai[action] = {
      status: result.status,
      model: result.value.model || null,
      validated: result.ok,
      error: result.value.error || null,
    };
  }
}
report.checks.reminder_due_at = due.toISOString();
await fs.writeFile(
  "/tmp/syrka-native-service-report.json",
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(report, null, 2));
