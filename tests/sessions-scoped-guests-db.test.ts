import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
test("scoped guests use no Auth identity and cannot bypass admission, room scope, consent or host revocation", async () => {
  const db = new PGlite();
  const owner = "10000000-0000-4000-8000-000000000001",
    other = "10000000-0000-4000-8000-000000000002";
  const ticket = "x".repeat(43),
    foreign = "y".repeat(43);
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
 create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt()returns jsonb language sql stable as $$select '{}'::jsonb$$;grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
 create table office_files(id uuid,owner_id uuid);alter table office_files enable row level security;
 create table storage.objects(id uuid);alter table storage.objects enable row level security;`);
  for (const suffix of [
    "_sessions_notes.sql",
    "_sessions_guest_admission.sql",
    "_sessions_guest_metadata_privacy.sql",
    "_sessions_scoped_guests.sql",
  ]) {
    const f = readdirSync("supabase/migrations").find((f) =>
      f.endsWith(suffix),
    )!;
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  }
  async function as(id?: string) {
    await db.exec(
      `reset role;set request.jwt.claim.sub='${id || ""}';set role ${id ? "authenticated" : "anon"};`,
    );
  }
  await as(owner);
  const room = (
    await db.query<{ id: string }>(
      `insert into session_rooms(owner_id,title,allow_guests)values('${owner}','Private guest meeting',true)returning id`,
    )
  ).rows[0].id;
  const room2 = (
    await db.query<{ id: string }>(
      `insert into session_rooms(owner_id,title,allow_guests)values('${owner}','Other meeting',true)returning id`,
    )
  ).rows[0].id;
  await as();
  const g = (
    await db.query<{ g: { user_id: string; status: string } }>(
      `select session_guest_request('${room}','${ticket}','Guest visitor')g`,
    )
  ).rows[0].g;
  expect(g.status).toBe("waiting");
  const id = g.user_id;
  await expect(
    db.query(`select * from session_private.guests`),
  ).rejects.toThrow();
  await expect(
    db.query(`select session_guest_access('${room}','${ticket}','token')`),
  ).rejects.toThrow();
  await expect(
    db.query(`select session_guest_access('${room2}','${ticket}','snapshot')`),
  ).rejects.toThrow();
  await expect(
    db.query(`select session_guest_access('${room}','${foreign}','snapshot')`),
  ).rejects.toThrow();
  await expect(
    db.query(
      `select session_guest_manage('${room}','${id}','{"status":"approved"}')`,
    ),
  ).rejects.toThrow();
  await as(other);
  await expect(
    db.query(
      `select session_guest_manage('${room}','${id}','{"status":"approved"}')`,
    ),
  ).rejects.toThrow();
  await as(owner);
  await db.exec(
    `select session_guest_manage('${room}','${id}','{"status":"approved"}');update session_rooms set transcribing=true,status='live' where id='${room}';select session_set_consent('${room}',true)`,
  );
  await as();
  const snap = (
    await db.query<{
      s: { me: { guest_identity: boolean }; note: null; segments: unknown[] };
    }>(`select session_guest_access('${room}','${ticket}','snapshot')s`)
  ).rows[0].s;
  expect(snap.me.guest_identity).toBe(true);
  expect(snap.note).toBeNull();
  expect(snap.segments).toEqual([]);
  const request = "10000000-0000-4000-8000-000000000010";
  await expect(
    db.query(
      `select session_guest_access('${room}','${ticket}','reserve_stt','{"request_id":"${request}","start_ms":0,"end_ms":4000}')`,
    ),
  ).rejects.toThrow();
  await db.exec(
    `select session_guest_access('${room}','${ticket}','consent','{"consent":true}');select session_guest_access('${room}','${ticket}','reserve_stt','{"request_id":"${request}","start_ms":0,"end_ms":4000}');select session_guest_access('${room}','${ticket}','complete_stt','{"request_id":"${request}","text":"Fictional test speech","language":"en"}')`,
  );
  await as(owner);
  expect(
    (
      await db.query(
        "select guest_speaker_id,original_text from session_segments",
      )
    ).rows,
  ).toEqual([{ guest_speaker_id: id, original_text: "Fictional test speech" }]);
  await db.exec("reset role");
  expect(
    (await db.query<{ n: number }>("select count(*)::int n from auth.users"))
      .rows[0].n,
  ).toBe(2);
  await as(owner);
  await db.exec(
    `select session_guest_manage('${room}','${id}','{"status":"removed"}')`,
  );
  await as();
  expect(
    (
      await db.query<{ s: { admission: string } }>(
        `select session_guest_access('${room}','${ticket}','snapshot')s`,
      )
    ).rows[0].s.admission,
  ).toBe("removed");
  await expect(
    db.query(`select session_guest_request('${room}','${ticket}','Return')`),
  ).rejects.toThrow();
  await as(owner);
  await db.exec(`update session_rooms set locked=true where id='${room2}'`);
  await as();
  await expect(
    db.query(
      `select session_guest_request('${room2}','${foreign}','New visitor')`,
    ),
  ).rejects.toThrow();
  await db.close();
});
