import React from "react";
import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number | null;
  sub?: string;
  icon?: React.ElementType;
  loading?: boolean;
}

export function StatCard({ label, value, sub, icon: Icon, loading }: StatCardProps) {
  return (
    <Card className="p-3 shadow-xs">
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5" />}
      </div>
      <div className="mt-2 text-xl font-semibold text-foreground">
        {loading ? (
          <div className="h-7 w-10 rounded bg-muted animate-pulse" />
        ) : (
          (value ?? "—")
        )}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
