"use client";

import React, { useState } from "react";
import { LogIn, LogOut, RotateCcw, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SimulationBarProps {
  employees: any[];
  onSimulateComplete?: () => void;
}

export function SimulationBar({ employees, onSimulateComplete }: SimulationBarProps) {
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [lastActionStatus, setLastActionStatus] = useState<string | null>(null);

  const activeEmp = employees.find((e) => e.id === selectedEmpId) || employees[0];

  const handleSimulate = async (action: "enter_site" | "leave_site" | "return_site") => {
    if (!activeEmp) return;
    setLoading(true);
    setLastActionStatus(null);
    try {
      const res = await api.simulateMovement(activeEmp.id, action);
      setLastActionStatus(
        action === "enter_site"
          ? `Auto Check-in triggered at ${res.geofence}`
          : action === "leave_site"
          ? `Exit confirmed: Status updated to AWAY`
          : `Returned to site: Status updated to WORKING`
      );
      if (onSimulateComplete) onSimulateComplete();
    } catch (err: any) {
      setLastActionStatus(`Simulation error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="py-2.5 px-3.5 shadow-xs border-border bg-card">
      <CardContent className="p-0 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 font-normal">
            <Radio className="w-3.5 h-3.5 text-foreground" />
            <span>GPS Simulator</span>
          </Badge>
          <span className="text-muted-foreground text-xs hidden sm:inline">
            Test geofence transitions &amp; auto check-ins
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedEmpId || activeEmp?.id || ""}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="h-8 border border-input bg-background text-foreground text-xs rounded-md px-2.5 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.user?.name || emp.employeeCode} ({emp.currentStatus})
              </option>
            ))}
          </select>

          <Button
            size="sm"
            variant="default"
            onClick={() => handleSimulate("enter_site")}
            disabled={loading}
          >
            <LogIn className="w-3.5 h-3.5" />
            Enter Geofence
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleSimulate("leave_site")}
            disabled={loading}
          >
            <LogOut className="w-3.5 h-3.5" />
            Exit (Away)
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSimulate("return_site")}
            disabled={loading}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Return to Site
          </Button>
        </div>

        {lastActionStatus && (
          <div className="w-full text-xs font-mono bg-muted text-muted-foreground px-2.5 py-1 rounded border border-border flex items-center justify-between">
            <span>{lastActionStatus}</span>
            <span className="text-[10px]">Real-time updated</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
