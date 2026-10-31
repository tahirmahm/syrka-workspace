-- Anonymous waiting guests must use the minimal invitation lookup, never the
-- full room row. Permanent-user and course policies remain unchanged.
create policy guest_room_metadata on public.session_rooms as restrictive for select to authenticated
 using(not (select session_private.is_guest()) or session_private.is_member(id));
-- The private budget is writable only inside the constrained definer function.
create policy invitation_budget_deny_clients on session_private.invitation_limits for all to anon,authenticated
 using(false) with check(false);
