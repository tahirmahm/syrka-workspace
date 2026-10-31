import { test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
test("Sessions RLS: admission, consent, publication, immutable originals and quotas", async () => {
  const db = new PGlite();
  const a = "10000000-0000-4000-8000-000000000001",
    b = "10000000-0000-4000-8000-000000000002",
    c = "10000000-0000-4000-8000-000000000003";
  await db.exec(
    `create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid()to authenticated;insert into auth.users values('${a}'),('${b}'),('${c}');`,
  );
  const migration = readdirSync("supabase/migrations").find((f) =>
    f.endsWith("_sessions_notes.sql"),
  )!;
  await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
  const indexes = readdirSync("supabase/migrations").find((f) =>
    f.endsWith("_sessions_policy_indexes.sql"),
  );
  if (indexes)
    await db.exec(readFileSync(`supabase/migrations/${indexes}`, "utf8"));
  const as = async (id: string) => {
    await db.exec(
      `reset role;set request.jwt.claim.sub='${id}';set role authenticated;`,
    );
  };
  await as(a);
  const room = (
    await db.query<{ id: string }>(
      `insert into session_rooms(owner_id,title)values('${a}','Private meeting')returning id`,
    )
  ).rows[0].id;
  await as(c);
  expect(
    (await db.query(`select * from session_search('Private')`)).rows,
  ).toHaveLength(0);
  expect((await db.query(`select * from session_rooms`)).rows).toHaveLength(0);
  await expect(
    db.query(
      `insert into session_rooms(owner_id,title)values('${a}','Forged')`,
    ),
  ).rejects.toThrow();
  await as(b);
  await db.query(`select session_request_join('${room}','Participant B')`);
  expect(
    (await db.query(`select status from session_members where user_id='${b}'`))
      .rows,
  ).toEqual([{ status: "waiting" }]);
  await expect(
    db.query(
      `update session_members set status='approved'where user_id='${b}'`,
    ),
  ).resolves.toBeDefined();
  expect(
    (await db.query(`select status from session_members where user_id='${b}'`))
      .rows,
  ).toEqual([{ status: "waiting" }]);
  await as(a);
  await db.query(
    `update session_members set status='approved'where user_id='${b}'`,
  );
  await db.query(`update session_rooms set transcribing=true,status='live'`);
  expect(
    (
      await db.query<{ started_at: string }>(
        `select started_at from session_rooms`,
      )
    ).rows[0].started_at,
  ).toBeTruthy();
  await db.query(`select session_set_consent('${room}',true)`);
  await expect(
    db.query(`select session_reserve_stt('${room}','chunk1')`),
  ).rejects.toThrow(/consent/);
  await as(b);
  await db.query(`select session_set_consent('${room}',true)`);
  const job = await db.query(
    `select session_reserve_stt('${room}','chunk1')id`,
  );
  expect(
    (await db.query(`select session_reserve_stt('${room}','chunk1')id`)).rows,
  ).toEqual(job.rows);
  await db.query(
    `insert into session_segments(room_id,speaker_id,speaker_name,start_ms,end_ms,original_text,source_kind)values('${room}','${b}','Participant B',0,1000,'Original','stt')`,
  );
  await expect(
    db.query(`update session_segments set original_text='Tampered'`),
  ).rejects.toThrow();
  await as(a);
  await db.query(`update session_segments set edited_text='Corrected'`);
  expect(
    (await db.query(`select previous_text from session_revisions`)).rows,
  ).toEqual([{ previous_text: "Original" }]);
  await db.query(
    `insert into session_notes(room_id,body)values('${room}','{}')`,
  );
  await as(b);
  expect(
    (await db.query(`select * from session_search('Corrected')`)).rows,
  ).toHaveLength(0);
  expect((await db.query(`select * from session_notes`)).rows).toHaveLength(0);
  await as(a);
  await db.query(`update session_notes set published=true`);
  await as(b);
  expect((await db.query(`select * from session_notes`)).rows).toHaveLength(1);
  expect((await db.query(`select * from session_segments`)).rows).toHaveLength(
    0,
  );
  await as(a);
  await db.query(`update session_rooms set transcript_published=true`);
  await as(b);
  expect((await db.query(`select * from session_segments`)).rows).toHaveLength(
    1,
  );
  await expect(
    db.query(`select session_reserve_job('${room}','notes','illegal')`),
  ).rejects.toThrow(/host/);
  expect(
    (await db.query(`select * from session_search('Corrected')`)).rows,
  ).toHaveLength(1);
  await as(c);
  expect(
    (await db.query(`select * from session_search('Corrected')`)).rows,
  ).toHaveLength(0);
  expect((await db.query(`select * from session_notes`)).rows).toHaveLength(0);
  await as(a);
  for (let i = 0; i < 20; i++)
    await db.query(
      `select session_reserve_job('${room}','notes','request${i}')`,
    );
  await expect(
    db.query(`select session_reserve_job('${room}','notes','overlimit')`),
  ).rejects.toThrow(/limit/);
  await db.close();
}, 30000);
