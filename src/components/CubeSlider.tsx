import CubeFace, { type ArtworkCubeItem } from "./CubeFace";
import "../styles/CubeSlider.css";

interface CubeSliderProps {
  artworks: ArtworkCubeItem[];
  currentArtworkIndex: number;
  rotationStep: number;
}

const FACE_CLASSES = [
  "cube__face--front",
  "cube__face--right",
  "cube__face--back",
  "cube__face--left",
] as const;

const modulo = (value: number, base: number) => ((value % base) + base) % base;

const CubeSlider = ({ artworks, currentArtworkIndex, rotationStep }: CubeSliderProps) => {
  if (artworks.length === 0) {
    return (
      <div className="scene">
        <div className="cube-empty">Aucune œuvre disponible pour cet artiste.</div>
      </div>
    );
  }

  const visibleFaces = FACE_CLASSES.map((faceClass, faceOffset) => {
    const artworkIndex = modulo(currentArtworkIndex + faceOffset, artworks.length);
    return {
      faceClass,
      artwork: artworks[artworkIndex],
      key: `${faceClass}-${artworks[artworkIndex].id}`,
    };
  });

  const nextArtwork = artworks[modulo(currentArtworkIndex + 1, artworks.length)];
  const prevArtwork = artworks[modulo(currentArtworkIndex - 1, artworks.length)];

  return (
    <div className="scene">
      {/* Préchargement discret des fiches voisines pour fluidifier la navigation. */}
      <iframe
        className="cube__preload-frame"
        src={`/œuvre/${encodeURIComponent(nextArtwork.id)}?embed=1&preload=1`}
        title="preload-next-artwork"
      />
      <iframe
        className="cube__preload-frame"
        src={`/œuvre/${encodeURIComponent(prevArtwork.id)}?embed=1&preload=1`}
        title="preload-prev-artwork"
      />
      <div className="cube-shell">
        <div
          className="cube"
          style={{
            transform: `translateZ(-180px) rotateY(${rotationStep * -90}deg)`,
          }}
        >
          {visibleFaces.map(({ key, artwork, faceClass }) => (
            <CubeFace key={key} artwork={artwork} faceClass={faceClass} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CubeSlider;
