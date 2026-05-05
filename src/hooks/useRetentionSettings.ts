import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface RetentionEntry {
  retention_days: number;
  auto_purge: boolean;
  archive_before_purge: boolean;
  notify_before_days: number | null;
  notify_email: string | null;
}

export type RetentionMap = Record<string, RetentionEntry>;

interface UseRetentionSettingsResult {
  retention: RetentionMap;
  loading: boolean;
}

/** Cache module-level pour éviter de refetch à chaque montage de composant. */
let _cache: RetentionMap | null = null;
let _fetchPromise: Promise<RetentionMap> | null = null;

async function fetchRetentionSettings(): Promise<RetentionMap> {
  if (_cache) return _cache;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    const { data, error } = await supabase
      .from("retention_settings")
      .select("table_name, retention_days, auto_purge, archive_before_purge, notify_before_days, notify_email");

    if (error || !data) {
      _fetchPromise = null;
      return {};
    }

    const map: RetentionMap = {};
    for (const row of data as Array<{
      table_name: string;
      retention_days: number;
      auto_purge: boolean;
      archive_before_purge: boolean;
      notify_before_days: number | null;
      notify_email: string | null;
    }>) {
      if (row.table_name) {
        map[row.table_name] = {
          retention_days: row.retention_days,
          auto_purge: row.auto_purge,
          archive_before_purge: row.archive_before_purge,
          notify_before_days: row.notify_before_days,
          notify_email: row.notify_email,
        };
      }
    }

    _cache = map;
    _fetchPromise = null;
    return map;
  })();

  return _fetchPromise;
}

/**
 * Charge la table retention_settings une seule fois (cache module).
 * Retourne un Record<table_name, RetentionEntry>.
 * Résistant aux erreurs : retourne {} si la table est inaccessible.
 */
export function useRetentionSettings(): UseRetentionSettingsResult {
  const [retention, setRetention] = useState<RetentionMap>(_cache ?? {});
  const [loading, setLoading] = useState(_cache === null);

  useEffect(() => {
    if (_cache) {
      setRetention(_cache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetchRetentionSettings().then((map) => {
      if (!cancelled) {
        setRetention(map);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return { retention, loading };
}
