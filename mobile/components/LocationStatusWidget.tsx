/**
 * LocationStatusWidget.tsx
 * Sologix Energy Telemetry Card
 * High-precision GPS & geofence telemetry indicator.
 */
import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  onLocationUpdate,
  startForegroundTracking,
  requestPermissions,
  getPermissionStatus,
  getCurrentPosition,
  ensureLocationProviders,
  type LocationState,
} from "../lib/location";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { IconTile } from "./ui/icon-tile";

type Props = {
  onPositionUpdate?: (pos: LocationState) => void;
};

export function LocationStatusWidget({ onPositionUpdate }: Props) {
  const [loc, setLoc] = useState<LocationState | null>(null);
  const [permGranted, setPermGranted] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [delayedFix, setDelayedFix] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDelayedFix(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [loc]);

  useEffect(() => {
    getPermissionStatus().then(async ({ foreground }) => {
      setPermGranted(foreground);
      if (foreground) {
        await ensureLocationProviders();
        await startForegroundTracking().catch(() => {});
        const pos = await getCurrentPosition().catch(() => null);
        if (pos) {
          setLoc(pos);
          onPositionUpdate?.(pos);
        }
      }
    });
  }, [onPositionUpdate]);

  useEffect(() => {
    const unsub = onLocationUpdate((state) => {
      setLoc(state);
      onPositionUpdate?.(state);
    });
    return unsub;
  }, [onPositionUpdate]);

  const handleEnable = async () => {
    setStarting(true);
    const { foreground } = await requestPermissions();
    setPermGranted(foreground);
    if (foreground) {
      await ensureLocationProviders();
      await startForegroundTracking();
      const pos = await getCurrentPosition().catch(() => null);
      if (pos) {
        setLoc(pos);
        onPositionUpdate?.(pos);
      }
    }
    setStarting(false);
  };

  const handleRefreshFix = async () => {
    setRetrying(true);
    try {
      await ensureLocationProviders();
      await startForegroundTracking();
      const pos = await getCurrentPosition();
      if (pos) {
        setLoc(pos);
        onPositionUpdate?.(pos);
      }
    } finally {
      setRetrying(false);
    }
  };

  // ── Permission Denied or Location Off (Solid Red Banner as required by prompt) ──
  if (permGranted === false) {
    return (
      <View className="rounded-2xl bg-[#DC2626] p-4 border border-[#B91C1C] shadow-warm">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-white/20 items-center justify-center">
            <Ionicons name="location-outline" size={24} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <Text className="text-[16px] font-bold text-white tracking-tight">
              Location Services Required
            </Text>
            <Text className="text-[13px] text-white/90 mt-0.5 leading-snug">
              Your location is OFF. Please turn on location services to verify your attendance.
            </Text>
          </View>
        </View>

        <Button
          variant="secondary"
          size="sm"
          onPress={handleEnable}
          loading={starting}
          className="mt-3 bg-white border-transparent"
          textClassName="text-[#DC2626] font-bold"
        >
          Enable Location in Settings
        </Button>
      </View>
    );
  }

  // ── Acquiring Fix ──────────────────────────────────────────────────────────
  if (!loc) {
    return (
      <Card className="border-[#F3E8C8] bg-white">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5">
            <IconTile name="navigate" bg="bg-[#FEF3C7]" color="#D97706" />
            <View>
              <Text className="text-[15px] font-bold text-[#1F2937]">
                Location Telemetry
              </Text>
              <Text className="text-[12px] text-[#6B7280]">
                Acquiring solar GPS fix…
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <Badge variant="warning" className="animate-pulse">
              CONNECTING
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onPress={handleRefreshFix}
              loading={retrying}
              className="py-1 px-2.5 border-[#F3E8C8]"
            >
              <Ionicons name="refresh" size={13} color="#D97706" />
            </Button>
          </View>
        </View>

        {delayedFix && (
          <View className="mt-3 pt-2.5 border-t border-[#F3E8C8] flex-row gap-2 items-center">
            <Button
              variant="default"
              size="sm"
              onPress={handleRefreshFix}
              loading={retrying}
              className="flex-1 py-1.5 bg-[#F59E0B] border-transparent"
              textClassName="text-[#1F2937] font-bold"
            >
              Retry Satellite Fix
            </Button>
          </View>
        )}
      </Card>
    );
  }

  // ── Live Telemetry State ───────────────────────────────────────────────────
  const isHighPrecision = loc.accuracy <= 10;
  const isGoodPrecision = loc.accuracy <= 25;
  const radarBg = isHighPrecision ? "bg-[#16A34A]" : isGoodPrecision ? "bg-[#0EA5E9]" : "bg-[#F59E0B]";

  const updatedAt = new Date(loc.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <Card className="border-[#F3E8C8] bg-white">
      {/* Header Row */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2.5">
          <View className="w-8 h-8 rounded-lg bg-[#DCFCE7] border border-[#BBF7D0] items-center justify-center">
            <Ionicons name="navigate" size={17} color="#16A34A" />
          </View>
          <View>
            <Text className="text-[15px] font-bold text-[#1F2937] tracking-tight">
              Location Services
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <View className={`w-1.5 h-1.5 rounded-full ${radarBg}`} />
              <Text className="text-[12px] font-bold text-[#16A34A]">
                {isHighPrecision ? "High Precision Active" : "Active"}
              </Text>
            </View>
          </View>
        </View>

        <Badge variant={isHighPrecision ? "success" : "info"}>
          ±{loc.accuracy} m
        </Badge>
      </View>

      {/* Metrics Pill Grid */}
      <View className="flex-row gap-2 mt-1">
        {/* Precision Box */}
        <View className="flex-1 bg-[#FEF9E7] rounded-xl p-2.5 border border-[#F3E8C8]">
          <Text className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-wider">
            Accuracy
          </Text>
          <Text className="text-[16px] font-extrabold font-mono text-[#1F2937] mt-0.5">
            ±{loc.accuracy}m
          </Text>
        </View>

        {/* Fused Technology Box */}
        <View className="flex-1 bg-[#FEF9E7] rounded-xl p-2.5 border border-[#F3E8C8]">
          <Text className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-wider">
            Sensors
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1">
            <Ionicons name="wifi" size={13} color="#0EA5E9" />
            <Ionicons name="cellular" size={13} color="#16A34A" />
            <Ionicons name="sunny" size={13} color="#F59E0B" />
          </View>
        </View>

        {/* Speed Box */}
        {loc.speed !== null && loc.speed > 0.3 ? (
          <View className="flex-1 bg-[#FEF9E7] rounded-xl p-2.5 border border-[#F3E8C8]">
            <Text className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-wider">
              Speed
            </Text>
            <Text className="text-[16px] font-extrabold font-mono text-[#1F2937] mt-0.5">
              {(loc.speed * 3.6).toFixed(0)} km/h
            </Text>
          </View>
        ) : (
          <View className="flex-1 bg-[#FEF9E7] rounded-xl p-2.5 border border-[#F3E8C8]">
            <Text className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-wider">
              Status
            </Text>
            <Text className="text-[14px] font-bold text-[#16A34A] mt-0.5">
              Stationary
            </Text>
          </View>
        )}
      </View>

      {/* Lat/Long Footer Row */}
      <View className="flex-row items-center justify-between pt-2 border-t border-[#F3E8C8]">
        <View className="flex-row items-center gap-2">
          <Text className="text-[11px] font-mono text-[#6B7280]">
            {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
          </Text>
        </View>
        <Text className="text-[11px] text-[#6B7280]">
          Updated {updatedAt}
        </Text>
      </View>
    </Card>
  );
}
