import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cn } from "../../lib/utils";

export interface IconTileProps {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  bg?: string;
  color?: string;
  className?: string;
}

/**
 * Sologix Solar Squircle Icon Tile
 */
export function IconTile({
  name,
  size = 18,
  bg = "bg-[#FEF3C7]",
  color = "#D97706",
  className,
}: IconTileProps) {
  return (
    <View
      className={cn(
        "w-8 h-8 rounded-lg items-center justify-center shrink-0 border border-[#F3E8C8]",
        bg,
        className
      )}
    >
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}
