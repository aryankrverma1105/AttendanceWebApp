"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Modal } from "@/components/modal";
import { FormSelect } from "@/components/form-select";
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/api";
import { ShieldAlert, Plus, MapPin, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GeofenceMapEditor = dynamic(
  () => import("@/components/geofence-map-editor").then((m) => m.GeofenceMapEditor),
  { ssr: false, loading: () => <div className="w-full h-64 rounded-lg bg-muted animate-pulse" /> }
);

import {
  GEOFENCE_PRESETS,
  formatArea,
  calculateEnclosedAreaM2,
  getAdaptiveHysteresisMeters,
} from "@/lib/geo";

const DEFAULT_FORM = {
  name: "",
  type: "CUSTOMER_SITE",
  latitude: 17.4435,
  longitude: 78.382,
  radiusMeters: 50,
  address: "",
};

export default function GeofencesPage() {
  const [geofences, setGeofences] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);

  const loadGeofences = async () => {
    try {
      const res = await api.getGeofences();
      if (res.success) setGeofences(res.data);
    } catch (e) {
      console.error("Geofence load error:", e);
    }
  };

  useEffect(() => {
    loadGeofences();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createGeofence({
        ...formData,
        latitude: Number(formData.latitude),
        longitude: Number(formData.longitude),
        radiusMeters: Number(formData.radiusMeters),
      });
      setShowCreateModal(false);
      setFormData(DEFAULT_FORM);
      await loadGeofences();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.deleteGeofence(deleteId);
      setDeleteId(null);
      await loadGeofences();
    } catch (err: any) {
      setError(err.message);
      setDeleteId(null);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          icon={ShieldAlert}
          title="Geofence Boundary & Site Manager"
          description="Configure virtual circular perimeters for customer locations and office headquarters"
          actions={
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-3.5 h-3.5" />
              Create Geofence
            </Button>
          }
        />

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Geofence Cards Grid */}
        {geofences.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg">
            <EmptyState title="No geofences configured yet. Create one using the map above." />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {geofences.map((gf) => (
              <Card key={gf.id} className="p-4 flex flex-col justify-between shadow-xs border-border">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="outline" className="mb-2 text-[10px]">
                        {gf.type}
                      </Badge>
                      <h3 className="text-sm font-semibold text-foreground">{gf.name}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(gf.id)}
                      title="Delete Geofence"
                      className="text-muted-foreground hover:text-destructive h-7 w-7"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{gf.address || "—"}</span>
                  </p>

                  <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-muted-foreground text-[10px] block font-sans">Perimeter</span>
                      <span className="font-medium text-foreground">{gf.radiusMeters}m</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] block font-sans">Area</span>
                      <span className="font-medium text-foreground">
                        {formatArea(calculateEnclosedAreaM2(gf.radiusMeters))}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] block font-sans">Tolerance</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        ±{getAdaptiveHysteresisMeters(gf.radiusMeters).toFixed(0)}m
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                  <span>
                    {Number(gf.latitude).toFixed(4)}, {Number(gf.longitude).toFixed(4)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      WGS-84
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create Geofence Modal */}
        <Modal
          open={showCreateModal}
          onClose={() => { setShowCreateModal(false); setFormData(DEFAULT_FORM); setError(null); }}
          title="Create Virtual Geofence Boundary"
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleCreate} className="space-y-4 text-xs">
            {/* Map Picker */}
            <div>
              <label className="block text-muted-foreground mb-2 font-medium">
                Click or drag the pin to place the geofence boundary centre
              </label>
              <GeofenceMapEditor
                latitude={formData.latitude}
                longitude={formData.longitude}
                radiusMeters={formData.radiusMeters}
                onLocationChange={(lat, lng) =>
                  setFormData((f) => ({ ...f, latitude: lat, longitude: lng }))
                }
                existingGeofences={geofences}
              />
              <div className="mt-1.5 flex gap-3 font-mono text-[10px] text-muted-foreground">
                <span>Lat: {formData.latitude.toFixed(5)}</span>
                <span>Lng: {formData.longitude.toFixed(5)}</span>
                <span className="text-emerald-600 font-semibold">WGS-84 Ellipsoidal Model</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1">Boundary Name *</label>
                <Input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Substation North Node 4"
                />
              </div>
              <div>
                <label className="block text-muted-foreground mb-1">Site Classification</label>
                <FormSelect
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v })}
                  options={[
                    { value: "OFFICE", label: "Corporate Office" },
                    { value: "CUSTOMER_SITE", label: "Customer Site" },
                    { value: "FIELD_SITE", label: "Field Substation" },
                    { value: "REMOTE", label: "Remote Workspace" },
                    { value: "OTHER", label: "Other Location" },
                  ]}
                />
              </div>
            </div>

            {/* Precision Presets */}
            <div>
              <label className="block text-muted-foreground mb-1.5">Quick Precision Presets</label>
              <div className="flex flex-wrap gap-1.5">
                {GEOFENCE_PRESETS.map((p) => (
                  <button
                    key={p.radius}
                    type="button"
                    onClick={() => setFormData({ ...formData, radiusMeters: p.radius })}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all flex items-center gap-1 border ${
                      formData.radiusMeters === p.radius
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                    <span className="opacity-70 text-[10px]">({p.title})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-muted-foreground">
                    Radius: <span className="font-semibold text-foreground">{formData.radiusMeters}m</span>
                  </label>
                  <span className="text-[10px] text-blue-600 font-mono">
                    ±{getAdaptiveHysteresisMeters(formData.radiusMeters).toFixed(0)}m tolerance
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={10}
                    max={1000}
                    step={5}
                    value={formData.radiusMeters}
                    onChange={(e) => setFormData({ ...formData, radiusMeters: Number(e.target.value) })}
                    className="w-full"
                  />
                  <Input
                    type="number"
                    min={10}
                    max={5000}
                    value={formData.radiusMeters}
                    onChange={(e) => setFormData({ ...formData, radiusMeters: Math.max(10, Number(e.target.value)) })}
                    className="w-16 h-7 text-xs font-mono text-center"
                  />
                </div>
              </div>
              <div>
                <label className="block text-muted-foreground mb-1">Address / Landmark</label>
                <Input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. Sector 2, HITEC City"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setShowCreateModal(false); setFormData(DEFAULT_FORM); }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Deploying..." : "Deploy Geofence"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirm Dialog */}
        <ConfirmDialog
          open={!!deleteId}
          title="Delete Geofence"
          description="This will permanently remove the geofence boundary and unassign all engineers. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      </div>
    </DashboardShell>
  );
}
