import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArtworkModal } from "@/components/ArtworkModal";
import { ImageWithSkeleton } from "@/components/ui/ImageWithSkeleton";
import { artworks, expos } from "@/data/mockData";
import { useDataScope } from "@/hooks/useDataScope";
import { getArtworksForDataScope } from "@/lib/userScope";
import { ImageIcon, QrCode, ScanLine, Download, RefreshCw, Plus } from "lucide-react";

function formatFrInt(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

const QRCodes = () => {
  const { scope, loading: authLoading } = useDataScope();
  const [artworkModalOpen, setArtworkModalOpen] = useState(false);

  const scopedArtworks = useMemo(
    () => getArtworksForDataScope(artworks, expos, scope),
    [scope],
  );

  const activeCount = useMemo(
    () => scopedArtworks.filter((a) => a.status === "active").length,
    [scopedArtworks],
  );

  const totalScans = useMemo(
    () => scopedArtworks.reduce((s, a) => s + a.artwork_total_visites, 0),
    [scopedArtworks],
  );

  const stats = useMemo(
    () => [
      {
        label: "Œuvres actives",
        value: scopedArtworks.length ? formatFrInt(activeCount) : "—",
        sub: "avec QR code disponible",
        icon: ImageIcon,
      },
      {
        label: "QR générés",
        value: scopedArtworks.length ? formatFrInt(Math.min(activeCount, scopedArtworks.length)) : "—",
        sub: "prêts pour l'impression",
        icon: QrCode,
      },
      {
        label: "Scans total",
        value: scopedArtworks.length ? formatFrInt(totalScans) : "—",
        sub: "visites (liées au périmètre)",
        icon: ScanLine,
      },
    ],
    [scopedArtworks.length, activeCount, totalScans],
  );

  const showScopeHint = !authLoading && scope.mode === "none";

  return (
    <div className="container py-8 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold">Catalogue des œuvres</h2>
          <p className="text-muted-foreground">Gestion des œuvres et des cartels QR Codes des œuvres</p>
          {!authLoading && scope.mode === "all" && (
            <p className="text-xs text-muted-foreground mt-1">Toutes les œuvres (vue globale).</p>
          )}
          {!authLoading && scope.mode === "agency" && (
            <p className="text-xs text-muted-foreground mt-1">Agence {scope.agencyId} — toutes ses expos.</p>
          )}
          {!authLoading && scope.mode === "expo" && (
            <p className="text-xs text-muted-foreground mt-1">Exposition {scope.expoId} uniquement.</p>
          )}
        </div>
        <Button className="gradient-gold gradient-gold-hover-bg text-primary-foreground gap-2 shrink-0" onClick={() => setArtworkModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Créer une nouvelle œuvre
        </Button>
      </div>

      {showScopeHint && (
        <Alert>
          <AlertTitle>Périmètre vide</AlertTitle>
          <AlertDescription>
            Ajustez la configuration agence / expo pour ce rôle afin d’afficher les œuvres concernées.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="glass-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <p className="text-3xl font-serif font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass-card">
        <CardHeader>
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-4 text-xs font-medium text-muted-foreground">
            <span className="w-8" />
            <span>QR Code</span>
            <span>Œuvre</span>
            <span>Actions</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {scopedArtworks.length === 0 && !showScopeHint && (
            <p className="text-sm text-muted-foreground text-center py-8">Aucune œuvre dans votre périmètre.</p>
          )}
          {scopedArtworks.map((aw) => (
            <div
              key={aw.id}
              className="grid grid-cols-[auto_1fr_1fr_1fr] gap-4 items-center p-4 rounded-xl bg-muted/30 border border-border/50"
            >
              <input type="checkbox" className="h-4 w-4 rounded border-border" />
              <div className="flex items-center justify-center">
                <div className="h-20 w-20 bg-muted rounded-lg flex items-center justify-center">
                  <QrCode className="h-12 w-12 text-muted-foreground/50" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ImageWithSkeleton
                  src={aw.artworkPhoto}
                  alt={aw.title}
                  wrapperClassName="h-16 w-16 rounded-lg"
                  className="h-16 w-16 rounded-lg object-cover"
                />
                <div>
                  <p className="font-serif font-bold">{aw.title}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" className="gradient-gold gradient-gold-hover-bg text-primary-foreground gap-2 text-xs">
                  <Download className="h-3 w-3" /> Télécharger le cartel
                </Button>
                <Button variant="outline" size="sm" className="gap-2 text-xs">
                  <RefreshCw className="h-3 w-3" /> Générer le QR Code
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <ArtworkModal open={artworkModalOpen} onOpenChange={setArtworkModalOpen} />
    </div>
  );
};

export default QRCodes;
