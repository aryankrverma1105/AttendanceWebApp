import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { mobileApi, type Employee, type AttendanceSummary } from "../lib/api";
import { LocationStatusWidget } from "../components/LocationStatusWidget";
import { getMobileSocket } from "../lib/socket";
import {
  startForegroundTracking,
  startBackgroundTracking,
  requestPermissions,
  type LocationState,
} from "../lib/location";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { IconTile } from "../components/ui/icon-tile";
import { BrandLogo } from "../components/ui/BrandLogo";

import {
  calculateBoundaryMetrics,
  formatDistance,
  formatArea,
} from "../lib/geo";

interface HomeScreenProps {
  onGoTo?: (screen: string) => void;
}

export default function HomeScreen({ onGoTo }: HomeScreenProps) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPos, setCurrentPos] = useState<LocationState | null>(null);
  const [nearestSite, setNearestSite] = useState<{
    name: string;
    boundaryDistM: number;
    centerDistM: number;
    inside: boolean;
    radius: number;
    toleranceM: number;
  } | null>(null);

  const employeeRef = useRef<Employee | null>(null);
  useEffect(() => {
    employeeRef.current = employee;
  }, [employee]);

  const load = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync("sologix_user");
      if (!raw) return;
      const user = JSON.parse(raw);
      const employeeId = user.employeeId;

      const [sumRes, empRes] = await Promise.all([
        mobileApi.getAttendanceSummary().catch(() => null),
        employeeId ? mobileApi.getMyProfile(employeeId).catch(() => null) : null,
      ]);

      if (sumRes?.success) setSummary(sumRes.summary);
      if (empRes?.success) setEmployee(empRes.data);
    } catch (e) {
      console.error("Home load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();

    (async () => {
      const { foreground, background } = await requestPermissions();
      if (foreground) {
        await startForegroundTracking();
        if (background) {
          await startBackgroundTracking().catch(() => {});
        }
      }
    })();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    let active = true;
    const refresh = () => load();

    getMobileSocket().then((socket) => {
      if (!active) return;
      socket.on("attendance.checked_in", refresh);
      socket.on("attendance.checked_out", refresh);
      socket.on("employee.status.changed", refresh);
      socket.on("attendance.updated", refresh);
      socket.on("leave.updated", refresh);
    });

    return () => {
      active = false;
      getMobileSocket().then((socket) => {
        socket.off("attendance.checked_in", refresh);
        socket.off("attendance.checked_out", refresh);
        socket.off("employee.status.changed", refresh);
        socket.off("attendance.updated", refresh);
        socket.off("leave.updated", refresh);
      });
    };
  }, [load]);

  const handlePositionUpdate = useCallback((pos: LocationState) => {
    setCurrentPos(pos);
    const assignments = employeeRef.current?.geofenceAssignments;
    if (!assignments?.length) return;

    let bestBoundaryDist = Infinity;
    let bestSite: typeof nearestSite = null;

    for (const { geofence } of assignments) {
      const metrics = calculateBoundaryMetrics(
        pos.latitude,
        pos.longitude,
        Number(geofence.latitude),
        Number(geofence.longitude),
        geofence.radiusMeters
      );

      if (metrics.boundaryDistM < bestBoundaryDist) {
        bestBoundaryDist = metrics.boundaryDistM;
        bestSite = {
          name: geofence.name,
          boundaryDistM: Math.round(metrics.boundaryDistM),
          centerDistM: Math.round(metrics.centerDistM),
          inside: metrics.isInside,
          radius: geofence.radiusMeters,
          toleranceM: Math.round(metrics.adaptiveHysteresisM),
        };
      }
    }
    setNearestSite(bestSite);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toUpperCase();
    if (s === "WORKING" || s === "INSIDE") {
      return <Badge variant="success">Working On-Site</Badge>;
    }
    if (s === "AWAY") {
      return <Badge variant="warning">Away / Transit</Badge>;
    }
    if (s === "ON_LEAVE") {
      return <Badge variant="info">On Leave</Badge>;
    }
    return <Badge variant="secondary">{s || "Offline"}</Badge>;
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#FFFBF0]">
        <ActivityIndicator color="#F59E0B" />
      </View>
    );
  }

  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <ScrollView
      className="flex-1 bg-[#FFFBF0]"
      contentContainerClassName="p-4 pt-4 pb-16 gap-5"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#F59E0B"
        />
      }
    >
      {/* Sunny Gradient Header */}
      <LinearGradient
        colors={["#FFF7D6", "#FFFBF0", "#E0F2FE"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="rounded-3xl p-4 border border-[#F3E8C8] shadow-solar"
      >
        <View className="flex-row items-center justify-between">
          <View>
            <View className="flex-row items-center gap-1.5">
              <BrandLogo size={22} />
              <Text className="text-[12px] font-bold text-[#D97706] uppercase tracking-wider">
                Sologix Energy
              </Text>
            </View>
            <Text className="text-[26px] font-extrabold tracking-tight text-[#1F2937] mt-0.5">
              Today's Operations
            </Text>
            <Text className="text-[12px] font-medium text-[#6B7280]">
              {todayStr}
            </Text>
          </View>
          <View className="w-12 h-12 rounded-2xl bg-white/80 border border-[#F3E8C8] items-center justify-center shadow-warm">
            <Ionicons name="sunny" size={26} color="#F59E0B" />
          </View>
        </View>
      </LinearGradient>

      {/* Primary Identity Card */}
      <Card>
        <View className="flex-row items-center justify-between pb-3 border-b border-[#F3E8C8]">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-2xl bg-[#FEF3C7] border border-[#F3E8C8] items-center justify-center shadow-warm">
              <Text className="text-[#D97706] text-[18px] font-extrabold">
                {employee?.user?.name
                  ? employee.user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .substring(0, 2)
                      .toUpperCase()
                  : "SE"}
              </Text>
            </View>

            <View>
              <Text className="text-[17px] font-bold text-[#1F2937] tracking-tight">
                {employee?.user?.name ?? "Field Engineer"}
              </Text>
              <Text className="text-[13px] text-[#6B7280]">
                {employee?.department?.name ?? "Operations"} · {employee?.employeeCode ?? "EMP"}
              </Text>
            </View>
          </View>

          {getStatusBadge(employee?.currentStatus ?? "OFFLINE")}
        </View>

        {/* Shift Row */}
        {employee?.defaultShift && (
          <View className="flex-row items-center justify-between pt-1">
            <View className="flex-row items-center gap-2">
              <Ionicons name="time-outline" size={16} color="#D97706" />
              <Text className="text-[14px] font-medium text-[#1F2937]">
                {employee.defaultShift.name} Shift
              </Text>
            </View>
            <Text className="text-[13px] font-mono font-medium text-[#6B7280]">
              {employee.defaultShift.startTime} – {employee.defaultShift.endTime}
            </Text>
          </View>
        )}
      </Card>

      {/* Telemetry Widget */}
      <View className="gap-1.5">
        <Text className="text-[13px] uppercase font-bold text-[#6B7280] px-1 tracking-wider">
          Live Telemetry
        </Text>
        <LocationStatusWidget onPositionUpdate={handlePositionUpdate} />
      </View>

      {/* Geofence Proximity Card */}
      {nearestSite && (
        <View className="gap-1.5">
          <Text className="text-[13px] uppercase font-bold text-[#6B7280] px-1 tracking-wider">
            Assigned Geofence
          </Text>
          <Card className={nearestSite.inside ? "border-[#16A34A]/40 bg-[#DCFCE7]/30" : ""}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <IconTile
                  name="location"
                  bg={nearestSite.inside ? "bg-[#DCFCE7]" : "bg-[#FEF3C7]"}
                  color={nearestSite.inside ? "#16A34A" : "#D97706"}
                />
                <View className="flex-1">
                  <Text className="text-[16px] font-bold text-[#1F2937]">
                    {nearestSite.name}
                  </Text>
                  <Text className="text-[13px] text-[#6B7280] mt-0.5">
                    {nearestSite.inside
                      ? `✓ Inside boundary by ${Math.abs(nearestSite.boundaryDistM)}m`
                      : `${nearestSite.boundaryDistM}m to boundary (${formatDistance(nearestSite.centerDistM)} to centre)`}
                  </Text>
                </View>
              </View>

              {nearestSite.inside ? (
                <Badge variant="success">
                  ✓ Inside by {Math.abs(nearestSite.boundaryDistM)}m
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-mono">
                  {nearestSite.boundaryDistM}m to boundary
                </Badge>
              )}
            </View>

            <View className="mt-2.5 pt-2.5 border-t border-[#F3E8C8] flex-row items-center justify-between text-[11px]">
              <View>
                <Text className="text-[10px] text-[#6B7280]">Perimeter</Text>
                <Text className="font-semibold text-[#1F2937]">{nearestSite.radius}m radius</Text>
              </View>
              <View>
                <Text className="text-[10px] text-[#6B7280]">Tolerance</Text>
                <Text className="font-semibold text-[#0EA5E9]">±{nearestSite.toleranceM}m halo</Text>
              </View>
              <View>
                <Text className="text-[10px] text-[#6B7280]">Enclosed Area</Text>
                <Text className="font-semibold text-[#1F2937]">{formatArea(nearestSite.radius)}</Text>
              </View>
            </View>
          </Card>
        </View>
      )}

      {/* Workforce Summary Grid */}
      {summary && (
        <View className="gap-1.5">
          <Text className="text-[13px] uppercase font-bold text-[#6B7280] px-1 tracking-wider">
            Workforce Overview
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {[
              {
                label: "Working",
                value: summary.working,
                color: "#16A34A",
                bg: "bg-[#DCFCE7]",
                icon: "checkmark-circle" as const,
              },
              {
                label: "In Transit",
                value: summary.away,
                color: "#F59E0B",
                bg: "bg-[#FEF3C7]",
                icon: "walk" as const,
              },
              {
                label: "On Leave",
                value: summary.onLeave,
                color: "#0EA5E9",
                bg: "bg-[#E0F2FE]",
                icon: "calendar" as const,
              },
              {
                label: "Offline",
                value: summary.offline,
                color: "#9CA3AF",
                bg: "bg-[#F3E8C8]/60",
                icon: "cloud-offline" as const,
              },
            ].map((stat) => (
              <View
                key={stat.label}
                className="flex-1 min-w-[45%] bg-white border border-[#F3E8C8] rounded-2xl p-3.5 shadow-solar"
              >
                <View className="flex-row items-center justify-between">
                  <View
                    className={`w-8 h-8 rounded-lg items-center justify-center ${stat.bg}`}
                  >
                    <Ionicons name={stat.icon} size={16} color={stat.color} />
                  </View>
                  <Text
                    className="text-[22px] font-extrabold font-mono"
                    style={{ color: stat.color }}
                  >
                    {stat.value ?? 0}
                  </Text>
                </View>

                <Text className="text-[13px] font-semibold text-[#6B7280] mt-2">
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Sologix Attendance Policy Banner */}
      <Card className="bg-white">
        <View className="flex-row items-start gap-3">
          <View className="w-8 h-8 rounded-xl bg-[#FEF3C7] border border-[#F3E8C8] items-center justify-center mt-0.5">
            <Ionicons name="sunny" size={17} color="#F59E0B" />
          </View>
          <View className="flex-1">
            <Text className="text-[14px] font-bold text-[#1F2937]">
              Sologix Smart Attendance
            </Text>
            <Text className="text-[12px] text-[#6B7280] leading-relaxed mt-0.5">
              Attendance records and shift hours are verified with solar-powered precision per corporate guidelines.
            </Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}
