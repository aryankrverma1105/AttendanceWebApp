import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getMobileSocket } from "../lib/socket";
import { mobileApi, type Notification } from "../lib/api";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { BrandLogo } from "../components/ui/BrandLogo";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getNotifVisual(type: string) {
  if (type?.includes("ATTENDANCE") || type?.includes("CHECK")) {
    return { icon: "navigate" as const, bg: "bg-[#DCFCE7]", color: "#16A34A" };
  }
  if (type?.includes("LEAVE")) {
    return { icon: "document-text" as const, bg: "bg-[#E0F2FE]", color: "#0EA5E9" };
  }
  if (type?.includes("ALERT") || type?.includes("EMERGENCY")) {
    return { icon: "warning" as const, bg: "bg-[#FEE2E2]", color: "#DC2626" };
  }
  return { icon: "notifications" as const, bg: "bg-[#FEF3C7]", color: "#D97706" };
}

interface LocalNotification extends Notification {
  live?: boolean;
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await mobileApi.getNotifications();
      if (res.success) setNotifications(res.data ?? []);
    } catch (e) {
      console.error("Notifications load:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;

    getMobileSocket().then((socket) => {
      if (!active) return;

      const handleLive = (data: any) => {
        const notif: LocalNotification = {
          id: `live-${Date.now()}`,
          title: data.title ?? "Operational Alert",
          message: data.message ?? JSON.stringify(data),
          type: data.type ?? "SYSTEM",
          readAt: null,
          createdAt: new Date().toISOString(),
          live: true,
        };
        setNotifications((prev) => [notif, ...prev]);
      };

      socket.on("attendance.checked_in", (d) =>
        handleLive({
          title: "Attendance Logged",
          message: `Arrived at work site at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          type: "ATTENDANCE_CHECKIN",
        })
      );
      socket.on("attendance.checked_out", (d) =>
        handleLive({
          title: "Check-Out Logged",
          message: `Departed site. Shift duration calculated.`,
          type: "ATTENDANCE_CHECKOUT",
        })
      );
      socket.on("leave.updated", (d) =>
        handleLive({
          title: "Leave Status Updated",
          message: `Your leave request has been reviewed.`,
          type: "LEAVE_STATUS",
        })
      );
      socket.on("notification.new", (d) => handleLive(d));
    });

    return () => {
      active = false;
      getMobileSocket().then((socket) => {
        socket.off("attendance.checked_in");
        socket.off("attendance.checked_out");
        socket.off("leave.updated");
        socket.off("notification.new");
      });
    };
  }, []);

  const renderItem = ({ item }: { item: LocalNotification }) => {
    const isUnread = !item.readAt;
    const visual = getNotifVisual(item.type);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          if (isUnread) {
            setNotifications((prev) =>
              prev.map((n) =>
                n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n
              )
            );
          }
        }}
      >
        <Card
          className={`mb-3 border-[#F3E8C8] ${
            isUnread ? "bg-white" : "bg-white/80"
          }`}
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-row items-center gap-3 flex-1">
              <View
                className={`w-9 h-9 rounded-xl items-center justify-center shrink-0 border border-[#F3E8C8] ${visual.bg}`}
              >
                <Ionicons name={visual.icon} size={18} color={visual.color} />
              </View>

              <View className="flex-1">
                <Text
                  className={`text-[15px] text-[#1F2937] ${
                    isUnread ? "font-bold" : "font-medium"
                  }`}
                >
                  {item.title}
                </Text>
                <Text className="text-[12px] text-[#6B7280]">
                  {timeAgo(item.createdAt)}
                </Text>
              </View>
            </View>

            {isUnread && (
              <View className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] mt-1.5" />
            )}
          </View>

          <Text className="text-[13px] text-[#6B7280] leading-relaxed pt-1">
            {item.message}
          </Text>
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#FFFBF0]">
        <ActivityIndicator color="#F59E0B" />
      </View>
    );
  }

  const unread = notifications.filter((n) => !n.readAt).length;

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
              <View className="flex-row items-center gap-2 mt-0.5">
                <Text className="text-[26px] font-extrabold tracking-tight text-[#1F2937]">
                  Alerts
                </Text>
                {unread > 0 && (
                  <Badge variant="warning">
                    {unread} new
                  </Badge>
                )}
              </View>
              <Text className="text-[12px] text-[#6B7280]">
                Real-time workforce &amp; duty notifications
              </Text>
            </View>

            {unread > 0 && (
              <TouchableOpacity
                onPress={() =>
                  setNotifications((prev) =>
                    prev.map((n) => ({
                      ...n,
                      readAt: n.readAt ?? new Date().toISOString(),
                    }))
                  )
                }
                className="bg-white/80 border border-[#F3E8C8] px-3 py-1.5 rounded-xl shadow-warm"
              >
                <Text className="text-[12px] font-bold text-[#D97706]">
                  Mark all
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      </View>

      <FlatList
        data={notifications}
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
          <View className="items-center justify-center py-20 px-6">
            <View className="w-16 h-16 rounded-full bg-white border border-[#F3E8C8] items-center justify-center mb-3 shadow-warm">
              <Ionicons name="notifications-outline" size={28} color="#D97706" />
            </View>
            <Text className="text-[17px] font-bold text-[#1F2937]">
              No Alerts
            </Text>
            <Text className="text-[13px] text-[#6B7280] text-center mt-1 leading-relaxed">
              Real-time geofence alerts and operational notices will be delivered here.
            </Text>
          </View>
        }
      />
    </View>
  );
}
