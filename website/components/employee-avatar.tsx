import React from "react";
import { cn } from "@/lib/utils";

interface EmployeeAvatarProps {
  name?: string;
  photoUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<EmployeeAvatarProps["size"]>, string> = {
  sm: "w-7 h-7 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-12 h-12 text-base",
};

export function EmployeeAvatar({ name, photoUrl, size = "md", className }: EmployeeAvatarProps) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "EM";

  return (
    <div
      className={cn(
        SIZE_CLASSES[size],
        "rounded-md bg-muted border border-border flex items-center justify-center font-medium shrink-0 overflow-hidden",
        className
      )}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}
