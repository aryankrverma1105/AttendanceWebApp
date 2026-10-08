"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  getAdaptiveHysteresisMeters,
  calculateEnclosedAreaM2,
  calculateCircumferenceM,
  formatArea,
  formatDistance,
} from "@/lib/geo";

interface GeofenceMapEditorProps {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  onLocationChange: (lat: number, lng: number) => void;
  existingGeofences?: any[];
}

export function GeofenceMapEditor({
  latitude,
  longitude,
  radiusMeters,
  onLocationChange,
  existingGeofences = [],
}: GeofenceMapEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const haloRef = useRef<L.Circle | null>(null);
  const [hint, setHint] = useState("Click or drag pin to position geofence centre");

  const adaptiveHysteresis = getAdaptiveHysteresisMeters(radiusMeters);
  const areaM2 = calculateEnclosedAreaM2(radiusMeters);
  const circumferenceM = calculateCircumferenceM(radiusMeters);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [latitude || 17.4445, longitude || 78.3785],
      zoom: 15,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_4e5f_1_4f7d31c7b00835a4b92885e3", {
      attribution: "&copy; CARTO, OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Draw existing geofences as reference
    existingGeofences.forEach((gf) => {
      L.circle([gf.latitude, gf.longitude], {
        radius: gf.radiusMeters,
        color: "#94a3b8",
        weight: 1,
        fillColor: "#94a3b8",
        fillOpacity: 0.05,
        dashArray: "4,6",
      })
        .bindTooltip(`<b>${gf.name}</b><br/>${gf.type}`, {
          direction: "top",
          className: "text-xs",
        })
        .addTo(map);
    });

    // Click to place
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      onLocationChange(lat, lng);
      setHint(`Centre: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker + dual concentric rings when lat/lng/radius change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !latitude || !longitude) return;

    const latlng: [number, number] = [latitude, longitude];
    const hysteresis = getAdaptiveHysteresisMeters(radiusMeters);

    // Update or create draggable marker
    if (markerRef.current) {
      markerRef.current.setLatLng(latlng);
    } else {
      const icon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-6 h-6 rounded-full bg-amber-500/20 animate-ping"></div>
            <div class="w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow-lg flex items-center justify-center">
              <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
            </div>
          </div>
        `,
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker(latlng, { icon, draggable: true }).addTo(map);
      marker.on("dragend", (e) => {
        const newPos = (e.target as L.Marker).getLatLng();
        onLocationChange(newPos.lat, newPos.lng);
        setHint(`Centre: ${newPos.lat.toFixed(5)}, ${newPos.lng.toFixed(5)}`);
      });
      markerRef.current = marker;
    }

    // Outer concentric ring: dynamic entry tolerance halo - soft amber
    if (haloRef.current) {
      haloRef.current.setLatLng(latlng);
      haloRef.current.setRadius(radiusMeters + hysteresis);
    } else {
      haloRef.current = L.circle(latlng, {
        radius: radiusMeters + hysteresis,
        color: "#F59E0B",
        weight: 1.5,
        dashArray: "4, 6",
        fillColor: "#FEF3C7",
        fillOpacity: 0.1,
      }).addTo(map);
    }

    // Inner concentric ring: core boundary perimeter - soft amber circle
    if (circleRef.current) {
      circleRef.current.setLatLng(latlng);
      circleRef.current.setRadius(radiusMeters);
    } else {
      circleRef.current = L.circle(latlng, {
        radius: radiusMeters,
        color: "#D97706",
        weight: 2,
        fillColor: "#F59E0B",
        fillOpacity: 0.22,
      }).addTo(map);
    }

    map.panTo(latlng);
  }, [latitude, longitude, radiusMeters, onLocationChange]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-border bg-muted/20">
      <div ref={containerRef} className="w-full h-72" />

      {/* Top HUD: Real-time High-Precision Geometry Metrics */}
      <div className="absolute top-2 left-2 right-2 z-[1000] flex items-center justify-between pointer-events-none gap-2">
        <div className="bg-background/90 backdrop-blur-md border border-border shadow-xs px-2.5 py-1 rounded-md text-[11px] font-mono flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            <span className="text-muted-foreground font-sans text-[10px]">Radius:</span>
            <span className="font-semibold text-foreground">{radiusMeters}m</span>
          </div>
          <div className="w-px h-3 bg-border"></div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-sans text-[10px]">Tolerance:</span>
            <span className="font-semibold text-blue-600">+{adaptiveHysteresis.toFixed(0)}m</span>
          </div>
          <div className="w-px h-3 bg-border"></div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-sans text-[10px]">Area:</span>
            <span className="font-semibold text-foreground">{formatArea(areaM2)}</span>
          </div>
          <div className="w-px h-3 bg-border hidden sm:block"></div>
          <div className="items-center gap-1.5 hidden sm:flex">
            <span className="text-muted-foreground font-sans text-[10px]">Perimeter:</span>
            <span className="font-semibold text-foreground">{formatDistance(circumferenceM)}</span>
          </div>
        </div>

        <div className="bg-background/90 backdrop-blur-md border border-border shadow-xs px-2 py-1 rounded-md text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          WGS-84 Precision
        </div>
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-background/90 border border-border backdrop-blur-md rounded px-2.5 py-1 text-[11px] text-muted-foreground font-mono max-w-sm shadow-xs">
        {hint}
      </div>
    </div>
  );
}
