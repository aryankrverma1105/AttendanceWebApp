import React from "react"

interface BrandLogoProps {
  size?: number
  className?: string
  showText?: boolean
  variant?: "mark" | "full"
}

export function BrandLogo({
  size = 36,
  className = "",
  showText = false,
  variant = "mark",
}: BrandLogoProps) {
  if (variant === "full") {
    return (
      <div className={`inline-flex items-center ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Sologix Energy"
          style={{ height: size, width: "auto" }}
          className="object-contain"
        />
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-mark.png"
        alt="Sologix Energy"
        style={{ width: size, height: size * 1.08 }}
        className="object-contain shrink-0 transition-transform duration-300 hover:scale-105"
      />
      {showText && (
        <div className="flex flex-col">
          <span className="font-bold tracking-tight text-foreground text-sm leading-tight">
            Sologix Energy
          </span>
          <span className="text-[10px] text-muted-foreground font-medium tracking-wide">
            Powering Attendance with the Sun
          </span>
        </div>
      )}
    </div>
  )
}

export default BrandLogo
