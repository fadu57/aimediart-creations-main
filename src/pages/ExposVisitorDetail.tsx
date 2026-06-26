import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpenStreetMap } from "@/components/OpenStreetMap";
import { useAuthUser } from "@/hooks/useAuthUser";
import { supabase } from "@/lib/supabase";
import { getStyleLabelFromDb, type PromptStyleLabelFields } from "@/lib/promptStyleLabel";

type FeedbackRow = {
  artwork_id: string | null;
  artwork_title: string | null;
  emotion_id: string | null;
  heart_rating: number | null;
  comment_text: string | null;
  submitted_at: string | null;
  expo_name: string | null;
};

type GeoCoords = { lat: number; lon: number; city?: string; country?: string } | null;

// ── Composants de mise en page ─────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return <div className="py-2" />;
  return (
    <div className="py-2 border-b text-sm">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="break-all">{value}</p>
    </div>
  );
}

function HeaderPhoto({ src, alt, label, shape }: { src: string; alt: string; label: string; shape: "round" | "square" }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <img
        src={src}
        alt={alt}
        className={`h-12 w-12 object-cover ring-2 ring-border ${shape === "round" ? "rounded-full" : "rounded-lg"}`}
        onError={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          el.closest<HTMLElement>("[data-photo-wrapper]")!.style.display = "none";
        }}
        data-photo-wrapper=""
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="col-span-2 mt-6 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-t pt-4">
      {children}
    </p>
  );
}

type PersonaStyleRow = PromptStyleLabelFields & { icon?: string | null };

function PersonaDefautField({
  style,
  personaId,
}: {
  style: PersonaStyleRow | null;
  personaId: string | null;
}) {
  const { t, i18n } = useTranslation("expos");
  const label = style ? getStyleLabelFromDb(style, i18n.language.slice(0, 2)) : null;
  const icon = typeof style?.icon === "string" ? style.icon.trim() : "";
  return (
    <div className="py-2 border-b text-sm">
      <p className="text-xs text-muted-foreground mb-0.5">{t("visitors.persona_default")}</p>
      {personaId && label ? (
        <p className="flex items-center gap-1.5 break-all">
          {icon ? <span aria-hidden>{icon}</span> : null}
          <span>{label}</span>
        </p>
      ) : personaId ? (
        <p className="break-all text-muted-foreground">{personaId}</p>
      ) : (
        <p className="text-muted-foreground">{t("visitors.not_defined")}</p>
      )}
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6">{children}</div>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("fr-FR");
}

// ── Composant principal ────────────────────────────────────────────────────

export default function ExposVisitorDetail() {
  const { t } = useTranslation("expos");
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const source = searchParams.get("source") ?? "visitors";
  const navigate = useNavigate();
  const { loading: authLoading, role_id: currentRoleId } = useAuthUser();
  const canAccess = typeof currentRoleId === "number" && currentRoleId >= 1 && currentRoleId <= 4;

  const [data, setData]           = useState<Record<string, unknown> | null>(null);
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
  const [coords, setCoords]       = useState<GeoCoords>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // ── Chargement profil + feedbacks ────────────────────────────────────────
  useEffect(() => {
    if (!id || !canAccess) { setLoading(false); return; }

    void (async () => {
      setLoading(true);
      setError(null);

      if (source === "visitors") {
        // avatar_url + selfie_url disponibles si visitors_avatar_url_and_confirm_rpc.sql a été appliqué
        const baseSelect =
          "id, visitor_name, visitor_pseudo, visitor_client_id, " +
          "fingerprint, fingerprint_source, user_agent, client_locale, " +
          "client_timezone, screen_resolution, ip_address, browser_name, " +
          "device_type, country, city, last_seen_at";

        const loadVisitorRow = async (select: string) =>
          supabase.from("visitors").select(select).eq("id", id).maybeSingle();

        let visitorRow: Record<string, unknown> | null = null;
        let res = await loadVisitorRow(`${baseSelect}, avatar_url, selfie_url, persona_defaut`);
        if (res.error?.code === "42703") {
          res = await loadVisitorRow(`${baseSelect}, avatar_url, selfie_url`);
        }
        if (res.error?.code === "42703") {
          res = await loadVisitorRow(baseSelect);
        }
        if (res.error) {
          setError(res.error.message);
          setLoading(false);
          return;
        }
        visitorRow = res.data as Record<string, unknown> | null;

        const personaDefaut =
          typeof visitorRow?.persona_defaut === "string" ? visitorRow.persona_defaut.trim() : "";
        let personaStyle: PersonaStyleRow | null = null;
        if (personaDefaut) {
          const { data: styleRow } = await supabase
            .from("prompt_style")
            .select("id, name_fr, name_en, name_de, name_es, name_it, icon")
            .eq("id", personaDefaut)
            .maybeSingle();
          personaStyle = (styleRow as PersonaStyleRow | null) ?? null;
        }

        const { data: lastExpoVisit } = await supabase
          .from("visitor_expo_visits")
          .select("entered_at, last_activity_at, ended_at, status, entry_source")
          .eq("visitor_id", id)
          .order("entered_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        type ExpoVisitSnap = {
          entered_at?: string | null;
          last_activity_at?: string | null;
          ended_at?: string | null;
          status?: string | null;
          entry_source?: string | null;
        };
        const lv = lastExpoVisit as ExpoVisitSnap | null;
        const lastActivity = lv?.last_activity_at ?? lv?.entered_at ?? null;

        setData(visitorRow ? {
          ...visitorRow,
          persona_defaut: personaDefaut || null,
          persona_style: personaStyle,
          last_seen_at: lastActivity ?? visitorRow.last_seen_at ?? null,
          has_visit_data: Boolean(lastActivity || visitorRow.last_seen_at),
          last_expo_visit_status: lv?.status ?? null,
          last_expo_visit_entry: lv?.entry_source ?? null,
        } : null);
      } else {
        const { data: row, error: err } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, username, avatar_url, phone, birth_year")
          .eq("id", id)
          .maybeSingle();

        if (err) { setError(err.message); setLoading(false); return; }

        let agencyName: string | null = null;
        let roleId: number | null = null;
        if (row) {
          const { data: au } = await supabase
            .from("agency_users")
            .select("role_id, agency_id")
            .eq("user_id", id)
            .maybeSingle();
          roleId = (au as { role_id?: number } | null)?.role_id ?? null;
          const agId = (au as { agency_id?: string } | null)?.agency_id ?? null;
          if (agId) {
            const { data: ag } = await supabase
              .from("agencies")
              .select("name_agency")
              .eq("id", agId)
              .maybeSingle();
            agencyName = (ag as { name_agency?: string } | null)?.name_agency ?? null;
          }
        }

        const { data: lastExpoVisit } = await supabase
          .from("visitor_expo_visits")
          .select("entered_at, last_activity_at, ended_at, status, entry_source")
          .eq("auth_user_id", id)
          .order("entered_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        type ExpoVisitSnap = {
          entered_at?: string | null;
          last_activity_at?: string | null;
          ended_at?: string | null;
          status?: string | null;
          entry_source?: string | null;
        };
        const lv = lastExpoVisit as ExpoVisitSnap | null;
        const lastActivity = lv?.last_activity_at ?? lv?.entered_at ?? null;

        setData(row ? {
          ...row as Record<string, unknown>,
          agency_name: agencyName,
          role_id: roleId,
          ip_address: null,
          client_locale: null,
          client_timezone: null,
          last_seen_at: lastActivity,
          has_visit_data: Boolean(lastActivity),
          last_expo_visit_status: lv?.status ?? null,
          last_expo_visit_entry: lv?.entry_source ?? null,
        } : null);
      }

      // Feedbacks
      const { data: fbData } = await supabase
        .from("visitor_feedback")
        .select("artwork_id, emotion_id, heart_rating, comment_text, submitted_at, expo_id")
        .eq("visitor_id", id)
        .order("submitted_at", { ascending: false })
        .limit(50);

      if (fbData && (fbData as unknown[]).length > 0) {
        type RawFb = {
          artwork_id?: string | null; emotion_id?: string | null;
          heart_rating?: number | null; comment_text?: string | null;
          submitted_at?: string | null; expo_id?: string | null;
        };
        const rows = fbData as RawFb[];
        const artworkIds = [...new Set(rows.map((r) => r.artwork_id).filter(Boolean))] as string[];
        const expoIds    = [...new Set(rows.map((r) => r.expo_id).filter(Boolean))]    as string[];

        const [{ data: artworksData }, { data: exposData }] = await Promise.all([
          artworkIds.length
            ? supabase.from("artworks").select("artwork_id, artwork_title").in("artwork_id", artworkIds)
            : Promise.resolve({ data: [] }),
          expoIds.length
            ? supabase.from("expos").select("id, expo_name").in("id", expoIds)
            : Promise.resolve({ data: [] }),
        ]);

        const artworkMap = new Map(
          ((artworksData ?? []) as Array<{ artwork_id: string; artwork_title?: string | null }>)
            .map((a) => [a.artwork_id, a.artwork_title ?? null]),
        );
        const expoMap = new Map(
          ((exposData ?? []) as Array<{ id: string; expo_name?: string | null }>)
            .map((e) => [e.id, e.expo_name ?? null]),
        );

        setFeedbacks(rows.map((r) => ({
          artwork_id:    r.artwork_id ?? null,
          artwork_title: r.artwork_id ? (artworkMap.get(r.artwork_id) ?? r.artwork_id) : null,
          emotion_id:    r.emotion_id ?? null,
          heart_rating:  r.heart_rating ?? null,
          comment_text:  r.comment_text ?? null,
          submitted_at:  r.submitted_at ?? null,
          expo_name:     r.expo_id ? (expoMap.get(r.expo_id) ?? null) : null,
        })));
      }

      setLoading(false);
    })();
  }, [id, source, canAccess]);

  // ── Géolocalisation IP (ipapi.co — gratuit, sans clé) ────────────────────
  useEffect(() => {
    const ip = data?.ip_address as string | null | undefined;
    if (!ip?.trim() || ip === "127.0.0.1" || ip.startsWith("192.168")) return;

    void (async () => {
      try {
        const res = await fetch(`https://ipapi.co/${ip.trim()}/json/`);
        if (!res.ok) return;
        const geo = await res.json() as { latitude?: number; longitude?: number; city?: string; country_name?: string };
        if (geo.latitude && geo.longitude) {
          setCoords({ lat: geo.latitude, lon: geo.longitude, city: geo.city, country: geo.country_name });
        }
      } catch {
        // géolocalisation facultative
      }
    })();
  }, [data]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canAccess) return <Navigate to="/dashboard" replace />;

  const isAnon = source === "visitors";
  const title = isAnon
    ? (data?.visitor_pseudo as string | null) || (data?.visitor_name as string | null) || t("visitors.visitor_anonymous")
    : `${(data?.first_name as string | null) ?? ""} ${(data?.last_name as string | null) ?? ""}`.trim() || t("visitors.visitor");

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => navigate("/expos/visitors")}>
          {t("visitors.back_to_visitors")}
        </Button>
      </div>

      {/* ── Fiche identité ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-3 flex-1 min-w-0">
            <span className="truncate">{title}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground shrink-0">
              {isAnon ? t("visitors.visitor_anonymous") : t("visitors.profile_registered")}
            </span>
          </CardTitle>

          {/* Avatar / selfie (anon) ou avatar profil — à droite du titre */}
          {data && (() => {
            const validUrl = (u: unknown) =>
              typeof u === "string" && (u.startsWith("http://") || u.startsWith("https://"));
            const avatar = data.avatar_url as string | null;
            const selfie = isAnon ? (data.selfie_url as string | null) : null;
            if (!validUrl(avatar) && !validUrl(selfie)) return null;
            return (
              <div className="flex items-center gap-3 shrink-0">
                {validUrl(avatar) && (
                  <HeaderPhoto src={avatar!} alt="avatar" label={t("visitors.avatar")} shape="round" />
                )}
                {validUrl(selfie) && (
                  <HeaderPhoto src={selfie!} alt="selfie" label={t("visitors.selfie")} shape="square" />
                )}
              </div>
            );
          })()}
        </CardHeader>

        <CardContent>
          {error && <p className="text-sm text-destructive mb-4">{error}</p>}
          {!data ? (
            <p className="text-sm text-muted-foreground">{t("visitors.not_found")}</p>
          ) : isAnon ? (
            <>
              {/* Identité */}
              <TwoCol>
                <Field label={t("visitors.pseudo_chosen")}   value={data.visitor_pseudo as string} />
                <Field label={t("visitors.visitor_name")}    value={data.visitor_name as string} />
                <PersonaDefautField
                  personaId={(data.persona_defaut as string | null) ?? null}
                  style={(data.persona_style as PersonaStyleRow | null) ?? null}
                />
                <Field label={t("visitors.last_activity")}   value={formatDate(data.last_seen_at as string)} />
              </TwoCol>

              {/* Appareil */}
              <TwoCol>
                <SectionTitle>{t("visitors.device")}</SectionTitle>
                <Field label={t("visitors.browser")}            value={data.browser_name as string} />
                <Field label={t("visitors.device_type")}        value={data.device_type as string} />
                <Field label={t("visitors.screen_resolution")}  value={data.screen_resolution as string} />
                <Field label={t("visitors.language")}           value={data.client_locale as string} />
                <Field label={t("visitors.timezone")}           value={data.client_timezone as string} />
              </TwoCol>

              {/* Localisation */}
              <TwoCol>
                <SectionTitle>{t("visitors.location")}</SectionTitle>
                <Field label={t("visitors.country")}     value={data.country as string} />
                <Field label={t("visitors.city")}        value={data.city as string} />
                <Field label={t("visitors.ip_address")}  value={data.ip_address as string} />
              </TwoCol>

              {/* Carte interactive Leaflet */}
              {coords && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("visitors.approx_location", { location: [coords.city, coords.country].filter(Boolean).join(", ") })}
                  </p>
                  <OpenStreetMap
                    lat={coords.lat}
                    lon={coords.lon}
                    label={[coords.city, coords.country].filter(Boolean).join(", ")}
                    height={260}
                    zoom={11}
                  />
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=12/${coords.lat}/${coords.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs text-muted-foreground hover:underline"
                  >
                    {t("visitors.open_in_osm")}
                  </a>
                </div>
              )}

            </>
          ) : (
            <>
              <TwoCol>
                <Field label={t("visitors.firstname")}    value={data.first_name as string} />
                <Field label={t("visitors.lastname")}     value={data.last_name as string} />
                <Field label={t("visitors.col_pseudo")}   value={data.username as string} />
                <Field label={t("visitors.phone")}        value={data.phone as string} />
                <Field label={t("visitors.birth_year")}   value={data.birth_year != null ? String(data.birth_year) : null} />
                <Field label={t("visitors.organisation")} value={data.agency_name as string} />
                <Field label={t("visitors.role_id")}      value={data.role_id != null ? String(data.role_id) : null} />
              </TwoCol>

              {/* Dernière visite connue — toujours affiché */}
              <TwoCol>
                <SectionTitle>{t("visitors.last_visit")}</SectionTitle>
              </TwoCol>
              {data.has_visit_data ? (
                <TwoCol>
                  <Field label={t("visitors.ip_address")}  value={data.ip_address as string} />
                  <Field label={t("visitors.language")}    value={data.client_locale as string} />
                  <Field label={t("visitors.timezone")}    value={data.client_timezone as string} />
                  <Field label={t("visitors.date")}        value={formatDate(data.last_seen_at as string)} />
                </TwoCol>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  {t("visitors.no_visit_tracked")}
                </p>
              )}

              {/* Carte si IP disponible */}
              {coords && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("visitors.approx_location", { location: [coords.city, coords.country].filter(Boolean).join(", ") })}
                  </p>
                  <OpenStreetMap
                    lat={coords.lat}
                    lon={coords.lon}
                    label={[coords.city, coords.country].filter(Boolean).join(", ")}
                    height={260}
                    zoom={11}
                  />
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=12/${coords.lat}/${coords.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs text-muted-foreground hover:underline"
                  >
                    {t("visitors.open_in_osm")}
                  </a>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Feedbacks ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("visitors.feedbacks_count", { count: feedbacks.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {feedbacks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("visitors.no_feedback")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1">{t("visitors.date")}</th>
                  <th className="px-2 py-1">{t("visitors.col_artwork")}</th>
                  <th className="px-2 py-1">{t("visitors.col_expo")}</th>
                  <th className="px-2 py-1">{t("visitors.col_emotion")}</th>
                  <th className="px-2 py-1 text-center">♥</th>
                  <th className="px-2 py-1">{t("visitors.col_comment")}</th>
                </tr>
              </thead>
              <tbody>
                {feedbacks.map((fb, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="px-2 py-1 whitespace-nowrap">{formatDate(fb.submitted_at) ?? "—"}</td>
                    <td className="px-2 py-1 max-w-[160px] truncate" title={fb.artwork_title ?? ""}>{fb.artwork_title ?? "—"}</td>
                    <td className="px-2 py-1 max-w-[140px] truncate" title={fb.expo_name ?? ""}>{fb.expo_name ?? "—"}</td>
                    <td className="px-2 py-1">{fb.emotion_id ?? "—"}</td>
                    <td className="px-2 py-1 text-center">{fb.heart_rating ?? "—"}</td>
                    <td className="px-2 py-1 max-w-[200px] truncate" title={fb.comment_text ?? ""}>{fb.comment_text || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
