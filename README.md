# Sologix Energy — Workforce Attendance Platform

> **Sologix Energy** · Powering Attendance with the Sun. A full-stack, real-time, location-aware workforce attendance and operations platform for solar energy and field personnel.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Mission & Vision](#2-mission--vision)
3. [Architecture](#3-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Repository Structure](#5-repository-structure)
6. [Features](#6-features)
7. [Database Schema](#7-database-schema)
8. [API Reference](#8-api-reference)
9. [WebSocket Events](#9-websocket-events)
10. [Location Engine](#10-location-engine)
11. [Roles & Permissions](#11-roles--permissions)
12. [Getting Started](#12-getting-started)
13. [Environment Variables](#13-environment-variables)
14. [Running the Project](#14-running-the-project)
15. [Security & Production Hardening](#15-security--production-hardening)
16. [Credits](#16-credits)

---

## 1. Project Overview

**Sologix Energy** provides enterprise workforce attendance tracking for organizations managing distributed field engineers, solar plant operators, installation technicians, and operations personnel.

The platform is designed around a **Light Solar Theme** (Amber `#F59E0B`, Sky `#0EA5E9`, Green `#16A34A`, Page `#FFFBF0`) embodying the clean-energy aesthetic, with an offline-first mobile sync engine and real-time operations radar.

The system consists of **three integrated sub-projects**:

| Sub-project               | Directory  | Technology                                      | Purpose                                   |
| ------------------------- | ---------- | ----------------------------------------------- | ----------------------------------------- |
| **Backend API**           | `backend/` | Bun · Express · Prisma · PostgreSQL · Socket.IO | REST API, attendance engine, realtime layer |
| **Mobile App**            | `mobile/`  | Expo · React Native · NativeWind · SQLite       | Background location, attendance, offline sync |
| **Admin Web Dashboard**   | `website/` | Next.js 16 · Tailwind CSS v4 · Leaflet          | Live map, telemetry, admin controls       |

---

## 2. Mission & Vision

Solar energy and field engineering operations require verifiable, transparent, and resilient tracking:

```
Field Personnel  +  GPS Location  +  Assigned Shift  +  Solar Site Perimeter
                               |
               Sologix Workforce Attendance Engine
                               |
     Attendance Records · Real-time Telemetry · Admin Live Map
```

- **Resilient Offline Tracking**: Field personnel frequently operate in remote solar fields with spotty connectivity. Check-ins, check-outs, and telemetry are stored locally in SQLite and synchronized automatically.
- **Strict Role Boundaries**: Clear separation between `ADMIN` and `USER` roles. Admins manage personnel, review telemetry, and export compliance reports without being tracked.
- **Location-Off Safeguards**: Immediate alerting when location services or background permissions are toggled off by an active employee during duty hours.

---

## 3. Architecture

```
+---------------------------------------+
|        Sologix Mobile App             |  Expo (React Native)
|   +--------------------------------+  |
|   | Background Location Engine     |  |  expo-location + foreground service
|   | SQLite Offline Outbox          |  |  expo-sqlite (pending sync)
|   +---------------+----------------+  |
+-------------------.-------------------+
                    |  HTTPS REST / Socket.IO
                    v
+-------------------------------------------------------+
|              Sologix Attendance API                   |
|  Express · Bun Runtime · TypeScript · Asia/Kolkata TZ |
|                                                       |
|  +----------------+  +---------------+  +----------+  |
|  | Location Sync  |->| Geofence Rule |->|Attendance|  |
|  | Batch Receiver |  | Verification  |  | Service  |  |
|  +----------------+  +---------------+  +----+-----+  |
|                                              |        |
|  +--------------------+  +-------------------v-----+  |
|  | Auto-Checkout 21:00|  | Realtime Telemetry Hub  |  |
|  +--------------------+  +-------------------------+  |
+--------------------------.----------------------------+
                           |
            +--------------+-------------+
            |                            |
            v                            v
      PostgreSQL                      Socket.IO
     (Prisma ORM)                (Admin Web Clients)
                                         |
                                         v
                      +------------------------------------+
                      |    Sologix Admin Web Dashboard     |
                      |  Next.js 16 · Leaflet Live Map     |
                      +------------------------------------+
```

---

## 4. Tech Stack

### Backend
- **Runtime**: Bun (v1.0+)
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Realtime**: Socket.IO with authenticated JWT rooms
- **Security**: Argon2 password hashing, Bearer JWT access & refresh tokens

### Mobile Application
- **Framework**: Expo (SDK 52+), React Native
- **Styling**: NativeWind (Tailwind CSS) with Sologix Light Solar Theme
- **Local Storage**: `expo-sqlite` outbox + `expo-secure-store`
- **Location**: `expo-location` with persistent foreground notification service
- **Networking**: NetInfo offline detection + exponential backoff sync engine

### Admin Web Dashboard
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4, shadcn/ui customized with Sologix Solar Theme
- **Mapping**: Leaflet with CartoDB standard light basemap tiles
- **State**: React Context with authenticated session management

---

## 5. Repository Structure

```
Sologix Energy Monorepo
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Prisma models & indexes
│   │   └── seed.ts             # Default bootstrap seed
│   ├── src/
│   │   ├── controllers/        # REST route handlers
│   │   ├── middleware/         # Auth, validation, role checks
│   │   ├── routes/             # API routing
│   │   ├── services/           # Attendance, location, cron jobs
│   │   └── app.ts              # Express configuration
│   └── server.ts               # HTTP & Socket.IO server entry
├── mobile/
│   ├── assets/                 # App icon, adaptive icon, splash, logo
│   ├── components/ui/          # Solar UI components & theme tokens
│   ├── lib/
│   │   ├── api.ts              # API client with retry logic
│   │   ├── auth.ts             # Auth session & key migration
│   │   ├── location.ts         # Background GPS task
│   │   └── sync.ts             # SQLite offline outbox sync engine
│   └── screens/                # Mobile views (Login, Home, Attendance, Profile, Admin)
└── website/
    ├── app/                    # Next.js app router pages
    │   ├── attendance/         # Attendance records & CSV export
    │   ├── employees/          # Personnel management & dispatch
    │   ├── live-map/           # Fullscreen operations radar
    │   └── login/              # Solar split-screen login
    ├── components/             # Reusable UI & Leaflet LiveMap
    └── lib/                    # API client, auth context, socket
```

---

## 6. Features

1. **Light Solar Design Language**:
   - Palette: Solar Amber (`#F59E0B`), Sky Blue (`#0EA5E9`), Green (`#16A34A`), Warm White (`#FFFBF0`).
   - Clean, high-contrast UI compliant with WCAG AA.
2. **Attendance Source of Truth**:
   - Dedicated manual Check In and Check Out endpoints with GPS coordinate capture, accuracy, and client timestamp.
   - Automatic 21:00 IST checkout scheduled job that handles catch-up upon server restarts.
3. **Resilient Offline-First Mobile Client**:
   - Outbox pattern using local SQLite. Attendance events and telemetry points are written to disk before being synced to the server.
   - Idempotent point insertion (`clientPointId` + `employeeId`) preventing duplicates during retries.
4. **Operations Radar & Telemetry**:
   - Real-time Leaflet map displaying active personnel with sun-shaped amber markers, pulsating red indicators for location-off alerts, and soft amber geofence zones.
5. **Strict Two-Tier Role System**:
   - `ADMIN`: Full access to management dashboard, user creation, password resets, and audit logs. Never tracked.
   - `USER`: Field personnel with access to check in/out, view duty hours, and sync status.

---

## 7. Database Schema

Key models managed via Prisma in `backend/prisma/schema.prisma`:

- **User**: Authentication credentials, email, role (`ADMIN` or `USER`), status.
- **Employee**: Field profile linked exclusively to `USER` accounts (code, department, phone, active state).
- **Attendance**: Daily work records (`workDate` in `Asia/Kolkata`), check-in/out coordinates, check-out type (`MANUAL`, `AUTO_9PM`, `ADMIN`).
- **LocationUpdate**: GPS telemetry stream with `recordedAt`, `clientPointId`, speed, accuracy, and `isMock` detection.
- **LocationStatusEvent**: Audit trail of device state transitions (`LOCATION_OFF`, `LOCATION_ON`, `PERMISSION_REVOKED`).
- **Geofence**: Solar site boundaries, coordinates, radius, and polygon perimeters.

---

## 8. API Reference

### Authentication
- `POST /api/auth/login` — Login with email and password
- `POST /api/auth/refresh` — Exchange refresh token for new access token
- `POST /api/auth/logout` — Invalidate current session

### Attendance (USER only)
- `POST /api/attendance/check-in` — Idempotent check-in with device GPS coordinates
- `POST /api/attendance/check-out` — Idempotent check-out with device GPS coordinates
- `GET /api/attendance/today` — Current day attendance status

### Location Telemetry
- `POST /api/location/batch` — Bulk point sync (up to 200 points per batch)
- `POST /api/location/status` — Report location hardware state or permission changes

### Admin Controls (ADMIN only)
- `GET /api/employees` — List all employees and current status
- `POST /api/employees` — Register new field engineer (USER)
- `POST /api/admins` — Register new administrator (ADMIN)
- `POST /api/employees/:id/reset-password` — Generate or set initial password
- `POST /api/employees/:id/reset-sessions` — Revoke active user sessions

---

## 9. WebSocket Events

| Event Name | Direction | Payload | Description |
|---|---|---|---|
| `employee.location.updated` | Server → Client | `{ employeeId, latitude, longitude, recordedAt }` | Telemetry pin update |
| `employee.location.off` | Server → Client | `{ employeeId, state, at }` | Hardware location disabled warning |
| `attendance.checked_in` | Server → Client | `{ employeeId, workDate, checkInAt }` | Live attendance punch notification |
| `attendance.checked_out` | Server → Client | `{ employeeId, workDate, checkOutAt, type }` | Shift completion notification |

---

## 10. Location Engine

- **Foreground Service**: Android persistent notification ensures continuous GPS updates even when the mobile app is backgrounded.
- **No Mock Toleration**: Simulated positions are flagged (`isMock: true`) and broadcast to administrators.
- **No Signal Watchdog**: Server-side watchdog flags users who have sent no telemetry for more than 10 minutes while checked in.

---

## 11. Roles & Permissions

| Role | Web Dashboard | Mobile App | Tracked | Create Users |
|---|---|---|---|---|
| `ADMIN` | Full Access | Admin Management Mode | No | Yes (USER & ADMIN) |
| `USER` | No Access | Attendance & Duty Hub | Yes (while checked in) | No |

---

## 12. Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (v1.0+) or Node.js (v18+)
- [PostgreSQL](https://www.postgresql.org/) (v14+)
- [Expo CLI](https://docs.expo.dev/)

---

## 13. Environment Variables

### Backend (`backend/.env`)
```env
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sologix_db?schema=public"
JWT_ACCESS_SECRET="sologix-access-secret-key"
JWT_REFRESH_SECRET="sologix-refresh-secret-key"
CORS_ORIGIN="http://localhost:3000"
TZ="Asia/Kolkata"
```

### Web (`website/.env.local`)
```env
NEXT_PUBLIC_API_URL="http://localhost:5000"
```

### Mobile (`mobile/.env`)
```env
EXPO_PUBLIC_API_BASE="http://10.0.2.2:5000"
```

---

## 14. Running the Project

### Database Setup
```bash
cd backend
bun x prisma migrate deploy
bun run prisma/seed.ts
```

### Start Backend
```bash
cd backend
bun run dev
```

### Start Web Dashboard
```bash
cd website
bun run dev
```

### Start Mobile App
```bash
cd mobile
bun run start
```

---

## 15. Security & Production Hardening

- Strictly parameterized SQL via Prisma.
- Passwords hashed using Argon2id.
- One-device session enforcement with remote session termination.
- Offline storage secured via SQLite sandbox and encrypted key storage.
- Rate limiting on authentication routes and location batch endpoints.

---

## 16. Credits

Designed and developed by **Aryan Kumar Verma** for **Sologix Energy**.
