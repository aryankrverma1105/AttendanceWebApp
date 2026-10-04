import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  className?: string;
}

/** Centered placeholder for empty tables, grids, and lists. */
export function EmptyState({ icon: Icon, title, description, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1.5 py-12 text-center", className)}>
      {Icon && <Icon className="w-5 h-5 text-muted-foreground/50" />}
      <p className="text-sm text-muted-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground/70 max-w-sm">{description}</p>
      )}
    </div>
  );
}
