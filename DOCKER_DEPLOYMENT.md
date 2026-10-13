# Sankara Academy of Vision — Fellowship Admissions & Exam System
## Containerized Docker Deployment Guide

---

## 🛡️ Safety & Data Isolation Guarantee

> [!IMPORTANT]
> **Existing Live Application (`learn.sankaraeye.in`) and Historical Data are 100% Protected:**
> 1. **Complete Database Isolation**: The Docker stack runs inside its own isolated container (`fellowship-postgres`) using a dedicated named volume (`fellowship_postgres_volume`). It does **not** connect to or modify any existing host database.
> 2. **Port Non-Interference**: PostgreSQL is bound to host port `5433` (instead of standard `5432`) and the web application is bound to port `3002` (configurable via `APP_PORT`).
> 3. **Exam Cycle Isolation**: Inside the application database, all historical cycles (e.g. July/August examinations) are segregated by `program_id` (Program 1/2 for completed sessions, and Program 3 for the new July 2026 session). Old records are strictly preserved.

---

## 🚀 Quick Start (1-Command Deployment)

### 1. Copy Environment Configuration
```bash
cp .env.docker.example .env
```

### 2. Build and Launch the Containers
```bash
docker compose up -d --build
```

### 3. Verify Container Health
```bash
docker compose ps
```
You should see:
- `fellowship-postgres` — Status: `Up (healthy)` on port `0.0.0.0:5433->5432/tcp`
- `fellowship-app` — Status: `Up (healthy)` on port `0.0.0.0:3002->3002/tcp`

### 4. Access the Application
- **Web Portal / Admin Dashboard**: [http://localhost:3002](http://localhost:3002) (or `http://YOUR_SERVER_IP:3002`)
- **API Health Endpoint**: [http://localhost:3002/api/healthz](http://localhost:3002/api/healthz)

---

## 🔑 Default Super Admin Credentials

| Field | Value |
| :--- | :--- |
| **Email** | `saravanan@sankaraeye.com` |
| **Password** | `Saravanan@2026` |
| **Role** | Super Administrator |

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
