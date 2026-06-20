import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type MapErrorBoundaryProps = { children: ReactNode; fallback: ReactNode };
type MapErrorBoundaryState = { hasError: boolean };

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
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
};

export function VisitorGeographySection({ rows, loading, geocoding, progress, error }: Props) {
  const { t } = useTranslation("statistiques");

  const mappableCount = rows.filter((row) => row.latitude != null && row.longitude != null).length;
  const mapFallback = (
    <div className="flex h-[420px] items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">
      {geocoding ? (
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
    <Card id="statistics-geography" className="glass-card scroll-mt-24">
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
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("geography.empty")}</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-border/60">
              <MapErrorBoundary fallback={mapFallback}>
                <ClientOnly fallback={mapFallback}>
                  <Suspense fallback={mapFallback}>
                    {mappableCount > 0 ? (
                      <VisitorGeographyMap rows={rows} />
                    ) : (
                      mapFallback
                    )}
                  </Suspense>
                </ClientOnly>
              </MapErrorBoundary>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("geography.mapHint", { mapped: mappableCount, total: rows.length })}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border border-white bg-[#2563eb] shadow-sm" aria-hidden />
                {t("geography.legendVisitor")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border border-white bg-[#dc2626] shadow-sm" aria-hidden />
                {t("geography.legendOrganizer")}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs leading-tight">
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
                  {rows.map((row) => (
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
