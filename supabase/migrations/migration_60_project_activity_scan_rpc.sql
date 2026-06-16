-- migration_60_project_activity_scan_rpc.sql
-- RPC : scan created_at / updated_at → activité projet (JSON).

create or replace function public.scan_project_activity_timestamps()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_sql text;
  v_columns jsonb := '[]'::jsonb;
  v_by_table jsonb := '[]'::jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_first timestamptz;
  v_last timestamptz;
  v_cols_ok int := 0;
  v_cols_err int := 0;
  v_row record;
begin
  create temp table _project_ts_scan (
    table_name       text not null,
    column_name      text not null,
    data_type        text not null,
    rows_total       bigint not null default 0,
    rows_non_null    bigint not null default 0,
    first_activity   timestamptz null,
    last_activity    timestamptz null,
    scan_error       text null,
    primary key (table_name, column_name)
  ) on commit drop;

  create temp table _project_daily (
    day date not null,
    event_count bigint not null default 0,
    primary key (day)
  ) on commit drop;

  for r in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name in ('created_at', 'updated_at')
      and c.data_type in (
        'timestamp with time zone',
        'timestamp without time zone',
        'date'
      )
    order by c.table_name, c.column_name
  loop
    begin
      if r.data_type = 'date' then
        v_sql := format(
          $q$insert into _project_ts_scan
            select %L, %L, %L, count(*), count(%I),
                   min(%I::timestamp)::timestamptz, max(%I::timestamp)::timestamptz, null
            from public.%I$q$,
          r.table_name, r.column_name, r.data_type,
          r.column_name, r.column_name, r.column_name, r.table_name
        );
      elsif r.data_type = 'timestamp without time zone' then
        v_sql := format(
          $q$insert into _project_ts_scan
            select %L, %L, %L, count(*), count(%I),
                   min(%I at time zone 'UTC'), max(%I at time zone 'UTC'), null
            from public.%I$q$,
          r.table_name, r.column_name, r.data_type,
          r.column_name, r.column_name, r.column_name, r.table_name
        );
      else
        v_sql := format(
          $q$insert into _project_ts_scan
            select %L, %L, %L, count(*), count(%I),
                   min(%I), max(%I), null
            from public.%I$q$,
          r.table_name, r.column_name, r.data_type,
          r.column_name, r.column_name, r.column_name, r.table_name
        );
      end if;
      execute v_sql;

      if r.column_name = 'created_at' then
        if r.data_type = 'date' then
          v_sql := format(
            $q$insert into _project_daily (day, event_count)
            select (%I::timestamp)::date, count(*)
            from public.%I where %I is not null
            group by 1
            on conflict (day) do update set event_count = _project_daily.event_count + excluded.event_count$q$,
            r.column_name, r.table_name, r.column_name
          );
        elsif r.data_type = 'timestamp without time zone' then
          v_sql := format(
            $q$insert into _project_daily (day, event_count)
            select ((%I at time zone 'UTC') at time zone 'Europe/Paris')::date, count(*)
            from public.%I where %I is not null
            group by 1
            on conflict (day) do update set event_count = _project_daily.event_count + excluded.event_count$q$,
            r.column_name, r.table_name, r.column_name
          );
        else
          v_sql := format(
            $q$insert into _project_daily (day, event_count)
            select (%I at time zone 'Europe/Paris')::date, count(*)
            from public.%I where %I is not null
            group by 1
            on conflict (day) do update set event_count = _project_daily.event_count + excluded.event_count$q$,
            r.column_name, r.table_name, r.column_name
          );
        end if;
        begin
          execute v_sql;
        exception when others then
          null;
        end;
      end if;

    exception when others then
      insert into _project_ts_scan (table_name, column_name, data_type, scan_error)
      values (r.table_name, r.column_name, r.data_type, sqlerrm);
    end;
  end loop;

  select jsonb_agg(to_jsonb(t) order by t.table_name, t.column_name)
  into v_columns
  from (
    select table_name, column_name, data_type, rows_total, rows_non_null,
           first_activity, last_activity, scan_error
    from _project_ts_scan
  ) t;

  select jsonb_agg(to_jsonb(t) order by t.table_name)
  into v_by_table
  from (
    select table_name,
           min(first_activity) as first_activity,
           max(last_activity) as last_activity,
           sum(rows_total) as rows_total,
           sum(rows_non_null) as rows_non_null
    from _project_ts_scan
    where scan_error is null
    group by table_name
  ) t;

  select jsonb_agg(to_jsonb(t) order by t.day)
  into v_daily
  from (
    select day, event_count from _project_daily
  ) t;

  select min(first_activity), max(last_activity),
         count(*) filter (where scan_error is null),
         count(*) filter (where scan_error is not null)
  into v_first, v_last, v_cols_ok, v_cols_err
  from _project_ts_scan;

  return jsonb_build_object(
    'scanned_at', now(),
    'timezone', 'Europe/Paris',
    'summary', jsonb_build_object(
      'project_first_activity', v_first,
      'project_last_activity', v_last,
      'columns_scanned_ok', v_cols_ok,
      'columns_scan_errors', v_cols_err
    ),
    'columns', coalesce(v_columns, '[]'::jsonb),
    'by_table', coalesce(v_by_table, '[]'::jsonb),
    'daily_activity', coalesce(v_daily, '[]'::jsonb)
  );
end;
$$;

comment on function public.scan_project_activity_timestamps() is
  'Scan public.created_at / updated_at : min/max par table et activité journalière (created_at).';

revoke all on function public.scan_project_activity_timestamps() from public;
grant execute on function public.scan_project_activity_timestamps() to service_role;
