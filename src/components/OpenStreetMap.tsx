import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

import markerIcon   from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Correction icône Vite : les chemins internes de Leaflet ne fonctionnent pas
// avec les imports de modules ES — on les réassigne manuellement.
function fixLeafletIcons() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl:       markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl:     markerShadow,
  });
}

type Props = {
  lat: number;
  lon: number;
  label?: string;
  height?: number;
  zoom?: number;
};

export function OpenStreetMap({ lat, lon, label, height = 260, zoom = 12 }: Props) {
  useEffect(() => { fixLeafletIcons(); }, []);

  return (
    <MapContainer
      center={[lat, lon]}
      zoom={zoom}
      style={{ height, width: "100%", borderRadius: "0.5rem" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lon]}>
        {label && <Popup>{label}</Popup>}
      </Marker>
    </MapContainer>
  );
}
