"use client";

import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Modal } from "@/components/modal";
import { FormSelect } from "@/components/form-select";
import { api } from "@/lib/api";
import { Users, Plus, MapPin, Search, Mail } from "lucide-react";
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

const EMPLOYEE_STATUS_TONE: Record<string, StatusTone> = {
  WORKING: "success",
  AWAY: "warning",
  REMOTE_WORKING: "info",
  OVERTIME: "info",
  ON_LEAVE: "neutral",
  OFFLINE: "neutral",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    employeeCode: "",
    phone: "",
    defaultShiftId: "",
  });
  const [selectedGeofenceId, setSelectedGeofenceId] = useState("");

  const loadData = async () => {
    try {
      const [empRes, geoRes, shiftRes] = await Promise.all([
        api.getEmployees(),
        api.getGeofences(),
        api.getShifts(),
      ]);
      if (empRes.success) setEmployees(empRes.data);
      if (geoRes.success) setGeofences(geoRes.data);
      if (shiftRes.success) setShifts(shiftRes.data);
    } catch (e) {
      console.error("Failed to load employee data:", e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createEmployee(formData);
      setShowAddModal(false);
      setFormData({ name: "", email: "", employeeCode: "", phone: "", defaultShiftId: "" });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAssignGeofence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || !selectedGeofenceId) return;
    try {
      await api.assignGeofence(selectedEmp.id, { geofenceId: selectedGeofenceId });
      setShowAssignModal(false);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filtered = employees.filter((emp) => {
    const query = search.toLowerCase();
    return (
      (emp.user?.name || "").toLowerCase().includes(query) ||
      (emp.employeeCode || "").toLowerCase().includes(query) ||
      (emp.department?.name || "").toLowerCase().includes(query)
    );
  });

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          icon={Users}
          title="Field Personnel & Engineer Roster"
          description="Manage workforce profiles, shift assignments, and authorized geofence boundaries"
          actions={
            <>
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by name, code, dept..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <Button size="sm" onClick={() => setShowAddModal(true)}>
                <Plus className="w-3.5 h-3.5" />
                Add Engineer
              </Button>
            </>
          }
        />

        {/* Employee Roster Table */}
        <Card className="overflow-hidden shadow-xs border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engineer</TableHead>
                <TableHead>Employee Code</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Assigned Shift</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned Geofences</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <EmployeeAvatar name={emp.user?.name} photoUrl={emp.user?.photoUrl} />
                      <div>
                        <div className="font-medium text-foreground">{emp.user?.name}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                          <Mail className="w-3 h-3" /> {emp.user?.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">{emp.employeeCode}</TableCell>
                  <TableCell className="text-muted-foreground">{emp.department?.name || "Field Services"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {emp.defaultShift?.name || "Standard Day"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={emp.currentStatus} tone={EMPLOYEE_STATUS_TONE[emp.currentStatus] ?? "neutral"} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {emp.geofenceAssignments?.map((a: any) => (
                        <Badge key={a.id} variant="secondary" className="text-[10px] gap-1">
                          <MapPin className="w-2.5 h-2.5" />
                          {a.geofence?.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {emp.punctualityScore != null ? `${emp.punctualityScore}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setSelectedEmp(emp);
                        setShowAssignModal(true);
                      }}
                    >
                      Assign Site
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Add Employee Modal */}
        <Modal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Add Field Engineer"
        >
          <form onSubmit={handleCreateEmployee} className="space-y-3 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1">Full Name</label>
              <Input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Ramesh Chandra"
              />
            </div>
            <div>
              <label className="block text-muted-foreground mb-1">Work Email</label>
              <Input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="ramesh@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1">Employee Code</label>
                <Input
                  type="text"
                  value={formData.employeeCode}
                  onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                  placeholder="EMP105"
                />
              </div>
              <div>
                <label className="block text-muted-foreground mb-1">Phone Number</label>
                <Input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43214"
                />
              </div>
            </div>

            <div>
              <label className="block text-muted-foreground mb-1">Default Shift</label>
              <FormSelect
                value={formData.defaultShiftId}
                onValueChange={(v) => setFormData({ ...formData, defaultShiftId: v })}
                placeholder="Select Shift Schedule"
                options={shifts.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.startTime} - ${s.endTime})`,
                }))}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save Engineer
              </Button>
            </div>
          </form>
        </Modal>

        {/* Assign Geofence Modal */}
        <Modal
          open={showAssignModal && !!selectedEmp}
          onClose={() => setShowAssignModal(false)}
          title={`Assign Geofence to ${selectedEmp?.user?.name ?? ""}`}
        >
          <p className="text-xs text-muted-foreground -mt-2">
            Authorizes the employee to auto check-in within this physical perimeter.
          </p>
          <form onSubmit={handleAssignGeofence} className="space-y-4 text-xs mt-4">
            <div>
              <label className="block text-muted-foreground mb-1">Authorized Site</label>
              <FormSelect
                value={selectedGeofenceId}
                onValueChange={setSelectedGeofenceId}
                placeholder="Select Geofence Perimeter"
                options={geofences.map((gf) => ({
                  value: gf.id,
                  label: `${gf.name} (${gf.type} • ${gf.radiusMeters}m)`,
                }))}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAssignModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Authorize Site
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardShell>
  );
}
