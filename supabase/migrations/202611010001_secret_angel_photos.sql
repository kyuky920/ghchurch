-- Private photo bucket. There are intentionally no client storage policies.
-- Uploads/download signing pass through the authenticated participant API with
-- the existing service role. Never put the service key in a browser bundle.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('secret-angel-photos', 'secret-angel-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg'];
-- Existing season JSON gains optional fields lazily. No participant/session
-- rows, assignments or historical mission records need rewriting.
