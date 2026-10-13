# Sankara Academy of Vision — Fellowship Exam System
## Deployment Guide for `exam.sankaraeye.com`

---

## What's Included

```
fellowship-exam-deploy/
├── api-server/          ← Node.js backend (Express + Drizzle ORM)
├── fellowship-exam/     ← Admin panel frontend (React, built → dist/public/)
├── fellowship/          ← Student application form (React, built → dist/public/)
├── nginx/               ← Nginx config for exam.sankaraeye.com
├── scripts/             ← Setup & management scripts
├── .env.example         ← Environment variable template
└── README.md
```

---

## System Requirements

| Software    | Version     |
|-------------|-------------|
| Node.js     | v18 or v20  |
| pnpm        | v8+         |
| PostgreSQL  | v14+        |
| Nginx       | v1.18+      |
| PM2         | latest      |
| Certbot     | latest (for HTTPS) |

---

## Step 1 — Server Setup (Ubuntu/Debian VPS)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm pm2

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Nginx
sudo apt install -y nginx

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx
```

---

## Step 2 — Upload & Extract Files

```bash
# On your local machine, upload the zip:
scp fellowship-exam-deploy.zip user@YOUR_SERVER_IP:/opt/

# On the server:
cd /opt
unzip fellowship-exam-deploy.zip
mv fellowship-exam-deploy sankara-exam
cd sankara-exam
```

---

## Step 3 — Database Setup

```bash
# Switch to postgres user
sudo -u postgres psql

-- Inside psql:
CREATE DATABASE fellowship_exam;
CREATE USER fellowship_user WITH PASSWORD 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE fellowship_exam TO fellowship_user;
\q
```

---

## Step 4 — Environment Variables

```bash
cd /opt/sankara-exam
cp .env.example .env
nano .env
```

Fill in your values:
```
DATABASE_URL=postgresql://fellowship_user:STRONG_PASSWORD_HERE@localhost:5432/fellowship_exam
SESSION_SECRET=GENERATE_RANDOM_64_CHAR_STRING
PORT=8080
NODE_ENV=production
```

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Step 5 — Install Dependencies & Run Migrations

```bash
cd /opt/sankara-exam/api-server
npm install --production
npm run db:push     # Creates all tables
npm run db:seed     # Seeds admin user and initial data
```

---

## Step 6 — Start the API Server with PM2

```bash
cd /opt/sankara-exam/api-server
pm2 start dist/index.mjs --name "fellowship-api" --env production
pm2 save
pm2 startup   # Follow the printed command to auto-start on reboot
```

Verify it's running:
```bash
pm2 logs fellowship-api
curl http://localhost:8080/api/health
```

---

## Step 7 — Nginx Configuration

```bash
sudo cp /opt/sankara-exam/nginx/exam.sankaraeye.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/exam.sankaraeye.com.conf /etc/nginx/sites-enabled/
sudo nginx -t          # Test config
sudo systemctl reload nginx
```

---

## Step 8 — DNS — Point Subdomain to Your Server

In your domain registrar / DNS panel (wherever sankaraeye.com DNS is managed):

```
Type: A
Name: exam
Value: YOUR_SERVER_IP
TTL:  300
```

Wait 5–30 minutes for DNS to propagate.

---

## Step 9 — SSL Certificate (HTTPS)

```bash
sudo certbot --nginx -d exam.sankaraeye.com
```

Follow the prompts. Certbot will auto-configure HTTPS and set up auto-renewal.

---

## Step 10 — Verify

| URL | Expected |
|-----|----------|
| https://exam.sankaraeye.com/ | Student application form |
| https://exam.sankaraeye.com/admin | Admin login page |
| https://exam.sankaraeye.com/api/health | `{"status":"ok"}` |

---

## Default Login

| Email | Password | Role |
|-------|----------|------|
| admin@sankaraeye.com | Admin@2026 | Super Admin |
| All others | Welcome@123 | (role-specific, forced reset on first login) |

---

## WordPress Coexistence

Your main `www.sankaraeye.com` (WordPress) is unaffected. This is a **separate subdomain** on a separate server. No changes to WordPress are needed — only a DNS A record pointing `exam` to this server's IP.

---

## Maintenance Commands

```bash
pm2 status                          # Check if API is running
pm2 restart fellowship-api          # Restart API
pm2 logs fellowship-api --lines 50  # View recent logs
sudo systemctl reload nginx         # Reload nginx after config changes
```

---

## Firewall (if using ufw)

```bash
sudo ufw allow 22      # SSH
sudo ufw allow 80      # HTTP
sudo ufw allow 443     # HTTPS
sudo ufw enable
```
