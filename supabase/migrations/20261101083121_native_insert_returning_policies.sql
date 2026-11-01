-- INSERT/UPSERT ... RETURNING checks SELECT policies within the same statement.
-- A STABLE self-lookup cannot see the newly inserted row yet. Authorize the
-- returned row from its own columns and the existing parent calendar instead.
alter policy calendar_read on public.native_calendars
  using (owner_id = (select auth.uid()) or public.native_calendar_role(id) is not null);

alter policy event_read on public.native_events
  using (
    public.native_calendar_role(calendar_id) in ('owner', 'editor')
    or (
      public.native_calendar_role(calendar_id) = 'viewer'
      and data->>'visibility' = 'calendar'
    )
  );
