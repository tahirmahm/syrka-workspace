create function native_private.touch_updated_at()returns trigger language plpgsql set search_path='' as $$begin new.updated_at=clock_timestamp();return new;end$$;
revoke all on function native_private.touch_updated_at()from public,anon,authenticated;
create trigger native_events_touch before update on public.native_events for each row execute function native_private.touch_updated_at();
create trigger native_forms_touch before update on public.native_forms for each row execute function native_private.touch_updated_at();
-- A private exception on an otherwise public series must never reveal its override.
alter policy exception_read on public.native_exceptions using(public.native_event_access(event_id)and exists(select 1 from public.native_events e where e.id=event_id and(public.native_calendar_role(e.calendar_id)in('owner','editor')or coalesce(override->>'visibility',e.data->>'visibility')='calendar')));
create function public.native_calendar_exceptions()returns table(event_id uuid,original_start text,cancelled boolean,override jsonb)language sql stable security definer set search_path='' as $$select x.event_id,x.original_start,case when public.native_calendar_role(e.calendar_id)='viewer'and coalesce(x.override->>'visibility',e.data->>'visibility')<>'calendar' then true else x.cancelled end,case when public.native_calendar_role(e.calendar_id)='viewer'and coalesce(x.override->>'visibility',e.data->>'visibility')<>'calendar' then null else x.override end from public.native_exceptions x join public.native_events e on e.id=x.event_id where public.native_event_access(e.id)$$;
revoke all on function public.native_calendar_exceptions()from public,anon,authenticated;grant execute on function public.native_calendar_exceptions()to authenticated;
create function native_private.reminder_occurrence_allowed(eid uuid,recipient uuid,original text)returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.native_events e join public.native_calendars c on c.id=e.calendar_id left join public.native_calendar_shares s on s.calendar_id=c.id and s.user_id=recipient left join public.native_exceptions x on x.event_id=e.id and x.original_start=original where e.id=eid and e.owner_id=recipient and not coalesce(x.cancelled,false)and(c.owner_id=recipient or s.role='editor'or(s.role='viewer'and e.data->>'visibility'='calendar'and coalesce(x.override->>'visibility',e.data->>'visibility')='calendar')))$$;
revoke all on function native_private.reminder_occurrence_allowed(uuid,uuid,text)from public,anon,authenticated;
create or replace function native_private.deliver_reminders()returns integer language plpgsql security definer set search_path='' as $$declare n integer;begin
 with due as(update native_private.reminders set delivered=true where not delivered and due_at<=now()returning *)insert into public.native_notifications(user_id,event_id,occurrence,due_at,title)select user_id,event_id,occurrence,due_at,title from due where native_private.reminder_occurrence_allowed(event_id,user_id,occurrence)on conflict do nothing;
 get diagnostics n=row_count;return n;end$$;
revoke all on function native_private.deliver_reminders()from public,anon,authenticated;
create function native_private.touch_exception_parent()returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE'or(tg_op='UPDATE'and old.event_id is distinct from new.event_id)then update public.native_events set updated_at=clock_timestamp()where id=old.event_id;delete from native_private.reminders where event_id=old.event_id and not delivered;end if;
 if tg_op<>'DELETE'then update public.native_events set updated_at=clock_timestamp()where id=new.event_id;delete from native_private.reminders where event_id=new.event_id and not delivered;return new;end if;return old;
end$$;
revoke all on function native_private.touch_exception_parent()from public,anon,authenticated;
create trigger native_exception_parent after insert or update or delete on public.native_exceptions for each row execute function native_private.touch_exception_parent();
create function native_private.event_revision()returns trigger language plpgsql set search_path='' as $$begin new.revision=old.revision+1;return new;end$$;
revoke all on function native_private.event_revision()from public,anon,authenticated;
create trigger native_event_revision before update on public.native_events for each row execute function native_private.event_revision();
create function native_private.invalidate_event_jobs()returns trigger language plpgsql security definer set search_path='' as $$begin delete from native_private.reminders where event_id=new.id and not delivered;return new;end$$;
revoke all on function native_private.invalidate_event_jobs()from public,anon,authenticated;
create trigger native_event_jobs after update of data,calendar_id on public.native_events for each row execute function native_private.invalidate_event_jobs();
create function public.native_default_calendar(cid uuid)returns void language plpgsql security invoker set search_path='' as $$begin
 if not exists(select 1 from public.native_calendars where id=cid and owner_id=auth.uid())then raise exception 'Choose a calendar you own';end if;
 perform id from public.native_calendars where owner_id=auth.uid()order by id for update;
 update public.native_calendars set is_default=(id=cid)where owner_id=auth.uid();end$$;
revoke all on function public.native_default_calendar(uuid)from public,anon,authenticated;grant execute on function public.native_default_calendar(uuid)to authenticated;

-- Lock/check the snapshot revision before replacing outbox jobs.
create or replace function public.native_broker(payload text,signature text)returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; k text; f public.native_forms; v public.native_form_versions; result jsonb; uid uuid; rid uuid; n integer; ratekey text;
begin
 select secret into k from native_private.keys where id='v1';
 if k is null or signature is distinct from encode(extensions.hmac(payload,k,'sha256'),'hex')then raise exception 'Invalid server authorization';end if;
 p:=payload::jsonb;
 if abs(extract(epoch from now())-(p->>'ts')::numeric)>90 then raise exception 'Expired authorization';end if;
 if p->>'op'='reminder_snapshot' then
 return jsonb_build_object('events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb)from public.native_events e where jsonb_array_length(e.data->'reminders')>0),'exceptions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from public.native_exceptions x));
 end if;
 if p->>'op'='reminder_seed' then
  uid:=(p->>'user_id')::uuid;
  perform 1 from public.native_events e where e.id=(p->>'event_id')::uuid and e.owner_id=uid and e.revision=(p->>'revision')::integer for update;if not found then raise exception 'The event changed. Reload before scheduling reminders.';end if;
  delete from native_private.reminders where event_id=(p->>'event_id')::uuid and not delivered;
  insert into native_private.reminders(event_id,user_id,occurrence,due_at,title)select (p->>'event_id')::uuid,uid,x->>'occurrence',(x->>'due_at')::timestamptz,left(x->>'title',180)from jsonb_array_elements(p->'jobs')x on conflict do nothing;
  return jsonb_build_object('seeded',jsonb_array_length(p->'jobs'));
 end if;
 if p->>'op'='rate' then
  ratekey:=p->>'key';
  insert into native_private.rate_windows values(ratekey,now(),1)on conflict(key)do update set count=case when native_private.rate_windows.started_at<now()-interval '1 minute' then 1 else native_private.rate_windows.count+1 end,started_at=case when native_private.rate_windows.started_at<now()-interval '1 minute' then now()else native_private.rate_windows.started_at end returning count into n;
  if n>10 then raise exception 'Too many requests. Wait a minute.';end if;
  delete from native_private.rate_windows where started_at<now()-interval '2 days';return 'true'::jsonb;
 end if;
 if p->>'op'='publish' then
  select * into f from public.native_forms where id=(p->>'form_id')::uuid and owner_id=(p->>'user_id')::uuid for update;
  if f.id is null or f.deleted_at is not null then raise exception 'Form unavailable';end if;
  if f.revision<>(p->>'revision')::integer then raise exception 'The draft changed. Reload before publishing.';end if;
  if f.draft<>p->'schema' then raise exception 'Save the draft before publishing.';end if;
  select * into v from public.native_form_versions where form_id=f.id order by number desc limit 1;
  if v.id is null or v.schema<>p->'schema' then
   insert into public.native_form_versions(form_id,schema,number)values(f.id,p->'schema',coalesce(v.number,0)+1)returning * into v;
  end if;
  update public.native_forms set current_version=v.id,status='published',updated_at=now()where id=f.id;
  return to_jsonb(v);
 end if;
 select * into f from public.native_forms where public_token=(p->>'token')::uuid and deleted_at is null for update;
 if f.id is null or f.status<>'published' or f.closes_at<=now()then raise exception 'This form is not accepting responses.';end if;
 uid:=nullif(p->>'user_id','')::uuid;
 if f.access='authenticated' and uid is null then raise exception 'Sign in to respond to this form.';end if;
 select * into v from public.native_form_versions where id=f.current_version;
 if p->>'op'='load' then return jsonb_build_object('id',f.id,'version_id',v.id,'schema',v.schema,'access',f.access,'closes_at',f.closes_at,'max_responses',f.max_responses);end if;
 if p->>'op'<>'submit' then raise exception 'Unknown operation';end if;
 rid:=(p->>'response_id')::uuid;
 select jsonb_build_object('id',r.id,'created_at',r.created_at)into result from public.native_responses r join native_private.submission_keys s on s.response_id=r.id where r.id=rid and r.form_id=f.id and s.receipt_hash=p->>'receipt_hash';
 if result is not null then return result;end if;
 if v.id<>(p->>'version_id')::uuid then raise exception 'The form changed. Reload and review your answers before submitting.';end if;
 if f.max_responses is not null and(select count(*)from public.native_responses where form_id=f.id)>=f.max_responses then raise exception 'The response limit has been reached.';end if;
 if f.one_per_user and exists(select 1 from native_private.submission_keys where form_id=f.id and user_id=uid)then raise exception 'You have already submitted a response.';end if;
 insert into public.native_responses(id,form_id,version_id,answers,score)values(rid,f.id,v.id,p->'answers',p->'score');
 insert into native_private.submission_keys values(rid,f.id,uid,p->>'receipt_hash',p->>'client_hash');
 return jsonb_build_object('id',rid,'created_at',now());
end$$;
revoke all on function public.native_broker(text,text)from public,anon,authenticated;grant execute on function public.native_broker(text,text)to anon;
