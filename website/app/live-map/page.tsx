"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { SimulationBar } from "@/components/simulation-bar";
import { FormSelect } from "@/components/form-select";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Search, RefreshCw, Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const LiveMap = dynamic(() => import("@/components/live-map").then((mod) => mod.LiveMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[600px] rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-mono text-xs">
      Loading Operations Map...
    </div>
  ),
});

export default function LiveMapPage() {
  const { canAccess } = useAuth();
  const [geofences, setGeofences] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = async () => {
    try {
      const [geoRes, empRes] = await Promise.all([api.getGeofences(), api.getEmployees()]);
      if (geoRes.success) setGeofences(geoRes.data);
      if (empRes.success) setEmployees(empRes.data);
    } catch (err) {
      console.error("Live map load error:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredEmployees = employees.filter((emp) => {
    const matchesStatus = filterStatus === "ALL" || emp.currentStatus === filterStatus;
    const name = emp.user?.name || emp.employeeCode || "";
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <DashboardShell>
      <div className="h-[calc(100vh-7rem)] flex flex-col space-y-4">
        {/* Controls Bar */}
        <PageHeader
          icon={Radio}
          title="Real-time Geofenced Field Operations Map"
          description="Live tracking pins, geofence status triggers, and satellite boundary visualization"
          className="shrink-0"
          actions={
            <>
              <div className="relative w-52">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search engineer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <FormSelect
                value={filterStatus}
                onValueChange={setFilterStatus}
                className="w-40"
                options={[
                  { value: "ALL", label: "All Statuses" },
                  { value: "WORKING", label: "Working" },
                  { value: "AWAY", label: "Away" },
                  { value: "REMOTE_WORKING", label: "Remote" },
                  { value: "ON_LEAVE", label: "On Leave" },
                  { value: "OVERTIME", label: "Overtime" },
                ]}
              />

              <Button
                size="sm"
                variant="outline"
                onClick={loadData}
                title="Refresh coordinates"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </>
          }
        />

        {/* Live Simulation Toolbar — ops tool, not available to plain employees */}
        {canAccess(["ADMIN"]) && (
          <SimulationBar employees={employees} onSimulateComplete={loadData} />
        )}

        {/* Fullscreen Map Canvas */}
        <Card className="flex-1 min-h-0 overflow-hidden p-0 shadow-xs relative border-border">
          <LiveMap geofences={geofences} employees={filteredEmployees} />
        </Card>
      </div>
    </DashboardShell>
  );
}
