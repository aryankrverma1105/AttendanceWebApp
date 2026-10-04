"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { getSocket } from "@/lib/socket";
import { Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import { getAdaptiveHysteresisMeters, formatArea, calculateEnclosedAreaM2 } from "@/lib/geo";

interface LiveMapProps {
  geofences: any[];
  employees: any[];
  selectedEmployeeId?: string | null;
  onSelectEmployee?: (emp: any) => void;
}

const GEOFENCE_COLORS: Record<string, string> = {
  OFFICE: "#F59E0B",
  CUSTOMER_SITE: "#0EA5E9",
  FIELD_SITE: "#16A34A",
  REMOTE: "#8B5CF6",
  OTHER: "#F59E0B",
};

export function LiveMap({ geofences, employees, selectedEmployeeId, onSelectEmployee }: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const employeeMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const [activePinDetails, setActivePinDetails] = useState<any | null>(null);

  const employeesRef = useRef(employees);
  employeesRef.current = employees;
  const onSelectEmployeeRef = useRef(onSelectEmployee);
  onSelectEmployeeRef.current = onSelectEmployee;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [17.4445, 78.3785],
      zoom: 13,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Standard light map tile layer (CartoDB light_all)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>, OpenStreetMap',
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render & Update Geofences with Soft Amber Circles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const circlesLayer = L.layerGroup();

    geofences.forEach((gf) => {
      const color = GEOFENCE_COLORS[gf.type] || "#F59E0B";
      const hysteresis = getAdaptiveHysteresisMeters(gf.radiusMeters || 100);
      const area = calculateEnclosedAreaM2(gf.radiusMeters || 100);

      if (gf.boundaryType === "POLYGON" && gf.polygonCoordinates?.length) {
        // Arbitrary Polygon Boundary
        const poly = L.polygon(gf.polygonCoordinates, {
          color: color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.12,
        });

        poly.bindTooltip(
          `<b>${gf.name}</b><br/>${gf.type} • Polygon Boundary<br/><span style="color:#D97706">WGS-84 Precision</span>`,
          {
            direction: "top",
            className: "bg-white text-gray-800 border border-[#F3E8C8] px-2.5 py-1.5 rounded text-xs shadow-md",
          }
        );
        poly.addTo(circlesLayer);
      } else {
        // Outer Dynamic Entry Tolerance Halo - soft amber
        const halo = L.circle([gf.latitude, gf.longitude], {
          radius: gf.radiusMeters + hysteresis,
          color: "#F59E0B",
          weight: 1.2,
          dashArray: "4, 6",
          fillColor: "#FEF3C7",
          fillOpacity: 0.08,
        });
        halo.addTo(circlesLayer);

        // Inner Core Boundary Perimeter - soft amber circle
        const coreCircle = L.circle([gf.latitude, gf.longitude], {
          radius: gf.radiusMeters,
          color: "#F59E0B",
          weight: 2,
          fillColor: "#FEF3C7",
          fillOpacity: 0.2,
        });

        coreCircle.bindTooltip(
          `<b>${gf.name}</b><br/>${gf.type} • ${gf.radiusMeters}m perimeter<br/>Area: ${formatArea(area)} • Tolerance: ±${hysteresis.toFixed(0)}m<br/><span style="font-size:10px;color:#16A34A">✓ WGS-84 Geodesic</span>`,
          {
            direction: "top",
            className: "bg-white text-gray-800 border border-[#F3E8C8] px-2.5 py-1.5 rounded text-xs shadow-md",
          }
        );

        coreCircle.addTo(circlesLayer);
      }
    });

    circlesLayer.addTo(map);

    return () => {
      map.removeLayer(circlesLayer);
    };
  }, [geofences]);

  // Helper to construct custom employee marker icon:
  // Sun-shaped amber for checked-in, grey for offline, red with pulse for location-off
  const createEmployeeIcon = (
    name: string,
    employeeCode: string,
    photoUrl?: string,
    statusState?: { isLocationOff?: boolean; isNoSignal?: boolean; status?: string; isCheckedIn?: boolean }
  ) => {
    const initials = (name || employeeCode || "EM")
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();

    const isOff = statusState?.isLocationOff;
    const isNoSig = statusState?.isNoSignal;
    const isWorking = statusState?.isCheckedIn || statusState?.status === "WORKING" || statusState?.status === "OVERTIME";

    let borderCol = "#F59E0B"; // Solar amber default
    let bgRing = "ring-[#FEF3C7]";
    let glow = "0 2px 10px rgba(245,158,11,0.35)";
    let pulseHtml = "";

    if (isOff) {
      borderCol = "#DC2626";
      bgRing = "ring-red-200";
      glow = "0 0 14px rgba(220,38,38,0.7)";
      pulseHtml = `<div class="absolute -inset-1.5 rounded-full bg-red-500/40 animate-ping"></div>`;
    } else if (isNoSig || (!isWorking && statusState?.status === "OFFLINE")) {
      borderCol = "#9CA3AF";
      bgRing = "ring-gray-200";
      glow = "none";
    }

    // Sun rays effect for active checked-in users
    const sunRays = isWorking && !isOff ? `
      <div class="absolute -inset-1 rounded-full border border-amber-400/50 animate-pulse pointer-events-none"></div>
      <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-0.5 h-1 bg-amber-400 rounded-full"></div>
      <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0.5 h-1 bg-amber-400 rounded-full"></div>
      <div class="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-0.5 bg-amber-400 rounded-full"></div>
      <div class="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-0.5 bg-amber-400 rounded-full"></div>
    ` : "";

    const iconHtml = `
      <div class="relative cursor-pointer group flex items-center justify-center">
        ${pulseHtml}
        ${sunRays}
        <div style="border-color: ${borderCol}; box-shadow: ${glow}; background-color: ${borderCol};" class="w-8 h-8 rounded-full border-2 flex items-center justify-center overflow-hidden text-gray-900 text-[11px] font-bold ring-2 ${bgRing} transition-transform transform group-hover:scale-110">
          ${
            photoUrl
              ? `<img src="${photoUrl}" class="w-full h-full object-cover" />`
              : `<span class="text-white font-bold">${initials}</span>`
          }
        </div>
        <div class="absolute -top-6 left-1/2 -translate-x-1/2 bg-white text-gray-800 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#F3E8C8] shadow-xs whitespace-nowrap flex items-center gap-1">
          ${isOff ? `<span class="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>` : ""}
          ${name || employeeCode}
        </div>
      </div>
    `;

    return L.divIcon({
      html: iconHtml,
      className: "custom-employee-marker",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  };

  // Render & Update Employee Markers from props
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    employees.forEach((emp) => {
      const lat = emp.lastLatitude;
      const lng = emp.lastLongitude;
      if (!lat || !lng) return;

      const isOff = emp.isLocationOff || emp.locationStatus === "LOCATION_OFF";
      const isNoSig = emp.isNoSignal || emp.locationStatus === "NO_SIGNAL";

      const customIcon = createEmployeeIcon(
        emp.user?.name || emp.name,
        emp.employeeCode,
        emp.user?.photoUrl || emp.photoUrl,
        {
          isLocationOff: isOff,
          isNoSignal: isNoSig,
          status: emp.currentStatus,
          isCheckedIn: emp.currentStatus === "WORKING" || !!emp.activeAttendance,
        }
      );

      let marker = employeeMarkersRef.current.get(emp.id);

      if (!marker) {
        marker = L.marker([lat, lng], { icon: customIcon });
        marker.on("click", () => {
          setActivePinDetails(emp);
          if (onSelectEmployee) onSelectEmployee(emp);
        });
        marker.addTo(map);
        employeeMarkersRef.current.set(emp.id, marker);
      } else {
        marker.setLatLng([lat, lng]);
        marker.setIcon(customIcon);
      }
    });
  }, [employees, onSelectEmployee]);

  // Real-time Socket.IO Marker Movement & Status Changes
  useEffect(() => {
    const socket = getSocket();

    const handleLocationUpdated = (data: any) => {
      const map = mapInstanceRef.current;
      if (!map || !data?.employeeId || !data?.latitude || !data?.longitude) return;

      console.log("[LiveMap] Live location updated:", data.employeeId, data.latitude, data.longitude);

      let marker = employeeMarkersRef.current.get(data.employeeId);

      const emp = employeesRef.current.find((e) => e.id === data.employeeId) || {
        id: data.employeeId,
        employeeCode: data.employeeCode || "EMP",
        user: { name: data.name, photoUrl: data.photoUrl },
        currentStatus: data.status || "WORKING",
      };

      const customIcon = createEmployeeIcon(
        data.name || emp.user?.name || emp.employeeCode,
        data.employeeCode || emp.employeeCode,
        data.photoUrl || emp.user?.photoUrl,
        {
          isLocationOff: data.state === "LOCATION_OFF" || data.isLocationOff,
          isNoSignal: data.state === "NO_SIGNAL" || data.isNoSignal,
          status: data.status || emp.currentStatus,
          isCheckedIn: true,
        }
      );

      if (!marker) {
        marker = L.marker([data.latitude, data.longitude], { icon: customIcon });
        marker.on("click", () => {
          setActivePinDetails({ ...emp, lastLatitude: data.latitude, lastLongitude: data.longitude });
          if (onSelectEmployeeRef.current) onSelectEmployeeRef.current(emp);
        });
        marker.addTo(map);
        employeeMarkersRef.current.set(data.employeeId, marker);
      } else {
        marker.setLatLng([data.latitude, data.longitude]);
        marker.setIcon(customIcon);
      }

      // Update selected quick-card if active
      setActivePinDetails((prev: any) => {
        if (prev?.id === data.employeeId) {
          return {
            ...prev,
            lastLatitude: data.latitude,
            lastLongitude: data.longitude,
            currentStatus: data.status || prev.currentStatus,
            lastLocationUpdate: data.recordedAt || new Date().toISOString(),
            isLocationOff: data.state === "LOCATION_OFF",
          };
        }
        return prev;
      });
    };

    const handleLocationOff = (data: any) => {
      if (!data?.employeeId) return;
      const marker = employeeMarkersRef.current.get(data.employeeId);
      const emp = employeesRef.current.find((e) => e.id === data.employeeId);
      if (marker && emp) {
        const customIcon = createEmployeeIcon(
          emp.user?.name || emp.name,
          emp.employeeCode,
          emp.user?.photoUrl || emp.photoUrl,
          { isLocationOff: true, status: emp.currentStatus }
        );
        marker.setIcon(customIcon);
      }
    };

    socket.on("employee.location.updated", handleLocationUpdated);
    socket.on("location.updated", handleLocationUpdated);
    socket.on("employee.location.off", handleLocationOff);

    return () => {
      socket.off("employee.location.updated", handleLocationUpdated);
      socket.off("location.updated", handleLocationUpdated);
      socket.off("employee.location.off", handleLocationOff);
    };
  }, []);

  return (
    <div className="relative w-full h-full min-h-[480px] rounded-lg overflow-hidden border border-border">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Map Overlay Badge */}
      <div className="absolute top-3 left-3 z-[1000] bg-card/90 border border-border backdrop-blur-xs rounded-md p-2 text-xs shadow-xs space-y-1">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Navigation className="w-3.5 h-3.5" />
          <span>Operations Radar</span>
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-3">
          <span>Working: {employees.filter((e) => e.currentStatus === "WORKING").length}</span>
          <span>Away: {employees.filter((e) => e.currentStatus === "AWAY").length}</span>
          <span>Remote: {employees.filter((e) => e.currentStatus === "REMOTE_WORKING").length}</span>
        </div>
      </div>

      {/* Selected Employee Quick Card */}
      {activePinDetails && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-popover border border-border text-popover-foreground rounded-lg p-3 shadow-md max-w-sm w-full">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-md overflow-hidden bg-muted border border-border flex items-center justify-center font-semibold text-xs">
                {activePinDetails.user?.photoUrl ? (
                  <img src={activePinDetails.user.photoUrl} className="w-full h-full object-cover" />
                ) : (
                  activePinDetails.user?.name?.substring(0, 2) || "EM"
                )}
              </div>
              <div>
                <h4 className="font-semibold text-foreground text-xs">{activePinDetails.user?.name}</h4>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {activePinDetails.employeeCode} • {activePinDetails.department?.name || "Field Services"}
                </p>
                <div className="mt-0.5">
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                    {activePinDetails.currentStatus}
                  </Badge>
                </div>
              </div>
            </div>
            <button
              onClick={() => setActivePinDetails(null)}
              className="text-muted-foreground hover:text-foreground text-xs font-medium px-1"
            >
              ✕
            </button>
          </div>

          <div className="mt-2.5 pt-2 border-t border-border grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground text-[10px] block">Assigned Site</span>
              <span className="font-medium text-foreground truncate block">
                {activePinDetails.geofenceAssignments?.[0]?.geofence?.name || "Corporate HQ"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground text-[10px] block">Punctuality Score</span>
              <span className="font-medium text-foreground font-mono">
                {activePinDetails.punctualityScore || 96.5}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
