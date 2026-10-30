-- All admitted participants retain presentation by default; only hosts can alter it.
alter table public.session_members add column can_share_screen boolean not null default true;
alter table session_private.guests add column can_share_screen boolean not null default true;
grant update(can_share_screen) on public.session_members to authenticated;
-- Existing host-only UPDATE RLS and private deny-all RLS are unchanged.
create or replace function session_private.guest_json(g session_private.guests)returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('room_id',g.room_id,'user_id',g.id,'display_name',g.display_name,'status',g.status,
 'can_share_screen',g.can_share_screen,'can_publish',g.can_publish,'consent',g.consent,'is_guest',true,'guest_identity',true,'expires_at',g.expires_at);$$;
create or replace function session_private.guest_manage(r uuid,gid uuid,p jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
 declare g session_private.guests;begin
 if auth.uid()is null or not session_private.is_host(r)or session_private.is_guest()then raise exception 'Only the host can manage guests';end if;
 if p is null or jsonb_typeof(p)<>'object' or p-array['status','can_publish','can_share_screen']<>'{}'::jsonb then raise exception 'Invalid guest update';end if;
 if p?'status'and p->>'status'not in('approved','removed')then raise exception 'Invalid admission status';end if;
 if p?'can_publish'and jsonb_typeof(p->'can_publish')<>'boolean'then raise exception 'Invalid publication permission';end if;
 if p?'can_share_screen'and jsonb_typeof(p->'can_share_screen')<>'boolean'then raise exception 'Invalid screen sharing permission';end if;
 select * into g from session_private.guests where id=gid and room_id=r for update;
 if not found then raise exception 'Guest not found';end if;
 if (g.expires_at<=now()or g.status='removed') and p<>'{}'::jsonb and coalesce(p->>'status','')<>'removed'then raise exception 'Guest admission expired or was removed';end if;
 if (p->>'status')='approved'and exists(select 1 from public.session_rooms where id=r and status='ended')then raise exception 'Meeting has ended';end if;
 update session_private.guests set status=coalesce(p->>'status',status),can_share_screen=coalesce((p->>'can_share_screen')::boolean,can_share_screen),can_publish=coalesce((p->>'can_publish')::boolean,can_publish),
 consent=case when p->>'status'='removed'then false else consent end where id=gid returning * into g;
 return session_private.guest_json(g);
 end;$$;
