-- ============================================================================
-- Scan activité projet — colonnes created_at / updated_at (schéma public)
-- À exécuter dans Supabase SQL Editor (rôle postgres / service).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) Inventaire : tables et colonnes created_at / updated_at
-- ---------------------------------------------------------------------------
SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND c.column_name IN ('created_at', 'updated_at')
ORDER BY c.table_name, c.column_name;


-- ---------------------------------------------------------------------------
-- B) Première / dernière activité par table et par colonne
--     (parcours dynamique de toutes les tables concernées)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_sql text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _project_ts_scan (
    table_name       text        NOT NULL,
    column_name      text        NOT NULL,
    data_type        text        NOT NULL,
    rows_total       bigint      NOT NULL DEFAULT 0,
    rows_non_null    bigint      NOT NULL DEFAULT 0,
    first_activity   timestamptz NULL,
    last_activity    timestamptz NULL,
    scan_error       text        NULL,
    PRIMARY KEY (table_name, column_name)
  ) ON COMMIT DROP;

  TRUNCATE _project_ts_scan;

  FOR r IN
    SELECT
      c.table_name,
      c.column_name,
      c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name IN ('created_at', 'updated_at')
      AND c.data_type IN (
        'timestamp with time zone',
        'timestamp without time zone',
        'date'
      )
    ORDER BY c.table_name, c.column_name
  LOOP
    BEGIN
      IF r.data_type = 'date' THEN
        v_sql := format(
          $q$
          INSERT INTO _project_ts_scan (
            table_name, column_name, data_type,
            rows_total, rows_non_null, first_activity, last_activity
          )
          SELECT
            %L,
            %L,
            %L,
            count(*),
            count(%I),
            min(%I::timestamp)::timestamptz,
            max(%I::timestamp)::timestamptz
          FROM public.%I
          $q$,
          r.table_name,
          r.column_name,
          r.data_type,
          r.column_name,
          r.column_name,
          r.column_name,
          r.table_name
        );
      ELSIF r.data_type = 'timestamp without time zone' THEN
        v_sql := format(
          $q$
          INSERT INTO _project_ts_scan (
            table_name, column_name, data_type,
            rows_total, rows_non_null, first_activity, last_activity
          )
          SELECT
            %L,
            %L,
            %L,
            count(*),
            count(%I),
            min(%I AT TIME ZONE 'UTC'),
            max(%I AT TIME ZONE 'UTC')
          FROM public.%I
          $q$,
          r.table_name,
          r.column_name,
          r.data_type,
          r.column_name,
          r.column_name,
          r.column_name,
          r.table_name
        );
      ELSE
        v_sql := format(
          $q$
          INSERT INTO _project_ts_scan (
            table_name, column_name, data_type,
            rows_total, rows_non_null, first_activity, last_activity
          )
          SELECT
            %L,
            %L,
            %L,
            count(*),
            count(%I),
            min(%I),
            max(%I)
          FROM public.%I
          $q$,
          r.table_name,
          r.column_name,
          r.data_type,
          r.column_name,
          r.column_name,
          r.column_name,
          r.table_name
        );
      END IF;

      EXECUTE v_sql;

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _project_ts_scan (
        table_name, column_name, data_type, scan_error
      ) VALUES (
        r.table_name,
        r.column_name,
        r.data_type,
        SQLERRM
      );
    END;
  END LOOP;
END $$;

-- Détail colonne par colonne
SELECT
  table_name,
  column_name,
  data_type,
  rows_total,
  rows_non_null,
  first_activity,
  last_activity,
  first_activity AT TIME ZONE 'Europe/Paris' AS first_activity_paris,
  last_activity AT TIME ZONE 'Europe/Paris'  AS last_activity_paris,
  scan_error
FROM _project_ts_scan
ORDER BY table_name, column_name;


-- ---------------------------------------------------------------------------
-- C) Synthèse par table (min/max sur created_at + updated_at de la table)
-- ---------------------------------------------------------------------------
SELECT
  table_name,
  min(first_activity) AS first_activity,
  max(last_activity)  AS last_activity,
  min(first_activity) AT TIME ZONE 'Europe/Paris' AS first_activity_paris,
  max(last_activity)  AT TIME ZONE 'Europe/Paris'  AS last_activity_paris,
  sum(rows_total)     AS rows_total_max,
  sum(rows_non_null)  AS rows_non_null_sum
FROM _project_ts_scan
WHERE scan_error IS NULL
GROUP BY table_name
ORDER BY table_name;


-- ---------------------------------------------------------------------------
-- D) Première et dernière activité globales du projet (toutes tables confondues)
-- ---------------------------------------------------------------------------
SELECT
  min(first_activity) AS project_first_activity_utc,
  max(last_activity)  AS project_last_activity_utc,
  min(first_activity) AT TIME ZONE 'Europe/Paris' AS project_first_activity_paris,
  max(last_activity)  AT TIME ZONE 'Europe/Paris'  AS project_last_activity_paris,
  count(*) FILTER (WHERE scan_error IS NULL) AS columns_scanned_ok,
  count(*) FILTER (WHERE scan_error IS NOT NULL) AS columns_scan_errors
FROM _project_ts_scan;


-- ---------------------------------------------------------------------------
-- E) Tables sources des extrêmes globaux (optionnel)
-- ---------------------------------------------------------------------------
(
  SELECT
    'first'::text AS extremum,
    table_name,
    column_name,
    first_activity AS activity_at,
    first_activity AT TIME ZONE 'Europe/Paris' AS activity_at_paris
  FROM _project_ts_scan
  WHERE scan_error IS NULL
    AND first_activity IS NOT NULL
  ORDER BY first_activity ASC
  LIMIT 5
)
UNION ALL
(
  SELECT
    'last'::text AS extremum,
    table_name,
    column_name,
    last_activity AS activity_at,
    last_activity AT TIME ZONE 'Europe/Paris' AS activity_at_paris
  FROM _project_ts_scan
  WHERE scan_error IS NULL
    AND last_activity IS NOT NULL
  ORDER BY last_activity DESC
  LIMIT 5
);
