# Sankara Academy of Vision — Fellowship Admissions & Exam System
## Containerized Docker Deployment & Database Rework Guide

---

## ⚡ Zero-Effort Automatic Database Rework & Updates

> [!IMPORTANT]
> **Everything Updates Automatically on Container Startup:**
> When you run `docker compose up -d --build` (or start the container):
> 1. **Automatic Connection & Retry**: The backend loops and checks database connectivity until PostgreSQL is fully ready.
> 2. **Complete Schema Overhaul & Rework**:
>    - Checks and installs PostgreSQL extensions (`uuid-ossp`, `pgcrypto`).
>    - Synchronizes custom ENUMs (`candidate_status`, `user_role` with all roles).
>    - Creates all 34 database tables (`CREATE TABLE IF NOT EXISTS`).
>    - Automatically adds any missing columns across all tables (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
>    - Drops conflicting legacy constraints (e.g., old single-doctor marks restriction) and ensures correct composite unique constraints.
>    - Creates all 25+ performance indexes.
> 3. **Canonical Data Seeding & Healing**:
>    - Provisions and activates canonical Super Admins (`saravanan@sankaraeye.com`, `prabhanjan@sankaraeye.com`, `radhika@sankaraeye.com`).
>    - Provisions official units and 65-seat matrix across all 13 hospital locations.
>    - Provisions active Fellowship Program January 2027 (`FP-JAN-2027`) and VCT 2026 (`SAV-VCT-2026`).
>    - Automatically purges obsolete legacy programs (`FP-JUL-2026`, `FP-DEC-2026`, `Test`).
>    - Configures active application form with token `JAN2027` (canonical URL: `https://learn.sankaraeye.in/apply/JAN2027`).
>    - Connects Razorpay for online checkout with fallback to Direct Bank Transfer / UTR.
> **Zero manual SQL migrations required.**

---

## 🛡️ Existing Server DB vs Isolated Container

You have two simple options for the database:

### Option A: Use the Isolated Docker Database (Default)
Leave `DATABASE_URL` unset in your `.env`. The stack uses its own dedicated PostgreSQL 16 container (`fellowship-postgres`) on port `5433` with persistent volume `fellowship_pgdata`.

### Option B: Complete Rework of an Existing Old DB in the Server
If you have an existing PostgreSQL database on your server that you want to rework and update:
1. Open `.env` and set `DATABASE_URL` to your server's old database:
   ```bash
   # If Postgres is running on the host server:
   DATABASE_URL=postgresql://user:password@host.docker.internal:5432/my_old_db
   
   # Or direct host IP:
   DATABASE_URL=postgresql://user:password@172.17.0.1:5432/my_old_db
   ```
2. Run `docker compose up -d --build`.
3. The application will connect directly to `my_old_db`, automatically update all tables, add new columns, repair old schemas, and heal existing records safely!

---

## 🚀 Quick Start (1-Command Deployment)

### 1. Copy Environment Configuration
```bash
cp .env.docker.example .env
```

### 2. Build and Launch the Stack
```bash
docker compose up -d --build
```

### 3. Verify Container Health & Database Bootstrap
```bash
docker compose ps
docker compose logs -f fellowship-app
```
You will see the startup banner:
```
==================================================================
🚀 SANKARA ACADEMY OF VISION — AUTOMATIC DATABASE BOOTSTRAP 🚀
==================================================================
[DB-BOOTSTRAP] Database connection established successfully.
[DB-BOOTSTRAP] All 34 tables verified and created if missing.
[DB-BOOTSTRAP] Table columns synchronized successfully.
[DB-BOOTSTRAP] Constraints healed and performance indexes ready.
[DB-BOOTSTRAP] Baseline data seeding and state rework completed.
✅ DATABASE REWORK & BOOTSTRAP COMPLETE
```

### 4. Access the Application
- **Web Portal / Admin Dashboard**: [http://localhost:3002](http://localhost:3002) (or `http://YOUR_SERVER_IP:3002`)
- **API Health Endpoint**: [http://localhost:3002/api/healthz](http://localhost:3002/api/healthz)

---

## 🔑 Canonical Super Admin Credentials

| Name | Email | Password | Role |
| :--- | :--- | :--- | :--- |
| **Dr. Saravanan** | `saravanan@sankaraeye.com` | `Saravanan@2026` | Super Administrator |
| **Prabhanjan** | `prabhanjan@sankaraeye.com` | `Prabhanjan@2026` | Super Administrator |
| **Radhika Saranam** | `radhika@sankaraeye.com` | `Radhika@2026` | Super Administrator |

---

## 📋 Common Docker Management Commands

### View Live Logs
```bash
# Follow application logs
docker compose logs -f fellowship-app

# Follow database logs
docker compose logs -f fellowship-db
```

### Restart Services
```bash
docker compose restart
```

### Stop Services (Data is Safely Preserved)
```bash
docker compose down
```

### Rebuild After Code Updates
```bash
docker compose up -d --build
```

---

## 💾 Automated Database Backups (5 Times Daily)

The Docker stack includes an automated backup microservice (`fellowship-backup`) that automatically creates compressed backups **5 times a day** (at **00:00, 05:00, 10:00, 15:00, 20:00**).

All backup archives are saved directly inside the `./backups/` folder within your git cloned repository on the server:

```
fellowshiprework/
├── backups/
│   ├── backup_fellowship_db_20260818_000000.sql.gz
│   ├── backup_fellowship_db_20260818_050000.sql.gz
│   ├── backup_fellowship_db_20260818_100000.sql.gz
│   ├── backup_fellowship_db_20260818_150000.sql.gz
│   └── backup_fellowship_db_20260818_200000.sql.gz
```

### Manual Backup On-Demand (Run anytime)
```bash
./scripts/backup.sh
```

### Restore Database from a Specific Backup
```bash
gunzip -c backups/backup_fellowship_db_YYYYMMDD_HHMMSS.sql.gz | docker exec -i fellowship-postgres psql -U fellowship_admin -d fellowship_db
```

---

## 🌐 Production Domain & Nginx Reverse Proxy (Optional)

If routing this container through an Nginx reverse proxy on your server for a custom subdomain (e.g. `exam.sankaraeye.com` or `fellowship.sankaraeye.in`), point the upstream to `127.0.0.1:3002`:

```nginx
server {
    listen 80;
    server_name exam.sankaraeye.com;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Allow large PDF/document uploads
        client_max_body_size 50M;
    }
}
```

Enable SSL with Certbot:
```bash
sudo certbot --nginx -d exam.sankaraeye.com
```
