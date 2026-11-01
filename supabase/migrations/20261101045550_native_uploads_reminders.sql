-- Separate private Forms bucket; existing office-assets is untouched.
create table public.native_attachments(id uuid primary key,form_id uuid not null references public.native_forms on delete cascade,version_id uuid not null references public.native_form_versions,response_id uuid not null,question_id uuid not null,object_path text not null unique,filename text not null,mime text not null,bytes integer not null check(bytes between 1 and 2097152),receipt_hash text not null,upload_expires timestamptz not null,created_at timestamptz not null default now());
alter table public.native_attachments enable row level security;
create policy native_attachment_owner on public.native_attachments for select to authenticated using(exists(select 1 from public.native_forms f where f.id=form_id and f.owner_id=(select auth.uid())));
grant select on public.native_attachments to authenticated;
create index native_attachments_form on public.native_attachments(form_id,response_id);
create table native_private.upload_garbage(path text primary key,created_at timestamptz not null default now());
alter table native_private.upload_garbage enable row level security;
revoke all on native_private.upload_garbage from public,anon,authenticated;
create function native_private.queue_upload_delete()returns trigger language plpgsql security definer set search_path='' as $$begin insert into native_private.upload_garbage(path)values(old.object_path)on conflict do nothing;return old;end$$;
revoke all on function native_private.queue_upload_delete()from public,anon,authenticated;
create trigger native_upload_delete before delete on public.native_attachments for each row execute function native_private.queue_upload_delete();
create function public.native_upload_expired(path text)returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from native_private.upload_garbage g where g.path=$1)or exists(select 1 from public.native_attachments a where a.object_path=$1 and a.created_at<now()-interval '1 day' and not exists(select 1 from public.native_responses r where r.id=a.response_id))$$;
revoke all on function public.native_upload_expired(text)from public;grant execute on function public.native_upload_expired(text)to anon;
create function public.native_attachment_access(path text,writing boolean)returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.native_attachments a where a.object_path=path and case when writing then a.upload_expires>now()and not exists(select 1 from public.native_responses r where r.id=a.response_id)else exists(select 1 from public.native_forms f where f.id=a.form_id and f.owner_id=auth.uid())and exists(select 1 from public.native_responses r where r.id=a.response_id)end)$$;
revoke all on function public.native_attachment_access(text,boolean)from public;grant execute on function public.native_attachment_access(text,boolean)to anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('office-form-uploads','office-form-uploads',false,2097152,array['application/pdf','image/png','image/jpeg','text/plain'])on conflict(id)do nothing;
create policy native_form_upload on storage.objects for insert to anon,authenticated with check(bucket_id='office-form-uploads'and public.native_attachment_access(name,true));
create policy native_form_download on storage.objects for select to authenticated using(bucket_id='office-form-uploads'and public.native_attachment_access(name,false));
create policy native_form_orphan_read on storage.objects for select to anon using(bucket_id='office-form-uploads'and public.native_upload_expired(name));
create policy native_form_orphan_delete on storage.objects for delete to anon using(bucket_id='office-form-uploads'and public.native_upload_expired(name));
-- Isolated attachment broker, no unsigned public RPC may register objects or read metadata.
create function public.native_attachment_broker(payload text,signature text)returns jsonb language plpgsql security definer set search_path='' as $$declare p jsonb;k text;f public.native_forms;a public.native_attachments;begin
 select secret into k from native_private.keys where id='v1';if k is null or signature is distinct from encode(extensions.hmac(payload,k,'sha256'),'hex')then raise exception 'Invalid server authorization';end if;p:=payload::jsonb;if abs(extract(epoch from now())-(p->>'ts')::numeric)>90 then raise exception 'Expired authorization';end if;
 if p->>'op'='garbage' then
 return (select coalesce(jsonb_agg(path),'[]'::jsonb)from(select object_path as path from public.native_attachments a where a.created_at<now()-interval '1 day'and not exists(select 1 from public.native_responses r where r.id=a.response_id)union select path from native_private.upload_garbage limit 100)g);
 end if;
 if p->>'op'='cleaned' then
 delete from public.native_attachments a where a.object_path in(select jsonb_array_elements_text(p->'paths'))and a.created_at<now()-interval '1 day'and not exists(select 1 from public.native_responses r where r.id=a.response_id);
 delete from native_private.upload_garbage where path in(select jsonb_array_elements_text(p->'paths'));return 'true'::jsonb;
 end if;
 if p->>'op'='check' then
 select * into a from public.native_attachments where id=(p->>'id')::uuid and form_id=(p->>'form_id')::uuid and version_id=(p->>'version_id')::uuid and response_id=(p->>'response_id')::uuid and question_id=(p->>'question_id')::uuid and receipt_hash=p->>'receipt_hash';
 if a.id is null or not exists(select 1 from storage.objects o where o.bucket_id='office-form-uploads'and o.name=a.object_path)then raise exception 'Attachment unavailable. Upload the file again.';end if;return jsonb_build_object('id',a.id);
 end if;
 if p->>'op'<>'register' then raise exception 'Unknown attachment operation';end if;
 select * into f from public.native_forms where id=(p->>'form_id')::uuid and current_version=(p->>'version_id')::uuid and status='published'and deleted_at is null;
 if f.id is null or f.closes_at<=now()then raise exception 'Form is closed';end if;
 insert into public.native_attachments(id,form_id,version_id,response_id,question_id,object_path,filename,mime,bytes,receipt_hash,upload_expires)values((p->>'id')::uuid,f.id,f.current_version,(p->>'response_id')::uuid,(p->>'question_id')::uuid,p->>'path',left(p->>'filename',180),p->>'mime',(p->>'bytes')::integer,p->>'receipt_hash',now()+interval '1 hour')returning * into a;return to_jsonb(a);
end$$;
revoke all on function public.native_attachment_broker(text,text)from public;grant execute on function public.native_attachment_broker(text,text)to anon;
-- Hosted scheduling extensions are available on the existing free project.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create table native_private.worker_config(id boolean primary key default true check(id),url text not null check(url ~ '^https://[a-zA-Z0-9-]+\.vercel\.app/workspace/api/native/worker$'));
alter table native_private.worker_config enable row level security;
revoke all on native_private.worker_config from public,anon,authenticated;
create function native_private.refill_reminders()returns bigint language plpgsql security definer set search_path='' as $$declare target text;k text;ts text;begin
 if not exists(select 1 from public.native_events e where jsonb_array_length(e.data->'reminders')>0)and not exists(select 1 from public.native_attachments)and not exists(select 1 from native_private.upload_garbage)then return null;end if;
 select url into target from native_private.worker_config where id;select secret into k from native_private.keys where id='v1';if target is null or k is null then return null;end if;
 ts:=floor(extract(epoch from now()))::text;
 return net.http_post(url:=target,body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-syrka-time',ts,'x-syrka-signature',encode(extensions.hmac('reminder-worker:'||ts,k,'sha256'),'hex')),timeout_milliseconds:=55000);
end$$;
revoke all on function native_private.refill_reminders()from public,anon,authenticated;
select cron.schedule('syrka-native-reminder-delivery','* * * * *','select native_private.deliver_reminders()');
select cron.schedule('syrka-native-reminder-refill','17 3 * * *','select native_private.refill_reminders()');
