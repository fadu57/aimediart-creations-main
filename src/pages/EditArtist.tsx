import { useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AddArtistDialog } from "@/components/AddArtistDialog";

const EditArtist = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const artistId = useMemo(() => (id ?? "").trim() || null, [id]);

  if (!artistId) {
    return <Navigate to="/artistes" replace />;
  }

  return (
    <AddArtistDialog
      open
      artistId={artistId}
      onOpenChange={(open) => {
        if (!open) navigate("/artistes");
      }}
      onSuccess={() => navigate("/artistes")}
    />
  );
};

export default EditArtist;
