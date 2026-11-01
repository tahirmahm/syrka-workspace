-- Recheck sharing/visibility at delivery, not only when a reminder was scheduled.
create function native_private.reminder_allowed(eid uuid,recipient uuid)returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.native_events e join public.native_calendars c on c.id=e.calendar_id left join public.native_calendar_shares s on s.calendar_id=c.id and s.user_id=recipient where e.id=eid and e.owner_id=recipient and(c.owner_id=recipient or s.role='editor' or(s.role='viewer'and e.data->>'visibility'='calendar')))$$;
revoke all on function native_private.reminder_allowed(uuid,uuid)from public,anon,authenticated;
create or replace function native_private.deliver_reminders()returns integer language plpgsql security definer set search_path='' as $$declare n integer;begin
 with due as(update native_private.reminders set delivered=true where not delivered and due_at<=now()returning *)insert into public.native_notifications(user_id,event_id,occurrence,due_at,title)select user_id,event_id,occurrence,due_at,title from due where native_private.reminder_allowed(event_id,user_id)on conflict do nothing;
 get diagnostics n=row_count;return n;end$$;
revoke all on function native_private.deliver_reminders()from public,anon,authenticated;
create function native_private.cancel_revoked_reminders()returns trigger language plpgsql security definer set search_path='' as $$begin delete from native_private.reminders r using public.native_events e where r.event_id=e.id and e.calendar_id=old.calendar_id and r.user_id=old.user_id and not r.delivered;return old;end$$;
revoke all on function native_private.cancel_revoked_reminders()from public,anon,authenticated;
create trigger native_share_reminders after delete or update on public.native_calendar_shares for each row execute function native_private.cancel_revoked_reminders();
-- Even owners cannot browse filenames from respondents who have not submitted.
alter policy native_attachment_owner on public.native_attachments using(exists(select 1 from public.native_forms f where f.id=form_id and f.owner_id=(select auth.uid()))and exists(select 1 from public.native_responses r where r.id=response_id));

-- Avoid PL/pgSQL row-variable / SQL-alias ambiguity in real orphan cleanup.
create or replace function public.native_attachment_broker(payload text,signature text)returns jsonb language plpgsql security definer set search_path='' as $$declare p jsonb;k text;f public.native_forms;attachment public.native_attachments;begin
 select secret into k from native_private.keys where id='v1';if k is null or signature is distinct from encode(extensions.hmac(payload,k,'sha256'),'hex')then raise exception 'Invalid server authorization';end if;p:=payload::jsonb;if abs(extract(epoch from now())-(p->>'ts')::numeric)>90 then raise exception 'Expired authorization';end if;
 if p->>'op'='garbage' then
 return (select coalesce(jsonb_agg(path),'[]'::jsonb)from(select object_path as path from public.native_attachments a where a.created_at<now()-interval '1 day'and not exists(select 1 from public.native_responses r where r.id=a.response_id)union select path from native_private.upload_garbage limit 100)g);
 end if;
 if p->>'op'='cleaned' then
 delete from public.native_attachments a where a.object_path in(select jsonb_array_elements_text(p->'paths'))and a.created_at<now()-interval '1 day'and not exists(select 1 from public.native_responses r where r.id=a.response_id);
 delete from native_private.upload_garbage where path in(select jsonb_array_elements_text(p->'paths'));return 'true'::jsonb;
 end if;
 if p->>'op'='check' then
 select * into attachment from public.native_attachments where id=(p->>'id')::uuid and form_id=(p->>'form_id')::uuid and version_id=(p->>'version_id')::uuid and response_id=(p->>'response_id')::uuid and question_id=(p->>'question_id')::uuid and receipt_hash=p->>'receipt_hash';
 if attachment.id is null or not exists(select 1 from storage.objects o where o.bucket_id='office-form-uploads'and o.name=a.object_path)then raise exception 'Attachment unavailable. Upload the file again.';end if;return jsonb_build_object('id',attachment.id);
 end if;
 if p->>'op'<>'register' then raise exception 'Unknown attachment operation';end if;
 select * into f from public.native_forms where id=(p->>'form_id')::uuid and current_version=(p->>'version_id')::uuid and status='published'and deleted_at is null;
 if f.id is null or f.closes_at<=now()then raise exception 'Form is closed';end if;
 insert into public.native_attachments(id,form_id,version_id,response_id,question_id,object_path,filename,mime,bytes,receipt_hash,upload_expires)values((p->>'id')::uuid,f.id,f.current_version,(p->>'response_id')::uuid,(p->>'question_id')::uuid,p->>'path',left(p->>'filename',180),p->>'mime',(p->>'bytes')::integer,p->>'receipt_hash',now()+interval '1 hour')returning * into attachment;return to_jsonb(attachment);
end$$;
revoke all on function public.native_attachment_broker(text,text)from public,anon,authenticated;
grant execute on function public.native_attachment_broker(text,text)to anon;
