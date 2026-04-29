export interface ArtworkCubeItem {
  id: string;
  title: string;
  imageUrl: string;
  description: string;
}

interface CubeFaceProps {
  artwork: ArtworkCubeItem;
  faceClass: string;
}

const CubeFace = ({ artwork, faceClass }: CubeFaceProps) => {
  return (
    <div className={`cube__face ${faceClass}`}>
      <div className="cube__card">
        <iframe
          className="cube__iframe"
          src={`/œuvre/${encodeURIComponent(artwork.id)}?embed=1&nav_mode=same_artist_all_works`}
          title={`Page œuvre ${artwork.title}`}
          loading="lazy"
        />
      </div>
    </div>
  );
};

export default CubeFace;
