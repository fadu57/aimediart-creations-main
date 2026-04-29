import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type Artwork, getArtistById, getArtworksByArtist, getExpoById } from "@/data/mockData";
import { ArrowLeft, Heart, Eye, Mail } from "lucide-react";

const ArtistDetail = () => {
  const { id } = useParams<{ id: string }>();
  const artist = getArtistById(id || "");
  const works: Artwork[] = getArtworksByArtist(id || "");

  if (!artist) {
    return (
      <div className="container py-16 text-center">
        <p className="text-muted-foreground">Artiste introuvable.</p>
        <Link to="/artistes"><Button variant="ghost" className="mt-4">← Retour</Button></Link>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      <Link to="/artistes">
        <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour aux artistes
        </Button>
      </Link>

      {/* Profile header */}
      <div className="glass-card p-8 flex flex-col md:flex-row gap-8 items-start">
        <img
          src={artist.photo}
          alt={`${artist.firstName} ${artist.name}`}
          className="h-40 w-40 rounded-3xl object-cover ring-4 ring-primary/20"
        />
        <div className="flex-1 space-y-3">
          <div>
            <h2 className="text-4xl font-serif font-bold">{artist.firstName} {artist.name}</h2>
            {artist.pseudo && <p className="text-muted-foreground">aka {artist.pseudo}</p>}
          </div>
          <span className="inline-block text-sm font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">
            {artist.artType}
          </span>
          <p className="text-muted-foreground leading-relaxed">{artist.bio}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" /> {artist.email}
          </div>
        </div>
      </div>

      {/* Artworks */}
      <div>
        <h3 className="text-2xl font-serif font-bold mb-4">Œuvres ({works.length})</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {works.map((aw) => {
            const expo = getExpoById(aw.artwork_expo_id);
            return (
              <Card key={aw.artwork_id} className="glass-card overflow-hidden group hover:shadow-xl transition-all duration-300">
                <div className="relative overflow-hidden">
                  <img
                    src={aw.artwork_photo_url}
                    alt={aw.artwork_title}
                    className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
                    <Heart className="h-3 w-3 fill-crimson text-crimson" />
                    <span className="text-xs font-bold">{aw.artwork_moyenne_coeurs}</span>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h4 className="font-serif font-bold text-lg">{aw.artwork_title}</h4>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{aw.artwork_description}</p>
                  <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1"><Eye className="h-3 w-3" />{aw.artwork_total_visites} visites</div>
                    <span className="bg-muted px-2 py-0.5 rounded-full">{expo?.expo_name}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ArtistDetail;
