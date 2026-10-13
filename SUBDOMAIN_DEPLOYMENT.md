# Deploy to exams.sankaraeye.com
### Step-by-step server deployment guide (Windows Server & Linux)

---

## Architecture Overview

```
Internet
    │
    ▼
exams.sankaraeye.com (HTTPS:443)
    │
    ▼
Nginx (reverse proxy)
    ├── /         → serves React frontend (static files)
    ├── /admin/*  → serves React frontend (static files)
    ├── /api/*    → proxies to Node.js API at localhost:8080
    └── /apply/*  → proxies to Node.js API at localhost:8080
    
Node.js API (localhost:8080)
    └── PostgreSQL DB (localhost:5432)
```

**Result:**
- Public landing / login page → `https://exams.sankaraeye.com/admin`
- After login → `https://exams.sankaraeye.com/admin` (dashboard)
- Application forms → `https://exams.sankaraeye.com/admin/application-forms`
- Candidate apply link → `https://exams.sankaraeye.com/apply/{token}`

---

## OPTION A — Linux Server (Ubuntu 22.04 LTS) — Recommended

### Prerequisites
- A VPS or dedicated server running Ubuntu 22.04
- Public IP address pointing to the server
- `sudo` or root access
- Domain `sankaraeye.com` managed at your registrar

---

### Step 1 — DNS: Point the subdomain to your server

At your domain registrar (GoDaddy / BigRock / Cloudflare / etc.):

1. Log in to your domain registrar control panel
2. Go to **DNS Management** for `sankaraeye.com`
3. Add a new **A Record**:

| Type | Name (Host) | Value | TTL |
|------|-------------|-------|-----|
| A | `exams` | `YOUR_SERVER_IP` | 3600 |

Wait 5–30 minutes for DNS to propagate.  
Test with: `ping exams.sankaraeye.com` — should show your server IP.

---

### Step 2 — Prepare the Server

SSH into your server:
```bash
ssh root@YOUR_SERVER_IP
# or: ssh ubuntu@YOUR_SERVER_IP
```

Install all required software:
```bash
# System update
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm and PM2
sudo npm install -g pnpm pm2

# Nginx and Certbot (SSL)
sudo apt install -y nginx certbot python3-certbot-nginx

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

---

### Step 3 — Create the Database

```bash
sudo -u postgres psql -c "CREATE DATABASE sankara_fellowship;"
sudo -u postgres psql -c "CREATE USER sankara WITH PASSWORD 'CHOOSE_A_STRONG_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE sankara_fellowship TO sankara;"
```

Remember the password you chose — you'll need it in the next step.

---

### Step 4 — Upload and Extract the Project

**Option A: Upload the zip file using scp (from your laptop):**
```bash
# Run this on your LAPTOP, not the server:
scp fellowship-exam-deploy.zip root@YOUR_SERVER_IP:/var/www/
```

**Option B: Upload using a file manager (FileZilla, WinSCP, etc.):**
- Connect to your server via SFTP
- Upload `fellowship-exam-deploy.zip` to `/var/www/`

Then on the server:
```bash
cd /var/www
unzip fellowship-exam-deploy.zip -d fellowship
cd fellowship
```

---

### Step 5 — Configure Environment Variables

```bash
nano .env
```

Paste the following (replace placeholder values):
```
DATABASE_URL=postgresql://sankara:CHOOSE_A_STRONG_PASSWORD@localhost:5432/sankara_fellowship
JWT_SECRET=GENERATE_A_64_CHAR_RANDOM_STRING
SESSION_SECRET=GENERATE_ANOTHER_64_CHAR_RANDOM_STRING
NODE_ENV=production
PORT=8080
BASE_PATH=/admin
```

Generate random secrets:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Run twice — first output = `JWT_SECRET`, second = `SESSION_SECRET`.

Save and exit: `Ctrl+X` → `Y` → `Enter`

---

### Step 6 — Install Dependencies and Build

```bash
# Install packages
pnpm install

# Create database tables
pnpm --filter @workspace/db run push

# Build frontend
BASE_PATH=/admin pnpm --filter @workspace/fellowship-exam run build

# Build backend
pnpm --filter @workspace/api-server run build
```

---

### Step 7 — Start the API Server with PM2

```bash
cd /var/www/fellowship

pm2 start "node artifacts/api-server/dist/index.mjs" --name fellowship-api

# Save so it restarts after reboot
pm2 save

# Configure auto-start on system boot
pm2 startup
# PM2 will print a command — copy and run it (looks like: sudo env PATH=...)
```

Verify it's running:
```bash
pm2 status
curl http://localhost:8080/api/health
# Should return: {"status":"ok"}
```

---

### Step 8 — Configure Nginx

Create the Nginx site configuration:
```bash
sudo nano /etc/nginx/sites-available/exams-sankaraeye.conf
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name exams.sankaraeye.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Increase upload size for payment screenshots
    client_max_body_size 10M;

    # API proxy — all /api/ requests go to Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }

    # Apply form proxy — candidate-facing form pages
    location /apply/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Admin panel — React SPA served as static files
    location /admin {
        alias /var/www/fellowship/artifacts/fellowship-exam/dist/public;
        index index.html;
        try_files $uri $uri/ /admin/index.html;
    }

    # Root redirect to admin
    location = / {
        return 301 /admin;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        root /var/www/fellowship/artifacts/fellowship-exam/dist/public;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/exams-sankaraeye.conf /etc/nginx/sites-enabled/
sudo nginx -t
# Should print: configuration file test is successful
sudo systemctl reload nginx
```

---

### Step 9 — Add HTTPS (Free SSL Certificate)

```bash
sudo certbot --nginx -d exams.sankaraeye.com
```

When prompted:
- Enter your email address
- Agree to terms of service (type `Y`)
- Choose whether to share email with EFF (your choice)
- Choose **option 2** to redirect HTTP → HTTPS automatically

Certbot automatically renews the certificate. Verify renewal works:
```bash
sudo certbot renew --dry-run
```

---

### Step 10 — Verify the Deployment

1. Open `https://exams.sankaraeye.com` — should redirect to `https://exams.sankaraeye.com/admin`
2. You should see the Sankara Academy login page
3. Login with `saravanan@sankaraeye.com` / `Saravanan@2026`
4. Candidate apply links work at: `https://exams.sankaraeye.com/apply/{token}`

---

### Ongoing Maintenance (Linux)

**Update the app after code changes:**
```bash
cd /var/www/fellowship
pnpm install
pnpm --filter @workspace/db run push
BASE_PATH=/admin pnpm --filter @workspace/fellowship-exam run build
pnpm --filter @workspace/api-server run build
pm2 restart fellowship-api
```

**View live logs:**
```bash
pm2 logs fellowship-api
```

**Daily database backup (add to crontab):**
```bash
crontab -e
# Add this line (backup at 2 AM daily):
0 2 * * * pg_dump postgresql://sankara:PASSWORD@localhost/sankara_fellowship > /var/backups/fellowship_$(date +\%Y\%m\%d).sql
```

---

---

## OPTION B — Windows Server (IIS + node)

### Prerequisites
- Windows Server 2019 or 2022
- Administrator access
- Public IP mapped to `exams.sankaraeye.com` in DNS (same DNS step as Linux above)

---

### Step 1 — DNS

Same as Linux Step 1 — add an A record pointing `exams` → your server's public IP.

---

### Step 2 — Install Prerequisites

**Install Node.js 20 LTS:**
Download and run from https://nodejs.org/ (choose LTS, Windows 64-bit installer)

**Install pnpm and PM2** (in an elevated Command Prompt as Administrator):
```
npm install -g pnpm pm2 pm2-windows-startup
```

**Install PostgreSQL 15:**
Download from https://www.postgresql.org/download/windows/  
During installation:
- Remember the superuser (`postgres`) password
- Default port 5432 is fine
- Install pgAdmin (it's included)

**Install IIS with ARR (Application Request Routing):**
1. Open **Server Manager** → Add Roles and Features
2. Add **Web Server (IIS)**
3. Under IIS → download **IIS ARR** from: https://www.iis.net/downloads/microsoft/application-request-routing
4. Install it

---

### Step 3 — Create Database

Open pgAdmin, connect as `postgres`, and run in the Query Tool:
```sql
CREATE DATABASE sankara_fellowship;
CREATE USER sankara WITH PASSWORD 'CHOOSE_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE sankara_fellowship TO sankara;
```

---

### Step 4 — Upload and Extract Project

1. Create folder: `C:\inetpub\fellowship`
2. Copy `fellowship-exam-deploy.zip` there
3. Right-click → Extract All to `C:\inetpub\fellowship`

---

### Step 5 — Environment Variables

Create `C:\inetpub\fellowship\.env`:
```
DATABASE_URL=postgresql://sankara:CHOOSE_A_STRONG_PASSWORD@localhost:5432/sankara_fellowship
JWT_SECRET=GENERATE_A_64_CHAR_RANDOM_STRING
SESSION_SECRET=GENERATE_ANOTHER_64_CHAR_RANDOM_STRING
NODE_ENV=production
PORT=8080
BASE_PATH=/admin
```

Generate a random secret:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

### Step 6 — Install, Build, and Start

Open **Command Prompt as Administrator**, then:
```
cd C:\inetpub\fellowship
pnpm install
pnpm --filter @workspace/db run push
set BASE_PATH=/admin && pnpm --filter @workspace/fellowship-exam run build
pnpm --filter @workspace/api-server run build
```

Start with PM2 (auto-restarts):
```
pm2 start "node artifacts\api-server\dist\index.mjs" --name fellowship-api
pm2 save
pm2-windows-startup install
```

Verify API is running:
```
curl http://localhost:8080/api/health
```

---

### Step 7 — Configure IIS as Reverse Proxy

1. Open **IIS Manager**
2. Select your server → **Application Request Routing** → **Server Proxy Settings**
   - Enable proxy: **checked**
   - Click Apply
3. Create a new website:
   - Right-click **Sites** → **Add Website**
   - Site name: `fellowship`
   - Physical path: `C:\inetpub\fellowship\artifacts\fellowship-exam\dist\public`
   - Binding: Type = `http`, IP = `All Unassigned`, Port = `80`, Host name = `exams.sankaraeye.com`
4. Create a `web.config` file at `C:\inetpub\fellowship\artifacts\fellowship-exam\dist\public\web.config`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- API proxy -->
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:8080/api/{R:1}" />
        </rule>
        <!-- Apply form proxy -->
        <rule name="Apply Proxy" stopProcessing="true">
          <match url="^apply/(.*)" />
          <action type="Rewrite" url="http://localhost:8080/apply/{R:1}" />
        </rule>
        <!-- SPA fallback for React router -->
        <rule name="React SPA" stopProcessing="true">
          <match url="^admin(.*)" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/admin/index.html" />
        </rule>
        <!-- Root redirect -->
        <rule name="Root Redirect" stopProcessing="true">
          <match url="^$" />
          <action type="Redirect" url="/admin" redirectType="Permanent" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

---

### Step 8 — Add HTTPS on Windows Server

**Option A — Use Cloudflare (easiest):**
1. Move your DNS to Cloudflare (free)
2. Enable **Proxy** (orange cloud) for the `exams` A record
3. Cloudflare handles HTTPS automatically — no certificate needed on your server

**Option B — Let's Encrypt with win-acme:**
1. Download win-acme from https://www.win-acme.com/
2. Run `wacs.exe` as Administrator
3. Choose: Create certificate → Single binding of an IIS site → `fellowship`
4. It installs the certificate and updates IIS automatically

---

### Step 9 — Verify

Visit `https://exams.sankaraeye.com/admin` — you should see the login page.

---

## Troubleshooting Both Platforms

| Problem | Fix |
|---------|-----|
| 502 Bad Gateway | API server is not running. Check `pm2 status` |
| White screen after login | Check `BASE_PATH=/admin` is set in `.env` |
| Database connection refused | PostgreSQL not running, or password wrong |
| Certificate error | Certbot/win-acme not installed, or DNS not yet propagated |
| Apply form 404 | Nginx `/apply/` location block missing or wrong port |

---

## Super Admin Credentials

| Email | Password |
|-------|----------|
| `saravanan@sankaraeye.com` | `Saravanan@2026` |

**Change this password immediately after first login via My Profile → Change Password.**

---

## Future: Custom URL Routing (exams.sankaraeye.com/forms)

The application currently uses `/admin` as its base path. To change candidate-facing URLs to cleaner paths like `/forms`, you would rebuild the frontend with:

```bash
BASE_PATH=/ pnpm --filter @workspace/fellowship-exam run build
```

And update Nginx to remove the `/admin` prefix. Contact your development team to configure the route changes (`/forms` instead of `/application-forms`, `/home` instead of `/`) before doing this rebuild.
