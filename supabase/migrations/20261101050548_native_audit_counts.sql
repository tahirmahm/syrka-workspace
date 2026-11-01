create index native_forms_owner_updated on public.native_forms(owner_id,updated_at desc);
create index native_calendars_owner on public.native_calendars(owner_id);
create index native_calendar_shares_user on public.native_calendar_shares(user_id,calendar_id);
create index native_events_owner on public.native_events(owner_id);
create table public.native_audit(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,actor_id uuid,object_id uuid not null,action text not null,created_at timestamptz not null default now());
alter table public.native_audit enable row level security;
create policy native_audit_owner on public.native_audit for select to authenticated using(owner_id=(select auth.uid()));
grant select on public.native_audit to authenticated;
create index native_audit_owner_created on public.native_audit(owner_id,created_at desc);
create function native_private.audit_form()returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status is distinct from old.status or new.access is distinct from old.access or new.deleted_at is distinct from old.deleted_at or new.current_version is distinct from old.current_version then
 insert into public.native_audit(owner_id,actor_id,object_id,action)values(new.owner_id,coalesce(auth.uid(),new.owner_id),new.id,'form_settings_or_publication_changed');end if;return new;end$$;
revoke all on function native_private.audit_form()from public,anon,authenticated;
create trigger native_form_audit after update on public.native_forms for each row execute function native_private.audit_form();
create function native_private.audit_response_delete()returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.native_audit(owner_id,actor_id,object_id,action)select f.owner_id,auth.uid(),old.id,'response_deleted'from public.native_forms f where f.id=old.form_id;return old;end$$;
revoke all on function native_private.audit_response_delete()from public,anon,authenticated;
create trigger native_response_audit before delete on public.native_responses for each row execute function native_private.audit_response_delete();
create function public.native_form_counts()returns table(form_id uuid,submissions bigint)language sql stable security invoker set search_path='' as $$select f.id,count(r.id)from public.native_forms f left join public.native_responses r on r.form_id=f.id where f.owner_id=(select auth.uid())group by f.id$$;
revoke all on function public.native_form_counts()from public;grant execute on function public.native_form_counts()to authenticated;
