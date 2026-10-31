-- Meeting-scoped bearer admission, independent of Supabase Auth signup.
-- Private records have no client table grants. Public RPCs expose only an
-- unguessable ticket's own scope; host RPCs separately require auth.uid().
create table session_private.guests (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.session_rooms(id) on delete cascade,
 ticket_hash text not null unique,display_name text not null check(length(display_name) between 1 and 120),
 status text not null default 'waiting' check(status in('waiting','approved','removed')),
 can_publish boolean not null default true,consent boolean not null default false,
 created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '4 hours')
);
create index guests_room_status on session_private.guests(room_id,status);
create table session_private.guest_limits (
 key text primary key,room_id uuid not null references public.session_rooms(id) on delete cascade,
 bucket timestamptz not null,hits integer not null
);
create index guest_limits_room on session_private.guest_limits(room_id);
create table session_private.guest_chunks (
 guest_id uuid not null references session_private.guests(id) on delete cascade,request_id uuid not null,
 start_ms integer not null,end_ms integer not null,state text not null default 'reserved' check(state in('reserved','done','failed')),
 primary key(guest_id,request_id)
);
alter table session_private.guests enable row level security;
alter table session_private.guest_limits enable row level security;
alter table session_private.guest_chunks enable row level security;
revoke all on session_private.guests,session_private.guest_limits,session_private.guest_chunks from public,anon,authenticated;
create policy guests_deny_clients on session_private.guests for all to anon,authenticated using(false) with check(false);
create policy guest_limits_deny_clients on session_private.guest_limits for all to anon,authenticated using(false) with check(false);
create policy guest_chunks_deny_clients on session_private.guest_chunks for all to anon,authenticated using(false) with check(false);
alter table public.session_segments add column guest_speaker_id uuid references session_private.guests(id);
create unique index session_guest_segment_time on public.session_segments(room_id,guest_speaker_id,start_ms)where guest_speaker_id is not null;
create index session_segments_guest on public.session_segments(guest_speaker_id);
create function session_private.guest_rate(r uuid,k text,maximum integer)returns void language plpgsql security definer set search_path='' as $$
 declare n integer;begin
 insert into session_private.guest_limits(key,room_id,bucket,hits)values(k,r,date_trunc('hour',now()),1)
 on conflict(key)do update set bucket=excluded.bucket,hits=case when guest_limits.bucket=excluded.bucket then guest_limits.hits+1 else 1 end
 where guest_limits.bucket<>excluded.bucket or guest_limits.hits<maximum returning hits into n;
 if n is null then raise exception 'Guest request limit reached; try again later';end if;
 end;$$;
create function session_private.guest_json(g session_private.guests)returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('room_id',g.room_id,'user_id',g.id,'display_name',g.display_name,'status',g.status,
 'can_publish',g.can_publish,'consent',g.consent,'is_guest',true,'guest_identity',true,'expires_at',g.expires_at);$$;
create function session_private.guest_request(r uuid,t text,display text)returns jsonb language plpgsql security definer set search_path='' as $$
 declare room public.session_rooms;g session_private.guests;h text;begin
 if t is null or t!~'^[A-Za-z0-9_-]{43}$'then raise exception 'Invalid guest credential';end if;
 if display is null or length(trim(display))not between 1 and 120 then raise exception 'Display name required';end if;
 select * into room from public.session_rooms where id=r for update;
 if not found or not room.allow_guests or room.locked or room.status='ended' or room.institution_id is not null or room.offering_id is not null then raise exception 'Guest admission is unavailable or locked';end if;
 h:=encode(sha256(convert_to(t,'UTF8')),'hex');
 select * into g from session_private.guests where ticket_hash=h;
 if found then
  if g.room_id<>r or g.status='removed' or g.expires_at<=now()then raise exception 'Guest admission expired or was removed';end if;
  perform session_private.guest_rate(r,g.id::text||':request',120);
  update session_private.guests set display_name=trim(display)where id=g.id returning * into g;
 else
  perform session_private.guest_rate(r,r::text||':requests',30);
  if(select count(*)from session_private.guests where room_id=r and status='waiting'and expires_at>now())>=10 then raise exception 'Waiting room is full';end if;
  insert into session_private.guests(room_id,ticket_hash,display_name)values(r,h,trim(display))returning * into g;
 end if;
 return session_private.guest_json(g);
 end;$$;
create function public.session_guest_request(room uuid,ticket text,display text)returns jsonb language sql security invoker set search_path='' as $$select session_private.guest_request(room,ticket,display);$$;
create function session_private.guest_members(r uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid()is null or not session_private.can_read(r) or session_private.is_guest()then raise exception 'Meeting membership required';end if;
 return coalesce((select jsonb_agg(session_private.guest_json(g)order by g.created_at)from session_private.guests g where g.room_id=r and g.expires_at>now()and(session_private.is_host(r)or g.status='approved')),'[]'::jsonb);
 end;$$;
create function public.session_guest_members(room uuid)returns jsonb language sql security invoker set search_path='' as $$select session_private.guest_members(room);$$;
create function session_private.guest_manage(r uuid,gid uuid,p jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
 declare g session_private.guests;begin
 if auth.uid()is null or not session_private.is_host(r)or session_private.is_guest()then raise exception 'Only the host can manage guests';end if;
 if p is null or jsonb_typeof(p)<>'object' or p-array['status','can_publish']<>'{}'::jsonb then raise exception 'Invalid guest update';end if;
 if p?'status'and p->>'status'not in('approved','removed')then raise exception 'Invalid admission status';end if;
 if p?'can_publish'and jsonb_typeof(p->'can_publish')<>'boolean'then raise exception 'Invalid publication permission';end if;
 select * into g from session_private.guests where id=gid and room_id=r for update;
 if not found then raise exception 'Guest not found';end if;
 if (g.expires_at<=now()or g.status='removed') and p<>'{}'::jsonb and coalesce(p->>'status','')<>'removed'then raise exception 'Guest admission expired or was removed';end if;
 if (p->>'status')='approved'and exists(select 1 from public.session_rooms where id=r and status='ended')then raise exception 'Meeting has ended';end if;
 update session_private.guests set status=coalesce(p->>'status',status),can_publish=coalesce((p->>'can_publish')::boolean,can_publish),
 consent=case when p->>'status'='removed'then false else consent end where id=gid returning * into g;
 return session_private.guest_json(g);
 end;$$;
create function public.session_guest_manage(room uuid,guest uuid,patch jsonb)returns jsonb language sql security invoker set search_path='' as $$select session_private.guest_manage(room,guest,patch);$$;
create or replace function session_private.all_consented(r uuid)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.session_rooms where id=r and transcribing and status<>'ended')
 and not exists(select 1 from public.session_members where room_id=r and status='approved'and not consent)
 and not exists(select 1 from session_private.guests where room_id=r and status='approved'and expires_at>now()and not consent);$$;
create function session_private.guest_access(r uuid,t text,a text,d jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
 declare g session_private.guests;room public.session_rooms;members jsonb;j session_private.guest_chunks;n integer;begin
 if t is null or t!~'^[A-Za-z0-9_-]{43}$'then raise exception 'Guest admission required';end if;
 select * into g from session_private.guests where room_id=r and ticket_hash=encode(sha256(convert_to(t,'UTF8')),'hex')for update;
 if not found or g.expires_at<=now()then raise exception 'Guest admission expired or missing';end if;
 if g.status='removed'then
  if a='snapshot'then return jsonb_build_object('admission','removed','user_id',g.id);end if;
  raise exception 'Guest admission was removed';
 end if;
 select * into room from public.session_rooms where id=r;
 if not found then raise exception 'Meeting unavailable';end if;
 if a='snapshot' then
  perform session_private.guest_rate(r,g.id::text||':snapshot',1200);
  if room.status='ended'then return jsonb_build_object('admission','ended','user_id',g.id);end if;
  if g.status='waiting'then return jsonb_build_object('admission','waiting','user_id',g.id);end if;
  select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb)into members from public.session_members m where m.room_id=r and m.status='approved';
  members:=members||coalesce((select jsonb_agg(session_private.guest_json(x))from session_private.guests x where x.room_id=r and x.status='approved'and x.expires_at>now()),'[]'::jsonb);
  return jsonb_build_object('room',jsonb_build_object('id',room.id,'owner_id',room.owner_id,'title',room.title,'description','','starts_at',room.starts_at,'started_at',room.started_at,'timezone',room.timezone,'kind',room.kind,'institution_id',null,'offering_id',null,'project','','status',room.status,'locked',room.locked,'allow_guests',room.allow_guests,'transcribing',room.transcribing,'transcript_published',false,'created_at',room.created_at,'retention_days',room.retention_days),
   'me',session_private.guest_json(g),'members',members,'user_id',g.id,'segments','[]'::jsonb,'note',null,'cards','[]'::jsonb,'jobs','[]'::jsonb);
 end if;
 if g.status<>'approved'or room.status='ended'then raise exception 'Host admission required or meeting ended';end if;
 if a='token' then
  perform session_private.guest_rate(r,g.id::text||':token',120);
  return session_private.guest_json(g);
 elsif a='consent'then
  if jsonb_typeof(d->'consent')<>'boolean'then raise exception 'Choose consent explicitly';end if;
  update session_private.guests set consent=(d->>'consent')::boolean where id=g.id returning *into g;
  return session_private.guest_json(g);
 elsif a='reserve_stt'then
  if not g.consent or not session_private.all_consented(r)then raise exception 'All admitted participants must consent';end if;
  if (d->>'start_ms')::integer<0 or(d->>'end_ms')::integer<=(d->>'start_ms')::integer or(d->>'end_ms')::integer>(d->>'start_ms')::integer+60000 then raise exception 'Invalid audio timestamps';end if;
  if exists(select 1 from session_private.guest_chunks where guest_id=g.id and request_id=(d->>'request_id')::uuid)then return jsonb_build_object('claimed',false);end if;
  insert into session_private.usage_daily(user_id,day,kind,count)values(room.owner_id,current_date,'guest_stt',1)
  on conflict(user_id,day,kind)do update set count=usage_daily.count+1 where usage_daily.count<600 returning count into n;
  if n is null then raise exception 'Daily free-tier speech limit reached';end if;
  insert into session_private.guest_chunks(guest_id,request_id,start_ms,end_ms)values(g.id,(d->>'request_id')::uuid,(d->>'start_ms')::integer,(d->>'end_ms')::integer);
  return jsonb_build_object('claimed',true);
 elsif a in('complete_stt','fail_stt')then
  select *into j from session_private.guest_chunks where guest_id=g.id and request_id=(d->>'request_id')::uuid for update;
  if not found or j.state<>'reserved'then return jsonb_build_object('replayed',true);end if;
  if a='complete_stt'then
   if not g.consent or not session_private.all_consented(r)then raise exception 'Consent was revoked';end if;
   if length(d->>'text')>16000 or d->>'language'not in('en','hi','ur','ar','fr','de','zh','es')then raise exception 'Invalid transcript';end if;
   if length(trim(d->>'text'))>0 then
    insert into public.session_segments(room_id,speaker_id,guest_speaker_id,speaker_name,start_ms,end_ms,source_kind,language,original_text)
    values(r,null,g.id,g.display_name,j.start_ms,j.end_ms,'stt',d->>'language',d->>'text')
    on conflict(room_id,guest_speaker_id,start_ms)where guest_speaker_id is not null do nothing;
   end if;
  end if;
  update session_private.guest_chunks set state=case when a='complete_stt'then 'done'else 'failed'end where guest_id=g.id and request_id=j.request_id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Guest action is not permitted';
 end;$$;
create function public.session_guest_access(room uuid,ticket text,action text,data jsonb default '{}')returns jsonb language sql security invoker set search_path='' as $$select session_private.guest_access(room,ticket,action,data);$$;
revoke all on function session_private.guest_rate(uuid,text,integer),session_private.guest_json(session_private.guests),session_private.guest_request(uuid,text,text),session_private.guest_members(uuid),session_private.guest_manage(uuid,uuid,jsonb),session_private.guest_access(uuid,text,text,jsonb) from public;
revoke all on function public.session_guest_request(uuid,text,text),public.session_guest_members(uuid),public.session_guest_manage(uuid,uuid,jsonb),public.session_guest_access(uuid,text,text,jsonb)from public;
grant execute on function session_private.guest_request(uuid,text,text),session_private.guest_access(uuid,text,text,jsonb),public.session_guest_request(uuid,text,text),public.session_guest_access(uuid,text,text,jsonb)to anon,authenticated;
grant execute on function session_private.guest_members(uuid),session_private.guest_manage(uuid,uuid,jsonb),public.session_guest_members(uuid),public.session_guest_manage(uuid,uuid,jsonb)to authenticated;
