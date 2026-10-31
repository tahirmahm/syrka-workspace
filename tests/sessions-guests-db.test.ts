import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
test("guest invitation, admission, privacy, consent, removal and limits are enforced by Postgres", async () => {
  const db = new PGlite();
  const host = "10000000-0000-4000-8000-000000000001",
    guest = "10000000-0000-4000-8000-000000000002",
    stranger = "10000000-0000-4000-8000-000000000003";
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt()returns jsonb language sql stable as $$select jsonb_build_object('is_anonymous',coalesce(nullif(current_setting('request.jwt.claim.guest',true),''),'false')::boolean)$$;
 create table auth.users(id uuid primary key);insert into auth.users values('${host}'),('${guest}'),('${stranger}');
 grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
 create table public.office_files(id uuid primary key,owner_id uuid);alter table office_files enable row level security;grant all on office_files to authenticated;create policy own_files on office_files for all to authenticated using(owner_id=auth.uid())with check(owner_id=auth.uid());
 create table storage.objects(id uuid primary key);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;create policy fixture_storage on storage.objects for all to authenticated using(true)with check(true);`);
  for (const suffix of [
    "_sessions_notes.sql",
    "_sessions_guest_admission.sql",
    "_sessions_guest_metadata_privacy.sql",
  ]) {
    const file = readdirSync("supabase/migrations").find((f) =>
      f.endsWith(suffix),
    )!;
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  }
  async function as(id: string, isGuest = false) {
    await db.exec(
      `reset role;set request.jwt.claim.sub='${id}';set request.jwt.claim.guest='${isGuest}';set role authenticated;`,
    );
  }
  await as(host);
  const room = (
    await db.query<{ id: string }>(
      `insert into session_rooms(owner_id,title,allow_guests) values('${host}','Private guest meeting',true) returning id`,
    )
  ).rows[0].id;
  await db.exec(
    `insert into session_notes(room_id,body,published)values('${room}','{"private":"secret"}',true);insert into office_files values(gen_random_uuid(),'${host}');`,
  );
  await as(guest, true);
  expect(
    (
      await db.query<{ d: { title: string } }>(
        `select session_invitation('${room}')d`,
      )
    ).rows[0].d.title,
  ).toBe("Private guest meeting");
  for (let n = 0; n < 59; n++)
    await db.query(`select session_invitation('${room}')`);
  await expect(
    db.query(`select session_invitation('${room}')`),
  ).rejects.toThrow(/limit/);
  expect((await db.query("select * from session_rooms")).rows).toHaveLength(0);
  await expect(
    db.query(
      `insert into session_rooms(owner_id,title)values('${guest}','Forged host')`,
    ),
  ).rejects.toThrow();
  await expect(
    db.query(`insert into office_files values(gen_random_uuid(),'${guest}')`),
  ).rejects.toThrow();
  await db.exec(`select session_request_join('${room}','Guest B')`);
  expect(
    (await db.query("select status,is_guest from session_members")).rows,
  ).toEqual([{ status: "waiting", is_guest: true }]);
  expect((await db.query("select * from session_rooms")).rows).toHaveLength(0);
  await as(host);
  await db.exec(
    `update session_members set status='approved' where user_id='${guest}';update session_rooms set transcribing=true,status='live' where id='${room}'`,
  );
  await as(guest, true);
  expect((await db.query("select * from session_notes")).rows).toHaveLength(0);
  expect((await db.query("select * from office_files")).rows).toHaveLength(0);
  expect((await db.query("select * from storage.objects")).rows).toHaveLength(
    0,
  );
  await expect(
    db.query(`select session_reserve_job('${room}','notes','forged')`),
  ).rejects.toThrow();
  await expect(
    db.query(`select session_reserve_stt('${room}','before-consent')`),
  ).rejects.toThrow();
  await db.exec(`select session_set_consent('${room}',true)`);
  await as(host);
  await db.exec(`select session_set_consent('${room}',true)`);
  await as(guest, true);
  await expect(
    db.query(`select session_reserve_stt('${room}','consented')`),
  ).resolves.toBeDefined();
  await db.exec(`select session_set_consent('${room}',false)`);
  await expect(
    db.query(`select session_reserve_stt('${room}','revoked')`),
  ).rejects.toThrow();
  await as(stranger, true);
  expect((await db.query("select * from session_rooms")).rows).toHaveLength(0);
  await as(host);
  await db.exec(
    `update session_members set status='removed'where user_id='${guest}';update session_rooms set allow_guests=false where id='${room}'`,
  );
  await as(guest, true);
  await expect(
    db.query(`select session_request_join('${room}','Return')`),
  ).rejects.toThrow();
  expect((await db.query("select * from session_rooms")).rows).toHaveLength(0);
  expect(
    (await db.query<{ d: unknown }>(`select session_invitation('${room}')d`))
      .rows[0].d,
  ).toBeNull();
  await db.close();
});
