import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Ban, Headphones, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  banVisitorAudioSession,
  listVisitorAudioPresence,
  unbanVisitorAudioSession,
  type VisitorAudioPresenceRow,
} from "@/lib/visitorAudioSession";

type ExpoOption = { id: string; expo_name: string | null };

function formatLastSeen(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ExposVisitorAudioMonitor() {
  const { t } = useTranslation("expos");
  const [searchParams, setSearchParams] = useSearchParams();
  const filterExpoId = searchParams.get("expo_id")?.trim() || "";
  const { loading: authLoading, role_id: currentRoleId } = useAuthUser();
  const canAccess = typeof currentRoleId === "number" && currentRoleId >= 1 && currentRoleId <= 4;

  const [expos, setExpos] = useState<ExpoOption[]>([]);
  const [rows, setRows] = useState<VisitorAudioPresenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const expoById = useMemo(
    () => new Map(expos.map((e) => [e.id, e.expo_name?.trim() || e.id])),
    [expos],
  );

  const loadExpos = useCallback(async () => {
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase.from("expos").select("id, expo_name").is("deleted_at", null);
    setExpos((data as ExpoOption[] | null) ?? []);
  }, []);

  const loadPresence = useCallback(async (silent = false) => {
    if (!filterExpoId || !canAccess) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = await listVisitorAudioPresence(filterExpoId);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterExpoId, canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    void loadExpos();
  }, [canAccess, loadExpos]);

  useEffect(() => {
    void loadPresence();
    const timer = window.setInterval(() => void loadPresence(true), 10_000);
    return () => window.clearInterval(timer);
  }, [loadPresence]);

  const handleBan = async (row: VisitorAudioPresenceRow) => {
    setActionId(row.id);
    try {
      await banVisitorAudioSession(row.id);
      await loadPresence(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du bannissement.");
    } finally {
      setActionId(null);
    }
  };

  const handleUnban = async (row: VisitorAudioPresenceRow) => {
    setActionId(row.id);
    try {
      await unbanVisitorAudioSession(row.id);
      await loadPresence(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la réactivation.");
    } finally {
      setActionId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canAccess) {
    return <p className="p-6 text-sm text-muted-foreground">Accès réservé aux administrateurs.</p>;
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("audio_monitor.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("audio_monitor.subtitle")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link to="/expos">{t("audio_monitor.back_expos")}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("audio_monitor.select_expo")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select
            value={filterExpoId || undefined}
            onValueChange={(v) => {
              const next = new URLSearchParams(searchParams);
              next.set("expo_id", v);
              setSearchParams(next, { replace: true });
            }}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder={t("audio_monitor.expo_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {expos.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.expo_name?.trim() || e.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!filterExpoId || refreshing}
            onClick={() => void loadPresence(true)}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {t("audio_monitor.refresh")}
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!filterExpoId ? (
        <p className="text-sm text-muted-foreground">{t("audio_monitor.pick_expo_hint")}</p>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("audio_monitor.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t("audio_monitor.col_visitor")}</th>
                <th className="px-3 py-2">{t("audio_monitor.col_artwork")}</th>
                <th className="px-3 py-2">{t("audio_monitor.col_headphones")}</th>
                <th className="px-3 py-2">{t("audio_monitor.col_seen")}</th>
                <th className="px-3 py-2">{t("audio_monitor.col_status")}</th>
                <th className="px-3 py-2 text-right">{t("audio_monitor.col_action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isBanned = Boolean(row.banned_at);
                const busy = actionId === row.id;
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{row.visitor_client_id.slice(0, 12)}…</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.artwork_title?.trim() || "—"}</div>
                      {row.artwork_id ? (
                        <div className="text-xs text-muted-foreground">{row.artwork_id.slice(0, 8)}…</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {row.headphones_detected === true ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <Headphones className="h-3.5 w-3.5" /> OK
                        </span>
                      ) : row.headphones_detected === false ? (
                        <span className="text-amber-600">Non</span>
                      ) : (
                        "?"
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatLastSeen(row.last_seen_at)}</td>
                    <td className="px-3 py-2">
                      {isBanned ? (
                        <span className="font-medium text-destructive">{t("audio_monitor.status_banned")}</span>
                      ) : (
                        <span className="text-muted-foreground">{t("audio_monitor.status_active")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isBanned ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void handleUnban(row)}
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
                          {t("audio_monitor.unban")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void handleBan(row)}
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="mr-1 h-4 w-4" />}
                          {t("audio_monitor.ban")}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filterExpoId ? (
        <p className="text-xs text-muted-foreground">
          {t("audio_monitor.expo_label")} {expoById.get(filterExpoId) ?? filterExpoId}
        </p>
      ) : null}
    </div>
  );
}
