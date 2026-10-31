-- Private, temporary user-authorized audio imports; existing buckets and files are unchanged.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('session-audio','session-audio',false,20971520,array['audio/wav','audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/x-wav'])
on conflict(id)do nothing;
create policy session_audio_insert on storage.objects for insert to authenticated with check(
 bucket_id='session-audio' and split_part(name,'/',1)=(select auth.uid())::text and
 exists(select 1 from public.session_rooms r where r.id::text=split_part(name,'/',2)and session_private.is_host(r.id)));
create policy session_audio_read on storage.objects for select to authenticated using(
 bucket_id='session-audio' and split_part(name,'/',1)=(select auth.uid())::text and
 exists(select 1 from public.session_rooms r where r.id::text=split_part(name,'/',2)and session_private.is_host(r.id)));
create policy session_audio_delete on storage.objects for delete to authenticated using(
 bucket_id='session-audio' and split_part(name,'/',1)=(select auth.uid())::text and
 exists(select 1 from public.session_rooms r where r.id::text=split_part(name,'/',2)and session_private.is_host(r.id)));
create function session_private.reserve_filetrans(r uuid,q text)returns uuid language plpgsql security definer set search_path='' as $$
declare j uuid;begin
 if not session_private.is_host(r)then raise exception 'Only the host can import audio';end if;
 if length(q)not between 1 and 150 then raise exception 'Invalid request';end if;
 perform pg_advisory_xact_lock(hashtext(r::text||auth.uid()::text||q));
 select id into j from public.session_jobs where room_id=r and actor_id=auth.uid()and request_key=q;
 if j is not null then return j;end if;
 perform session_private.consume('filetrans');
 insert into public.session_jobs(room_id,actor_id,kind,request_key)values(r,auth.uid(),'filetrans',q)returning id into j;return j;end;$$;
create function public.session_reserve_filetrans(room uuid,request_key text)returns uuid language sql security invoker set search_path='' as $$select session_private.reserve_filetrans(room,request_key);$$;
revoke all on function session_private.reserve_filetrans(uuid,text),public.session_reserve_filetrans(uuid,text)from public;
grant execute on function session_private.reserve_filetrans(uuid,text),public.session_reserve_filetrans(uuid,text)to authenticated;
-- Four-second live batches: 1,800 chunks covers two hours per user/day, still free-quota protected.
create or replace function session_private.consume(k text)returns void language plpgsql security definer set search_path='' as $$
declare hits integer;cap integer;begin
 if auth.uid()is null then raise exception 'Authentication required';end if;
 cap=case when k in('stt','stt_claim')then 1800 else 20 end;
 insert into session_private.usage_daily(user_id,day,kind,count)values(auth.uid(),current_date,k,1)
 on conflict(user_id,day,kind)do update set count=usage_daily.count+1 where usage_daily.count<cap returning count into hits;
 if hits is null then raise exception 'Daily free-tier request limit reached';end if;end;$$;
create or replace function session_private.claim(j uuid)returns boolean language plpgsql security definer set search_path='' as $$
declare record public.session_jobs;begin
 select * into record from public.session_jobs where id=j and actor_id=auth.uid()for update;
 if not found or record.state<>'queued'then return false;end if;
 if record.kind='stt'then
  if not session_private.is_member(record.room_id)or not session_private.all_consented(record.room_id)then raise exception 'Consent required';end if;
 elsif record.kind='filetrans'then
  if not session_private.is_host(record.room_id)then raise exception 'Host access required';end if;
 elsif not session_private.can_transcript(record.room_id)then raise exception 'Transcript access required';end if;
 perform session_private.consume(case when record.kind='stt'then'stt_claim'when record.kind='filetrans'then'filetrans_claim'else'ai_claim'end);
 update public.session_jobs set state='running'where id=j;return true;end;$$;
