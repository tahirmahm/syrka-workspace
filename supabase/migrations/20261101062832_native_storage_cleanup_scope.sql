-- SELECT is also used by Storage delete operations. Permit it ONLY during exact
-- deletion operations, never for anonymous listing, reads or URL signing.
alter policy native_form_orphan_read on storage.objects using(bucket_id='office-form-uploads'and storage.allow_any_operation(array['object.delete','object.delete_many'])and public.native_upload_expired(name));
alter policy native_form_orphan_delete on storage.objects using(bucket_id='office-form-uploads'and storage.allow_any_operation(array['object.delete','object.delete_many'])and public.native_upload_expired(name));
