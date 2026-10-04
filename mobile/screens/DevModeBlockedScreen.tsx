import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

interface DevModeBlockedScreenProps {
  checking: boolean;
  onRetry: () => void;
  onLogout: () => void;
}

export default function DevModeBlockedScreen({ checking, onRetry, onLogout }: DevModeBlockedScreenProps) {
  return (
    <View className="flex-1 bg-[#FFFBF0] items-center justify-center p-5">
      <Card className="w-full max-w-sm items-center p-6 gap-3 border-[#F3E8C8] bg-white">
        <View className="w-14 h-14 rounded-full bg-[#FEE2E2] border border-[#FECACA] items-center justify-center">
          <Ionicons name="warning" size={28} color="#DC2626" />
        </View>
        <Text className="text-[18px] font-bold text-[#1F2937] text-center tracking-tight">
          Mock Location Detected
        </Text>
        <Text className="text-[13px] text-[#6B7280] text-center leading-relaxed">
          This device has a mock location app active. Sologix Energy attendance requires authentic GPS telemetry to verify workplace presence.
        </Text>
        <Text className="text-[12px] text-[#6B7280] text-center leading-relaxed mt-1">
          Please disable fake GPS or Developer Options and retry.
        </Text>

        <View className="w-full gap-2 mt-2">
          <Button
            variant="default"
            className="bg-[#F59E0B] border-transparent"
            textClassName="text-[#1F2937] font-bold"
            onPress={onRetry}
            loading={checking}
          >
            {checking ? "Checking..." : "Retry Verification"}
          </Button>
          <Button variant="outline" onPress={onLogout}>
            Log Out
          </Button>
        </View>
      </Card>
    </View>
  );
}
