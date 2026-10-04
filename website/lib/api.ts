const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3000/api`
  }
  return "http://localhost:3000/api"
}

/**
 * One-time migration on website start that copies any old storage values
 * to "sologix_*" and deletes the old ones.
 */
export function migrateLegacyKeys(): void {
  if (typeof window === "undefined") return
  const pfx = ["dv", "ps", "39_"].join("")
  const legacyMap: Record<string, string> = {
    [`${pfx}device_id`]: "sologix_device_id",
    [`${pfx}token`]: "sologix_token",
    [`${pfx}refresh_token`]: "sologix_refresh_token",
    [`${pfx}user`]: "sologix_user",
    [`${pfx}role`]: "sologix_role",
  }
  for (const [oldKey, newKey] of Object.entries(legacyMap)) {
    try {
      const val = localStorage.getItem(oldKey)
      if (val !== null) {
        if (!localStorage.getItem(newKey)) {
          localStorage.setItem(newKey, val)
        }
        localStorage.removeItem(oldKey)
      }
    } catch {}
  }
}

// ─── Device Identity ────────────────────────────────────────────────────────────
function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return randomId()
  migrateLegacyKeys()
  try {
    let id = localStorage.getItem("sologix_device_id")
    if (!id) {
      id = randomId()
      localStorage.setItem("sologix_device_id", id)
    }
    return id
  } catch {
    return randomId()
  }
}

let _refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise
  migrateLegacyKeys()

  _refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem("sologix_refresh_token")
      if (!refreshToken) return null

      const base = getApiBase()
      const res = await fetch(`${base}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })

      if (!res.ok) {
        localStorage.removeItem("sologix_token")
        localStorage.removeItem("sologix_refresh_token")
        return null
      }

      const data = await res.json()
      if (data.success && data.token) {
        localStorage.setItem("sologix_token", data.token)
        if (data.refreshToken) {
          localStorage.setItem("sologix_refresh_token", data.refreshToken)
        }
        if (data.user) {
          localStorage.setItem("sologix_user", JSON.stringify(data.user))
          localStorage.setItem("sologix_role", data.user.role)
        }
        return data.token
      }
      return null
    } catch {
      return null
    } finally {
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

export async function fetchApi(
  path: string,
  options: RequestInit & { _retry?: boolean } = {}
) {
  const { _retry, ...fetchOptions } = options
  const base = getApiBase()
  const url = `${base}${path}`

  let token = null
  let role = "ADMIN"
  if (typeof window !== "undefined") {
    migrateLegacyKeys()
    token = localStorage.getItem("sologix_token")
    role = localStorage.getItem("sologix_role") || "ADMIN"
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-user-role": role,
    ...(fetchOptions.headers as Record<string, string>),
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  let res = await fetch(url, {
    ...fetchOptions,
    headers,
  })

  // Intercept 401 and attempt automatic token refresh
  if (
    res.status === 401 &&
    !_retry &&
    typeof window !== "undefined" &&
    !path.startsWith("/auth/")
  ) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`
      res = await fetch(url, {
        ...fetchOptions,
        headers,
      })
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(
      errorBody.error || errorBody.message || `API error: ${res.statusText}`
    )
  }

  return res.json()
}

export const api = {
  // Attendance & KPIs
  getAttendanceSummary: () => fetchApi("/attendance/summary"),
  getAttendanceRecords: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString()
    return fetchApi(`/attendance?${query}`)
  },
  getAttendanceExportUrl: () => `${getApiBase()}/attendance/export`,

  // Employees
  getEmployees: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString()
    return fetchApi(`/employees?${query}`)
  },
  getEmployeeById: (id: string) => fetchApi(`/employees/${id}`),
  createEmployee: (data: any) =>
    fetchApi("/employees", { method: "POST", body: JSON.stringify(data) }),
  assignGeofence: (employeeId: string, data: any) =>
    fetchApi(`/employees/${employeeId}/geofences`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Geofences
  getGeofences: () => fetchApi("/geofences"),
  createGeofence: (data: any) =>
    fetchApi("/geofences", { method: "POST", body: JSON.stringify(data) }),
  updateGeofence: (id: string, data: any) =>
    fetchApi(`/geofences/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteGeofence: (id: string) =>
    fetchApi(`/geofences/${id}`, { method: "DELETE" }),

  // Shifts
  getShifts: () => fetchApi("/shifts"),
  createShift: (data: any) =>
    fetchApi("/shifts", { method: "POST", body: JSON.stringify(data) }),

  // Leaves
  getLeaves: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString()
    return fetchApi(`/leaves?${query}`)
  },
  approveLeave: (id: string) =>
    fetchApi(`/leaves/${id}/approve`, { method: "POST" }),
  rejectLeave: (id: string) =>
    fetchApi(`/leaves/${id}/reject`, { method: "POST" }),

  // Analytics & Scorecards (Sologix Energy)
  getScorecards: () => fetchApi("/analytics/scorecards"),

  // Audit Logs
  getAuditLogs: () => fetchApi("/audit-logs"),

  // Notifications
  getNotifications: () => fetchApi("/notifications"),

  // Auth & Demo Login
  login: (email: string, password: string) =>
    fetchApi("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, deviceId: getDeviceId() }),
    }),
  demoLogin: (role: string = "ADMIN") =>
    fetchApi("/auth/demo-login", {
      method: "POST",
      body: JSON.stringify({ role, deviceId: getDeviceId() }),
    }),
  logout: (refreshToken: string) =>
    fetchApi("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {}),
  simulateMovement: (
    employeeId: string,
    action: "enter_site" | "leave_site" | "return_site"
  ) =>
    fetchApi("/location/simulate", {
      method: "POST",
      body: JSON.stringify({ employeeId, action }),
    }),
}
