"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { UserCheck, AlertCircle, Sun, ShieldCheck } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!email || !password) {
      setError("Please enter both email and password.")
      return
    }

    setLoading(true)
    setError(null)

    const res = await login(email, password)
    setLoading(false)

    if (res.success) {
      setSuccess(true)
      setTimeout(() => {
        router.push("/")
      }, 500)
    } else {
      setError(res.message || "Invalid email or password.")
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Left Panel: Sunny Gradient with Subtle Animated Sun Rays */}
      <div
        className="relative hidden lg:flex lg:w-1/2 flex-col justify-between p-12 overflow-hidden border-r border-[#F3E8C8]"
        style={{
          background:
            "linear-gradient(135deg, #FFF7D6 0%, #FFFBF0 50%, #E0F2FE 100%)",
        }}
      >
        {/* Subtle Animated Sun Rays SVG in background */}
        <div className="absolute -top-24 -left-24 w-96 h-96 pointer-events-none opacity-30 animate-[spin_60s_linear_infinite]">
          <svg viewBox="0 0 200 200" fill="none" className="w-full h-full">
            <g stroke="#F59E0B" strokeWidth="2" strokeDasharray="6 6">
              <circle cx="100" cy="100" r="70" />
              <circle cx="100" cy="100" r="90" />
            </g>
            {Array.from({ length: 16 }).map((_, i) => (
              <line
                key={i}
                x1="100"
                y1="10"
                x2="100"
                y2="25"
                stroke="#F59E0B"
                strokeWidth="2.5"
                strokeLinecap="round"
                transform={`rotate(${i * 22.5} 100 100)`}
              />
            ))}
          </svg>
        </div>

        {/* Top Branding */}
        <div className="relative z-10 flex items-center gap-3">
          <BrandLogo size={42} />
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-[#1F2937]">
              Sologix Energy
            </h2>
            <p className="text-xs font-semibold text-[#D97706]">
              Workforce Operations
            </p>
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 my-auto max-w-md space-y-4">
          <Badge
            variant="outline"
            className="border-[#F3E8C8] bg-white/70 text-[#D97706] font-semibold text-xs py-1 px-3 shadow-xs"
          >
            <Sun className="h-3.5 w-3.5 mr-1 text-[#F59E0B] inline" />
            Clean Energy Workforce Operations
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#1F2937] leading-tight">
            Powering Attendance with the Sun
          </h1>
          <p className="text-sm text-[#4B5563] leading-relaxed">
            Real-time solar-precision telemetry, automated geofence attendance, and intelligent field engineer management.
          </p>
          <div className="flex items-center gap-4 pt-2 text-xs font-medium text-[#6B7280]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[#16A34A]" />
              Role-Based Access
            </span>
            <span className="flex items-center gap-1.5">
              <Sun className="h-4 w-4 text-[#F59E0B]" />
              Solar-Synced Time
            </span>
          </div>
        </div>

        {/* Left Bottom Footer */}
        <div className="relative z-10 text-xs text-[#6B7280]">
          &copy; 2026 Sologix Energy &bull; Designed &amp; developed by Aryan Kumar Verma
        </div>
      </div>

      {/* Right Panel: Clean Login Card */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 lg:p-12 bg-[#FFFBF0]">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile-only Brand Header */}
          <div className="lg:hidden space-y-2 text-center">
            <div className="inline-flex p-3 rounded-2xl bg-[#FEF3C7] border border-[#F3E8C8] shadow-xs">
              <BrandLogo size={36} />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1F2937]">
              Sologix Energy
            </h1>
            <p className="text-xs font-semibold text-[#D97706]">
              Powering Attendance with the Sun
            </p>
          </div>

          {/* Login Card */}
          <Card className="border-[#F3E8C8] bg-white shadow-solar">
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-[#1F2937]">Sign In</CardTitle>
                <Badge variant="outline" className="border-[#F3E8C8] text-[10px] text-[#D97706] font-mono">
                  Secured
                </Badge>
              </div>
              <CardDescription className="text-xs text-[#6B7280]">
                Enter your authorized credentials to access operations
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Authentication Failed</AlertTitle>
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-[#16A34A]/40 bg-[#DCFCE7] text-[#16A34A]">
                  <UserCheck className="h-4 w-4 text-[#16A34A]" />
                  <AlertTitle>Authenticated</AlertTitle>
                  <AlertDescription className="text-xs">
                    Redirecting to operations terminal...
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleLogin} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#1F2937]">
                    Work Email
                  </label>
                  <Input
                    type="email"
                    placeholder="admin@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-[#E5DCC0] bg-white text-[#1F2937] focus:ring-[#F59E0B]"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#1F2937]">
                      Password
                    </label>
                  </div>
                  <Input
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-[#E5DCC0] bg-white text-[#1F2937] focus:ring-[#F59E0B]"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full bg-[#F59E0B] hover:bg-[#D97706] text-[#1F2937] font-bold shadow-xs transition-colors"
                >
                  {loading ? "Authenticating..." : "Sign In to Operations"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Under login card credit */}
          <div className="text-center text-xs text-[#6B7280] font-medium pt-2">
            &copy; 2026 Sologix Energy - Made by Aryan Kumar Verma
          </div>
        </div>
      </div>
    </div>
  )
}
