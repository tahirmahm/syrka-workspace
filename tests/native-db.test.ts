import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
test("Native RLS, immutable schemas, signed admission, atomic limits and reminder deduplication", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const a = "10000000-0000-4000-8000-000000000001",
    b = "10000000-0000-4000-8000-000000000002",
    c = "20000000-0000-4000-8000-000000000001",
    f = "30000000-0000-4000-8000-000000000001",
    token = "40000000-0000-4000-8000-000000000001",
    event = "50000000-0000-4000-8000-000000000001";
  await db.exec(
    `create role authenticated;create role anon;alter default privileges in schema public grant all on tables to anon,authenticated;alter default privileges in schema public grant execute on functions to anon,authenticated;create schema auth;create schema extensions;create extension pgcrypto with schema extensions;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid()to authenticated,anon;insert into auth.users values('${a}'),('${b}');`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101014831_native_calendar_forms.sql",
      "utf8",
    ),
  );
  await db.exec(
    `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant insert,select,delete on storage.objects to anon,authenticated;`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101045155_native_uploads_reminders.sql",
      "utf8",
    ).split("-- Hosted scheduling")[0],
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101050433_native_audit_counts.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101051240_native_privilege_hardening.sql",
      "utf8",
    ),
  );
  await db.query(
    `insert into native_private.keys values('v1','test-only-signing-key')`,
  );
  const as = async (id: string | null) =>
    db.exec(
      `reset role;set request.jwt.claim.sub='${id || ""}';set role ${id ? "authenticated" : "anon"};`,
    );
  const call = async (p: Record<string, unknown>) => {
    const payload = JSON.stringify({ ...p, ts: Date.now() / 1000 });
    return db.query<{ value: unknown }>(
      "select public.native_broker($1,$2)as value",
      [
        payload,
        createHmac("sha256", "test-only-signing-key")
          .update(payload)
          .digest("hex"),
      ],
    );
  };
  await as(a);
  await db.query(
    `insert into native_calendars(id,owner_id,name)values($1,$2,'Personal')`,
    [c, a],
  );
  await db.query(
    `insert into native_events(id,owner_id,calendar_id,data)values($1,$2,$3,'{"visibility":"calendar"}')`,
    [event, a, c],
  );
  const schema = {
    title: "Private research",
    description: "",
    confirmation: "Thank you",
    questions: [
      {
        id: event,
        type: "short",
        title: "Question",
        required: true,
        correct: "secret answer",
      },
    ],
  };
  await db.query(
    `insert into native_forms(id,owner_id,title,draft,public_token,max_responses)values($1,$2,'Private research',$3,$4,1)`,
    [f, a, schema, token],
  );
  await as(b);
  expect((await db.query("select * from native_events")).rows).toHaveLength(0);
  expect((await db.query("select * from native_forms")).rows).toHaveLength(0);
  await expect(
    db.query(
      `insert into native_events(id,owner_id,calendar_id,data)values(gen_random_uuid(),$1,$2,'{}')`,
      [b, c],
    ),
  ).rejects.toThrow();
  await expect(db.query("select * from native_private.keys")).rejects.toThrow();
  await as(null);
  await expect(db.query("select * from native_forms")).rejects.toThrow();
  await expect(
    db.query("select native_calendar_role(gen_random_uuid())"),
  ).rejects.toThrow();
  await expect(db.query(`select native_broker('{}','forged')`)).rejects.toThrow(
    "authorization",
  );
  const published = await call({
    op: "publish",
    form_id: f,
    user_id: a,
    revision: 0,
    schema,
  });
  const version = (published.rows[0].value as { id: string }).id;
  await as(a);
  await expect(
    db.query(`update native_form_versions set schema='{}'where id=$1`, [
      version,
    ]),
  ).rejects.toThrow();
  await as(null);
  const payload = {
    op: "submit",
    token,
    version_id: version,
    response_id: "60000000-0000-4000-8000-000000000001",
    answers: { [event]: "حسن" },
    receipt_hash: "abc",
    client_hash: "qa",
    user_id: null,
    score: null,
  };
  await call(payload);
  await call(payload);
  await expect(
    call({ ...payload, response_id: "60000000-0000-4000-8000-000000000002" }),
  ).rejects.toThrow("limit");
  await as(b);
  expect((await db.query("select * from native_responses")).rows).toHaveLength(
    0,
  );
  await as(a);
  expect((await db.query("select * from native_responses")).rows).toHaveLength(
    1,
  );
  await as(null);
  await call({
    op: "reminder_seed",
    event_id: event,
    user_id: a,
    jobs: [
      {
        occurrence: "2026-11-01T09:00",
        due_at: "2026-01-01T00:00:00Z",
        title: "Reminder",
      },
    ],
  });
  await db.exec("reset role");
  await db.query("select native_private.deliver_reminders()");
  await db.query("select native_private.deliver_reminders()");
  expect(
    (await db.query("select * from native_notifications")).rows,
  ).toHaveLength(1);
  await as(b);
  expect(
    (await db.query("select * from native_notifications")).rows,
  ).toHaveLength(0);
  await as(null);
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name)values('office-form-uploads','forged.pdf')",
    ),
  ).rejects.toThrow();
  await expect(db.query("select * from native_attachments")).rejects.toThrow();
  await db.close();
}, 30000);
