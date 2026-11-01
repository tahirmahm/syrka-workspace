-- Supabase default privileges can include grants that a subsequent GRANT does not
-- narrow. Explicitly reset privileges on ONLY the new native objects.
revoke all on public.native_calendars,public.native_calendar_shares,public.native_events,public.native_exceptions,public.native_notifications,public.native_forms,public.native_form_versions,public.native_responses,public.native_proposals,public.native_attachments,public.native_audit from public,anon,authenticated;
grant select,insert,update,delete on public.native_calendars,public.native_calendar_shares,public.native_events,public.native_exceptions,public.native_forms,public.native_proposals to authenticated;
grant select on public.native_form_versions,public.native_attachments,public.native_audit to authenticated;
grant select,delete on public.native_responses to authenticated;
grant select,update on public.native_notifications to authenticated;
revoke all on function public.native_calendar_role(uuid),public.native_event_access(uuid,boolean),public.native_form_counts()from public,anon,authenticated;
grant execute on function public.native_calendar_role(uuid),public.native_event_access(uuid,boolean),public.native_form_counts()to authenticated;
revoke all on function public.native_broker(text,text),public.native_attachment_broker(text,text)from public,anon,authenticated;
grant execute on function public.native_broker(text,text),public.native_attachment_broker(text,text)to anon;
revoke all on function public.native_attachment_access(text,boolean)from public,anon,authenticated;
grant execute on function public.native_attachment_access(text,boolean)to anon,authenticated;
revoke all on function public.native_upload_expired(text)from public,anon,authenticated;
grant execute on function public.native_upload_expired(text)to anon;
-- Private-schema deny-all RLS is intentional; only fixed definer functions run there.
revoke all on all functions in schema native_private from public,anon,authenticated;
revoke all on all tables in schema native_private from public,anon,authenticated;
do $$begin if exists(select 1 from pg_namespace where nspname='net')then
 execute 'revoke usage on schema net from public,anon,authenticated';
 execute 'revoke execute on all functions in schema net from public,anon,authenticated';
end if;end$$;
