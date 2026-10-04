import React, { useEffect, useState } from 'react';
import { View, Text, Alert, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { clearUser, type StoredUser } from '../lib/auth';
import { stopForegroundTracking, stopBackgroundTracking } from '../lib/location';
import { disconnectMobileSocket } from '../lib/socket';
import { Card } from '../components/ui/card';
import { Badge, type BadgeVariant } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { IconTile } from '../components/ui/icon-tile';

interface ProfileScreenProps {
  onLogout: () => void;
}

export default function ProfileScreen({ onLogout }: ProfileScreenProps) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await SecureStore.getItemAsync('sologix_user');
        if (raw) setUser(JSON.parse(raw));
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of Sologix Energy on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          stopForegroundTracking();
          await stopBackgroundTracking().catch(() => {});
          disconnectMobileSocket();
          await clearUser();
          onLogout();
        },
      },
    ]);
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'TM';

  const getRoleBadgeVariant = (role: string | undefined): BadgeVariant => {
    if (role === 'ADMIN') return 'destructive';
    if (role === 'MANAGER') return 'info';
    return 'success';
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#f2f2f7]">
        <ActivityIndicator color="#007aff" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#f2f2f7]" contentContainerClassName="p-4 pt-8 pb-16 gap-5">
      {/* Apple Large Title */}
      <View className="px-1">
        <Text className="text-[32px] font-extrabold tracking-tight text-[#1c1c1e]">Profile</Text>
      </View>

      {/* Apple Account Profile Card (Like iOS Settings top card) */}
      <Card className="p-4">
        <View className="flex-row items-center gap-3.5">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-[#007aff] shadow-ios">
            <Text className="text-[22px] font-bold text-white">{initials}</Text>
          </View>

          <View className="flex-1">
            <Text className="text-[20px] font-bold tracking-tight text-[#1c1c1e]">
              {user?.name ?? 'Team Member'}
            </Text>
            <Text className="mt-0.5 text-[14px] text-[#8e8e93]">{user?.email ?? '—'}</Text>

            <View className="mt-1.5 self-start">
              <Badge variant={getRoleBadgeVariant(user?.role)}>{user?.role ?? 'EMPLOYEE'}</Badge>
            </View>
          </View>
        </View>
      </Card>

      {/* Apple iOS Grouped Settings Section */}
      <View className="gap-1.5">
        <Text className="px-1 text-[13px] font-semibold uppercase tracking-wider text-[#8e8e93]">
          Account Details
        </Text>

        <Card className="overflow-hidden p-0">
          {/* Row 1: Employee ID */}
          {user?.employeeCode && (
            <View className="flex-row items-center justify-between border-b border-[#e5e5ea] p-3.5">
              <View className="flex-row items-center gap-3">
                <IconTile name="card" bg="bg-[#007aff]" />
                <Text className="text-[15px] font-medium text-[#1c1c1e]">Employee Code</Text>
              </View>
              <Text className="font-mono text-[14px] font-bold text-[#8e8e93]">
                {user.employeeCode}
              </Text>
            </View>
          )}

          {/* Row 2: Department */}
          <View className="flex-row items-center justify-between border-b border-[#e5e5ea] p-3.5">
            <View className="flex-row items-center gap-3">
              <IconTile name="briefcase" bg="bg-[#ff9500]" />
              <Text className="text-[15px] font-medium text-[#1c1c1e]">Department</Text>
            </View>
            <Text className="text-[14px] font-medium text-[#8e8e93]">
              {user?.department ?? 'Field Operations'}
            </Text>
          </View>

          {/* Row 3: Security & Encryption */}
          <View className="flex-row items-center justify-between p-3.5">
            <View className="flex-row items-center gap-3">
              <IconTile name="lock-closed" bg="bg-[#34c759]" />
              <Text className="text-[15px] font-medium text-[#1c1c1e]">Data Security</Text>
            </View>
            <Text className="text-[13px] text-[#8e8e93]">AES Encrypted</Text>
          </View>
        </Card>
      </View>

      {/* Apple Policy Card */}
      <View className="gap-1.5">
        <Text className="px-1 text-[13px] font-semibold uppercase tracking-wider text-[#8e8e93]">
          System Policy
        </Text>
        <Card>
          <View className="flex-row items-start gap-3">
            <IconTile name="shield-checkmark" bg="bg-[#5856d6]" />
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-[#1c1c1e]">
                Autonomous Attendance
              </Text>
              <Text className="mt-0.5 text-[13px] leading-relaxed text-[#8e8e93]">
                Attendance and location verification are collected autonomously per corporate policy
                during shift windows.
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* iOS Sign Out Button */}
      <View className="mt-2">
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={handleLogout}
          className="items-center rounded-2xl border border-[#e5e5ea] bg-white py-3.5 shadow-ios">
          <Text className="text-[16px] font-bold text-[#ff3b30]">Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* About Card with Credits */}
      <View className="mt-4">
        <Card className="items-center p-4 border-[#F3E8C8] bg-white">
          <Text className="text-[15px] font-bold text-[#1F2937]">Sologix Energy</Text>
          <Text className="text-[12px] font-medium text-[#D97706] mt-0.5">Powering Attendance with the Sun</Text>
          <Text className="text-[12px] text-[#6B7280] mt-1">Version 1.0.0 (Build 2026.10)</Text>
          <View className="h-[1px] w-full bg-[#F3E8C8] my-2.5" />
          <Text className="text-[12px] font-semibold text-[#1F2937]">
            Made by Aryan Kumar Verma
          </Text>
          <Text className="text-[10px] text-[#9CA3AF] mt-0.5">
            &copy; 2026 Sologix Energy. All rights reserved.
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}
