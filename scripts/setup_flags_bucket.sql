insert into storage.buckets (id, name, public)
values ('flags', 'flags', true)
on conflict (id) do update set public = excluded.public;

alter table storage.objects enable row level security;

drop policy if exists "Public read flags" on storage.objects;
create policy "Public read flags"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'flags');
