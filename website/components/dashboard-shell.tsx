"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  MapPin,
  Users,
  CalendarCheck,
  ShieldAlert,
  Clock,
  CalendarDays,
  Award,
  FileText,
  Bell,
  Radio,
  LogOut,
  ChevronDown,
} from "lucide-react"
import { getSocket } from "@/lib/socket"
import { api } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth, UserRole } from "@/lib/auth-context"
import { Loader2 } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  roles: UserRole[]
  badge?: string
}

const ALL_NAV_ITEMS: NavItem[] = [
  {
    name: "Executive Overview",
    href: "/",
    icon: LayoutDashboard,
    roles: ["ADMIN", "USER"],
  },
  {
    name: "Live Operations Map",
    href: "/live-map",
    icon: MapPin,
    roles: ["ADMIN", "USER"],
  },
  {
    name: "Field Engineers",
    href: "/employees",
    icon: Users,
    roles: ["ADMIN"],
  },
  {
    name: "Attendance Hub",
    href: "/attendance",
    icon: CalendarCheck,
    roles: ["ADMIN", "USER"],
  },
  {
    name: "Geofence Manager",
    href: "/geofences",
    icon: ShieldAlert,
    roles: ["ADMIN"],
  },
  {
    name: "Shift Schedules",
    href: "/shifts",
    icon: Clock,
    roles: ["ADMIN"],
  },
  {
    name: "Leave Approvals",
    href: "/leaves",
    icon: CalendarDays,
    roles: ["ADMIN", "USER"],
  },
  {
    name: "Performance Scorecards",
    href: "/analytics",
    icon: Award,
    roles: ["ADMIN"],
  },
  {
    name: "Audit Trail",
    href: "/audit-logs",
    icon: FileText,
    roles: ["ADMIN"],
    badge: "Admin",
  },
]

interface StoredNotification {
  id: string
  title: string
  message: string
  time: string
  read: boolean
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, role, logout, isLoading } = useAuth()
  const [socketConnected, setSocketConnected] = useState(false)
  const [notifications, setNotifications] = useState<StoredNotification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length

  // Load real notifications from API
  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.getNotifications()
      if (res.success && Array.isArray(res.data)) {
        setNotifications(
          res.data.map((n: any) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            time: n.createdAt
              ? new Date(n.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—",
            read: !!n.readAt,
          }))
        )
      }
    } catch {
      // Non-critical – don't surface error
    }
  }, [])

  useEffect(() => {
    loadNotifications()

    const socket = getSocket()

    const onConnect = () => setSocketConnected(true)
    const onDisconnect = () => setSocketConnected(false)

    if (socket.connected) setSocketConnected(true)
    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)

    // Real-time: new attendance check-in
    socket.on("attendance.checked_in", (data: any) => {
      setNotifications((prev) => [
        {
          id: `live-${Date.now()}`,
          title: "Automatic Check-in",
          message: `${data.employeeName ?? "Employee"} checked in at ${data.geofenceName ?? "a site"}`,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          read: false,
        },
        ...prev,
      ])
    })

    // Real-time: push notification from backend
    socket.on("notification.new", (data: any) => {
      setNotifications((prev) => [
        {
          id: `live-${Date.now()}`,
          title: data.title ?? "Notification",
          message: data.message ?? "",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          read: false,
        },
        ...prev,
      ])
    })

    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("attendance.checked_in")
      socket.off("notification.new")
    }
  }, [loadNotifications])

  const visibleNavItems = ALL_NAV_ITEMS.filter((item) =>
    item.roles.includes(role)
  )

  if (pathname === "/login") {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans text-foreground">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col justify-between border-r border-border bg-card">
        <div>
          {/* Brand */}
          <div className="flex h-16 items-center gap-2.5 border-b border-border px-4 bg-white">
            <BrandLogo size={32} />
            <div>
              <div className="text-sm font-bold tracking-tight text-foreground">
                Sologix Energy
              </div>
              <p className="text-[10px] font-semibold text-[#D97706]">
                Powering Attendance with the Sun
              </p>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="max-h-[calc(100vh-14rem)] space-y-1 overflow-y-auto p-2">
            <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              <span>Navigation</span>
              <Badge
                variant="outline"
                className="px-1 py-0 font-mono text-[10px] uppercase border-[#F3E8C8]"
              >
                {role}
              </Badge>
            </div>
            {visibleNavItems.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-md px-2.5 py-2 text-xs transition-colors ${
                    isActive
                      ? "bg-[#FEF3C7] font-bold text-[#D97706] border-l-4 border-[#F59E0B]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <Badge variant="outline" className="px-1 py-0 text-[9px] border-[#F3E8C8]">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* User Card & Credits Footer */}
        <div className="border-t border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/60 px-2.5 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#FEF3C7] text-xs font-bold text-[#D97706] border border-[#F3E8C8]">
              {(user?.name ?? role).substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 truncate">
              <p className="truncate text-xs font-medium text-foreground">
                {user?.name ?? "—"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user?.email ?? role}
              </p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="text-center text-[10px] text-muted-foreground font-medium pt-1 border-t border-border/40">
            &copy; 2026 Sologix Energy - Made by Aryan Kumar Verma
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header
          className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6"
          style={{ background: "linear-gradient(135deg, #FFF7D6 0%, #FFFBF0 50%, #E0F2FE 100%)" }}
        >
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs border border-[#F3E8C8]">
              Role: {role}
            </Badge>
          </div>

          <div className="relative flex items-center gap-3">
            {/* Notification Bell */}
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setShowNotifications((v) => !v)
                  // Mark all as read visually
                  if (!showNotifications) {
                    setNotifications((prev) =>
                      prev.map((n) => ({ ...n, read: true }))
                    )
                  }
                }}
                className="relative h-8 w-8"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>

              {showNotifications && (
                <div className="absolute top-11 right-0 z-50 w-80 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md">
                  <div className="flex items-center justify-between border-b border-border pb-2 text-xs font-semibold">
                    <span>Live Alerts</span>
                    <Badge
                      variant="secondary"
                      className="font-mono text-[10px]"
                    >
                      Real-time
                    </Badge>
                  </div>
                  <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        No notifications
                      </p>
                    ) : (
                      notifications.slice(0, 20).map((n) => (
                        <div
                          key={n.id}
                          className="rounded-md border border-border bg-muted p-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">
                              {n.title}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {n.time}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {n.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Logout */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={logout}
            >
              <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Sign Out</span>
            </Button>

            <span className="font-mono text-xs text-muted-foreground">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
