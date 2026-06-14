-- migration_75_supabase_db_monitoring_rpc.sql
-- Instantané SQL pour le suivi base Supabase (taille, connexions, objets volumineux).

create or replace function public.get_supabase_db_relation_sizes(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_db_size bigint;
  v_conn_count int;
  v_conn_max int;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 50;
  elsif p_limit > 200 then
    p_limit := 200;
  end if;

  select pg_database_size(current_database()) into v_db_size;

  select count(*)::int
  from pg_stat_activity
  where datname = current_database()
  into v_conn_count;

  select coalesce(
    (select setting::int from pg_settings where name = 'max_connections'),
    0
  ) into v_conn_max;

  return jsonb_build_object(
    'database_name', current_database(),
    'database_size_bytes', v_db_size,
    'active_connections', v_conn_count,
    'max_connections', v_conn_max,
    'fetched_at', now(),
    'large_objects', coalesce((
      select jsonb_agg(obj order by (obj->>'total_bytes')::bigint desc)
      from (
        select jsonb_build_object(
          'object_name', format('%I.%I', n.nspname, c.relname),
          'schema_name', n.nspname,
          'relation_name', c.relname,
          'kind', case c.relkind
            when 'r' then 'table'
            when 'i' then 'index'
            when 't' then 'toast'
            when 'm' then 'materialized_view'
            when 'S' then 'sequence'
            else c.relkind::text
          end,
          'total_bytes', pg_total_relation_size(c.oid),
          'data_bytes', pg_relation_size(c.oid),
          'index_bytes', pg_indexes_size(c.oid),
          'share_pct', case
            when v_db_size > 0 then round(
              (pg_total_relation_size(c.oid)::numeric / v_db_size::numeric) * 100,
              2
            )
            else 0
          end
        ) as obj
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'i', 't', 'm')
          and n.nspname not in ('pg_catalog', 'information_schema')
        order by pg_total_relation_size(c.oid) desc
        limit p_limit
      ) ranked
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_supabase_db_relation_sizes(int) is
  'Instantané taille BDD, connexions actives et plus gros objets (service_role / Edge Functions).';

revoke all on function public.get_supabase_db_relation_sizes(int) from public;
grant execute on function public.get_supabase_db_relation_sizes(int) to service_role;
