# Sankara Academy of Vision — Docker & Git Operational Guide
## Production Deployment, Updates, and Container Management

---

## ⚡ Quick 1-Liner Update Command

Whenever code updates are pushed to GitHub, run this single command on the server to pull and redeploy:

```bash
git pull origin main && docker compose up -d --build && docker compose logs -f fellowship-app
```

---

## 📋 Table of Contents
1. [Initial Server Setup (First Time Only)](#1-initial-server-setup-first-time-only)
2. [Standard Update Workflow (Git Pull + Rebuild)](#2-standard-update-workflow-git-pull--rebuild)
3. [All Docker Management Commands](#3-all-docker-management-commands)
4. [Environment Configuration Reference](#4-environment-configuration-reference)
5. [Database Architecture & Automatic Bootstrap](#5-database-architecture--automatic-bootstrap)
6. [Pre-configured Super Admin Logins](#6-pre-configured-super-admin-logins)
7. [Automated & Manual Backups](#7-automated--manual-backups)
8. [Troubleshooting & Health Checks](#8-troubleshooting--health-checks)

---

## 1. Initial Server Setup (First Time Only)

Run these steps when deploying on a brand new server or machine:

```bash
# 1. Clone the repository from GitHub
git clone https://github.com/prabhanjanak/flshprewrk.git fellowshiprework
cd fellowshiprework

# 2. Copy the production environment template
cp .env.docker.example .env

# 3. (Optional) Edit environment variables if you want custom ports or SMTP keys
nano .env

# 4. Build and start all services in detached mode
docker compose up -d --build

# 5. Verify all services are healthy and running
docker compose ps
```

---

## 2. Standard Update Workflow (Git Pull + Rebuild)

Follow this workflow anytime you want to apply updates from the GitHub repository:

```bash
# Step 1: Navigate to repository root
cd fellowshiprework

# Step 2: Fetch and merge latest commits from origin/main
git pull origin main

# Step 3: Rebuild the application container and restart services
docker compose up -d --build

# Step 4: Follow live startup logs to confirm the database bootstrap completes
docker compose logs -f fellowship-app
```

*(Press `Ctrl + C` at any time to exit the log viewer; the containers will continue running in the background).*

---

## 3. All Docker Management Commands

### Service Control

| Action | Command | Description |
| :--- | :--- | :--- |
| **Start / Build** | `docker compose up -d --build` | Builds images and starts all services in the background. |
| **Start (No Rebuild)** | `docker compose up -d` | Starts existing containers without re-compiling. |
| **Stop Stack** | `docker compose down` | Stops and removes containers. **Data in volumes is 100% safe.** |
| **Restart Stack** | `docker compose restart` | Safely restarts all containers. |
| **Restart App Only** | `docker compose restart fellowship-app` | Restarts only the API/frontend web container. |
| **Restart DB Only** | `docker compose restart fellowship-db` | Restarts only the PostgreSQL container. |

### Monitoring & Status

| Action | Command | Description |
| :--- | :--- | :--- |
| **Container Status** | `docker compose ps` | Displays container state, uptime, and healthcheck status. |
| **App Logs (Live)** | `docker compose logs -f fellowship-app` | Streams real-time backend API and frontend request logs. |
| **Database Logs** | `docker compose logs -f fellowship-db` | Streams PostgreSQL database connection and query logs. |
| **Backup Runner Logs**| `docker compose logs -f fellowship-backup` | Shows automated backup execution timestamps. |
| **Resource Usage** | `docker stats` | Monitors real-time CPU, RAM, and network usage. |

---

## 4. Environment Configuration Reference

The application reads from `.env` (copied from `.env.docker.example`):

```ini
# Application Port on Host (Access via http://YOUR_SERVER_IP:3002)
APP_PORT=3002

# Isolated Docker Database (Default)
POSTGRES_DB=fellowship_db
POSTGRES_USER=fellowship_admin
POSTGRES_PASSWORD=FellowshipSecure2026!
HOST_DB_PORT=5433

# Optional: Connect to an existing external PostgreSQL database on the host server
# DATABASE_URL=postgresql://user:password@host.docker.internal:5432/my_old_db

# JWT & Session Secret Key (Must be a secure random string)
SESSION_SECRET=a8f5c9e2b4d7f1a3c6e9d2b5f8a1c4e7d0b3f6a9c2e5d8b1f4a7c0e3d6b9f2a5

# Email / SMTP Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=admissions@sankaraeye.com
SMTP_PASS=your_app_password_here
SMTP_FROM=admissions@sankaraeye.com

# Razorpay Payment Gateway (Optional)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

---

## 5. Database Architecture & Automatic Bootstrap

Whenever `docker compose up` starts `fellowship-app`, the automated bootstrap (`db-bootstrap.ts`) executes immediately:

1. **Connectivity Check & Auto-Retry**: Automatically waits for PostgreSQL to initialize and accept connections.
2. **Schema Synchronization**: Checks all 34 tables, creates missing tables, adds missing columns, and verifies indexes.
3. **Canonical Intake Isolation (Jan 2027 Only)**:
   * **Active Program:** `Fellowship Program January 2027` (`FP-JAN-2027`).
   * **Active Application Form:** Token `JAN2027` (`Fellowship Program - January 2027`).
   * **Official 65-Seat Matrix:** 8 specialties across 13 hospital locations (`Cornea`, `Glaucoma`, `IOL Fellowship`, `Medical Retina`, `Oculoplasty`, `Pediatric Ophthalmology`, `Phaco Refractive`, `Vitreo Retina`).
   * **Legacy Purge:** Automatically removes any legacy or non-Jan2027 programs (`FP-JUL-2026`, `FP-DEC-2026`, `VCT-2026`, `Test`).

---

## 6. Pre-configured Super Admin Logins

Log in at `http://localhost:3002/login` (or `http://YOUR_SERVER_IP:3002/login`) using any of the following accounts:

| Administrator Name | Email Address | Default Password | Access Role |
| :--- | :--- | :--- | :--- |
| **Dr. Saravanan** | `saravanan@sankaraeye.com` | `Saravanan@2026` | Super Administrator |
| **Prabhanjan** | `prabhanjan@sankaraeye.com` | `Prabhanjan@2026` | Super Administrator |
| **Radhika Saranam** | `radhika@sankaraeye.com` | `Radhika@2026` | Super Administrator |

---

## 7. Automated & Manual Backups

### Automated Backups
The `fellowship-backup` container runs on a cron schedule **5 times daily** (`00:00`, `05:00`, `10:00`, `15:00`, `20:00`). Backups are saved directly into the `./backups/` directory on your server:

```
fellowshiprework/
└── backups/
    ├── backup_fellowship_db_20261019_000000.sql.gz
    ├── backup_fellowship_db_20261019_050000.sql.gz
    └── backup_fellowship_db_20261019_100000.sql.gz
```

### Manual Backup (On-Demand)
Run this command anytime from the repository root:
```bash
./scripts/backup.sh
```

### Restore Database from a Backup File
```bash
gunzip -c backups/backup_fellowship_db_YYYYMMDD_HHMMSS.sql.gz | docker exec -i fellowship-postgres psql -U fellowship_admin -d fellowship_db
```

---

## 8. Troubleshooting & Health Checks

### Check API Health
```bash
curl -i http://localhost:3002/api/healthz
```
Expected response:
```http
HTTP/1.1 200 OK
{"status":"healthy"}
```

### Check Active Intake Program in Database
```bash
docker exec -i fellowship-postgres psql -U fellowship_admin -d fellowship_db -c "SELECT id, name, code, academic_year FROM programs;"
```

### If Git Pull Conflicts Occur
```bash
# Stash local edits, pull clean code, and re-apply if needed
git stash
git pull origin main
docker compose up -d --build
```
