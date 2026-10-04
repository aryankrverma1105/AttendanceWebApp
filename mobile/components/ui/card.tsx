import React from "react";
import { View, Text, ViewProps, TextProps } from "react-native";
import { cn } from "../../lib/utils";

interface CardProps extends ViewProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Sologix Solar Theme Card
 * Crisp white surface with 16px rounded corners, warm sunny border (#F3E8C8),
 * and subtle golden elevation shadow.
 */
export function Card({ children, className, style, ...props }: CardProps) {
  return (
    <View
      className={cn(
        "bg-white border border-[#F3E8C8] rounded-2xl p-4 gap-2.5",
        className
      )}
      style={[
        {
          shadowColor: "#F59E0B",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.10,
          shadowRadius: 16,
          elevation: 2,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardHeader({ children, className, style, ...props }: CardProps) {
  return (
    <View className={cn("gap-0.5 pb-0.5", className)} style={style} {...props}>
      {children}
    </View>
  );
}

export function CardTitle({
  children,
  className,
  style,
  ...props
}: {
  children?: React.ReactNode;
  className?: string;
} & TextProps) {
  return (
    <Text
      className={cn(
        "text-[#1F2937] text-[15px] font-bold tracking-tight",
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </Text>
  );
}

export function CardDescription({
  children,
  className,
  style,
  ...props
}: {
  children?: React.ReactNode;
  className?: string;
} & TextProps) {
  return (
    <Text
      className={cn("text-[#6B7280] text-[13px] leading-4", className)}
      style={style}
      {...props}
    >
      {children}
    </Text>
  );
}

export function CardContent({ children, className, style, ...props }: CardProps) {
  return (
    <View className={cn("gap-2", className)} style={style} {...props}>
      {children}
    </View>
  );
}

export function CardFooter({ children, className, style, ...props }: CardProps) {
  return (
    <View
      className={cn(
        "flex-row items-center justify-between border-t border-[#F3E8C8] pt-3 mt-1",
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}
