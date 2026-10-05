"use client";

import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Modal } from "@/components/modal";
import { FormSelect } from "@/components/form-select";
import { api } from "@/lib/api";
import { Users, Plus, MapPin, Search, Mail, KeyRound, UserX, UserCheck, LogOut, Copy, Check } from "lucide-react";
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
  const [tempPasswordModal, setTempPasswordModal] = useState<{ email: string; pass: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [formData, setFormData] = useState({
    role: "USER",
    name: "",
    email: "",
    username: "",
    password: "",
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
      let res: any;
      if (formData.role === "ADMIN") {
        res = await api.createAdmin({
          email: formData.email,
          name: formData.name,
          username: formData.username || formData.email.split("@")[0],
          password: formData.password || undefined,
        });
      } else {
        res = await api.createEmployee({
          role: "USER",
          email: formData.email,
          name: formData.name,
          username: formData.username || formData.email.split("@")[0],
          password: formData.password || undefined,
          employeeCode: formData.employeeCode,
          phone: formData.phone,
          defaultShiftId: formData.defaultShiftId || undefined,
        });
      }

      setShowAddModal(false);
      setFormData({
        role: "USER",
        name: "",
        email: "",
        username: "",
        password: "",
        employeeCode: "",
        phone: "",
        defaultShiftId: "",
      });

      if (res?.temporaryPassword) {
        setTempPasswordModal({ email: res.user?.email || formData.email, pass: res.temporaryPassword });
      } else {
        alert("Account created successfully!");
      }
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetPassword = async (emp: any) => {
    if (!confirm(`Reset password for ${emp.user?.name || emp.employeeCode}?`)) return;
    try {
      const res = await api.resetPassword(emp.id);
      if (res?.temporaryPassword) {
        setTempPasswordModal({
          email: emp.user?.email || emp.employeeCode,
          pass: res.temporaryPassword,
        });
      } else {
        alert("Password reset successfully.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to reset password");
    }
  };

  const handleToggleStatus = async (emp: any) => {
    const isCurrentlyActive = emp.user?.isActive !== false;
    const action = isCurrentlyActive ? "deactivate" : "reactivate";
    if (!confirm(`Are you sure you want to ${action} ${emp.user?.name || emp.employeeCode}?`)) return;
    try {
      await api.toggleEmployeeStatus(emp.id, !isCurrentlyActive);
      loadData();
    } catch (err: any) {
      alert(err.message || `Failed to ${action} user`);
    }
  };

  const handleResetSessions = async (emp: any) => {
    if (!confirm(`Revoke all active login sessions for ${emp.user?.name || emp.employeeCode}?`)) return;
    try {
      await api.resetSessions(emp.id);
      alert("All user sessions have been terminated.");
    } catch (err: any) {
      alert(err.message || "Failed to reset sessions");
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          title="Personnel & Workforce Roster"
          description="Manage workforce profiles, credentials, security status, and authorized geofences"
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
                Add User / Admin
              </Button>
            </>
          }
        />

        {/* Employee Roster Table */}
        <Card className="overflow-hidden shadow-xs border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User / Engineer</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Geofences</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => {
                const isActive = emp.user?.isActive !== false;
                return (
                  <TableRow key={emp.id} className={!isActive ? "opacity-60 bg-muted/20" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <EmployeeAvatar name={emp.user?.name} photoUrl={emp.user?.photoUrl} />
                        <div>
                          <div className="font-medium text-foreground flex items-center gap-2">
                            {emp.user?.name}
                            {!isActive && (
                              <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                                Deactivated
                              </Badge>
                            )}
                          </div>
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
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="xs"
                          title="Assign authorized site geofence"
                          onClick={() => {
                            setSelectedEmp(emp);
                            setShowAssignModal(true);
                          }}
                        >
                          Site
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          title="Reset temporary password"
                          onClick={() => handleResetPassword(emp)}
                        >
                          <KeyRound className="w-3 h-3 text-amber-500" />
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          title="Revoke active sessions"
                          onClick={() => handleResetSessions(emp)}
                        >
                          <LogOut className="w-3 h-3 text-blue-500" />
                        </Button>
                        <Button
                          variant={isActive ? "outline" : "secondary"}
                          size="xs"
                          title={isActive ? "Deactivate user" : "Reactivate user"}
                          onClick={() => handleToggleStatus(emp)}
                        >
                          {isActive ? (
                            <UserX className="w-3 h-3 text-destructive" />
                          ) : (
                            <UserCheck className="w-3 h-3 text-emerald-600" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        {/* Add Employee/User/Admin Modal */}
        <Modal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Create Account"
        >
          <form onSubmit={handleCreateEmployee} className="space-y-3 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1">Account Role</label>
              <FormSelect
                value={formData.role}
                onValueChange={(v) => setFormData({ ...formData, role: v })}
                placeholder="Select Account Role"
                options={[
                  { value: "USER", label: "Field Engineer (USER - tracked, check-in enabled)" },
                  { value: "ADMIN", label: "System Administrator (ADMIN - portal access only)" },
                ]}
              />
            </div>

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

            <div>
              <label className="block text-muted-foreground mb-1">
                Password <span className="text-[10px] text-muted-foreground">(leave blank to auto-generate temporary password)</span>
              </label>
              <Input
                type="text"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Auto-generated if empty"
              />
            </div>

            {formData.role === "USER" && (
              <>
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
              </>
            )}

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
                Create Account
              </Button>
            </div>
          </form>
        </Modal>

        {/* Temporary Password Modal */}
        <Modal
          open={!!tempPasswordModal}
          onClose={() => setTempPasswordModal(null)}
          title="Temporary Password Generated"
        >
          <div className="space-y-4 text-xs">
            <p className="text-muted-foreground">
              A temporary password has been generated for <strong>{tempPasswordModal?.email}</strong>. This password will be shown <strong>only once</strong>.
            </p>
            <div className="flex items-center justify-between p-3 rounded-md bg-muted font-mono text-sm border border-border">
              <span className="font-semibold text-foreground select-all">{tempPasswordModal?.pass}</span>
              <Button
                size="xs"
                variant="outline"
                className="gap-1.5"
                onClick={() => tempPasswordModal?.pass && copyToClipboard(tempPasswordModal.pass)}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setTempPasswordModal(null)}>
                Done
              </Button>
            </div>
          </div>
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
