"use client";

import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/api";
import { CalendarCheck, Download, CheckCircle, AlertCircle, Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AttendancePage() {
  const [records, setRecords] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const loadRecords = async (date?: string) => {
    setLoading(true);
    try {
      const params: any = {};
      if (date) params.date = date;
      const res = await api.getAttendanceRecords(params);
      if (res.success) setRecords(res.data);
    } catch (e) {
      console.error("Attendance fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const handleExport = () => {
    window.open(api.getAttendanceExportUrl(), "_blank");
  };

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          icon={CalendarCheck}
          title="Automated Attendance Hub & Overtime Records"
          description="Session records generated from geofence entry and exit confirmations"
          actions={
            <>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  loadRecords(e.target.value);
                }}
                className="h-8 text-xs font-mono w-40"
              />

              {selectedDate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedDate("");
                    loadRecords("");
                  }}
                >
                  Clear
                </Button>
              )}

              <Button size="sm" variant="outline" onClick={handleExport}>
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </Button>
            </>
          }
        />

        {/* Attendance Records Table */}
        <Card className="overflow-hidden shadow-xs border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Work Date</TableHead>
                <TableHead>Engineer</TableHead>
                <TableHead>Assigned Shift</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Working Hours</TableHead>
                <TableHead>Overtime</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Punctuality</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState title="No attendance sessions found for the selected criteria." />
                  </TableCell>
                </TableRow>
              ) : (
                records.map((rec) => {
                  const checkIn = rec.checkInAt ? new Date(rec.checkInAt) : null;
                  const checkOut = rec.checkOutAt ? new Date(rec.checkOutAt) : null;
                  const hours = Math.floor((rec.workingMinutes || 0) / 60);
                  const mins = (rec.workingMinutes || 0) % 60;

                  return (
                    <TableRow key={rec.id}>
                      <TableCell className="font-mono text-muted-foreground">{rec.workDate}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <EmployeeAvatar
                            name={rec.employee?.user?.name}
                            photoUrl={rec.employee?.user?.photoUrl}
                            size="sm"
                          />
                          <div>
                            <div className="font-medium text-foreground">
                              {rec.employee?.user?.name || rec.employee?.employeeCode}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {rec.employee?.employeeCode}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {rec.shift?.name || "Standard Day"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {checkIn ? checkIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {checkOut ? (
                          <span className={rec.isEarlyDeparture ? "text-rose-500 font-semibold" : "text-foreground"}>
                            {checkOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {rec.isEarlyDeparture ? " (Early)" : ""}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            In Session
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground">
                        <div>{hours}h {mins}m</div>
                        {rec.breakMinutes > 0 && (
                          <div className="text-[10px] text-muted-foreground font-sans">
                            {rec.breakMinutes}m away / break
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {rec.overtimeMinutes > 0 ? (
                          <span className="font-medium">+{rec.overtimeMinutes}m</span>
                        ) : (
                          <span className="text-muted-foreground">0m</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={rec.status === "WORKING" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {rec.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          {rec.isLateArrival ? (
                            <StatusBadge tone="warning" icon={AlertCircle} label="Late Arrival" />
                          ) : (
                            <StatusBadge tone="success" icon={CheckCircle} label="On-Time" />
                          )}

                          {rec.isEarlyDeparture && (
                            <StatusBadge tone="danger" icon={Clock} label="Early Depart" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </DashboardShell>
  );
}
