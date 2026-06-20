import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

import type { VisitorGeoTableRow } from "@/lib/statisticsVisitorGeography";

const MARKER_COLORS = {
  visitor: "#2563eb",
  profile: "#dc2626",
} as const;

function createParticipantIcon(kind: VisitorGeoTableRow["participantKind"]) {
  const color = MARKER_COLORS[kind];
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

function FitMapToMarkers({ markers }: { markers: Array<{ lat: number; lon: number }> }) {
  const map = useMap();
  const pointsKey = markers.map((m) => `${m.lat},${m.lon}`).join("|");

  useEffect(() => {
    if (markers.length === 0) return;

    let cancelled = false;
    let timer: number | undefined;

    const applyFit = () => {
      if (cancelled) return;
      map.invalidateSize();

      if (markers.length === 1) {
        map.setView([markers[0]!.lat, markers[0]!.lon], 11, { animate: false });
        return;
      }

      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lon] as [number, number]));
      if (!bounds.isValid()) return;
      map.fitBounds(bounds, { padding: [52, 52], animate: false });
    };

    const scheduleFit = () => {
      applyFit();
      window.requestAnimationFrame(applyFit);
      timer = window.setTimeout(applyFit, 300);
    };

    if (map.getContainer()) {
      scheduleFit();
    }
    map.whenReady(scheduleFit);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [map, pointsKey, markers]);

  return null;
}

type Props = {
  rows: VisitorGeoTableRow[];
  height?: number;
};

export function VisitorGeographyMap({ rows, height = 420 }: Props) {
  const icons = useMemo(
    () => ({
      visitor: createParticipantIcon("visitor"),
      profile: createParticipantIcon("profile"),
    }),
    [],
  );

  const markers = useMemo(
    () =>
      rows
        .filter((row) => row.latitude != null && row.longitude != null)
        .map((row, index) => ({
          id: `${row.participantKind}:${row.visitorKey}`,
          lat: row.latitude as number,
          lon: row.longitude as number,
          label: row.label,
          place: [row.city, row.country].filter(Boolean).join(", ") || "—",
          kind: row.participantKind,
          offset: ((index % 5) - 2) * 0.0008,
        })),
    [rows],
  );

  const fitPoints = useMemo(
    () => markers.map((m) => ({ lat: m.lat + m.offset, lon: m.lon + m.offset })),
    [markers],
  );

  const defaultCenter = useMemo<[number, number]>(() => {
    if (markers.length > 0) return [markers[0]!.lat, markers[0]!.lon];
    return [46.603354, 1.888334];
  }, [markers]);

  return (
    <MapContainer
      center={defaultCenter}
      zoom={5}
      style={{ height, width: "100%", borderRadius: "0.5rem" }}
      scrollWheelZoom
      zoomControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitMapToMarkers markers={fitPoints} />
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          position={[marker.lat + marker.offset, marker.lon + marker.offset]}
          icon={icons[marker.kind]}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{marker.label}</p>
              <p className="text-muted-foreground">{marker.place}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
