import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { onWatchdogStatusChange, evaluateLocationStatus } from '../lib/locationWatchdog';

export function LocationOffBanner() {
  const [status, setStatus] = useState({ isLocationOff: false, reason: 'OK' });

  useEffect(() => {
    return onWatchdogStatusChange(setStatus);
  }, []);

  if (!status.isLocationOff) {
    return null;
  }

  const handleFix = async () => {
    if (Platform.OS === 'android') {
      try {
        await Location.enableNetworkProviderAsync();
      } catch {
        Linking.openSettings();
      }
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View className="w-full bg-[#EF4444] px-4 py-3 flex-row items-center justify-between border-b border-[#DC2626] z-50">
      <View className="flex-row items-center gap-2.5 flex-1 pr-2">
        <View className="w-8 h-8 rounded-full bg-white/20 items-center justify-center">
          <Ionicons name="warning" size={18} color="#FFFFFF" />
        </View>
        <View className="flex-1">
          <Text className="text-white text-[13px] font-extrabold uppercase tracking-wide">
            Location Services OFF
          </Text>
          <Text className="text-white/90 text-[11px] font-medium leading-tight">
            Your location is OFF. Please turn it on to ensure duty verification.
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={handleFix}
        activeOpacity={0.8}
        className="bg-white px-3 py-1.5 rounded-lg shadow-sm"
      >
        <Text className="text-[#DC2626] text-[12px] font-bold">Turn ON</Text>
      </TouchableOpacity>
    </View>
  );
}
