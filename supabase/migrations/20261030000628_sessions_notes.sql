-- Native Sessions/Notes. Additive; no changes to existing file/Auth tables.
create schema if not exists session_private;
revoke all on schema session_private from public;
grant usage on schema session_private to authenticated;
create table public.session_rooms (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 title text not null check(length(title) between 1 and 160),description text not null default '' check(length(description)<=4000),
 started_at timestamptz, starts_at timestamptz not null default now(),timezone text not null default 'UTC',kind text not null default 'meeting' check(kind in ('meeting','lecture')),
 institution_id uuid,offering_id uuid, project text not null default '' check(length(project)<=120),
 status text not null default 'scheduled' check(status in ('scheduled','live','ended')),locked boolean not null default false,
 transcribing boolean not null default false,transcript_published boolean not null default false,
 retention_days integer not null default 30 check(retention_days between 1 and 365), created_at timestamptz not null default now()
);
create table public.session_members (
 room_id uuid not null references public.session_rooms(id) on delete cascade,user_id uuid not null references auth.users(id),
 display_name text not null check(length(display_name) between 1 and 120),status text not null default 'waiting' check(status in ('waiting','approved','removed')),
 consent boolean not null default false, can_publish boolean not null default true,primary key(room_id,user_id)
);
create table public.session_segments (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.session_rooms(id) on delete cascade,
 speaker_id uuid references auth.users(id),speaker_name text not null,start_ms integer not null check(start_ms>=0),end_ms integer not null check(end_ms>start_ms),
 source_kind text not null default 'manual' check(source_kind in ('manual','stt')),language text not null default 'en',original_text text not null check(length(original_text)<=16000),edited_text text check(length(edited_text)<=16000),important boolean not null default false,
 created_at timestamptz not null default now(),unique(room_id,speaker_id,start_ms)
);
create table public.session_notes (
 room_id uuid primary key references public.session_rooms(id) on delete cascade,body jsonb not null default '{}'::jsonb,published boolean not null default false,
 ai_generated boolean not null default false,updated_at timestamptz not null default now()
);
create table public.session_jobs (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.session_rooms(id) on delete cascade,actor_id uuid not null references auth.users(id),
 kind text not null,request_key text not null,state text not null default 'queued' check(state in ('queued','running','done','failed')),output jsonb,error text,
 created_at timestamptz not null default now(),unique(room_id,actor_id,request_key)
);
create table public.session_cards (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.session_rooms(id) on delete cascade,user_id uuid not null references auth.users(id),
 front text not null check(length(front)<=1500),back text not null check(length(back)<=4000),segment_ids uuid[] not null default '{}',confidence integer not null default 0 check(confidence between 0 and 3),
 interval_days integer not null default 1 check(interval_days between 1 and 365),due_at timestamptz not null default now()
);
create table public.session_annotations (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.session_rooms(id) on delete cascade,user_id uuid not null references auth.users(id),
 body text not null default '' check(length(body)<=12000),bookmarked boolean not null default false,folder text not null default '' check(length(folder)<=120),unique(room_id,user_id)
);
-- Separate, non-exposed ledger survives room deletion and cannot be reset by clients.
create table session_private.usage_daily(user_id uuid not null references auth.users(id)on delete cascade,day date not null,kind text not null,count integer not null default 0,primary key(user_id,day,kind));
revoke all on table session_private.usage_daily from authenticated;
alter table session_private.usage_daily enable row level security;
create function session_private.is_host(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.session_rooms where id=r and owner_id=(select auth.uid())); $$;
create function session_private.is_member(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.session_members where room_id=r and user_id=(select auth.uid()) and status='approved'); $$;
create function session_private.can_read(r uuid)returns boolean language sql stable security definer set search_path='' as $$select session_private.is_host(r)or session_private.is_member(r);$$;
create function session_private.can_transcript(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select session_private.is_host(r) or (session_private.can_read(r) and exists(select 1 from public.session_rooms where id=r and transcript_published)); $$;
create function session_private.all_consented(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.session_rooms where id=r and transcribing and status<>'ended') and not exists(select 1 from public.session_members where room_id=r and status='approved' and not consent); $$;
create function session_private.owner_member() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.session_members(room_id,user_id,display_name,status) values(new.id,new.owner_id,'Host','approved');return new;end;$$;
create trigger session_owner_member after insert on public.session_rooms for each row execute function session_private.owner_member();
create function session_private.request_join(r uuid,display text) returns void language plpgsql security definer set search_path='' as $$
 declare room public.session_rooms; begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into room from public.session_rooms where id=r for update;
 if not found or room.locked or room.status='ended' then raise exception 'Session is unavailable or locked';end if;
 
 if length(trim(display)) not between 1 and 120 then raise exception 'Display name required';end if;
 if exists(select 1 from public.session_members where room_id=r and user_id=auth.uid() and status='removed')then raise exception 'Access removed';end if;
 insert into public.session_members(room_id,user_id,display_name)values(r,auth.uid(),trim(display))on conflict(room_id,user_id)do update set display_name=excluded.display_name;
 end;$$;
create function public.session_request_join(room uuid,display text)returns void language sql security invoker set search_path='' as $$select session_private.request_join(room,display);$$;
create function session_private.consume(k text)returns void language plpgsql security definer set search_path='' as $$
 declare hits integer;cap integer;begin
 if auth.uid()is null then raise exception 'Authentication required';end if;
 cap=case when k in('stt','stt_claim') then 600 else 20 end;
 insert into session_private.usage_daily(user_id,day,kind,count)values(auth.uid(),current_date,k,1)
 on conflict(user_id,day,kind)do update set count=usage_daily.count+1 where usage_daily.count<cap returning count into hits;
 if hits is null then raise exception 'Daily free-tier request limit reached';end if;end;$$;
create function session_private.reserve(r uuid,k text,q text)returns uuid language plpgsql security definer set search_path='' as $$
 declare j uuid;begin
 if not session_private.can_transcript(r)then raise exception 'Transcript access required';end if;
 if k='notes' and not session_private.is_host(r)then raise exception 'Only the host can generate shared notes';end if;
 if k not in('notes','ask','study','explain','teach','translate','followup','stt') or length(q)>150 then raise exception 'Invalid job';end if;
 perform pg_advisory_xact_lock(hashtext(r::text||auth.uid()::text||q));
 select id into j from public.session_jobs where room_id=r and actor_id=auth.uid() and request_key=q;
 if j is not null then return j;end if;
 perform session_private.consume(case when k='stt'then 'stt'else'ai'end);
 insert into public.session_jobs(room_id,actor_id,kind,request_key)values(r,auth.uid(),k,q)returning id into j;return j;end;$$;
create function public.session_reserve_job(room uuid,kind text,request_key text)returns uuid language sql security invoker set search_path='' as $$select session_private.reserve(room,kind,request_key);$$;
-- STT admission is separate: participants can transcribe only their own consenting track.
create function session_private.reserve_stt(r uuid,q text)returns uuid language plpgsql security definer set search_path='' as $$
 declare j uuid;begin
 if not session_private.is_member(r) or not session_private.all_consented(r) then raise exception 'All admitted participants must consent';end if;
 perform pg_advisory_xact_lock(hashtext(r::text||auth.uid()::text||q));
 select id into j from public.session_jobs where room_id=r and actor_id=auth.uid() and request_key=q;if j is not null then return j;end if;
 perform session_private.consume('stt');insert into public.session_jobs(room_id,actor_id,kind,request_key)values(r,auth.uid(),'stt',q)returning id into j;return j;end;$$;
create function public.session_reserve_stt(room uuid,request_key text)returns uuid language sql security invoker set search_path='' as $$select session_private.reserve_stt(room,request_key);$$;
-- Timestamped correction history is immutable to clients.
create table public.session_revisions(id uuid primary key default gen_random_uuid(),segment_id uuid not null references public.session_segments(id)on delete cascade,editor_id uuid not null references auth.users(id),previous_text text not null,edited_at timestamptz not null default now());
create function session_private.track_revision()returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.edited_text is distinct from old.edited_text then insert into public.session_revisions(segment_id,editor_id,previous_text)values(old.id,auth.uid(),coalesce(old.edited_text,old.original_text));end if;return new;end;$$;
create trigger session_segment_revision before update on public.session_segments for each row execute function session_private.track_revision();
alter table public.session_rooms enable row level security;
alter table public.session_members enable row level security;
alter table public.session_segments enable row level security;
alter table public.session_notes enable row level security;
alter table public.session_jobs enable row level security;
alter table public.session_cards enable row level security;
alter table public.session_annotations enable row level security;
alter table public.session_revisions enable row level security;
create policy session_room_read on public.session_rooms for select to authenticated using(owner_id=(select auth.uid())or session_private.can_read(id)or exists(select 1 from public.session_members where room_id=id and user_id=(select auth.uid())and status='waiting'));
create policy session_room_create on public.session_rooms for insert to authenticated with check(owner_id=(select auth.uid()) and institution_id is null and offering_id is null);
create policy session_room_update on public.session_rooms for update to authenticated using(session_private.is_host(id))with check(owner_id=(select auth.uid()));
create policy session_room_delete on public.session_rooms for delete to authenticated using(session_private.is_host(id));
create policy session_members_read on public.session_members for select to authenticated using(user_id=(select auth.uid())or session_private.is_host(room_id)or session_private.is_member(room_id));
create policy session_members_update on public.session_members for update to authenticated using(session_private.is_host(room_id))with check(session_private.is_host(room_id));
create function session_private.set_consent(r uuid,c boolean)returns void language plpgsql security definer set search_path='' as $$begin
 if not session_private.is_member(r)then raise exception 'Admission required';end if;
 update public.session_members set consent=c where room_id=r and user_id=auth.uid();end;$$;
create function public.session_set_consent(room uuid,consent boolean)returns void language sql security invoker set search_path='' as $$select session_private.set_consent(room,consent);$$;
create policy session_segments_read on public.session_segments for select to authenticated using(session_private.can_transcript(room_id));
create policy session_segments_insert on public.session_segments for insert to authenticated with check((source_kind='manual'and speaker_id is null and session_private.is_host(room_id))or(source_kind='stt'and speaker_id=(select auth.uid())and session_private.is_member(room_id)and session_private.all_consented(room_id)));
create policy session_segments_edit on public.session_segments for update to authenticated using(session_private.is_host(room_id))with check(session_private.is_host(room_id));
create policy session_notes_read on public.session_notes for select to authenticated using(session_private.is_host(room_id)or(published and session_private.can_read(room_id)));
create policy session_notes_write on public.session_notes for all to authenticated using(session_private.is_host(room_id))with check(session_private.is_host(room_id));
create policy session_jobs_read on public.session_jobs for select to authenticated using(actor_id=(select auth.uid())and session_private.can_read(room_id));
create policy session_jobs_update on public.session_jobs for update to authenticated using(actor_id=(select auth.uid())and session_private.can_read(room_id))with check(actor_id=(select auth.uid())and session_private.can_read(room_id));
create policy session_cards_access on public.session_cards for all to authenticated using(user_id=(select auth.uid())and session_private.can_transcript(room_id))with check(user_id=(select auth.uid())and session_private.can_transcript(room_id));
create policy session_annotations_access on public.session_annotations for all to authenticated using(user_id=(select auth.uid())and session_private.can_read(room_id))with check(user_id=(select auth.uid())and session_private.can_read(room_id));
create policy session_revisions_read on public.session_revisions for select to authenticated using(exists(select 1 from public.session_segments s where s.id=segment_id and session_private.is_host(s.room_id)));
grant select,insert,delete on public.session_rooms to authenticated;
grant update(title,description,starts_at,timezone,project,status,locked,transcribing,transcript_published,retention_days)on public.session_rooms to authenticated;
grant select on public.session_members to authenticated;
grant update(status,can_publish)on public.session_members to authenticated;
grant select,insert on public.session_segments to authenticated;
grant update(edited_text,important)on public.session_segments to authenticated;
grant select,insert,update,delete on public.session_notes,public.session_cards,public.session_annotations to authenticated;
grant select on public.session_jobs,public.session_revisions to authenticated;
grant update(state,output,error)on public.session_jobs to authenticated;
revoke all on all functions in schema session_private from public;
grant execute on function session_private.is_host(uuid),session_private.is_member(uuid),session_private.can_read(uuid),session_private.can_transcript(uuid),session_private.all_consented(uuid),session_private.request_join(uuid,text),session_private.reserve(uuid,text,text),session_private.reserve_stt(uuid,text),session_private.set_consent(uuid,boolean)to authenticated;
revoke all on function public.session_request_join(uuid,text),public.session_reserve_job(uuid,text,text),public.session_reserve_stt(uuid,text),public.session_set_consent(uuid,boolean)from public;
grant execute on function public.session_request_join(uuid,text),public.session_reserve_job(uuid,text,text),public.session_reserve_stt(uuid,text),public.session_set_consent(uuid,boolean)to authenticated;
create index session_rooms_owner_date on public.session_rooms(owner_id,starts_at desc);
create index session_rooms_offering on public.session_rooms(offering_id);
create index session_members_user on public.session_members(user_id,status);
create index session_segments_room_time on public.session_segments(room_id,start_ms);
create index session_segments_speaker on public.session_segments(speaker_id);
create index session_jobs_actor on public.session_jobs(actor_id,created_at);
create index session_cards_user_due on public.session_cards(user_id,due_at);
create index session_annotations_user on public.session_annotations(user_id);
create index session_revisions_segment on public.session_revisions(segment_id);
create index session_revisions_editor on public.session_revisions(editor_id);

create function session_private.claim(j uuid)returns boolean language plpgsql security definer set search_path='' as $$
declare record public.session_jobs;begin
 select * into record from public.session_jobs where id=j and actor_id=auth.uid() for update;
 if not found or record.state<>'queued' then return false;end if;
 if record.kind='stt' then
 if not session_private.is_member(record.room_id)or not session_private.all_consented(record.room_id)then raise exception 'Consent required';end if;
 else if not session_private.can_transcript(record.room_id)then raise exception 'Transcript access required';end if;end if;
 perform session_private.consume(case when record.kind='stt'then 'stt_claim'else'ai_claim'end);
 update public.session_jobs set state='running'where id=j;return true;end;$$;
create function public.session_claim_job(job uuid)returns boolean language sql security invoker set search_path='' as $$select session_private.claim(job);$$;
revoke all on function session_private.claim(uuid),public.session_claim_job(uuid)from public;
grant execute on function session_private.claim(uuid),public.session_claim_job(uuid)to authenticated;

-- Invoker search retains every source table's RLS, including publication gates.
create function public.session_search(q text)returns table(room_id uuid,title text,kind text,snippet text,segment_id uuid,start_ms integer)
language sql stable security invoker set search_path='' as $$
 select * from (
 select r.id,r.title,'session'::text,left(r.description,300),null::uuid,null::integer from public.session_rooms r
 where length(trim(q))between 2 and 200 and to_tsvector('simple',r.title||' '||r.description||' '||r.project)@@plainto_tsquery('simple',q)
 union all
 select r.id,r.title,'transcript',left(coalesce(s.edited_text,s.original_text),300),s.id,s.start_ms from public.session_segments s join public.session_rooms r on r.id=s.room_id
 where length(trim(q))between 2 and 200 and to_tsvector('simple',coalesce(s.edited_text,s.original_text))@@plainto_tsquery('simple',q)
 union all
 select r.id,r.title,'notes',left(coalesce(n.body->'overview'->0->>'text','Notes'),300),null::uuid,null::integer from public.session_notes n join public.session_rooms r on r.id=n.room_id
 where length(trim(q))between 2 and 200 and to_tsvector('simple',n.body::text)@@plainto_tsquery('simple',q)
 )matches limit 100;$$;
revoke all on function public.session_search(text)from public;
grant execute on function public.session_search(text)to authenticated;
create index session_room_keywords on public.session_rooms using gin(to_tsvector('simple',title||' '||description||' '||project));
create index session_segment_keywords on public.session_segments using gin(to_tsvector('simple',coalesce(edited_text,original_text)));
create index session_note_keywords on public.session_notes using gin(to_tsvector('simple',body::text));

-- Timeline origin is actual first start, not the scheduled calendar date.
create function session_private.start_clock()returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='live' and old.status='scheduled' and old.started_at is null then new.started_at=now();end if;
 return new;
end;$$;
revoke all on function session_private.start_clock()from public;
create trigger session_start_clock before update of status on public.session_rooms for each row execute function session_private.start_clock();
