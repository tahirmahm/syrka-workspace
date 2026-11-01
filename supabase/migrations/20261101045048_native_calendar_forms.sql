-- Additive native apps. No existing Workspace table or policy is changed.
create schema if not exists native_private;
revoke all on schema native_private from public, anon, authenticated;
create table native_private.keys(id text primary key, secret text not null);
create table public.native_calendars(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,name text not null check(length(name) between 1 and 100),colour text not null default '#5379b8' check(colour ~ '^#[0-9a-fA-F]{6}$'),time_zone text not null default 'UTC',is_default boolean not null default false,created_at timestamptz not null default now());
create table public.native_calendar_shares(calendar_id uuid references public.native_calendars on delete cascade,user_id uuid references auth.users on delete cascade,role text not null check(role in('viewer','editor')),primary key(calendar_id,user_id));
create table public.native_events(id uuid primary key,calendar_id uuid not null references public.native_calendars on delete cascade,owner_id uuid not null references auth.users on delete cascade,data jsonb not null check(jsonb_typeof(data)='object'),revision integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index native_events_calendar on public.native_events(calendar_id);
create table public.native_exceptions(event_id uuid not null references public.native_events on delete cascade,original_start text not null,cancelled boolean not null default false,override jsonb,primary key(event_id,original_start));
create table public.native_notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,event_id uuid not null references public.native_events on delete cascade,occurrence text not null,due_at timestamptz not null,title text not null,read boolean not null default false,created_at timestamptz not null default now(),unique(user_id,event_id,occurrence,due_at));
create index native_notifications_user on public.native_notifications(user_id,created_at desc);
create table native_private.reminders(event_id uuid references public.native_events on delete cascade,user_id uuid references auth.users on delete cascade,occurrence text not null,due_at timestamptz not null,title text not null,delivered boolean not null default false,primary key(event_id,user_id,occurrence,due_at));
create index native_reminders_due on native_private.reminders(due_at)where not delivered;
create table public.native_forms(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,title text not null check(length(title)between 1 and 180),draft jsonb not null,revision integer not null default 0,status text not null default 'draft' check(status in('draft','published','closed','archived')),public_token uuid not null unique default gen_random_uuid(),current_version uuid,access text not null default 'public' check(access in('public','authenticated')),closes_at timestamptz,max_responses integer check(max_responses between 1 and 1000000),one_per_user boolean not null default false,deleted_at timestamptz,updated_at timestamptz not null default now(),check(not one_per_user or access='authenticated'));
create table public.native_form_versions(id uuid primary key default gen_random_uuid(),form_id uuid not null references public.native_forms on delete cascade,schema jsonb not null,number integer not null,created_at timestamptz not null default now(),unique(form_id,number));
alter table public.native_forms add constraint native_forms_version foreign key(current_version)references public.native_form_versions(id);
create table public.native_responses(id uuid primary key,form_id uuid not null references public.native_forms on delete cascade,version_id uuid not null references public.native_form_versions,answers jsonb not null,score jsonb,created_at timestamptz not null default now());
create index native_responses_form on public.native_responses(form_id,created_at desc);
create table native_private.submission_keys(response_id uuid primary key references public.native_responses on delete cascade,form_id uuid not null references public.native_forms on delete cascade,user_id uuid,receipt_hash text not null,client_hash text not null);
create index native_submission_user on native_private.submission_keys(form_id,user_id);
create table native_private.rate_windows(key text primary key,started_at timestamptz not null,count integer not null);
create table public.native_proposals(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,source text not null,idempotency_key text not null,payload jsonb not null,status text not null default 'pending' check(status in('pending','approved','rejected')),created_at timestamptz not null default now(),unique(owner_id,source,idempotency_key));
create or replace function public.native_calendar_role(cid uuid)returns text language sql stable security definer set search_path='' as $$select case when c.owner_id=auth.uid()then 'owner' else s.role end from public.native_calendars c left join public.native_calendar_shares s on s.calendar_id=c.id and s.user_id=auth.uid()where c.id=cid$$;
revoke all on function public.native_calendar_role(uuid)from public;grant execute on function public.native_calendar_role(uuid)to authenticated;
create function public.native_event_access(eid uuid,writing boolean default false)returns boolean language sql stable security definer set search_path='' as $$select coalesce(public.native_calendar_role(e.calendar_id)in('owner','editor')or(not writing and public.native_calendar_role(e.calendar_id)='viewer' and e.data->>'visibility'='calendar'),false)from public.native_events e where e.id=eid$$;
revoke all on function public.native_event_access(uuid,boolean)from public;grant execute on function public.native_event_access(uuid,boolean)to authenticated;
alter table public.native_calendars enable row level security;
alter table public.native_calendar_shares enable row level security;
alter table public.native_events enable row level security;
alter table public.native_exceptions enable row level security;
alter table public.native_notifications enable row level security;
alter table public.native_forms enable row level security;
alter table public.native_form_versions enable row level security;
alter table public.native_responses enable row level security;
alter table public.native_proposals enable row level security;
create policy calendar_read on public.native_calendars for select to authenticated using(public.native_calendar_role(id)is not null);
create policy calendar_own on public.native_calendars for all to authenticated using(owner_id=(select auth.uid()))with check(owner_id=(select auth.uid()));
create policy calendar_share_read on public.native_calendar_shares for select to authenticated using(user_id=(select auth.uid())or public.native_calendar_role(calendar_id)='owner');
create policy calendar_share_manage on public.native_calendar_shares for all to authenticated using(public.native_calendar_role(calendar_id)='owner')with check(public.native_calendar_role(calendar_id)='owner');
create policy event_read on public.native_events for select to authenticated using(public.native_event_access(id));
create policy event_insert on public.native_events for insert to authenticated with check(owner_id=(select auth.uid())and public.native_calendar_role(calendar_id)in('owner','editor'));
create policy event_update on public.native_events for update to authenticated using(public.native_event_access(id,true))with check(public.native_calendar_role(calendar_id)in('owner','editor'));
create policy event_delete on public.native_events for delete to authenticated using(public.native_event_access(id,true));
create policy exception_read on public.native_exceptions for select to authenticated using(public.native_event_access(event_id));
create policy exception_write on public.native_exceptions for all to authenticated using(public.native_event_access(event_id,true))with check(public.native_event_access(event_id,true));
create policy notification_own on public.native_notifications for select to authenticated using(user_id=(select auth.uid()));
create policy notification_read on public.native_notifications for update to authenticated using(user_id=(select auth.uid()))with check(user_id=(select auth.uid()));
create policy forms_own on public.native_forms for all to authenticated using(owner_id=(select auth.uid()))with check(owner_id=(select auth.uid()));
create policy versions_read on public.native_form_versions for select to authenticated using(exists(select 1 from public.native_forms f where f.id=form_id and f.owner_id=(select auth.uid())));
create policy responses_read on public.native_responses for select to authenticated using(exists(select 1 from public.native_forms f where f.id=form_id and f.owner_id=(select auth.uid())));
create policy responses_delete on public.native_responses for delete to authenticated using(exists(select 1 from public.native_forms f where f.id=form_id and f.owner_id=(select auth.uid())));
create policy proposals_own on public.native_proposals for all to authenticated using(owner_id=(select auth.uid()))with check(owner_id=(select auth.uid()));
grant select,insert,update,delete on public.native_calendars,public.native_calendar_shares,public.native_events,public.native_exceptions,public.native_forms,public.native_proposals to authenticated;
grant select on public.native_form_versions to authenticated;
grant select,delete on public.native_responses to authenticated;
grant select,update on public.native_notifications to authenticated;
-- No anon table grants. This broker verifies a server-only MAC before any public operation.
create function public.native_broker(payload text,signature text)returns jsonb language plpgsql security definer set search_path='' as $$
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
  if not exists(select 1 from public.native_events e where e.id=(p->>'event_id')::uuid and e.owner_id=uid)then raise exception 'Event unavailable';end if;
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
revoke all on function public.native_broker(text,text)from public;
grant execute on function public.native_broker(text,text)to anon,authenticated;
-- Durable, transactionally idempotent in-app delivery; no browser timers or email claims.
create function native_private.deliver_reminders()returns integer language plpgsql security definer set search_path='' as $$declare n integer;begin
 with due as(update native_private.reminders set delivered=true where not delivered and due_at<=now()returning *)insert into public.native_notifications(user_id,event_id,occurrence,due_at,title)select user_id,event_id,occurrence,due_at,title from due on conflict do nothing;
 get diagnostics n=row_count;return n;end$$;
revoke all on function native_private.deliver_reminders()from public,anon,authenticated;

-- A version cannot be attached to another owner's form, even by a direct REST update.
alter table public.native_form_versions add constraint native_version_form unique(id,form_id);
alter table public.native_forms add constraint native_form_version_pair foreign key(current_version,id)references public.native_form_versions(id,form_id);
create function native_private.event_identity()returns trigger language plpgsql set search_path='' as $$begin
 if new.id<>old.id or new.owner_id<>old.owner_id then raise exception 'Event identity and ownership are immutable';end if;return new;end$$;
create trigger native_event_identity before update on public.native_events for each row execute function native_private.event_identity();
alter table native_private.keys enable row level security;
alter table native_private.reminders enable row level security;
alter table native_private.submission_keys enable row level security;
alter table native_private.rate_windows enable row level security;
revoke all on all tables in schema native_private from public,anon,authenticated;
revoke all on all functions in schema native_private from public,anon,authenticated;
