-- Preserve note authorization while avoiding redundant SELECT policy evaluation.
drop policy session_notes_write on public.session_notes;
create policy session_notes_insert on public.session_notes for insert to authenticated with check(session_private.is_host(room_id));
create policy session_notes_update on public.session_notes for update to authenticated using(session_private.is_host(room_id))with check(session_private.is_host(room_id));
create policy session_notes_delete on public.session_notes for delete to authenticated using(session_private.is_host(room_id));
create index session_cards_room on public.session_cards(room_id);
-- Explicit client denial documents the private ledger's intended access; grants stay revoked.
create policy session_usage_deny_clients on session_private.usage_daily for all to authenticated using(false)with check(false);
