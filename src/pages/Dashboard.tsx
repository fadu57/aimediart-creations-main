import { useMemo } from "react";
import { Eye, Heart, Smile, ImageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageWithSkeleton } from "@/components/ui/ImageWithSkeleton";
import { emotions, artworks, expos, getArtistById } from "@/data/mockData";
import { useDataScope } from "@/hooks/useDataScope";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getArtworksForDataScope } from "@/lib/userScope";
import { hasFullDataAccess } from "@/lib/authUser";

function formatFrNumber(n: number, opts: Intl.NumberFormatOptions = {}) {
  return n.toLocaleString("fr-FR", opts);
}

function artworkId(aw: unknown, index: number): string {
  const x = aw as { id?: string | null; artwork_id?: string | null };
  return x.id ?? x.artwork_id ?? `aw-${index + 1}`;
}

function artworkArtistId(aw: unknown): string | null {
  const x = aw as { artistId?: string | null; artwork_artist_id?: string | null };
  return x.artistId ?? x.artwork_artist_id ?? null;
}

function artworkPhoto(aw: unknown): string {
  const x = aw as { artworkPhoto?: string | null; artwork_photo_url?: string | null };
  return x.artworkPhoto ?? x.artwork_photo_url ?? "";
}

function artworkTitle(aw: unknown, index: number): string {
  const x = aw as { title?: string | null; artwork_title?: string | null };
  return x.title ?? x.artwork_title ?? `Œuvre ${index + 1}`;
}

const Dashboard = () => {
  const { scope, loading: authLoading } = useDataScope();
  const { role_id, role_name } = useAuthUser();

  const scopedArtworks = useMemo(
    () => getArtworksForDataScope(artworks, expos, scope),
    [scope],
  );

  const kpis = useMemo(() => {
    if (scopedArtworks.length === 0) {
      return [
        { label: "Total des visites", value: "—", sub: "Aucune œuvre dans le périmètre", icon: Eye, color: "text-gold" },
        { label: "Moyenne des cœurs", value: "—", sub: "—", icon: Heart, color: "text-crimson" },
        { label: "Émotion dominante", value: "—", sub: "—", icon: Smile, color: "text-gold" },
        { label: "Œuvres actives", value: "0", sub: "Dans le catalogue de l'expo", icon: ImageIcon, color: "text-primary" },
      ];
    }
    const totalVisites = scopedArtworks.reduce((s, a) => s + a.artwork_total_visites, 0);
    const moy =
      scopedArtworks.reduce((s, a) => s + a.artwork_moyenne_coeurs, 0) / scopedArtworks.length;
    const dominant = emotions.reduce((best, e) => (e.percentage > best.percentage ? e : best), emotions[0]);
    const actives = scopedArtworks.filter((a) => a.status === "active").length;
    return [
      {
        label: "Total des visites",
        value: formatFrNumber(totalVisites),
        sub: "Toutes les œuvres de votre périmètre",
        icon: Eye,
        color: "text-gold",
      },
      {
        label: "Moyenne des cœurs",
        value: formatFrNumber(moy, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        sub: "Note moyenne sur 5 cœurs",
        icon: Heart,
        color: "text-crimson",
      },
      {
        label: "Émotion dominante",
        value: dominant.name,
        sub: "Ressenti le plus exprimé (aperçu)",
        icon: Smile,
        color: "text-gold",
      },
      {
        label: "Œuvres actives",
        value: formatFrNumber(actives),
        sub: "Dans le catalogue de l'expo",
        icon: ImageIcon,
        color: "text-primary",
      },
    ];
  }, [scopedArtworks]);

  const sortedArtworks = useMemo(
    () => [...scopedArtworks].sort((a, b) => b.artwork_moyenne_coeurs - a.artwork_moyenne_coeurs),
    [scopedArtworks],
  );

  const showScopeHint =
    !authLoading &&
    scope.mode === "none" &&
    !(typeof role_id === "number" && role_id >= 1 && role_id <= 3) &&
    !hasFullDataAccess(role_name);

  return (
    <div className="container py-8 space-y-8">
      <div className="flex flex-col justify-between gap-4 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-serif font-bold text-white">Accueil</h2>
        </div>
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-1">Données en temps réel de votre exposition</p>
        {!authLoading && scope.mode === "agency" && (
          <p className="text-xs text-muted-foreground">
            Périmètre : toutes les expos de l’agence <strong className="text-foreground">{scope.agencyId}</strong> (admin
            agence).
          </p>
        )}
        {!authLoading && scope.mode === "expo" && (
          <p className="text-xs text-muted-foreground">
            Périmètre : exposition <strong className="text-foreground">{scope.expoId}</strong> (curateur / équipe expo).
          </p>
        )}
      </div>

      {showScopeHint && (
        <Alert>
          <AlertTitle>Données non disponibles pour ce rôle</AlertTitle>
          <AlertDescription>
            Votre rôle ne correspond pas à un périmètre données dans l’app, ou il manque{" "}
            <code className="rounded bg-muted px-1">agency_id</code> /{" "}
            <code className="rounded bg-muted px-1">expo_id</code> sur le profil. Les rôles « admin agence » et « curateur /
            équipe expo » doivent avoir ces identifiants renseignés (métadonnées, table <code className="rounded bg-muted px-1">public.user</code> ou variables{" "}
            <code className="rounded bg-muted px-1">VITE_DEFAULT_*</code> en dev).
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="glass-card group hover:shadow-xl transition-all duration-300">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <p className="text-3xl font-serif font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Emotions */}
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Émotions</CardTitle>
          <span className="text-xs text-muted-foreground">Votre périmètre (aperçu)</span>
        </CardHeader>
        <CardContent className="space-y-3">
          {scopedArtworks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aucune donnée d’émotion pour ce périmètre.</p>
          ) : (
            <>
              {emotions.map((emo) => (
                <div key={emo.id} className="flex items-center gap-4">
                  <span className="text-sm w-24 shrink-0">{emo.name}</span>
                  <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${emo.percentage}%`, backgroundColor: emo.color }}
                    />
                  </div>
                  <span className="text-sm font-semibold w-12 text-right">{emo.percentage}%</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground italic text-center pt-2">
                Basé sur les feedbacks du périmètre sélectionné (données de démonstration)
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Classement */}
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Classement des œuvres</CardTitle>
          <span className="text-xs bg-muted px-3 py-1 rounded-full">Par engagement émotionnel</span>
        </CardHeader>
        <CardContent>
          {sortedArtworks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Aucune œuvre dans votre périmètre agence / exposition.</p>
          ) : (
            <>
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 gap-y-0 text-xs text-muted-foreground font-medium mb-3 px-2">
                <span>Rang</span>
                <span>Œuvre</span>
                <span>Visites</span>
                <span>Moy. cœurs</span>
              </div>
              <div className="space-y-3">
                {sortedArtworks.map((aw, i) => {
                  const artist = getArtistById(artworkArtistId(aw) ?? "");
                  return (
                    <div
                      key={artworkId(aw, i)}
                      className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 items-center p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <span className="text-sm font-bold text-primary">{i + 1}</span>
                      </div>
                      <div className="flex items-center gap-3 min-w-0">
                        <ImageWithSkeleton
                          src={artworkPhoto(aw)}
                          alt={artworkTitle(aw, i)}
                          wrapperClassName="h-12 w-12 shrink-0 rounded-lg"
                          className="h-12 w-12 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{artworkTitle(aw, i)}</p>
                          <p className="text-xs text-muted-foreground">
                            {artist?.firstName} {artist?.name}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm">{aw.artwork_total_visites} visite(s)</span>
                      <div className="flex items-center gap-1">
                        <Heart className="h-4 w-4 fill-crimson text-crimson" />
                        <span className="text-sm font-bold">{aw.artwork_moyenne_coeurs}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
