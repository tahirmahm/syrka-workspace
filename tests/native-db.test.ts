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
      "supabase/migrations/20261101045048_native_calendar_forms.sql",
      "utf8",
    ),
  );
  await db.exec(
    `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant insert,select,delete on storage.objects to anon,authenticated;`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101045550_native_uploads_reminders.sql",
      "utf8",
    ).split("-- Hosted scheduling")[0],
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101050548_native_audit_counts.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101051340_native_privilege_hardening.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101052203_native_integrity_receipts.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101053552_native_reminder_permissions.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101054511_native_attachment_validation_fix.sql",
      "utf8",
    ),
  );
  await db.exec(
    `create function storage.allow_any_operation(expected_operations text[])returns boolean language sql stable as $$select regexp_replace(coalesce(current_setting('storage.operation',true),''),'^storage\\.','')=any(expected_operations)$$`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101062832_native_storage_cleanup_scope.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101063815_native_calendar_consistency.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261101083121_native_insert_returning_policies.sql",
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
  const call = async (p: Record<string, unknown>, rpc = "native_broker") => {
    const payload = JSON.stringify({ ...p, ts: Date.now() / 1000 });
    return db.query<{ value: unknown }>(`select public.${rpc}($1,$2)as value`, [
      payload,
      createHmac("sha256", "test-only-signing-key")
        .update(payload)
        .digest("hex"),
    ]);
  };
  await as(a);
  expect(
    (
      await db.query<{ id: string }>(
        `insert into native_calendars(id,owner_id,name)values($1,$2,'Personal')returning *`,
        [c, a],
      )
    ).rows[0].id,
  ).toBe(c);
  expect(
    (
      await db.query<{ id: string }>(
        `insert into native_calendars(id,owner_id,name)values($1,$2,'Personal')on conflict(id)do update set name=excluded.name returning *`,
        [c, a],
      )
    ).rows[0].id,
  ).toBe(c);
  expect(
    (
      await db.query<{ id: string }>(
        `insert into native_events(id,owner_id,calendar_id,data)values($1,$2,$3,jsonb_build_object('id',($1::uuid)::text,'calendar_id',($3::uuid)::text,'visibility','calendar'))returning *`,
        [event, a, c],
      )
    ).rows[0].id,
  ).toBe(event);
  const returningEvent = "50000000-0000-4000-8000-000000000003";
  for (const expectedRevision of [0, 1])
    expect(
      (
        await db.query<{ id: string; revision: number }>(
          `insert into native_events(id,owner_id,calendar_id,data)values($1,$2,$3,jsonb_build_object('id',($1::uuid)::text,'calendar_id',($3::uuid)::text,'visibility','private'))on conflict(id)do update set data=excluded.data returning *`,
          [returningEvent, a, c],
        )
      ).rows[0],
    ).toMatchObject({ id: returningEvent, revision: expectedRevision });
  await db.query("delete from native_events where id=$1", [returningEvent]);
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
      `insert into native_events(id,owner_id,calendar_id,data)values($1,$2,$3,jsonb_build_object('id',($1::uuid)::text,'calendar_id',($3::uuid)::text,'visibility','calendar'))returning *`,
      [returningEvent, b, c],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      `insert into native_events(id,owner_id,calendar_id,data)values($1,$2,$3,jsonb_build_object('id',($1::uuid)::text,'calendar_id',($3::uuid)::text,'visibility','calendar'))on conflict(id)do update set data=excluded.data returning *`,
      [event, b, c],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      `insert into native_calendars(id,owner_id,name)values(gen_random_uuid(),$1,'Forged owner')returning *`,
      [a],
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
  const fileId = "80000000-0000-4000-8000-000000000001";
  await call(
    {
      op: "register",
      id: fileId,
      form_id: f,
      version_id: version,
      response_id: payload.response_id,
      question_id: event,
      path: "qa-current-upload.txt",
      filename: "qa.txt",
      mime: "text/plain",
      bytes: 5,
      receipt_hash: "abc",
    },
    "native_attachment_broker",
  );
  await db.query(
    "insert into storage.objects(bucket_id,name)values('office-form-uploads','qa-current-upload.txt')",
  );
  const checked = await call(
    {
      op: "check",
      id: fileId,
      form_id: f,
      version_id: version,
      response_id: payload.response_id,
      question_id: event,
      receipt_hash: "abc",
    },
    "native_attachment_broker",
  );
  expect((checked.rows[0].value as { id: string }).id).toBe(fileId);
  await expect(
    call(
      {
        op: "check",
        id: fileId,
        form_id: f,
        version_id: version,
        response_id: payload.response_id,
        question_id: event,
        receipt_hash: "forged",
      },
      "native_attachment_broker",
    ),
  ).rejects.toThrow("unavailable");
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
    revision: 0,
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
  await as(a);
  await db.query("update native_forms set status='closed'where id=$1", [f]);
  await as(null);
  const recovered = await call(
    {
      op: "receipt",
      token,
      response_id: payload.response_id,
      receipt_hash: "abc",
    },
    "native_receipt_broker",
  );
  expect((recovered.rows[0].value as { id: string }).id).toBe(
    payload.response_id,
  );
  expect(
    (recovered.rows[0].value as { answers?: unknown }).answers,
  ).toBeUndefined();
  expect(
    (
      await call(
        {
          op: "receipt",
          token,
          response_id: payload.response_id,
          receipt_hash: "wrong",
        },
        "native_receipt_broker",
      )
    ).rows[0].value,
  ).toBeNull();
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
  await as(a);
  await db.query("insert into native_calendar_shares values($1,$2,'editor')", [
    c,
    b,
  ]);
  await as(b);
  const sharedEvent = "50000000-0000-4000-8000-000000000002";
  await db.query(
    "insert into native_events(id,owner_id,calendar_id,data)values($1,$2,$3,jsonb_build_object('id',($1::uuid)::text,'calendar_id',($3::uuid)::text,'visibility','private'))",
    [sharedEvent, b, c],
  );
  await as(null);
  await call({
    op: "reminder_seed",
    revision: 0,
    event_id: sharedEvent,
    user_id: b,
    jobs: [
      {
        occurrence: "2026-11-01T10:00",
        due_at: "2026-01-01T00:00:00Z",
        title: "Private shared event",
      },
    ],
  });
  await as(a);
  await db.query(
    "delete from native_calendar_shares where calendar_id=$1 and user_id=$2",
    [c, b],
  );
  await as(null);
  await call({
    op: "reminder_seed",
    revision: 0,
    event_id: sharedEvent,
    user_id: b,
    jobs: [
      {
        occurrence: "2026-11-01T10:00",
        due_at: "2026-01-01T00:00:00Z",
        title: "Must never leak after revocation",
      },
    ],
  });
  await db.exec("reset role");
  await db.query("select native_private.deliver_reminders()");
  await as(b);
  expect(
    (await db.query("select * from native_notifications")).rows,
  ).toHaveLength(0);
  await db.exec("reset role");
  const pending = "70000000-0000-4000-8000-000000000001";
  await db.query(
    "insert into native_attachments(id,form_id,version_id,response_id,question_id,object_path,filename,mime,bytes,receipt_hash,upload_expires,created_at)values($1,$2,$3,gen_random_uuid(),gen_random_uuid(),'unpredictable-qa-orphan.txt','qa.txt','text/plain',5,'qa',now()+interval '1 hour',now()-interval '2 days')",
    [pending, f, version],
  );
  await as(null);
  await db.query(
    "insert into storage.objects(bucket_id,name)values('office-form-uploads','unpredictable-qa-orphan.txt')",
  );
  const garbage = await call({ op: "garbage" }, "native_attachment_broker");
  expect(garbage.rows[0].value).toEqual(["unpredictable-qa-orphan.txt"]);
  await db.exec("set storage.operation='storage.object.list'");
  expect((await db.query("select * from storage.objects")).rows).toHaveLength(
    0,
  );
  await db.exec("set storage.operation='storage.object.get_authenticated'");
  expect((await db.query("select * from storage.objects")).rows).toHaveLength(
    0,
  );
  await db.exec("set storage.operation='storage.object.delete_many'");
  await db.query(
    "delete from storage.objects where name='unpredictable-qa-orphan.txt'",
  );
  await call(
    { op: "cleaned", paths: ["unpredictable-qa-orphan.txt"] },
    "native_attachment_broker",
  );
  expect(
    (await call({ op: "garbage" }, "native_attachment_broker")).rows[0].value,
  ).toEqual([]);
  await as(a);
  await db.query("insert into native_calendar_shares values($1,$2,'viewer')", [
    c,
    b,
  ]);
  await db.query(
    'insert into native_exceptions values($1,\'2026-11-02T09:00\',false,\'{"visibility":"private","title":"Never reveal this title"}\')',
    [event],
  );
  await as(b);
  expect(
    (
      await db.query("select * from native_exceptions where event_id=$1", [
        event,
      ])
    ).rows,
  ).toHaveLength(0);
  const redacted = await db.query<{ cancelled: boolean; override: unknown }>(
    "select * from native_calendar_exceptions()where event_id=$1",
    [event],
  );
  expect(redacted.rows[0]).toMatchObject({ cancelled: true, override: null });
  await as(a);
  await db.query(
    "update native_forms set updated_at='2099-01-01T00:00:00Z'where id=$1",
    [f],
  );
  const modified = await db.query<{ updated_at: Date }>(
    "select updated_at from native_forms where id=$1",
    [f],
  );
  expect(new Date(modified.rows[0].updated_at).getUTCFullYear()).toBe(
    new Date().getUTCFullYear(),
  );
  await as(null);
  await expect(
    call({
      op: "reminder_seed",
      event_id: event,
      user_id: a,
      revision: 0,
      jobs: [],
    }),
  ).rejects.toThrow("changed");
  await as(a);
  await db.query("select native_default_calendar($1)", [c]);
  expect(
    (
      await db.query<{ is_default: boolean }>(
        "select is_default from native_calendars where id=$1",
        [c],
      )
    ).rows[0].is_default,
  ).toBe(true);
  await db.close();
}, 30000);
