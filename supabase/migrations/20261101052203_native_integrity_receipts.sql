-- Canonical IDs prevent malformed JSON from masquerading as a different record.
alter table public.native_events add constraint native_event_model_identity check(coalesce(data->>'id'=id::text and data->>'calendar_id'=calendar_id::text,false));
create unique index native_calendar_ical_uid on public.native_events(calendar_id,(data->'source'->>'record_id'))where data->'source'->>'system'='ical';
-- A retry can recover its receipt even after the owner publishes or closes a form.
-- No answers, identity, storage paths or answer keys are returned.
create function public.native_receipt_broker(payload text,signature text)returns jsonb language plpgsql security definer set search_path='' as $$declare p jsonb;k text;result jsonb;begin
 select secret into k from native_private.keys where id='v1';if k is null or signature is distinct from encode(extensions.hmac(payload,k,'sha256'),'hex')then raise exception 'Invalid server authorization';end if;p:=payload::jsonb;if p->>'op'<>'receipt' or abs(extract(epoch from now())-(p->>'ts')::numeric)>90 then raise exception 'Expired or invalid authorization';end if;
 select jsonb_build_object('id',r.id,'created_at',r.created_at,'confirmation',v.schema->>'confirmation')into result from public.native_responses r join public.native_forms f on f.id=r.form_id join public.native_form_versions v on v.id=r.version_id join native_private.submission_keys s on s.response_id=r.id where f.public_token=(p->>'token')::uuid and r.id=(p->>'response_id')::uuid and s.receipt_hash=p->>'receipt_hash';
 return result;
end$$;
revoke all on function public.native_receipt_broker(text,text)from public,anon,authenticated;
grant execute on function public.native_receipt_broker(text,text)to anon;
