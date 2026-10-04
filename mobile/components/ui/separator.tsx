import React from "react";
import { View, ViewProps } from "react-native";
import { cn } from "../../lib/utils";

interface SeparatorProps extends ViewProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function Separator({ orientation = "horizontal", className, style, ...props }: SeparatorProps) {
  return (
    <View
      className={cn(
        orientation === "horizontal" ? "h-[1px] w-full bg-border" : "w-[1px] h-full bg-border",
        className
      )}
      style={style}
      {...props}
    />
  );
}
