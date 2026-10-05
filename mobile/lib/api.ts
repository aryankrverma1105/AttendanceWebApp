import * as SecureStore from "expo-secure-store";
import { getApiBase, apiRequest, type UserRole, type StoredUser } from "./auth";

// Re-export auth types for convenience
export type { UserRole, StoredUser };

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface AttendanceSummary {
  total: number;
  working: number;
  remote: number;
  away: number;
  onLeave: number;
  overtime: number;
  offline: number;
  attendanceRate: number;
}

export interface AttendanceRecord {
  id: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingMinutes: number;
  breakMinutes?: number;
  overtimeMinutes: number;
  status: string;
  isLateArrival: boolean;
  isEarlyDeparture?: boolean;
  employee?: {
    employeeCode: string;
    user?: { name: string; email: string; photoUrl?: string };
  };
  shift?: { name: string; startTime?: string; endTime?: string };
}

export interface LeaveRequest {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
  approverNotes?: string;
  employee?: {
    employeeCode: string;
    user?: { name: string; email: string };
  };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface Geofence {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  address?: string;
  active: boolean;
  employeeAssignments?: any[];
}

export interface Employee {
  id: string;
  employeeCode: string;
  currentStatus: string;
  lastLatitude?: number;
  lastLongitude?: number;
  punctualityScore?: number;
  user?: { name: string; email: string; photoUrl?: string };
  department?: { name: string };
  defaultShift?: {
    name: string;
    startTime: string;
    endTime: string;
    gracePeriodMinutes: number;
  };
  geofenceAssignments?: { geofence: Geofence }[];
}

// ─── Authenticated Request Helper ─────────────────────────────────────────────

async function authReq<T = any>(
  path: string,
  options: RequestInit & { token?: string; role?: UserRole } = {}
): Promise<T> {
  // Load session token if not provided
  if (!options.token) {
    try {
      const t = await SecureStore.getItemAsync("sologix_token");
      const r = (await SecureStore.getItemAsync("sologix_role")) as UserRole | null;
      if (t) options.token = t;
      if (r) options.role = r;
    } catch {}
  }
  return apiRequest<T>(path, options);
}

// ─── API Client ───────────────────────────────────────────────────────────────

export const mobileApi = {
  // Auth
  login: (email: string, password: string) =>
    apiRequest<{ success: boolean; token: string; refreshToken?: string; user: StoredUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    }),

  getMe: () =>
    authReq<{ success: boolean; user: any }>("/auth/me"),

  // Attendance
  getAttendanceSummary: () =>
    authReq<{ success: boolean; summary: AttendanceSummary }>("/attendance/summary"),

  getMyAttendance: (employeeId: string) =>
    authReq<{ success: boolean; data: AttendanceRecord[] }>(
      `/attendance?employeeId=${employeeId}&limit=30`
    ),

  // Employees
  getEmployees: () =>
    authReq<{ success: boolean; data: Employee[] }>("/employees"),

  getMyProfile: (employeeId: string) =>
    authReq<{ success: boolean; data: Employee }>(`/employees/${employeeId}`),

  // Leaves
  getMyLeaves: (employeeId: string) =>
    authReq<{ success: boolean; data: LeaveRequest[] }>(
      `/leaves?employeeId=${employeeId}`
    ),

  getAllLeaves: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : "";
    return authReq<{ success: boolean; data: LeaveRequest[] }>(`/leaves${q}`);
  },

  submitLeave: (data: {
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
  }) =>
    authReq<{ success: boolean; data: LeaveRequest }>("/leaves", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  approveLeave: (id: string) =>
    authReq<{ success: boolean }>(`/leaves/${id}/approve`, { method: "POST" }),

  rejectLeave: (id: string) =>
    authReq<{ success: boolean }>(`/leaves/${id}/reject`, { method: "POST" }),

  // Notifications
  getNotifications: () =>
    authReq<{ success: boolean; data: Notification[] }>("/notifications"),

  markNotificationRead: (id: string) =>
    authReq<{ success: boolean }>(`/notifications/${id}/read`, { method: "PATCH" }),

  // Geofences
  getGeofences: () =>
    authReq<{ success: boolean; data: Geofence[] }>("/geofences"),

  // Manual Attendance
  checkIn: (data: {
    latitude?: number;
    longitude?: number;
    accuracy?: number | null;
    isMock?: boolean;
    clientEventId: string;
    clientTimestamp?: string;
  }) =>
    authReq<{ success: boolean; message: string; data: any; insideGeofence?: boolean; isLateArrival?: boolean }>("/attendance/check-in", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  checkOut: (data: {
    latitude?: number;
    longitude?: number;
    accuracy?: number | null;
    isMock?: boolean;
    clientEventId: string;
    clientTimestamp?: string;
  }) =>
    authReq<{ success: boolean; message: string; data: any }>("/attendance/check-out", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Location
  submitLocation: (data: {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed?: number | null;
    heading?: number | null;
    isMock?: boolean;
    employeeId?: string;
  }) =>
    authReq<{ success: boolean }>("/location/update", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  submitBatchLocations: (data: { locations: any[]; employeeId?: string }) =>
    authReq<{ success: boolean; processedCount: number; acceptedClientPointIds?: string[] }>("/location/batch", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  reportLocationStatus: (data: {
    state: "LOCATION_OFF" | "PERMISSION_REVOKED" | "LOCATION_ON";
    at?: string;
    clientEventId?: string;
  }) =>
    authReq<{ success: boolean; message: string }>("/location/status", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Admin account creation
  createEmployee: (data: any) =>
    authReq<{ success: boolean; user: any; temporaryPassword?: string }>("/employees", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  createAdmin: (data: any) =>
    authReq<{ success: boolean; user: any; temporaryPassword?: string }>("/admins", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
