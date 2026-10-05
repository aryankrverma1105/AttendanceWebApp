import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { mobileApi, type AttendanceRecord, type Employee, type AttendanceSummary } from "../lib/api";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { BrandLogo } from "../components/ui/BrandLogo";

interface AdminDashboardScreenProps {
  onLogout: () => void;
}

export default function AdminDashboardScreen({ onLogout }: AdminDashboardScreenProps) {
  const [activeTab, setActiveTab] = useState<"attendance" | "employees">("attendance");
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create User/Admin modal state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<"USER" | "ADMIN">("USER");
  const [newPassword, setNewPassword] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [sumRes, empRes, recRes] = await Promise.all([
        mobileApi.getAttendanceSummary().catch(() => null),
        mobileApi.getEmployees().catch(() => null),
        mobileApi.getMyAttendance("").catch(() => null),
      ]);

      if (sumRes?.success) setSummary(sumRes.summary);
      if (empRes?.success) setEmployees(empRes.data ?? []);
      if (recRes?.success) setRecords(recRes.data ?? []);
    } catch (e) {
      console.error("[AdminDashboard] loadData error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateAccount = async () => {
    if (!newEmail.trim() || !newUsername.trim() || !newName.trim()) {
      Alert.alert("Missing Fields", "Please provide email, username, and full name.");
      return;
    }

    setCreatingUser(true);
    try {
      let res: any;
      if (newRole === "ADMIN") {
        res = await mobileApi.createAdmin({
          email: newEmail.trim(),
          name: newName.trim(),
          username: newUsername.trim(),
          password: newPassword.trim() || undefined,
        });
      } else {
        res = await mobileApi.createEmployee({
          email: newEmail.trim(),
          name: newName.trim(),
          username: newUsername.trim(),
          role: "USER",
          password: newPassword.trim() || undefined,
        });
      }

      if (res?.success) {
        const passMsg = res.temporaryPassword
          ? `\n\nTemporary Password (shown once):\n${res.temporaryPassword}`
          : "";
        Alert.alert("Success", `Account created successfully for ${newEmail}.${passMsg}`);
        setCreateModalVisible(false);
        setNewEmail("");
        setNewName("");
        setNewUsername("");
        setNewPassword("");
        loadData();
      } else {
        Alert.alert("Creation Failed", res?.message || "Failed to create account");
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Account creation failed");
    } finally {
      setCreatingUser(false);
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
      {/* Admin Header */}
      <View className="p-4 pt-12 pb-2">
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
                <Text className="text-[11px] font-bold text-[#D97706] uppercase tracking-wider">
                  Admin Console
                </Text>
              </View>
              <Text className="text-[24px] font-extrabold tracking-tight text-[#1F2937] mt-0.5">
                Operations Management
              </Text>
              <Text className="text-[12px] text-[#6B7280]">
                System oversight, user accounts &amp; live duty status
              </Text>
            </View>

            <TouchableOpacity
              onPress={onLogout}
              className="w-10 h-10 rounded-2xl bg-white border border-[#F3E8C8] items-center justify-center shadow-sm"
            >
              <Ionicons name="log-out-outline" size={20} color="#DC2626" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* Quick Metrics Bar */}
      <View className="px-4 py-2 flex-row gap-2">
        <View className="flex-1 bg-white p-2.5 rounded-2xl border border-[#F3E8C8] shadow-sm">
          <Text className="text-[10px] text-[#6B7280] font-bold uppercase">Working</Text>
          <Text className="text-[18px] font-extrabold text-[#16A34A] mt-0.5">
            {summary?.working ?? 0}
          </Text>
        </View>
        <View className="flex-1 bg-white p-2.5 rounded-2xl border border-[#F3E8C8] shadow-sm">
          <Text className="text-[10px] text-[#6B7280] font-bold uppercase">Away</Text>
          <Text className="text-[18px] font-extrabold text-[#D97706] mt-0.5">
            {summary?.away ?? 0}
          </Text>
        </View>
        <View className="flex-1 bg-white p-2.5 rounded-2xl border border-[#F3E8C8] shadow-sm">
          <Text className="text-[10px] text-[#6B7280] font-bold uppercase">On Leave</Text>
          <Text className="text-[18px] font-extrabold text-[#0284C7] mt-0.5">
            {summary?.onLeave ?? 0}
          </Text>
        </View>
        <View className="flex-1 bg-white p-2.5 rounded-2xl border border-[#F3E8C8] shadow-sm">
          <Text className="text-[10px] text-[#6B7280] font-bold uppercase">Total</Text>
          <Text className="text-[18px] font-extrabold text-[#1F2937] mt-0.5">
            {summary?.total ?? employees.length}
          </Text>
        </View>
      </View>

      {/* Tabs Switcher & Create Account Button */}
      <View className="px-4 py-2 flex-row items-center justify-between">
        <View className="flex-row bg-[#FEF3C7] p-1 rounded-xl border border-[#F3E8C8]">
          <TouchableOpacity
            onPress={() => setActiveTab("attendance")}
            className={`px-3 py-1.5 rounded-lg ${
              activeTab === "attendance" ? "bg-white shadow-sm" : ""
            }`}
          >
            <Text
              className={`text-[12px] font-bold ${
                activeTab === "attendance" ? "text-[#D97706]" : "text-[#6B7280]"
              }`}
            >
              Today's Duty
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("employees")}
            className={`px-3 py-1.5 rounded-lg ${
              activeTab === "employees" ? "bg-white shadow-sm" : ""
            }`}
          >
            <Text
              className={`text-[12px] font-bold ${
                activeTab === "employees" ? "text-[#D97706]" : "text-[#6B7280]"
              }`}
            >
              Employees ({employees.length})
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => setCreateModalVisible(true)}
          className="bg-[#F59E0B] px-3 py-2 rounded-xl flex-row items-center gap-1.5 shadow-sm"
        >
          <Ionicons name="person-add" size={15} color="#1F2937" />
          <Text className="text-[12px] font-extrabold text-[#1F2937]">Create User</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === "attendance" ? (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          contentContainerClassName="p-4 pt-1 pb-16"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor="#F59E0B" />
          }
          renderItem={({ item }) => (
            <Card className="mb-3 border-[#F3E8C8] bg-white">
              <View className="flex-row items-center justify-between pb-2 border-b border-[#F3E8C8]">
                <View>
                  <Text className="text-[15px] font-bold text-[#1F2937]">
                    {item.employee?.user?.name || item.employee?.employeeCode || "Employee"}
                  </Text>
                  <Text className="text-[11px] text-[#6B7280]">
                    {item.employee?.employeeCode} · {item.shift?.name || "Standard Shift"}
                  </Text>
                </View>
                <Badge
                  variant={
                    item.status === "WORKING"
                      ? "success"
                      : item.status === "SHIFT_COMPLETED"
                      ? "secondary"
                      : "warning"
                  }
                >
                  {item.status}
                </Badge>
              </View>

              <View className="flex-row gap-2 mt-2">
                <View className="flex-1 bg-[#FEF9E7] p-2 rounded-xl border border-[#F3E8C8]">
                  <Text className="text-[10px] text-[#6B7280] font-semibold uppercase">In</Text>
                  <Text className="text-[13px] font-bold font-mono text-[#1F2937]">
                    {item.checkInAt
                      ? new Date(item.checkInAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </Text>
                </View>
                <View className="flex-1 bg-[#FEF9E7] p-2 rounded-xl border border-[#F3E8C8]">
                  <Text className="text-[10px] text-[#6B7280] font-semibold uppercase">Out</Text>
                  <Text className="text-[13px] font-bold font-mono text-[#1F2937]">
                    {item.checkOutAt
                      ? new Date(item.checkOutAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : item.status === "WORKING"
                      ? "Active"
                      : "—"}
                  </Text>
                </View>
                <View className="flex-1 bg-[#FEF9E7] p-2 rounded-xl border border-[#F3E8C8]">
                  <Text className="text-[10px] text-[#6B7280] font-semibold uppercase">Hours</Text>
                  <Text className="text-[13px] font-bold font-mono text-[#D97706]">
                    {Math.floor(item.workingMinutes / 60)}h {item.workingMinutes % 60}m
                  </Text>
                </View>
              </View>
            </Card>
          )}
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <Text className="text-[#6B7280] text-[14px]">No attendance records logged today.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={employees}
          keyExtractor={(item) => item.id}
          contentContainerClassName="p-4 pt-1 pb-16"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor="#F59E0B" />
          }
          renderItem={({ item }) => (
            <Card className="mb-3 border-[#F3E8C8] bg-white">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-xl bg-[#FEF3C7] border border-[#F3E8C8] items-center justify-center">
                    <Ionicons name="person" size={18} color="#D97706" />
                  </View>
                  <View>
                    <Text className="text-[15px] font-bold text-[#1F2937]">
                      {item.user?.name || "Unnamed"}
                    </Text>
                    <Text className="text-[12px] text-[#6B7280]">
                      {item.employeeCode} · {item.department?.name || "General"}
                    </Text>
                  </View>
                </View>
                <Badge variant={item.currentStatus === "WORKING" ? "success" : "secondary"}>
                  {item.currentStatus}
                </Badge>
              </View>
            </Card>
          )}
        />
      )}

      {/* Create Account Modal */}
      <Modal visible={createModalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 border-t border-[#F3E8C8] max-h-[85%]">
            <View className="flex-row items-center justify-between pb-3 border-b border-[#F3E8C8] mb-4">
              <Text className="text-[18px] font-extrabold text-[#1F2937]">Create New Account</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Role Toggle */}
              <Text className="text-[12px] font-bold text-[#6B7280] uppercase mb-1.5">Role</Text>
              <View className="flex-row gap-2 mb-4">
                <TouchableOpacity
                  onPress={() => setNewRole("USER")}
                  className={`flex-1 py-2.5 rounded-xl border items-center ${
                    newRole === "USER"
                      ? "bg-[#FEF3C7] border-[#D97706]"
                      : "bg-[#F9FAFB] border-[#E5E7EB]"
                  }`}
                >
                  <Text
                    className={`text-[13px] font-bold ${
                      newRole === "USER" ? "text-[#D97706]" : "text-[#6B7280]"
                    }`}
                  >
                    USER (Field Duty)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNewRole("ADMIN")}
                  className={`flex-1 py-2.5 rounded-xl border items-center ${
                    newRole === "ADMIN"
                      ? "bg-[#FEF3C7] border-[#D97706]"
                      : "bg-[#F9FAFB] border-[#E5E7EB]"
                  }`}
                >
                  <Text
                    className={`text-[13px] font-bold ${
                      newRole === "ADMIN" ? "text-[#D97706]" : "text-[#6B7280]"
                    }`}
                  >
                    ADMIN (Operations)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Full Name */}
              <Text className="text-[12px] font-bold text-[#6B7280] uppercase mb-1">Full Name</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Ramesh Chandra"
                className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3.5 py-2.5 mb-3 text-[14px] text-[#1F2937]"
              />

              {/* Username */}
              <Text className="text-[12px] font-bold text-[#6B7280] uppercase mb-1">Username</Text>
              <TextInput
                value={newUsername}
                onChangeText={setNewUsername}
                placeholder="e.g. ramesh"
                autoCapitalize="none"
                className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3.5 py-2.5 mb-3 text-[14px] text-[#1F2937]"
              />

              {/* Email */}
              <Text className="text-[12px] font-bold text-[#6B7280] uppercase mb-1">Email</Text>
              <TextInput
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="e.g. ramesh@sologix.com"
                keyboardType="email-address"
                autoCapitalize="none"
                className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3.5 py-2.5 mb-3 text-[14px] text-[#1F2937]"
              />

              {/* Password */}
              <Text className="text-[12px] font-bold text-[#6B7280] uppercase mb-1">
                Password (optional, auto-generated if blank)
              </Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Leave blank for secure auto-generation"
                secureTextEntry
                className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3.5 py-2.5 mb-5 text-[14px] text-[#1F2937]"
              />

              <TouchableOpacity
                onPress={handleCreateAccount}
                disabled={creatingUser}
                className="w-full bg-[#F59E0B] py-3.5 rounded-xl items-center justify-center shadow-solar mb-4"
              >
                {creatingUser ? (
                  <ActivityIndicator color="#1F2937" />
                ) : (
                  <Text className="text-[15px] font-extrabold text-[#1F2937]">Create Account</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
