-- Agrégation serveur des coûts (évite la limite PostgREST 1000 lignes côté client).
create or replace function public.get_ai_usage_cost_rollup()
returns table (
  provider text,
  currency text,
  call_count bigint,
  sum_cost numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.provider,
    upper(coalesce(e.currency, 'USD')) as currency,
    count(*)::bigint as call_count,
    coalesce(sum(e.cost_estimated), 0)::numeric as sum_cost
  from public.ai_usage_events e
  group by e.provider, upper(coalesce(e.currency, 'USD'))
  order by e.provider, upper(coalesce(e.currency, 'USD'));
$$;

comment on function public.get_ai_usage_cost_rollup() is
  'Synthèse coûts par fournisseur/devise — utilisée par Paramètres → Coûts (KPI globaux).';

grant execute on function public.get_ai_usage_cost_rollup() to authenticated;

create or replace function public.count_ai_usage_events()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint from public.ai_usage_events;
$$;

grant execute on function public.count_ai_usage_events() to authenticated;
