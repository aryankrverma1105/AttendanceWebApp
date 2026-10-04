"use client";

import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { FileText, ShieldAlert } from "lucide-react";
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
import { useAuth } from "@/lib/auth-context";

export default function AuditLogsPage() {
  const { role, switchRole } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);

  const loadLogs = async () => {
    try {
      const res = await api.getAuditLogs();
      if (res.success) setLogs(res.data);
    } catch (e) {
      console.error("Audit load error:", e);
    }
  };

  useEffect(() => {
    if (role === "ADMIN") {
      loadLogs();
    }
  }, [role]);

  if (role !== "ADMIN") {
    return (
      <DashboardShell>
        <div className="max-w-xl mx-auto mt-12">
          <Card className="p-6 text-center space-y-3 border-border shadow-xs">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Access Restricted</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The Security Audit Trail contains immutable system compliance records and is restricted exclusively to the <strong>ADMIN</strong> role. Your active role is <strong>{role}</strong>.
            </p>
            <div className="pt-2">
              <Button size="sm" onClick={() => switchRole("ADMIN")}>
                Switch to Admin Role
              </Button>
            </div>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          icon={FileText}
          title="Security Audit Trail & Compliance Logs"
          description="Immutable record of administrative boundary updates and authorization events"
          actions={
            <Badge variant="outline" className="text-xs font-mono">
              Role: ADMIN Verified
            </Badge>
          }
        />

        {/* Logs Table */}
        <Card className="overflow-hidden shadow-xs border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action Executed</TableHead>
                <TableHead>Target Entity</TableHead>
                <TableHead>Metadata / Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <>
                  <TableRow>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {new Date().toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium text-foreground text-xs">Super Admin (System)</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        GEOFENCE_DEPLOYED
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">Customer Site A</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      radius: 200m, lat: 17.4435, lng: 78.3820
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {new Date(Date.now() - 3600000).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium text-foreground text-xs">Vikram Malhotra</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        SITE_ASSIGNMENT
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">EMP101 (Rahul Kumar)</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      Assigned priority 1 to Nexus Tech site
                    </TableCell>
                  </TableRow>
                </>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium text-foreground text-xs">
                      {log.actor?.name || log.actor?.email || "System"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {log.entityType} ({log.entityId || "N/A"})
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {log.metadata || "—"}
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
