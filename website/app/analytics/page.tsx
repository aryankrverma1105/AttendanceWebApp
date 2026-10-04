"use client";

import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { api } from "@/lib/api";
import { Award } from "lucide-react";
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

export default function AnalyticsPage() {
  const [scorecards, setScorecards] = useState<any[]>([]);

  const loadScorecards = async () => {
    try {
      const res = await api.getScorecards();
      if (res.success) setScorecards(res.data);
    } catch (e) {
      console.error("Scorecards load error:", e);
    }
  };

  useEffect(() => {
    loadScorecards();
  }, []);

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          icon={Award}
          title="Field Engineer Performance Scorecards"
          description="Autonomous performance scoring based on punctuality, geofence compliance, and operational duty hours"
        />

        {/* Top 3 Highlights */}
        {scorecards.length >= 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scorecards.slice(0, 3).map((emp, index) => (
              <Card
                key={emp.id}
                className="p-4 shadow-xs border-border flex items-center gap-3.5"
              >
                <EmployeeAvatar name={emp.name} photoUrl={emp.photoUrl} size="lg" className="font-bold" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Rank #{index + 1}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mt-1">{emp.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{emp.department}</p>
                  <div className="mt-1.5 flex items-center gap-2.5 text-xs">
                    <span className="font-semibold text-foreground font-mono text-sm">
                      {emp.overallScore}/100
                    </span>
                    <span className="text-[10px] text-muted-foreground">Punctuality {emp.onTimeRate}%</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Full Rankings Table */}
        <Card className="overflow-hidden shadow-xs border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Engineer</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Punctuality Rate</TableHead>
                <TableHead>Geofence Compliance</TableHead>
                <TableHead>Duty Hours</TableHead>
                <TableHead>Overtime Hours</TableHead>
                <TableHead className="text-right">Composite Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scorecards.map((card, idx) => (
                <TableRow key={card.id}>
                  <TableCell className="font-mono text-xs font-semibold">
                    #{idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <EmployeeAvatar name={card.name} photoUrl={card.photoUrl} size="sm" />
                      <div>
                        <div className="font-medium text-foreground">{card.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{card.employeeCode}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{card.department}</TableCell>
                  <TableCell className="font-mono text-xs">{card.onTimeRate}%</TableCell>
                  <TableCell className="font-mono text-xs">{card.adherenceScore}%</TableCell>
                  <TableCell className="font-mono text-xs">{card.totalHours} hrs</TableCell>
                  <TableCell className="font-mono text-xs">{card.totalOvertimeHours} hrs</TableCell>
                  <TableCell className="text-right font-mono font-semibold text-sm">
                    {card.overallScore}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </DashboardShell>
  );
}
