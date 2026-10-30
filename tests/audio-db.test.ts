import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
test("private audio imports require current host ownership and idempotent file jobs", async () => {
  const db = new PGlite();
  const a = "10000000-0000-4000-8000-000000000001",
    b = "10000000-0000-4000-8000-000000000002";
  await db.exec(
    `create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid()to authenticated;insert into auth.users values('${a}'),('${b}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter(
      (f) =>
        f.endsWith("_sessions_notes.sql") ||
        f.endsWith("_sessions_audio_jobs.sql"),
    )
    .sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  const as = async (id: string) =>
    db.exec(
      `reset role;set request.jwt.claim.sub='${id}';set role authenticated;`,
    );
  await as(a);
  const room = (
    await db.query<{ id: string }>(
      `insert into session_rooms(owner_id,title)values('${a}','Audio import test')returning id`,
    )
  ).rows[0].id;
  const path = `${a}/${room}/test.wav`;
  await db.exec(
    `insert into storage.objects(bucket_id,name)values('session-audio','${path}')`,
  );
  const first = (
    await db.query(`select session_reserve_filetrans('${room}','file1')id`)
  ).rows;
  expect(
    (await db.query(`select session_reserve_filetrans('${room}','file1')id`))
      .rows,
  ).toEqual(first);
  await as(b);
  expect((await db.query(`select * from storage.objects`)).rows).toHaveLength(
    0,
  );
  await expect(
    db.exec(
      `insert into storage.objects(bucket_id,name)values('session-audio','${b}/${room}/forged.wav')`,
    ),
  ).rejects.toThrow();
  await expect(
    db.query(`select session_reserve_filetrans('${room}','stolen')`),
  ).rejects.toThrow(/host/);
  await db.query(`select session_request_join('${room}','Participant')`);
  await as(a);
  await db.exec(
    `update session_members set status='approved'where user_id='${b}'`,
  );
  await as(b);
  await expect(
    db.exec(
      `insert into storage.objects(bucket_id,name)values('session-audio','${b}/${room}/member.wav')`,
    ),
  ).rejects.toThrow();
  await as(a);
  await db.exec(`delete from storage.objects where name='${path}'`);
  expect((await db.query(`select * from storage.objects`)).rows).toHaveLength(
    0,
  );
  await db.close();
});
