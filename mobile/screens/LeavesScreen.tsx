import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { mobileApi, type LeaveRequest } from "../lib/api";
import { getMobileSocket } from "../lib/socket";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { IconTile } from "../components/ui/icon-tile";
import { BrandLogo } from "../components/ui/BrandLogo";

const LEAVE_TYPES = [
  "CASUAL",
  "SICK",
  "EARNED",
  "MATERNITY",
  "PATERNITY",
  "UNPAID",
];

function toDateInput(d: Date) {
  return d.toISOString().substring(0, 10);
}

function getLeaveStatusBadge(status: string) {
  if (status === "APPROVED") {
    return <Badge variant="success">Approved</Badge>;
  }
  if (status === "REJECTED") {
    return <Badge variant="destructive">Declined</Badge>;
  }
  return <Badge variant="warning">In Review</Badge>;
}

function renderLeave({ item }: { item: LeaveRequest }) {
  const startStr = new Date(item.startDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endStr = new Date(item.endDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Card className="mb-3 border-[#F3E8C8] bg-white">
      <View className="flex-row items-center justify-between pb-2 border-b border-[#F3E8C8]">
        <View className="flex-row items-center gap-2.5">
          <View className="w-8 h-8 rounded-lg bg-[#FEF3C7] border border-[#F3E8C8] items-center justify-center">
            <Ionicons name="document-text" size={17} color="#D97706" />
          </View>
          <View>
            <Text className="text-[16px] font-bold text-[#1F2937]">
              {item.leaveType} Leave
            </Text>
            <Text className="text-[12px] text-[#6B7280]">
              {startStr} – {endStr}
            </Text>
          </View>
        </View>

        {getLeaveStatusBadge(item.status)}
      </View>

      <Text className="text-[14px] text-[#1F2937] leading-relaxed pt-1">
        {item.reason}
      </Text>

      {item.approverNotes && (
        <View className="mt-2 p-2.5 rounded-xl bg-[#FEF9E7] border border-[#F3E8C8]">
          <Text className="text-[11px] font-bold text-[#D97706] uppercase tracking-wider">
            Reviewer Remarks
          </Text>
          <Text className="text-[13px] text-[#6B7280] mt-0.5">
            {item.approverNotes}
          </Text>
        </View>
      )}
    </Card>
  );
}

export default function LeavesScreen() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    leaveType: "CASUAL",
    startDate: toDateInput(new Date()),
    endDate: toDateInput(new Date(Date.now() + 86400000)),
    reason: "",
  });

  const load = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync("sologix_user");
      const user = raw ? JSON.parse(raw) : null;
      if (!user?.employeeId) return;
      const res = await mobileApi.getMyLeaves(user.employeeId);
      if (res.success) setLeaves(res.data ?? []);
    } catch (e) {
      console.error("Leaves load:", e);
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
      socket.on("leave.updated", refresh);
    });

    return () => {
      active = false;
      getMobileSocket().then((socket) => {
        socket.off("leave.updated", refresh);
      });
    };
  }, [load]);

  const handleSubmit = async () => {
    if (!form.reason.trim()) {
      Alert.alert("Reason Required", "Please provide a reason for your absence.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await mobileApi.submitLeave(form);
      if (res.success) {
        setShowForm(false);
        setForm({
          leaveType: "CASUAL",
          startDate: toDateInput(new Date()),
          endDate: toDateInput(new Date(Date.now() + 86400000)),
          reason: "",
        });
        await load();
      }
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

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
                Leave Requests
              </Text>
              <Text className="text-[12px] text-[#6B7280]">
                Absence applications &amp; duty exemptions
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowForm(true)}
              className="bg-[#F59E0B] px-4 py-2 rounded-full flex-row items-center gap-1.5 shadow-warm"
            >
              <Ionicons name="add" size={18} color="#1F2937" />
              <Text className="text-[#1F2937] text-[13px] font-extrabold">Apply</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      <FlatList
        data={leaves}
        keyExtractor={(item) => item.id}
        renderItem={renderLeave}
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
              <Ionicons name="document-text-outline" size={28} color="#D97706" />
            </View>
            <Text className="text-[17px] font-bold text-[#1F2937]">
              No Leave Requests
            </Text>
            <Text className="text-[13px] text-[#6B7280] text-center mt-1 leading-relaxed">
              Submit an application using the button above to request time off.
            </Text>
          </View>
        }
      />

      {/* Apply Leave Modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl p-5 border-t border-[#F3E8C8] shadow-solar">
            <View className="flex-row items-center justify-between pb-3 border-b border-[#F3E8C8]">
              <Text className="text-[18px] font-bold text-[#1F2937]">
                New Leave Application
              </Text>
              <TouchableOpacity
                onPress={() => setShowForm(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View className="py-4 gap-3">
              <View>
                <Text className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1.5">
                  Leave Category
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {LEAVE_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setForm((prev) => ({ ...prev, leaveType: t }))}
                      className={`px-3 py-1.5 rounded-xl border ${
                        form.leaveType === t
                          ? "bg-[#FEF3C7] border-[#F59E0B]"
                          : "bg-white border-[#F3E8C8]"
                      }`}
                    >
                      <Text
                        className={`text-[12px] font-bold ${
                          form.leaveType === t ? "text-[#D97706]" : "text-[#6B7280]"
                        }`}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View className="flex-row gap-2.5">
                <View className="flex-1 gap-1">
                  <Text className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider">
                    Start Date
                  </Text>
                  <Input
                    value={form.startDate}
                    onChangeText={(t) => setForm((prev) => ({ ...prev, startDate: t }))}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider">
                    End Date
                  </Text>
                  <Input
                    value={form.endDate}
                    onChangeText={(t) => setForm((prev) => ({ ...prev, endDate: t }))}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              <View className="gap-1">
                <Text className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider">
                  Reason for Absence
                </Text>
                <Input
                  value={form.reason}
                  onChangeText={(t) => setForm((prev) => ({ ...prev, reason: t }))}
                  placeholder="Detail reason for absence..."
                />
              </View>
            </View>

            <View className="flex-row gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onPress={() => setShowForm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                className="flex-1 bg-[#F59E0B] border-transparent"
                textClassName="text-[#1F2937] font-bold"
                onPress={handleSubmit}
                loading={submitting}
              >
                Submit Application
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
