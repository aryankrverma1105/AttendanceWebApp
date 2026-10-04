"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Globe2,
  Clock,
  Briefcase,
  TrendingUp,
  Activity,
  ArrowRight,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const LiveMap = dynamic(
  () => import("@/components/live-map").then((mod) => mod.LiveMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[420px] rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-mono text-xs animate-pulse">
        Loading Operations Map...
      </div>
    ),
  }
);

interface ActivityItem {
  id: string | number;
  type: string;
  title: string;
  desc: string;
  time: string;
}

// ─── Auto-refresh interval: 30 seconds ───────────────────────────────────────
const POLL_INTERVAL_MS = 30_000;

export default function DashboardPage() {
  const [summary, setSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);

  // Stable reference so socket callbacks always call the latest version
  const loadDataRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const loadData = useCallback(async () => {
    try {
      const [sumRes, empRes, geoRes] = await Promise.all([
        api.getAttendanceSummary(),
        api.getEmployees(),
        api.getGeofences(),
      ]);

      if (sumRes.success) {
        setSummary(sumRes.summary);
        setSummaryLoading(false);
      }
      if (empRes.success) setEmployees(empRes.data);
      if (geoRes.success) setGeofences(geoRes.data);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("Dashboard data load error:", e);
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    // Initial load
    loadData();

    // ── Socket listeners ──────────────────────────────────────────────────────
    const socket = getSocket();

    const onConnect = () => setLiveConnected(true);
    const onDisconnect = () => setLiveConnected(false);
    if (socket.connected) setLiveConnected(true);

    const pushActivity = (item: ActivityItem) => {
      setActivityFeed((prev) => [item, ...prev.slice(0, 19)]);
    };

    const onCheckedIn = (data: any) => {
      pushActivity({
        id: `ci-${Date.now()}`,
        type: "CHECK_IN",
        title: data.isLateArrival ? "Late Arrival Flagged" : "Auto Check-in",
        desc: `${data.employeeName ?? "Employee"} entered ${data.geofenceName ?? "a site"}${data.isLateArrival ? " (Late)" : ""}`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      loadDataRef.current?.();
    };

    const onCheckedOut = (data: any) => {
      pushActivity({
        id: `co-${Date.now()}`,
        type: "CHECK_OUT",
        title: data.isEarlyDeparture ? "Early Departure Flagged" : "Auto Check-out",
        desc: `${data.employeeName ?? "Employee"} departed ${data.geofenceName ?? "a site"}${data.isEarlyDeparture ? " (Early)" : ""}`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      loadDataRef.current?.();
    };

    const onStatusChanged = (data: any) => {
      pushActivity({
        id: `sc-${Date.now()}`,
        type: "STATUS",
        title: "Status Changed",
        desc: `${data.employeeName ?? "Employee"} → ${data.status ?? "updated"}`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      loadDataRef.current?.();
    };

    const onLocationUpdate = (data?: any) => {
      if (data?.employeeId && data?.latitude && data?.longitude) {
        setEmployees((prev) => {
          const exists = prev.some((e) => e.id === data.employeeId);
          if (!exists) {
            loadDataRef.current?.();
            return prev;
          }
          return prev.map((e) =>
            e.id === data.employeeId
              ? {
                  ...e,
                  lastLatitude: data.latitude,
                  lastLongitude: data.longitude,
                  currentStatus: data.status || e.currentStatus,
                  lastLocationUpdate: data.recordedAt || new Date().toISOString(),
                }
              : e
          );
        });
      }
      loadDataRef.current?.();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("attendance.checked_in", onCheckedIn);
    socket.on("attendance.checked_out", onCheckedOut);
    socket.on("employee.status.changed", onStatusChanged);
    socket.on("location.updated", onLocationUpdate);
    socket.on("employee.location.updated", onLocationUpdate);

    // ── Periodic poll fallback (in case socket events are missed) ─────────────
    const pollTimer = setInterval(() => {
      loadDataRef.current?.();
    }, POLL_INTERVAL_MS);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("attendance.checked_in", onCheckedIn);
      socket.off("attendance.checked_out", onCheckedOut);
      socket.off("employee.status.changed", onStatusChanged);
      socket.off("location.updated", onLocationUpdate);
      socket.off("employee.location.updated", onLocationUpdate);
      clearInterval(pollTimer);
    };
  }, [loadData]);

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          title="Workforce Operations Dashboard"
          description="Solar workforce operations · Real-time attendance · Live telemetry"
          actions={
            <>
              <Badge variant="outline" className="gap-1.5 text-xs font-normal font-mono">
                <span
                  className={`w-2 h-2 rounded-full ${
                    liveConnected ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
                  }`}
                />
                {liveConnected ? "Live" : "Reconnecting..."}
              </Badge>

              {lastUpdated && (
                <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">
                  Updated{" "}
                  {lastUpdated.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              )}

              <Link href="/live-map">
                <Button size="sm" variant="outline" className="gap-1.5">
                  View Full Map
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </>
          }
        />

        {/* KPI Stat Cards — live-updated via socket + 30s poll */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard
            label="Total Field Team"
            value={summary?.total}
            sub="Roster Count"
            icon={Users}
            loading={summaryLoading}
          />
          <StatCard
            label="Working (Site)"
            value={summary?.working}
            sub="Inside Geofence"
            icon={CheckCircle2}
            loading={summaryLoading}
          />
          <StatCard
            label="Remote Work"
            value={summary?.remote}
            sub="Approved Home"
            icon={Globe2}
            loading={summaryLoading}
          />
          <StatCard
            label="Away (Transit)"
            value={summary?.away}
            sub="Outside Perimeter"
            icon={AlertTriangle}
            loading={summaryLoading}
          />
          <StatCard
            label="On Leave"
            value={summary?.onLeave}
            sub="Exempted"
            icon={Briefcase}
            loading={summaryLoading}
          />
          <StatCard
            label="Overtime"
            value={summary?.overtime}
            sub="Past Shift End"
            icon={Clock}
            loading={summaryLoading}
          />
          <StatCard
            label="Attendance %"
            value={summary ? `${summary.attendanceRate}%` : null}
            sub="Present Today"
            icon={TrendingUp}
            loading={summaryLoading}
          />
        </div>

        {/* Main Grid: Live Map + Event Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Map */}
          <Card className="lg:col-span-8 shadow-xs flex flex-col p-4">
            <CardHeader className="p-0 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Geofence Live View
                  </CardTitle>
                  <CardDescription className="text-xs">
                    GPS telemetry of active personnel and authorised site perimeters
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-mono font-normal gap-1.5">
                  <Wifi className="w-3 h-3" />
                  Auto-updates
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0 flex-1 min-h-[440px]">
              <LiveMap geofences={geofences} employees={employees} />
            </CardContent>
          </Card>

          {/* Right Column */}
          <div className="lg:col-span-4 space-y-4 flex flex-col">
            {/* Event Stream */}
            <Card className="shadow-xs flex-1 flex flex-col p-4">
              <CardHeader className="p-0 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Event Stream
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px]">
                    Real-time
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0 space-y-2 overflow-y-auto max-h-[360px] flex-1">
                {activityFeed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 gap-1.5 text-xs text-muted-foreground">
                    <Wifi className="w-5 h-5 opacity-30 animate-pulse" />
                    Waiting for geofence events...
                  </div>
                ) : (
                  activityFeed.map((item) => {
                    const icon =
                      item.type === "CHECK_IN"
                        ? "↗"
                        : item.type === "CHECK_OUT"
                        ? "↙"
                        : "⟳";
                    return (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-md bg-muted/50 border border-border text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground flex items-center gap-1">
                            <span className="font-mono">{icon}</span>
                            {item.title}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                            {item.time}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Geofence Engine Info */}
            <Card className="shadow-xs p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <ShieldCheck className="w-4 h-4" />
                <span>Geofence Engine</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                4-state confirmation (OUTSIDE → ENTRY_PENDING → INSIDE →
                EXIT_PENDING) prevents false punches from GPS drift.
              </p>
              <div className="mt-3 pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Accuracy filter</span>
                  <span className="font-mono">≤ 100m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Auto-refresh interval</span>
                  <span className="font-mono">30s</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Attendance</span>
                  <Badge variant="outline" className="text-[10px]">
                    Fully Automatic
                  </Badge>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
