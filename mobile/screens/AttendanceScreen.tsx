import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { mobileApi, type AttendanceRecord } from "../lib/api";
import { getMobileSocket } from "../lib/socket";
import { Card } from "../components/ui/card";
import { Badge, type BadgeVariant } from "../components/ui/badge";
import { BrandLogo } from "../components/ui/BrandLogo";

function formatDuration(minutes: number) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function getStatusBadge(status: string, isEarly?: boolean) {
  const s = status?.toUpperCase();
  let variant: BadgeVariant = "secondary";
  let label = status.replace(/_/g, " ");

  if (s === "WORKING" || s === "PRESENT") {
    variant = "success";
    label = "Present";
  } else if (s === "AWAY") {
    variant = isEarly ? "destructive" : "secondary";
    label = isEarly ? "Departed Early" : "Away / Transit";
  } else if (s === "SHIFT_COMPLETED") {
    variant = "secondary";
    label = "Shift Ended";
  } else if (s === "ABSENT") {
    variant = "destructive";
    label = "Absent";
  } else if (s === "ON_LEAVE") {
    variant = "info";
    label = "On Leave";
  } else if (s === "LATE") {
    variant = "warning";
    label = "Late Arrival";
  }

  return <Badge variant={variant}>{label}</Badge>;
}

function renderItem({ item }: { item: AttendanceRecord }) {
  const dateFormatted = new Date(item.workDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <Card className="mb-3 border-[#F3E8C8] bg-white">
      {/* Header Row */}
      <View className="flex-row items-center justify-between pb-2 border-b border-[#F3E8C8]">
        <View className="flex-row items-center gap-2.5">
          <View className="w-8 h-8 rounded-lg bg-[#FEF3C7] border border-[#F3E8C8] items-center justify-center">
            <Ionicons name="calendar" size={17} color="#D97706" />
          </View>
          <View>
            <Text className="text-[16px] font-bold text-[#1F2937]">
              {dateFormatted}
            </Text>
            {item.shift && (
              <Text className="text-[12px] text-[#6B7280]">
                {item.shift.name}
                {item.shift.startTime && item.shift.endTime
                  ? ` (${item.shift.startTime} – ${item.shift.endTime})`
                  : ""}
              </Text>
            )}
          </View>
        </View>

        {getStatusBadge(item.status, item.isEarlyDeparture)}
      </View>

      {/* Metrics Row */}
      <View className="flex-row gap-2 mt-1">
        <View className="flex-1 bg-[#FEF9E7] rounded-xl p-2.5 border border-[#F3E8C8]">
          <Text className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-wider">
            In
          </Text>
          <Text className="text-[14px] font-bold font-mono text-[#1F2937] mt-0.5">
            {item.checkInAt
              ? new Date(item.checkInAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </Text>
        </View>

        <View className="flex-1 bg-[#FEF9E7] rounded-xl p-2.5 border border-[#F3E8C8]">
          <Text className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-wider">
            Out
          </Text>
          <Text
            className={`text-[14px] font-bold font-mono mt-0.5 ${
              item.isEarlyDeparture
                ? "text-[#DC2626]"
                : item.status === "WORKING" && !item.checkOutAt
                ? "text-[#16A34A]"
                : "text-[#1F2937]"
            }`}
          >
            {item.checkOutAt
              ? new Date(item.checkOutAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : item.status === "WORKING"
              ? "On-Site"
              : "—"}
          </Text>
        </View>

        <View className="flex-1 bg-[#FEF9E7] rounded-xl p-2.5 border border-[#F3E8C8]">
          <Text className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-wider">
            Total
          </Text>
          <Text className="text-[14px] font-bold font-mono text-[#D97706] mt-0.5">
            {formatDuration(item.workingMinutes)}
          </Text>
        </View>

        {Boolean(item.breakMinutes && item.breakMinutes > 0) && (
          <View className="flex-1 bg-[#FEF9E7] rounded-xl p-2.5 border border-[#F3E8C8]">
            <Text className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-wider">
              Break
            </Text>
            <Text className="text-[14px] font-bold font-mono text-[#6B7280] mt-0.5">
              {formatDuration(item.breakMinutes || 0)}
            </Text>
          </View>
        )}

        {item.overtimeMinutes > 0 && (
          <View className="flex-1 bg-[#E0F2FE] rounded-xl p-2.5 border border-[#0EA5E9]/30">
            <Text className="text-[10px] text-[#0369A1] font-semibold uppercase tracking-wider">
              OT
            </Text>
            <Text className="text-[14px] font-bold font-mono text-[#0284C7] mt-0.5">
              {formatDuration(item.overtimeMinutes)}
            </Text>
          </View>
        )}
      </View>

      {item.isLateArrival && (
        <View className="flex-row items-center gap-1.5 pt-1">
          <Ionicons name="warning" size={13} color="#F59E0B" />
          <Text className="text-[12px] font-medium text-[#D97706]">
            Late arrival flagged against scheduled shift start
          </Text>
        </View>
      )}

      {item.isEarlyDeparture && (
        <View className="flex-row items-center gap-1.5 pt-1">
          <Ionicons name="time-outline" size={13} color="#DC2626" />
          <Text className="text-[12px] font-medium text-[#DC2626]">
            Early departure flagged before scheduled shift end
          </Text>
        </View>
      )}
    </Card>
  );
}

export default function AttendanceScreen() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(false);

  const load = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync("sologix_user");
      const user = raw ? JSON.parse(raw) : null;
      if (!user?.employeeId) return;
      const res = await mobileApi.getMyAttendance(user.employeeId);
      if (res.success) {
        setRecords(res.data ?? []);
        const latest = (res.data ?? [])[0];
        setIsCheckedIn(latest?.status === "WORKING" && !latest?.checkOutAt);
      }
    } catch (e) {
      console.error("Attendance load:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
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
      socket.on("attendance.updated", refresh);
    });

    return () => {
      active = false;
      getMobileSocket().then((socket) => {
        socket.off("attendance.checked_in", refresh);
        socket.off("attendance.checked_out", refresh);
        socket.off("attendance.updated", refresh);
      });
    };
  }, [load]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#FFFBF0]">
        <ActivityIndicator color="#F59E0B" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FFFBF0]">
      {/* Sunny Gradient Header */}
      <View className="p-4 pt-4 pb-2">
        <LinearGradient
          colors={["#FFF7D6", "#FFFBF0", "#E0F2FE"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-3xl p-4 border border-[#F3E8C8] shadow-solar"
        >
          <View className="flex-row items-center justify-between">
            <View>
              <View className="flex-row items-center gap-1.5">
                <BrandLogo size={20} />
                <Text className="text-[12px] font-bold text-[#D97706] uppercase tracking-wider">
                  Sologix Energy
                </Text>
              </View>
              <Text className="text-[26px] font-extrabold tracking-tight text-[#1F2937] mt-0.5">
                Attendance Hub
              </Text>
              <Text className="text-[12px] text-[#6B7280]">
                Solar-verified presence &amp; duty timeline
              </Text>
            </View>
            <View className="w-11 h-11 rounded-2xl bg-white/80 border border-[#F3E8C8] items-center justify-center shadow-warm">
              <Ionicons name="calendar" size={24} color="#F59E0B" />
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Manual Check In / Check Out Card with big round buttons */}
      <View className="px-4 pb-2">
        <Card className="items-center p-4 border-[#F3E8C8] bg-white">
          <Text className="text-[13px] font-bold uppercase text-[#6B7280] tracking-wider mb-2">
            Duty Status: {isCheckedIn ? "Checked In" : "Checked Out"}
          </Text>
          <View className="flex-row items-center justify-center gap-6 my-1">
            {/* Big Round Amber Check In Button */}
            <TouchableOpacity
              activeOpacity={0.8}
              className="w-24 h-24 rounded-full bg-[#F59E0B] items-center justify-center border-4 border-[#FEF3C7] shadow-solar"
            >
              <Ionicons name="log-in-outline" size={30} color="#1F2937" />
              <Text className="text-[13px] font-extrabold text-[#1F2937] mt-0.5">
                Check In
              </Text>
            </TouchableOpacity>

            {/* Deep Blue Check Out Button */}
            <TouchableOpacity
              activeOpacity={0.8}
              className="w-24 h-24 rounded-full bg-[#0369A1] items-center justify-center border-4 border-[#E0F2FE] shadow-warm"
            >
              <Ionicons name="log-out-outline" size={30} color="#FFFFFF" />
              <Text className="text-[13px] font-extrabold text-white mt-0.5">
                Check Out
              </Text>
            </TouchableOpacity>
          </View>
        </Card>
      </View>

      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerClassName="p-4 pt-1 pb-16"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#F59E0B"
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-16 px-6">
            <View className="w-16 h-16 rounded-full bg-white border border-[#F3E8C8] items-center justify-center mb-3 shadow-warm">
              <Ionicons name="calendar-outline" size={28} color="#D97706" />
            </View>
            <Text className="text-[17px] font-bold text-[#1F2937]">
              No Attendance Records
            </Text>
            <Text className="text-[13px] text-[#6B7280] text-center mt-1 leading-relaxed">
              Attendance records will appear here as duty shifts are logged and verified.
            </Text>
          </View>
        }
      />
    </View>
  );
}
