# Sankara Academy of Vision — PM2 Server Deployment & Update Runbook
## Standard Production Setup, Git Pull, and Service Management via PM2

This guide is for the server administrator and technical team running the **Fellowship Admissions & Examination Portal** natively on the Linux/Windows server using **PM2** (Node.js Process Manager).

---

## ⚡ Quick 1-Liner Update Command

Whenever code updates or new commits are pushed to GitHub, run this single command on the server:

```bash
git pull origin main && pnpm install && pnpm run build && pm2 restart fellowship-api && pm2 logs fellowship-api --lines 30
```

*(If your server uses `npm` instead of `pnpm`, simply replace `pnpm` with `npm`).*

---

## 📋 Table of Contents
1. [Standard Update Workflow (Every Time You Pull Code)](#1-standard-update-workflow)
2. [First-Time PM2 Service Setup](#2-first-time-pm2-service-setup)
3. [Essential PM2 Commands Cheat Sheet](#3-essential-pm2-commands-cheat-sheet)
4. [Environment File (.env) Configuration](#4-environment-file-env-configuration)
5. [Automatic Database Schema Updates & Jan 2027 Program](#5-automatic-database-schema-updates--jan-2027-program)
6. [Nginx Reverse Proxy Configuration](#6-nginx-reverse-proxy-configuration)
7. [Troubleshooting & FAQs](#7-troubleshooting--faqs)

---

## 1. Standard Update Workflow

Follow these steps on the server whenever applying updates from GitHub:

```bash
# Step 1: Navigate to repository root directory
cd /path/to/fellowshiprework

# Step 2: Pull the latest commits from the main branch
git pull origin main

# Step 3: Install any new dependencies
pnpm install
# (or: npm install)

# Step 4: Recompile both API backend and frontend bundle
pnpm run build
# (or: npm run build)

# Step 5: Restart the PM2 process
pm2 restart fellowship-api

# Step 6: View live startup logs to confirm healthy bootstrap
pm2 logs fellowship-api --lines 30
```

> **Note:** Press `Ctrl + C` to exit the log viewer. The server remains running in the background.

---

## 2. First-Time PM2 Service Setup

If the application is not yet running in PM2 or the process was cleared:

### Step 1: Ensure Prerequisites are Installed
```bash
node -v    # Requires Node.js v18, v20, or v22
npm install -g pnpm pm2
```

### Step 2: Configure Environment File
Ensure a `.env` file exists in the repository root:
```bash
cp .env.example .env
nano .env
```
*(Verify your `DATABASE_URL=postgresql://user:password@localhost:5432/fellowship_db` and `PORT=3002`).*

### Step 3: Build the Codebase
```bash
pnpm install
pnpm run build
```

### Step 4: Launch the Process with PM2

**Option A — Using `ecosystem.config.cjs` (Recommended):**
```bash
pm2 start ecosystem.config.cjs
```

**Option B — Direct Command:**
```bash
pm2 start "node artifacts/api-server/dist/index.mjs" --name "fellowship-api"
```

### Step 5: Save PM2 Configuration for System Reboots
```bash
# Saves the running process list so it restarts automatically on server reboot
pm2 save

# Configures the systemd startup service
pm2 startup
```
*(PM2 will output a `sudo env PATH=...` command — copy and run that command as directed).*

---

## 3. Essential PM2 Commands Cheat Sheet

| Task | Command | Description |
| :--- | :--- | :--- |
| **Check Process Status** | `pm2 status` | Shows memory, CPU, PID, and uptime of `fellowship-api` |
| **View Real-Time Logs** | `pm2 logs fellowship-api` | Streams application stdout and stderr logs live |
| **View Recent Error Logs** | `pm2 logs fellowship-api --err --lines 50` | Shows the last 50 error log entries |
| **Restart Application** | `pm2 restart fellowship-api` | Zero-downtime or quick restart of the Node server |
| **Reload with Zero Downtime**| `pm2 reload fellowship-api` | Gracefully reloads application without dropping active requests |
| **Stop Application** | `pm2 stop fellowship-api` | Temporarily halts the process |
| **Delete from PM2** | `pm2 delete fellowship-api` | Removes process from PM2 list |
| **Save Process List** | `pm2 save` | Saves active processes to auto-start after server reboots |
| **Monitor Dashboard** | `pm2 monit` | Terminal dashboard showing live CPU/RAM usage per process |

---

## 4. Environment File (`.env`) Configuration

The application automatically reads its variables from `.env` in the root folder:

```ini
# Server Port (matches what Nginx proxies to, e.g. 3002 or 5001)
PORT=3002
NODE_ENV=production

# PostgreSQL Database Connection String
DATABASE_URL=postgresql://fellowship_admin:YourSecurePassword@localhost:5432/fellowship_db

# Security & Session Token Encryption Key
SESSION_SECRET=a8f5c9e2b4d7f1a3c6e9d2b5f8a1c4e7d0b3f6a9c2e5d8b1f4a7c0e3d6b9f2a5

# (Optional) SMTP Email Delivery Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=admissions@sankaraeye.com
SMTP_PASS=your_app_specific_password
SMTP_FROM=admissions@sankaraeye.com

# Razorpay credentials can also be configured directly in App UI under Application Settings
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

---

## 5. Automatic Database Schema Updates & Jan 2027 Program

Every time `pm2 restart fellowship-api` runs:
1. **Zero-Effort Schema Migrations**:
   * The server runs `bootstrapDatabase()`, checking all 34 database tables.
   * Missing columns and new constraints are added automatically (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
   * No manual SQL scripts need to be executed by the admin.
2. **Canonical Intake Enforcement (January 2027 Only)**:
   * Program `Fellowship Program January 2027` (`FP-JAN-2027`) is verified and activated.
   * Form token `JAN2027` is mounted as the active public application URL.
   * All legacy test or obsolete programs are automatically purged from the application forms dropdown.
3. **Canonical Super Admins**:
   * Ensures `saravanan@sankaraeye.com`, `prabhanjan@sankaraeye.com`, and `radhika@sankaraeye.com` exist and are active.

---

## 6. Nginx Reverse Proxy Configuration

If Nginx is fronting the server, ensure your configuration points to the port defined in `.env` (e.g. `3002`):

```nginx
server {
    server_name learn.sankaraeye.in;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

After modifying Nginx configuration:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 7. Troubleshooting & FAQs

### Q1: `pm2 status` shows `errored` or restart loop
Check the specific error using:
```bash
pm2 logs fellowship-api --err --lines 50
```
Common reasons:
* **Missing `.env` file or invalid `DATABASE_URL`**: Verify PostgreSQL is running on the host (`sudo systemctl status postgresql`) and that credentials in `.env` can connect via `psql`.
* **Port in use**: Check if another process is using port 3002 via `sudo lsof -i :3002`.

### Q2: `[PM2][ERROR] Process fellowship-api not found`
Your server admin might have named the process differently (e.g. `fellowship` or `api`). Run:
```bash
pm2 list
```
Identify the correct name or ID in the table, then restart with:
```bash
pm2 restart <name-or-id>
```
Or start fresh with:
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

### Q3: Git conflicts on `git pull`
If local modifications were made on the server:
```bash
git stash
git pull origin main
pnpm install && pnpm run build
pm2 restart fellowship-api
```
