import { ChevronLeft, ChevronRight, Home, Menu, Palette, Settings, X } from "lucide-react";
import { Link } from "react-router-dom";

interface ArtistWorksHeaderProps {
  artistName: string;
  onPrev: () => void;
  onNext: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  isMenuOpen: boolean;
}

const ArtistWorksHeader = ({ artistName, onPrev, onNext, onToggleMenu, onCloseMenu, isMenuOpen }: ArtistWorksHeaderProps) => {
  return (
    <header className="fixed left-1/2 top-0 z-50 w-[360px] -translate-x-1/2 border-b border-white/20 bg-black/60 backdrop-blur-md">
      <div className="mx-auto flex w-full items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Oeuvre precedente"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/35 bg-white/10 text-white transition hover:bg-white/20"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <Link
            to="/scan-work2"
            className="inline-flex h-9 items-center justify-center rounded-full bg-[#E63946] px-3 text-xs font-semibold text-white transition hover:bg-[#cf2f3c]"
          >
            Scan
          </Link>
        </div>

        <h1 className="px-2 text-center text-sm font-semibold text-white">{artistName}</h1>

        <div className="flex items-center gap-2">
          <div className={`fab-container œuvre-navi ${isMenuOpen ? "active" : ""}`}>
            <button
              type="button"
              className="fab-main shrink-0"
              aria-label={isMenuOpen ? "Fermer le menu flottant" : "Ouvrir le menu flottant"}
              onClick={onToggleMenu}
              style={{ width: 36, height: 36 }}
            >
              {isMenuOpen ? <X className="h-5 w-5 text-white" aria-hidden /> : <Menu className="h-5 w-5 text-white" aria-hidden />}
            </button>
            <div className="fab-links">
              <Link to="/dashboard" className="fab-item fab-nav-link" aria-label="Accueil" onClick={onCloseMenu}>
                <Home className="h-5 w-5 text-[#121212]" aria-hidden />
                <span className="fab-item-label">Accueil</span>
              </Link>
              <Link to="/artistes" className="fab-item fab-nav-link" aria-label="Artistes" onClick={onCloseMenu}>
                <Palette className="h-5 w-5 text-[#121212]" aria-hidden />
                <span className="fab-item-label">Artistes</span>
              </Link>
              <Link to="/catalogue" className="fab-item fab-nav-link" aria-label="Catalogue" onClick={onCloseMenu}>
                <Palette className="h-5 w-5 text-[#121212]" aria-hidden />
                <span className="fab-item-label">Catalogue</span>
              </Link>
              <Link to="/settings" className="fab-item fab-nav-link" aria-label="Paramètres" onClick={onCloseMenu}>
                <Settings className="h-5 w-5 text-[#121212]" aria-hidden />
                <span className="fab-item-label">Paramètres</span>
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={onNext}
            aria-label="Oeuvre suivante"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/35 bg-white/10 text-white transition hover:bg-white/20"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default ArtistWorksHeader;
