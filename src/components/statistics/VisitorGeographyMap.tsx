import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

import type { VisitorGeoTableRow } from "@/lib/statisticsVisitorGeography";

const MARKER_COLORS = {
  visitor: "#2563eb",
  profile: "#dc2626",
} as const;

const FRANCE_CENTER: [number, number] = [46.603354, 1.888334];

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

function isValidCoord(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function FitMapToMarkers({ markers }: { markers: Array<{ lat: number; lon: number }> }) {
  const map = useMap();
  const pointsKey = markers.map((m) => `${m.lat.toFixed(5)},${m.lon.toFixed(5)}`).join("|");

  useEffect(() => {
    if (markers.length === 0) return;

    let cancelled = false;
    const timers: number[] = [];

    const mapIsAlive = () => {
      try {
        const container = map.getContainer();
        return Boolean(container && container.isConnected);
      } catch {
        return false;
      }
    };

    const applyFit = () => {
      if (cancelled || markers.length === 0 || !mapIsAlive()) return;

      try {
        map.invalidateSize(true);
        const latLngs = markers
          .filter((m) => isValidCoord(m.lat, m.lon))
          .map((m) => L.latLng(m.lat, m.lon));
        if (latLngs.length === 0) return;

        if (latLngs.length === 1) {
          map.setView(latLngs[0]!, 11, { animate: false });
          return;
        }

        let bounds = L.latLngBounds(latLngs);
        if (!bounds.isValid()) {
          const center = latLngs[0]!;
          bounds = L.latLngBounds(center, center);
        }

        const northEast = bounds.getNorthEast();
        const southWest = bounds.getSouthWest();
        const latSpan = Math.abs(northEast.lat - southWest.lat);
        const lonSpan = Math.abs(northEast.lng - southWest.lng);
        if (latSpan < 0.02 || lonSpan < 0.02) {
          const padLat = Math.max(latSpan, 0.02);
          const padLon = Math.max(lonSpan, 0.02);
          const center = bounds.getCenter();
          bounds = L.latLngBounds(
            L.latLng(center.lat - padLat, center.lng - padLon),
            L.latLng(center.lat + padLat, center.lng + padLon),
          );
        }

        map.fitBounds(bounds, { padding: [52, 52], maxZoom: 13, animate: false });
      } catch {
        // Carte démontée entre-temps (changement de filtre)
      }
    };

    const scheduleFit = () => {
      applyFit();
      for (const delay of [80, 250, 600]) {
        timers.push(window.setTimeout(applyFit, delay));
      }
    };

    scheduleFit();
    map.whenReady(() => {
      if (!cancelled) scheduleFit();
    });

    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [map, pointsKey, markers]);

  return null;
}

type Props = {
  rows: VisitorGeoTableRow[];
  scopeKey: string;
  height?: number;
};

export function VisitorGeographyMap({ rows, scopeKey, height = 420 }: Props) {
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
          place: [row.zipCode, row.city, row.country].filter(Boolean).join(", ") || "—",
          kind: row.participantKind,
          offset: ((index % 5) - 2) * 0.0008,
        }))
        .filter((m) => isValidCoord(m.lat, m.lon)),
    [rows],
  );

  const fitPoints = useMemo(
    () => markers.map((m) => ({ lat: m.lat + m.offset, lon: m.lon + m.offset })),
    [markers],
  );

  const defaultCenter = useMemo<[number, number]>(() => {
    if (markers.length > 0) return [markers[0]!.lat, markers[0]!.lon];
    return FRANCE_CENTER;
  }, [markers]);

  if (markers.length === 0) return null;

  return (
    <MapContainer
      key={scopeKey}
      center={defaultCenter}
      zoom={6}
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
