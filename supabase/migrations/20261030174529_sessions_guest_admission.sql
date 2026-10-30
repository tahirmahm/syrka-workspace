-- Additive Workspace-only guest admission. Existing meetings stay private until
-- their host opts in. Permanent-user ownership policies remain in force.
alter table public.session_rooms add column allow_guests boolean not null default false;
alter table public.session_members add column is_guest boolean not null default false;
grant update(allow_guests) on public.session_rooms to authenticated;
create function session_private.is_guest() returns boolean language sql stable set search_path='' as $$
 select coalesce((auth.jwt()->>'is_anonymous')::boolean,false); $$;
revoke all on function session_private.is_guest() from public;
grant execute on function session_private.is_guest() to authenticated;
-- Anonymous Auth identities must never become Workspace file owners or hosts.
create policy session_permanent_create on public.session_rooms as restrictive for insert to authenticated
 with check(not (select session_private.is_guest()));
create policy office_permanent_only on public.office_files as restrictive for all to authenticated
 using(not (select session_private.is_guest())) with check(not (select session_private.is_guest()));
do $$ begin
 if to_regclass('public.workspace_files') is not null then
  execute 'create policy workspace_permanent_only on public.workspace_files as restrictive for all to authenticated using(not (select session_private.is_guest())) with check(not (select session_private.is_guest()))';
 end if;
end $$;
create policy notes_permanent_only on public.session_notes as restrictive for all to authenticated
 using(not (select session_private.is_guest())) with check(not (select session_private.is_guest()));
create policy cards_permanent_only on public.session_cards as restrictive for all to authenticated
 using(not (select session_private.is_guest())) with check(not (select session_private.is_guest()));
create policy annotations_permanent_only on public.session_annotations as restrictive for all to authenticated
 using(not (select session_private.is_guest())) with check(not (select session_private.is_guest()));
create policy storage_permanent_only on storage.objects as restrictive for all to authenticated
 using(not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false))
 with check(not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
-- Guests may submit only their own consenting microphone batches, not read the
-- host's transcript or run AI jobs. reserve_stt has its own admission/consent gate.
create or replace function session_private.can_transcript(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not session_private.is_guest() and (session_private.is_host(r) or
 (session_private.can_read(r) and exists(select 1 from public.session_rooms where id=r and transcript_published))); $$;
create or replace function session_private.request_join(r uuid,display text) returns void language plpgsql security definer set search_path='' as $$
 declare room public.session_rooms; guest boolean; begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into room from public.session_rooms where id=r for update;
 if not found or room.locked or room.status='ended' then raise exception 'Session is unavailable or locked';end if;
 guest:=session_private.is_guest();
 if guest and (not room.allow_guests or room.institution_id is not null or room.offering_id is not null) then raise exception 'Guest admission is disabled';end if;
 if length(trim(display)) not between 1 and 120 then raise exception 'Display name required';end if;
 if exists(select 1 from public.session_members where room_id=r and user_id=auth.uid() and status='removed') then raise exception 'Access removed';end if;
 if guest then
  perform session_private.consume('guest_join');
  if not exists(select 1 from public.session_members where room_id=r and user_id=auth.uid()) and
   (select count(*) from public.session_members where room_id=r and status='waiting')>=10 then raise exception 'Waiting room is full; try later';end if;
 end if;
 insert into public.session_members(room_id,user_id,display_name,is_guest) values(r,auth.uid(),trim(display),guest)
 on conflict(room_id,user_id) do update set display_name=excluded.display_name;
 end; $$;
-- Public invitation lookup discloses only explicitly guest-enabled meeting title
-- and host display name. UUID knowledge never grants admission or private data.
create table session_private.invitation_limits(room_id uuid primary key references public.session_rooms(id) on delete cascade,minute timestamptz not null,hits integer not null);
alter table session_private.invitation_limits enable row level security;
revoke all on session_private.invitation_limits from public,anon,authenticated;
create function session_private.invitation(r uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare room public.session_rooms; n integer; begin
 select * into room from public.session_rooms where id=r and allow_guests and not locked and status<>'ended' and institution_id is null and offering_id is null;
 if not found then return null;end if;
 insert into session_private.invitation_limits(room_id,minute,hits)values(r,date_trunc('minute',now()),1)
 on conflict(room_id) do update set minute=excluded.minute,hits=case when invitation_limits.minute=excluded.minute then invitation_limits.hits+1 else 1 end
 where invitation_limits.minute<>excluded.minute or invitation_limits.hits<60 returning hits into n;
 if n is null then raise exception 'Invitation request limit reached; try again shortly';end if;
 return jsonb_build_object('title',room.title,'host_name',coalesce((select display_name from public.session_members where room_id=r and user_id=room.owner_id),'Host'));
 end; $$;
create function public.session_invitation(room uuid) returns jsonb language sql security invoker set search_path='' as $$select session_private.invitation(room);$$;
revoke all on function session_private.invitation(uuid),public.session_invitation(uuid) from public;
grant usage on schema session_private to anon;
grant execute on function session_private.invitation(uuid),public.session_invitation(uuid) to anon,authenticated;
