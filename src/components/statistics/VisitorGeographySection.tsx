import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageWithSkeleton } from "@/components/ui/ImageWithSkeleton";
import type { VisitorGeoTableRow } from "@/lib/statisticsVisitorGeography";

const VisitorGeographyMap = lazy(() =>
  import("@/components/statistics/VisitorGeographyMap").then((module) => ({
    default: module.VisitorGeographyMap,
  })),
);

function ClientOnly({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}

type MapErrorBoundaryProps = { children: ReactNode; fallback: ReactNode; resetKey: string };
type MapErrorBoundaryState = { hasError: boolean };

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: MapErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

type Props = {
  rows: VisitorGeoTableRow[];
  loading: boolean;
  geocoding: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
  mapScopeKey: string;
  onRefreshGeocoding?: () => void;
};

export function VisitorGeographySection({
  rows,
  loading,
  geocoding,
  progress,
  error,
  mapScopeKey,
  onRefreshGeocoding,
}: Props) {
  const { t } = useTranslation("statistiques");
  const [showVisitors, setShowVisitors] = useState(true);
  const [showOrganizers, setShowOrganizers] = useState(true);

  const visibleRows = useMemo(
    () =>
      rows.filter((row) =>
        row.participantKind === "visitor" ? showVisitors : showOrganizers,
      ),
    [rows, showVisitors, showOrganizers],
  );

  const mappableCount = visibleRows.filter((row) => row.latitude != null && row.longitude != null).length;
  const showMap = mappableCount > 0;
  const mapScopeWithFilters = `${mapScopeKey}|v:${showVisitors ? 1 : 0}|o:${showOrganizers ? 1 : 0}`;
  const mapFallback = (
    <div className="flex h-[420px] items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">
      {loading || geocoding ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p>
            {progress && progress.total > 0
              ? t("geography.loadingProgress", { done: progress.done, total: progress.total })
              : t("geography.loading")}
          </p>
        </div>
      ) : (
        t("geography.mapEmpty")
      )}
    </div>
  );

  return (
    <Card id="statistics-geography" className="glass-card scroll-mt-24 min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-lg">{t("geography.title")}</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("geography.disclaimer")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p>{t("geography.loading")}</p>
          </div>
        ) : rows.length === 0 && !loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("geography.empty")}</p>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-lg border border-border/60">
              <MapErrorBoundary resetKey={mapScopeKey} fallback={mapFallback}>
                <ClientOnly fallback={mapFallback}>
                  <Suspense fallback={mapFallback}>
                    {showMap ? (
                      <VisitorGeographyMap rows={visibleRows} scopeKey={mapScopeWithFilters} />
                    ) : (
                      mapFallback
                    )}
                  </Suspense>
                </ClientOnly>
              </MapErrorBoundary>
              {(loading || geocoding) && showMap ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-2">
                  <div className="flex items-center gap-2 rounded-md bg-background/85 px-2 py-1 text-xs text-muted-foreground shadow-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
                    {progress && progress.total > 0
                      ? t("geography.loadingProgress", { done: progress.done, total: progress.total })
                      : t("geography.loading")}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="text-xs text-muted-foreground">
                {t("geography.mapHint", { mapped: mappableCount, total: visibleRows.length })}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <Checkbox
                    checked={showVisitors}
                    onCheckedChange={(checked) => setShowVisitors(checked === true)}
                    className="border-[#2563eb] data-[state=checked]:border-[#2563eb] data-[state=checked]:bg-[#2563eb]"
                    aria-label={t("geography.legendVisitor")}
                  />
                  {t("geography.legendVisitor")}
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <Checkbox
                    checked={showOrganizers}
                    onCheckedChange={(checked) => setShowOrganizers(checked === true)}
                    className="border-[#dc2626] data-[state=checked]:border-[#dc2626] data-[state=checked]:bg-[#dc2626]"
                    aria-label={t("geography.legendOrganizer")}
                  />
                  {t("geography.legendOrganizer")}
                </label>
                {onRefreshGeocoding ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                    onClick={onRefreshGeocoding}
                    disabled={geocoding || loading}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${geocoding ? "animate-spin" : ""}`} aria-hidden />
                    {t("geography.refreshGeocoding")}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-xs leading-tight">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">{t("geography.colVisitor")}</th>
                    <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">{t("geography.colPseudo")}</th>
                    <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">{t("geography.colCity")}</th>
                    <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">{t("geography.colCountry")}</th>
                    <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">{t("geography.colRegion")}</th>
                    <th className="px-1.5 py-1 text-left font-medium text-muted-foreground">{t("geography.colSource")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.visitorKey} className="border-b border-border/50">
                      <td className="px-1.5 py-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex shrink-0 items-center gap-1">
                            {row.avatarUrl ? (
                              <ImageWithSkeleton
                                src={row.avatarUrl}
                                alt={row.pseudo || row.label}
                                className="h-7 w-7 shrink-0 rounded-full object-cover"
                              />
                            ) : !row.selfieUrl ? (
                              <div className="h-7 w-7 shrink-0 rounded-full bg-muted" aria-hidden />
                            ) : null}
                            {row.selfieUrl && row.selfieUrl !== row.avatarUrl ? (
                              <ImageWithSkeleton
                                src={row.selfieUrl}
                                alt={`${row.pseudo || row.label} — selfie`}
                                className="h-7 w-7 shrink-0 rounded-md object-cover"
                              />
                            ) : null}
                          </div>
                          <span className="min-w-0 truncate font-medium">{row.label}</span>
                        </div>
                      </td>
                      <td className="px-1.5 py-1">{row.pseudo || "—"}</td>
                      <td className="px-1.5 py-1">{row.city || "—"}</td>
                      <td className="px-1.5 py-1">{row.country || "—"}</td>
                      <td className="px-1.5 py-1">{row.region || "—"}</td>
                      <td className="px-1.5 py-1 text-muted-foreground">
                        {t(`geography.sources.${row.source}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
