"use client";

import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/api";
import { CalendarDays } from "lucide-react";
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

export default function LeavesPage() {
  const [leaves, setLeaves] = useState<any[]>([]);

  const loadLeaves = async () => {
    try {
      const res = await api.getLeaves();
      if (res.success) setLeaves(res.data);
    } catch (e) {
      console.error("Leaves load error:", e);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  const [actionError, setActionError] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    try {
      await api.approveLeave(id);
      loadLeaves();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.rejectLeave(id);
      loadLeaves();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          icon={CalendarDays}
          title="Leave Management & Exemption Approvals"
          description="Approved leaves automatically exempt workers from daily attendance expectation"
        />

        {actionError && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
            {actionError}
          </div>
        )}

        {/* Leave Requests Table */}
        <Card className="overflow-hidden shadow-xs border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engineer</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Dates Window</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approved By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaves.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState title="No active leave requests." />
                  </TableCell>
                </TableRow>
              ) : (
                leaves.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <EmployeeAvatar name={leave.employee?.user?.name} size="sm" />
                        <div>
                          <div className="font-medium text-foreground">
                            {leave.employee?.user?.name || leave.employee?.employeeCode}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {leave.employee?.department?.name || "Field Services"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{leave.leaveType}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {leave.startDate} &rarr; {leave.endDate}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
                      {leave.reason || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          leave.status === "APPROVED"
                            ? "default"
                            : leave.status === "REJECTED"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-[10px]"
                      >
                        {leave.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {leave.approvedBy || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {leave.status === "PENDING" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="xs" onClick={() => handleApprove(leave.id)}>
                            Approve
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleReject(leave.id)}
                          >
                            Decline
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Processed</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </DashboardShell>
  );
}
