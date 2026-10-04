"use client";

import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";
import { api } from "@/lib/api";
import { Clock, Plus, Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    startTime: "09:00",
    endTime: "18:00",
    gracePeriodMinutes: 15,
    timezone: "Asia/Kolkata",
    overtimePolicy: "STANDARD",
  });

  const loadShifts = async () => {
    try {
      const res = await api.getShifts();
      if (res.success) setShifts(res.data);
    } catch (e) {
      console.error("Shift load error:", e);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createShift({
        ...formData,
        gracePeriodMinutes: Number(formData.gracePeriodMinutes),
      });
      setShowModal(false);
      setFormData({
        name: "",
        startTime: "09:00",
        endTime: "18:00",
        gracePeriodMinutes: 15,
        timezone: "Asia/Kolkata",
        overtimePolicy: "STANDARD",
      });
      loadShifts();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          icon={Clock}
          title="Shift Schedules & Overtime Rules"
          description="Configure standard day shifts, overnight shifts crossing midnight, and grace period thresholds"
          actions={
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus className="w-3.5 h-3.5" />
              Add Shift Schedule
            </Button>
          }
        />

        {/* Shift Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map((shift) => {
            const [startH] = shift.startTime.split(":").map(Number);
            const [endH] = shift.endTime.split(":").map(Number);
            const crossesMidnight = endH < startH;

            return (
              <Card key={shift.id} className="p-4 shadow-xs border-border">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-muted border border-border flex items-center justify-center text-foreground">
                      {crossesMidnight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">{shift.name}</h3>
                      <span className="text-[10px] text-muted-foreground font-mono">{shift.timezone}</span>
                    </div>
                  </div>
                  {crossesMidnight && (
                    <Badge variant="outline" className="text-[10px]">
                      Overnight
                    </Badge>
                  )}
                </div>

                <div className="mt-3 p-2.5 bg-muted/50 rounded-md border border-border grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[10px] block">Schedule Window</span>
                    <span className="font-medium text-foreground font-mono text-xs">
                      {shift.startTime} &rarr; {shift.endTime}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] block">Grace Period</span>
                    <span className="font-medium text-foreground font-mono text-xs">
                      {shift.gracePeriodMinutes} mins
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>Assigned: {shift._count?.employees || 0} Engineers</span>
                  <span className="text-[11px] font-mono">15m min overtime</span>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Create Shift Modal */}
        <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Shift Schedule">
          <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1">Shift Name</label>
              <Input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Afternoon Field Shift"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1">Start Time (24h)</label>
                <Input
                  type="time"
                  required
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-muted-foreground mb-1">End Time (24h)</label>
                <Input
                  type="time"
                  required
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1">Grace Period (Minutes)</label>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={formData.gracePeriodMinutes}
                  onChange={(e) => setFormData({ ...formData, gracePeriodMinutes: Number(e.target.value) })}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-muted-foreground mb-1">Timezone</label>
                <Input
                  type="text"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save Shift
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardShell>
  );
}
