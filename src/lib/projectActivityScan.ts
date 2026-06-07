import { formatProjectDate } from "@/lib/projectMeta";

export type ProjectActivityColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  rows_total: number;
  rows_non_null: number;
  first_activity: string | null;
  last_activity: string | null;
  scan_error: string | null;
};

export type ProjectActivityTableSummary = {
  table_name: string;
  first_activity: string | null;
  last_activity: string | null;
  rows_total: number;
  rows_non_null: number;
};

export type ProjectActivityDaily = {
  day: string;
  event_count: number;
};

export type ProjectActivityScanResult = {
  scanned_at: string;
  timezone: string;
  summary: {
    project_first_activity: string | null;
    project_last_activity: string | null;
    columns_scanned_ok: number;
    columns_scan_errors: number;
  };
  columns: ProjectActivityColumn[];
  by_table: ProjectActivityTableSummary[];
  daily_activity: ProjectActivityDaily[];
};

export function formatActivityDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatActivityDay(isoDay: string): string {
  return formatProjectDate(isoDay);
}
