import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Ban, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
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
import { supabase } from "@/lib/supabase";
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

async function enrichPresenceRows(
  rows: VisitorAudioPresenceRow[],
  unknownVisitor: string,
  unknownArtwork: string,
): Promise<VisitorAudioPresenceRow[]> {
  if (rows.length === 0) return rows;

  const clientIds = [
    ...new Set(
      rows
        .filter((row) => !row.visitor_pseudo?.trim())
        .map((row) => row.visitor_client_id.trim())
        .filter(Boolean),
    ),
  ];
  const artworkIds = [
    ...new Set(
      rows
        .filter((row) => row.artwork_id && !row.artwork_title?.trim())
        .map((row) => row.artwork_id!.trim())
        .filter(Boolean),
    ),
  ];

  const pseudoByClient = new Map<string, string>();
  const titleByArtwork = new Map<string, string>();

  if (clientIds.length > 0) {
    const { data } = await supabase
      .from("visitors")
      .select("visitor_client_id, visitor_pseudo, visitor_name")
      .in("visitor_client_id", clientIds);
    for (const visitor of (data ?? []) as Array<{
      visitor_client_id?: string | null;
      visitor_pseudo?: string | null;
      visitor_name?: string | null;
    }>) {
      const cid = visitor.visitor_client_id?.trim() ?? "";
      if (!cid) continue;
      const pseudo = visitor.visitor_pseudo?.trim() ?? "";
      const name = visitor.visitor_name?.trim() ?? "";
      if (pseudo) pseudoByClient.set(cid, pseudo);
      else if (name && name.toLowerCase() !== "anonymous") pseudoByClient.set(cid, name);
    }
  }

  if (artworkIds.length > 0) {
    const { data } = await supabase
      .from("artworks")
      .select("artwork_id, artwork_title")
      .in("artwork_id", artworkIds);
    for (const artwork of (data ?? []) as Array<{
      artwork_id?: string | null;
      artwork_title?: string | null;
    }>) {
      const id = artwork.artwork_id?.trim() ?? "";
      const title = artwork.artwork_title?.trim() ?? "";
      if (id && title) titleByArtwork.set(id, title);
    }
  }

  return rows.map((row) => ({
    ...row,
    visitor_pseudo:
      row.visitor_pseudo?.trim() ||
      pseudoByClient.get(row.visitor_client_id.trim()) ||
      unknownVisitor,
    artwork_title:
      row.artwork_title?.trim() ||
      (row.artwork_id ? titleByArtwork.get(row.artwork_id.trim()) : undefined) ||
      unknownArtwork,
  }));
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
      const enriched = await enrichPresenceRows(
        data,
        t("audio_monitor.visitor_unknown"),
        t("audio_monitor.artwork_unknown"),
      );
      setRows(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterExpoId, canAccess, t]);

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
          <p className="mt-1 text-xs text-muted-foreground">{t("audio_monitor.duplicate_hint")}</p>
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
            <thead className="border-b border-white/15 bg-[#2A2A2A] text-left text-xs font-semibold uppercase tracking-wide text-[#F0F0F0]">
              <tr>
                <th className="px-3 py-2.5">{t("audio_monitor.col_visitor")}</th>
                <th className="px-3 py-2.5">{t("audio_monitor.col_artwork")}</th>
                <th className="px-3 py-2.5">{t("audio_monitor.col_consent")}</th>
                <th className="px-3 py-2.5">{t("audio_monitor.col_seen")}</th>
                <th className="px-3 py-2.5">{t("audio_monitor.col_status")}</th>
                <th className="px-3 py-2.5 text-right">{t("audio_monitor.col_action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isBanned = Boolean(row.banned_at);
                const busy = actionId === row.id;
                const visitorLabel = row.visitor_pseudo?.trim() || t("audio_monitor.visitor_unknown");
                const artworkLabel = row.artwork_title?.trim() || t("audio_monitor.artwork_unknown");
                return (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="px-3 py-2.5 font-medium" title={row.visitor_client_id}>
                      {visitorLabel}
                    </td>
                    <td className="px-3 py-2.5 font-medium" title={row.artwork_id ?? undefined}>
                      {artworkLabel}
                    </td>
                    <td className="px-3 py-2">
                      {row.audio_consent_acknowledged === true ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t("audio_monitor.consent_yes")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("audio_monitor.consent_pending")}</span>
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
