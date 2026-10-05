# Sologix Energy — GCP Compute Engine VM Deployment Guide

This guide walks you through deploying the **Sologix Energy** platform (PostgreSQL, Bun Backend API, Next.js Web Dashboard, and Caddy Reverse Proxy with automated HTTPS) onto a **Google Cloud Platform (GCP) Compute Engine VM**.

---

## 1. Architecture Overview on GCP

```
Internet (Users & Mobile Apps)
         │  HTTPS (443) / HTTP (80)
         ▼
┌──────────────────────────────────────────────────────────────┐
│  GCP Compute Engine VM (e2-standard-2 / Ubuntu 24.04 LTS)    │
│  External Static IP · Firewall: Allow HTTP/HTTPS             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Caddy Reverse Proxy (Auto Let's Encrypt TLS/SSL)       │  │
│  └──────────┬─────────────────────────────┬───────────────┘  │
│             │ /api/*, /socket.io/*        │ /* (web pages)   │
│             ▼                             ▼                  │
│  ┌───────────────────────┐   ┌────────────────────────────┐  │
│  │ Backend API (Bun)     │   │ Next.js 16 Web Dashboard   │  │
│  │ Port 5000 (Internal)  │   │ Port 3000 (Internal)       │  │
│  └──────────┬────────────┘   └────────────────────────────┘  │
│             │ Internal Bridge Network (`sologix_net`)        │
│             ▼                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ PostgreSQL 16 (Private DB Access Only, No Host Port)   │  │
│  └──────────┬─────────────────────────────────────────────┘  │
│             │ Daily pg_dump                                  │
└─────────────┼────────────────────────────────────────────────┘
              ▼
  Google Cloud Storage (GCS) Bucket: `gs://your-backup-bucket/`
```

---

## 2. GCP Infrastructure Setup

### Step 2.1: Create a Static External IP Address
1. Go to **VPC Network** > **IP addresses** in the GCP Console.
2. Click **Reserve Static External IP Address**.
3. Name: `sologix-ip`.
4. Region: Choose your preferred region (e.g., `asia-south1` Mumbai).
5. Note the reserved IPv4 address (e.g., `34.xxx.xxx.xxx`).

### Step 2.2: Create a Cloud Storage Bucket for Backups
1. Go to **Cloud Storage** > **Buckets**.
2. Click **Create Bucket**.
3. Name: `sologix-attendance-backups` (names are globally unique).
4. Location Type: Region (e.g., `asia-south1`).
5. Storage Class: **Standard** (or Nearline).
6. Enable Object Versioning or Retention Policy as needed.

### Step 2.3: Launch Compute Engine VM Instance
1. Go to **Compute Engine** > **VM instances** > **Create Instance**.
2. Configuration:
   - **Name**: `sologix-server-prod`
   - **Region / Zone**: Same region as your bucket and IP (e.g., `asia-south1-a`).
   - **Machine Type**: `e2-standard-2` (2 vCPU, 8 GB memory) or `e2-medium` (2 vCPU, 4 GB memory minimum).
   - **Boot Disk**: Click **Change** → OS: **Ubuntu**, Version: **Ubuntu 24.04 LTS**, Size: **50 GB SSD**.
   - **Identity and API access**:
     - Service Account: **Compute Engine default service account** (or create a dedicated `sologix-vm-sa`).
     - Access Scopes: Select **Set access for each API** → **Storage**: **Read/Write** (or **Full**).
   - **Firewall**: Check both **Allow HTTP traffic** and **Allow HTTPS traffic**.
   - **Networking** > **Network interfaces**: Click default interface → **External IPv4 address** → Select your reserved static IP `sologix-ip`.
3. Click **Create**.

---

## 3. Server Configuration & Docker Installation

### Step 3.1: SSH into the VM
Connect via the GCP Console browser SSH button, or from your terminal:
```bash
gcloud compute ssh sologix-server-prod --zone asia-south1-a
```

### Step 3.2: Set System Timezone to Asia/Kolkata
```bash
sudo timedatectl set-timezone Asia/Kolkata
timedatectl
```

### Step 3.3: Install Docker and Docker Compose
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw ca-certificates gnupg

# Install official Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow non-root docker execution
sudo usermod -aG docker $USER
newgrp docker
```

### Step 3.4: Configure VM Firewall (UFW)
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

---

## 4. Deploying the Application

### Step 4.1: Clone the GitHub Repository
```bash
cd ~
git clone https://github.com/aryankrverma1105/AttendanceWebApp.git sologix-app
cd sologix-app
```

### Step 4.2: Configure Production Environment Variables
Create `.env` from the provided example:
```bash
cp .env.production.example .env
nano .env
```
Fill in your configuration:
```env
# Timezone
TZ=Asia/Kolkata

# Domain (Caddy will automatically issue SSL for this domain)
DOMAIN=attendance.yourdomain.com
ACME_EMAIL=admin@yourdomain.com

# Database Credentials
POSTGRES_DB=sologix_db
POSTGRES_USER=sologix_user
POSTGRES_PASSWORD=UseAStrongRandomPassword123!

# JWT Secret (Generate with: openssl rand -hex 32)
JWT_SECRET=your_generated_jwt_secret_hex_at_least_32_characters

# CORS & Domain
ALLOWED_ORIGINS=https://attendance.yourdomain.com

# First Admin User Bootstrap (Created once upon initial startup)
SYSTEM_ADMIN=admin@yourdomain.com
SYSTEM_ADMIN_PASSWORD=AdminSecurePass2026!

# GCS Bucket for Backups
GCS_BACKUP_BUCKET=sologix-attendance-backups
```

### Step 4.3: Configure DNS A Records
In your domain registrar (GoDaddy, Cloudflare, Namecheap, etc.), add an **A Record**:
- **Type**: `A`
- **Name**: `attendance` (or `@` for apex domain)
- **Value**: Your VM Static External IP (e.g. `34.xxx.xxx.xxx`)
- **TTL**: Auto or 300 seconds

---

## 5. Launching the Services

Run Docker Compose to build containers and start services in the background:
```bash
docker compose up -d --build
```

### Check Running Containers
```bash
docker compose ps
```
You should see:
- `sologix-postgres`: Up (healthy) - internal port only
- `sologix-backend`: Up - internal port 5000
- `sologix-website`: Up - internal port 3000
- `sologix-caddy`: Up - ports `0.0.0.0:80->80/tcp`, `0.0.0.0:443->443/tcp`

### Check Logs & Health Check
```bash
# Check Caddy SSL issuance
docker compose logs -f caddy

# Test Health Check API directly on server
curl http://localhost/api/health
```
Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-10-04T18:00:00.000Z",
  "service": "Sologix Attendance API"
}
```

---

## 6. Automated Daily Backups to Google Cloud Storage (02:00 IST)

### Step 6.1: Make the Backup Script Executable
```bash
chmod +x scripts/backup-gcs.sh scripts/restore-gcs.sh
```

### Step 6.2: Test Manual Backup
```bash
./scripts/backup-gcs.sh
```
Verify the dump in your Cloud Storage bucket:
```bash
gcloud storage ls gs://sologix-attendance-backups/backups/
```

### Step 6.3: Schedule Daily Backup via Crontab (Runs at 02:00 IST)
Since the system timezone was configured to `Asia/Kolkata` in Step 3.2, crontab fires at 02:00 IST:
```bash
crontab -e
```
Add the following cron entry:
```cron
0 2 * * * /home/$USER/sologix-app/scripts/backup-gcs.sh >> /var/log/sologix-backup.log 2>&1
```

---

## 7. Database Restore Guide

In the event of accidental data corruption, migration rollback, or server relocation, restore PostgreSQL from a GCS backup:

### Option A: Using the Automated Restore Script
```bash
# 1. List available backups in GCS
gcloud storage ls gs://sologix-attendance-backups/backups/

# 2. Run restore script pointing to target backup file
./scripts/restore-gcs.sh gs://sologix-attendance-backups/backups/sologix_db_backup_20261005_020000.sql.gz
```

### Option B: Manual Step-by-Step Restore
```bash
# 1. Download desired backup from Cloud Storage
gcloud storage cp gs://sologix-attendance-backups/backups/sologix_db_backup_20261005_020000.sql.gz ./latest_backup.sql.gz

# 2. Stop application services to prevent active connections during restore
docker compose stop backend website

# 3. Stream compressed dump into PostgreSQL container
zcat latest_backup.sql.gz | docker compose exec -T postgres psql -U sologix_user -d sologix_db

# 4. Run Prisma migration catch-up (if restoring older schema)
docker compose run --rm backend bun x prisma migrate deploy

# 5. Restart application services
docker compose start backend website
```

---

## 8. Connecting the Mobile App to Production

Update your mobile configuration in `mobile/.env`:
```env
EXPO_PUBLIC_API_BASE=https://attendance.yourdomain.com/api
```
Rebuild your Android APK using EAS:
```bash
cd mobile
eas build --platform android --profile production
```

---

## 9. Maintenance & Operations Cheatsheet

| Task | Command |
|---|---|
| **View Backend Logs** | `docker compose logs -f backend` |
| **View Live Map Sockets** | `docker compose logs -f backend \| grep Socket` |
| **Restart Application** | `docker compose restart` |
| **Pull Updates from GitHub** | `git pull origin main && docker compose up -d --build` |
| **Run Prisma Migrations** | `docker compose exec backend bun x prisma migrate deploy` |
| **Interactive DB Shell** | `docker compose exec postgres psql -U sologix_user -d sologix_db` |
| **Restore Database Backup** | `zcat backup.sql.gz \| docker compose exec -T postgres psql -U sologix_user -d sologix_db` |

