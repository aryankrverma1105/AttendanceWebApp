import React from "react";
import {
  TouchableOpacity,
  Text,
  TouchableOpacityProps,
  TextStyle,
  ActivityIndicator,
} from "react-native";
import { cn } from "../../lib/utils";

export type ButtonVariant = "default" | "secondary" | "outline" | "destructive" | "ghost";
export type ButtonSize = "sm" | "default" | "lg" | "icon";

interface ButtonProps extends TouchableOpacityProps {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
  textClassName?: string;
  textStyle?: TextStyle;
}

const variantStyles: Record<ButtonVariant, { container: string; text: string; spinner: string }> = {
  default: {
    container: "bg-[#F59E0B] border-transparent active:bg-[#D97706]",
    text: "text-[#1F2937] font-bold", // Dark text on amber for high contrast
    spinner: "#1F2937",
  },
  secondary: {
    container: "bg-[#0EA5E9] border-transparent active:bg-[#0369A1]",
    text: "text-white font-semibold",
    spinner: "#ffffff",
  },
  outline: {
    container: "bg-white border-[#F3E8C8] active:bg-[#FEF3C7]",
    text: "text-[#1F2937] font-semibold",
    spinner: "#F59E0B",
  },
  destructive: {
    container: "bg-[#DC2626] border-transparent active:opacity-85",
    text: "text-white font-bold",
    spinner: "#ffffff",
  },
  ghost: {
    container: "bg-transparent border-transparent active:bg-[#FEF3C7]",
    text: "text-[#D97706] font-semibold",
    spinner: "#D97706",
  },
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "py-2 px-3 rounded-lg",
  default: "py-3 px-4 rounded-xl",
  lg: "py-3.5 px-5 rounded-2xl",
  icon: "w-10 h-10 p-0 rounded-full",
};

/**
 * Sologix Solar Theme Interactive Button
 */
export function Button({
  children,
  variant = "default",
  size = "default",
  onPress,
  disabled = false,
  loading = false,
  className,
  textClassName,
  style,
  textStyle,
  ...props
}: ButtonProps) {
  const currentVariant = variantStyles[variant] || variantStyles.default;
  const currentSize = sizeStyles[size] || sizeStyles.default;
  const isComponent = React.isValidElement(children);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
      className={cn(
        "border flex-row items-center justify-center gap-2",
        currentVariant.container,
        currentSize,
        (disabled || loading) && "opacity-50",
        className
      )}
      style={style}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={currentVariant.spinner} />
      ) : isComponent ? (
        children
      ) : (
        <Text
          className={cn("text-[14px] tracking-tight", currentVariant.text, textClassName)}
          style={textStyle}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}
