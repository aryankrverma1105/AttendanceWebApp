import React from "react";
import { View, Text, ViewProps, TextStyle } from "react-native";
import { cn } from "../../lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "success"
  | "warning"
  | "info";

interface BadgeProps extends ViewProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  textClassName?: string;
  textStyle?: TextStyle;
}

const variantStyles: Record<BadgeVariant, { container: string; text: string }> = {
  default: {
    container: "bg-[#FEF3C7] border-[#FDE68A]",
    text: "text-[#D97706] font-bold",
  },
  secondary: {
    container: "bg-[#FEF9E7] border-[#F3E8C8]",
    text: "text-[#6B7280] font-semibold",
  },
  outline: {
    container: "bg-transparent border-[#F3E8C8]",
    text: "text-[#1F2937] font-semibold",
  },
  destructive: {
    container: "bg-[#FEE2E2] border-[#FECACA]",
    text: "text-[#DC2626] font-bold",
  },
  success: {
    container: "bg-[#DCFCE7] border-[#BBF7D0]",
    text: "text-[#16A34A] font-bold",
  },
  warning: {
    container: "bg-[#FEF3C7] border-[#FDE68A]",
    text: "text-[#D97706] font-bold",
  },
  info: {
    container: "bg-[#E0F2FE] border-[#BAE6FD]",
    text: "text-[#0284C7] font-bold",
  },
};

/**
 * Sologix Solar Theme Badge
 */
export function Badge({
  children,
  variant = "default",
  className,
  textClassName,
  style,
  textStyle,
  ...props
}: BadgeProps) {
  const currentVariant = variantStyles[variant] || variantStyles.default;
  const isComponent = React.isValidElement(children);

  return (
    <View
      className={cn(
        "px-2.5 py-0.5 rounded-full self-start flex-row items-center justify-center border",
        currentVariant.container,
        className
      )}
      style={style}
      {...props}
    >
      {isComponent ? (
        children
      ) : (
        <Text
          className={cn(
            "text-[11px] tracking-tight",
            currentVariant.text,
            textClassName
          )}
          style={textStyle}
        >
          {children}
        </Text>
      )}
    </View>
  );
}
