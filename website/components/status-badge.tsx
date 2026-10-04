import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASSES: Record<Exclude<StatusTone, "neutral">, string> = {
  success: "text-[#16A34A] bg-[#DCFCE7] border-[#16A34A]/30",
  warning: "text-[#D97706] bg-[#FEF3C7] border-[#F59E0B]/30",
  danger: "text-[#DC2626] bg-red-50 border-[#DC2626]/30",
  info: "text-[#0369A1] bg-[#E0F2FE] border-[#0EA5E9]/30",
};

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  icon?: React.ElementType;
  className?: string;
}

/** Small pill for status/flag display. Keeps color usage consistent across tables and cards. */
export function StatusBadge({ label, tone = "neutral", icon: Icon, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[10px] font-medium",
        tone !== "neutral" && TONE_CLASSES[tone],
        className
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </Badge>
  );
}
