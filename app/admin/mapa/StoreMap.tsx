"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { StoreMapMarker } from "./StoreMapSection";

const LESKOVAC_CENTER: [number, number] = [43.105, 21.895];
const FALLBACK_ALLOWED_BOUNDS: [[number, number], [number, number]] = [
  [42.95, 21.78],
  [43.2, 22.02]
];
const MIN_ZOOM = 10;
const MAX_ZOOM = 18;

export default function StoreMap({ markers }: { markers: StoreMapMarker[] }) {
  const allowedBounds = useMemo(() => getAllowedBounds(markers), [markers]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <MapContainer
        center={LESKOVAC_CENTER}
        className="h-[70vh] min-h-[420px] w-full"
        maxBounds={allowedBounds}
        maxBoundsViscosity={0.9}
        maxZoom={MAX_ZOOM}
        minZoom={MIN_ZOOM}
        scrollWheelZoom
        zoom={11}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitStoreBounds markers={markers} />
        {markers.map((marker) => (
          <Marker
            icon={createStoreIcon(marker.statusColor, marker.storeType)}
            key={marker.id}
            position={[marker.latitude, marker.longitude]}
          >
            <Popup minWidth={220}>
              <div className="space-y-3 text-sm text-slate-700">
                <div>
                  <p className="font-bold text-slate-950">{marker.name}</p>
                  {marker.address ? <p className="mt-1 text-xs text-slate-500">{marker.address}</p> : null}
                </div>
                <dl className="space-y-1">
                  <PopupRow label="Tip" value={formatStoreType(marker.storeType)} />
                  <PopupRow label="Pazar juče" value={formatMoney(marker.yesterdayRevenueTotal)} />
                  <PopupRow label="Pazar danas" value={formatStatus(marker.revenueSubmitted)} />
                  <PopupRow label="Temperatura danas" value={formatStatus(marker.temperatureSubmitted)} />
                  <PopupRow label="Slika police danas" value={formatStatus(marker.shelfPhotoSubmitted)} />
                  <PopupRow label="Otvoreni zadaci" value={String(marker.openTasksCount)} />
                </dl>
                <a
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-leaf px-3 py-2 text-sm font-semibold text-white"
                  href={marker.detailHref}
                >
                  Otvori detalje
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function FitStoreBounds({ markers }: { markers: StoreMapMarker[] }) {
  const map = useMap();

  useEffect(() => {
    if (markers.length === 0) return;

    const points = markers.map((marker) => [marker.latitude, marker.longitude] as [number, number]);
    const bounds = L.latLngBounds(points);

    map.fitBounds(bounds, { maxZoom: 13, padding: [32, 32] });
  }, [map, markers]);

  return null;
}

function getAllowedBounds(markers: StoreMapMarker[]) {
  if (markers.length === 0) return FALLBACK_ALLOWED_BOUNDS;

  const points = markers.map((marker) => [marker.latitude, marker.longitude] as [number, number]);
  const markerBounds = L.latLngBounds(points).pad(0.45);
  const fallbackBounds = L.latLngBounds(FALLBACK_ALLOWED_BOUNDS);

  markerBounds.extend(fallbackBounds.getSouthWest());
  markerBounds.extend(fallbackBounds.getNorthEast());

  return markerBounds;
}

function PopupRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function createStoreIcon(color: StoreMapMarker["statusColor"], storeType: StoreMapMarker["storeType"]) {
  const colorStyle =
    color === "green"
      ? "background:#10b981;border-color:#047857;"
      : color === "yellow"
        ? "background:#f59e0b;border-color:#b45309;"
        : "background:#ef4444;border-color:#b91c1c;";
  const shapeStyle = getMarkerShapeStyle(storeType);

  return L.divIcon({
    className: "",
    html: `<span class="store-map-marker store-map-marker-${storeType}" style="${colorStyle}${shapeStyle.style}"></span>`,
    iconAnchor: shapeStyle.anchor,
    popupAnchor: [0, -10]
  });
}

function getMarkerShapeStyle(storeType: StoreMapMarker["storeType"]) {
  if (storeType === "supermarket") {
    return {
      anchor: [14, 14] as [number, number],
      style:
        "display:block;width:28px;height:28px;border-radius:8px;border-width:4px;border-style:solid;box-shadow:0 12px 28px rgba(15,23,42,.32);"
    };
  }

  if (storeType === "medium") {
    return {
      anchor: [11, 11] as [number, number],
      style:
        "display:block;width:22px;height:22px;border-radius:9999px;border-width:3px;border-style:solid;box-shadow:0 10px 24px rgba(15,23,42,.28);"
    };
  }

  return {
    anchor: [8, 8] as [number, number],
    style:
      "display:block;width:16px;height:16px;border-radius:4px;border-width:2px;border-style:solid;box-shadow:0 8px 18px rgba(15,23,42,.24);transform:rotate(45deg);"
  };
}

function formatStatus(value: boolean) {
  return value ? "Poslato" : "Nije poslato";
}

function formatStoreType(value: StoreMapMarker["storeType"]) {
  if (value === "supermarket") return "Supermarket";
  if (value === "medium") return "Srednja radnja";
  return "Mini market";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("sr-RS", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(value);
}
