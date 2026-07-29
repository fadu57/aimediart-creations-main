-- Chiffre d'affaires : saisies manuelles (miroirs des coûts manuels).
-- Accès : admins globaux role_id 1-2 (même helper is_cost_admin).

create table if not exists public.revenue_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  label text not null,
  category text not null default 'abonnement',
  client_name text null,
  agency_id uuid null references public.agencies(id) on delete set null,
  amount_ttc numeric(14, 2) not null check (amount_ttc >= 0),
  currency text not null default 'EUR',
  vat_rate numeric(5, 2) not null default 20,
  invoice_ref text null,
  status text not null default 'draft'
    check (status in ('draft', 'invoiced', 'paid', 'cancelled')),
  note text null,
  documents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null
);

comment on table public.revenue_entries is
  'Lignes de chiffre d''affaires (factures / encaissements) — saisie manuelle admins 1-2.';

create index if not exists revenue_entries_date_idx on public.revenue_entries (entry_date desc);
create index if not exists revenue_entries_status_idx on public.revenue_entries (status);
create index if not exists revenue_entries_category_idx on public.revenue_entries (category);

alter table public.revenue_entries enable row level security;

drop policy if exists "revenue_entries_select_admin" on public.revenue_entries;
create policy "revenue_entries_select_admin"
  on public.revenue_entries for select
  to authenticated
  using (public.is_cost_admin());

drop policy if exists "revenue_entries_insert_admin" on public.revenue_entries;
create policy "revenue_entries_insert_admin"
  on public.revenue_entries for insert
  to authenticated
  with check (public.is_cost_admin());

drop policy if exists "revenue_entries_update_admin" on public.revenue_entries;
create policy "revenue_entries_update_admin"
  on public.revenue_entries for update
  to authenticated
  using (public.is_cost_admin())
  with check (public.is_cost_admin());

drop policy if exists "revenue_entries_delete_admin" on public.revenue_entries;
create policy "revenue_entries_delete_admin"
  on public.revenue_entries for delete
  to authenticated
  using (public.is_cost_admin());

-- Bucket pièces jointes (factures clients)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'revenue-documents',
  'revenue-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

drop policy if exists "revenue_documents_select_admin" on storage.objects;
create policy "revenue_documents_select_admin"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'revenue-documents' and public.is_cost_admin());

drop policy if exists "revenue_documents_insert_admin" on storage.objects;
create policy "revenue_documents_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'revenue-documents' and public.is_cost_admin());

drop policy if exists "revenue_documents_update_admin" on storage.objects;
create policy "revenue_documents_update_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'revenue-documents' and public.is_cost_admin());

drop policy if exists "revenue_documents_delete_admin" on storage.objects;
create policy "revenue_documents_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'revenue-documents' and public.is_cost_admin());
