# Sankara Academy of Vision — Production Deployment Guide
## Domain: `learn.sankaraeye.in` | Intake: January 2027

---

### 🌐 Official Canonical URLs
- **Candidate Application Form**: [https://learn.sankaraeye.in/apply/JAN2027](https://learn.sankaraeye.in/apply/JAN2027)
- **Automatic Fallback / Short Link**: `https://learn.sankaraeye.in/apply` (auto-redirects to `JAN2027`)
- **Admin & Examination Portal**: `https://learn.sankaraeye.in/`
- **Docker Health Check**: `https://learn.sankaraeye.in/api/healthz`

---

## 1. Summary of Changes Implemented

1. **Intake Token Canonicalized to `JAN2027`**:
   - Program: `Fellowship Program January 2027` (`FP-JAN-2027`).
   - Active Token: `JAN2027`.
   - All visits to `/apply` or `/apply/` automatically redirect to `/apply/JAN2027`.
   - Token normalizer in backend accepts case-insensitive variations (`JAN2027`, `jan2027`) and handles legacy links gracefully.

2. **Purge of Legacy Data & Programs**:
   - Old programs (`Fellowship Program July 2026`, `Fellowship Program December 2026`, and `Test`) and their cascading records in `specialities`, `seat_matrix_entries`, and `payment_settings` have been permanently purged.
   - `db-bootstrap.ts` has been configured to never recreate legacy programs on reboot.
   - Only 2 active programs remain in the database:
     - `Fellowship Program January 2027` (65 seats across 13 hospital locations)
     - `Vision Care Technician (VCT) Entrance Examination 2026`

3. **Razorpay Online Application Checkout**:
   - Razorpay credentials synchronized directly with active intake.
   - Fee model set to standard ₹2,750 per specialty selected (e.g., 1 stream = ₹2,750; 2 streams = ₹5,500).
   - Order creation verified against live Razorpay APIs.
   - **Bulletproof Fallback**: In the event an applicant's browser blocks popups or has network issues, the system automatically offers Direct Bank / UPI transfer with UTR entry so no applicant is ever blocked.

4. **Call Letter Copy & Design Corrections**:
   - Official institutional text updated verbatim:
     > *"Sankara Eye Foundation is a group of 14 units across the country with a medical and support team of 3000, we perform over 3 Lakh vision restoring surgeries every year, with over 3 Million Free surgeries performed till date. Training at Sankara is coordinated by the Sankara Academy of Vision."*
   - Strict 2-Page standard layout preserved with high-resolution institutional logos and clean typography.
   - **Offline SMTP Graceful Fallback**: If Email SMTP credentials are not configured on the server, the system does **not** crash or return 500 errors. It records the letter issuance, updates candidate review notes, and provides the generated 2-page PDF for instant download.

5. **Cleaned Admin Interface**:
   - Obsolete "Live Logins & Session Security" tab removed from `DashboardPage.tsx`.
   - Sidebar cleaned to focus exclusively on:
     - **Dashboard**
     - **Applications & Admissions**
     - **Letters** (Call Letters & Offer Letters)
     - **Interview Evaluation**
     - **User Management**
     - **My Results** (for candidates)

6. **Web Server SPA Route Fix**:
   - Resolved Express root router configuration so browser requests to `/apply/JAN2027` serve the Single Page Application (`index.html`), while `/api/apply/JAN2027` serves the REST JSON data.

---

## 2. Docker Deployment Instructions

### Step 1: Clone or Pull Latest Code on Server
```bash
cd /opt/fellowshiprework
git pull origin main
```

### Step 2: Configure Environment (`.env`)
Create or edit your `.env` file:
```bash
# Port on host machine (default: 3002)
APP_PORT=3002

# Database settings for isolated PostgreSQL container (runs on port 5433 to avoid local conflict)
POSTGRES_DB=fellowship_db
POSTGRES_USER=fellowship_admin
POSTGRES_PASSWORD=FellowshipSecure2027!
HOST_DB_PORT=5433

# Razorpay Online Payment Gateway
RAZORPAY_KEY_ID=rzp_live_ddDz3Yp0860GqG
RAZORPAY_KEY_SECRET=LGVG9K6XjOwpHnfjfGMmgwxZ
VITE_RAZORPAY_KEY_ID=rzp_live_ddDz3Yp0860GqG

# Session Secret (random 64-char string)
SESSION_SECRET=a8f5c9e2b4d7f1a3c6e9d2b5f8a1c4e7d0b3f6a9c2e5d8b1f4a7c0e3d6b9f2a5

# Email SMTP (Optional - leave blank if SMTP server is not yet ready)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=admissions@sankaraeye.com
```

### Step 3: Build & Start Docker Containers
```bash
docker compose up -d --build
```

### Step 4: Verify Container Health
```bash
docker compose ps
docker compose logs -f fellowship-app
```
Look for the startup log:
```
[DB-BOOTSTRAP] Database connection established successfully.
[DB-BOOTSTRAP] Synchronized active application form for January intake (token: JAN2027).
[DB-BOOTSTRAP] Baseline data seeding and state rework completed.
Server listening and ready for requests: port 3002
```

---

## 3. Nginx Reverse Proxy for `learn.sankaraeye.in`

Create an Nginx configuration file on your host server (e.g., `/etc/nginx/sites-available/learn.sankaraeye.in`):

```nginx
server {
    server_name learn.sankaraeye.in;

    # Maximum file upload size for candidate CVs and certificates (50MB)
    client_max_body_size 50M;

    # Reverse proxy to the Docker app on port 3002
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
        proxy_read_timeout 120s;
    }

    listen 80;
}
```

Enable the site and test configuration:
```bash
sudo ln -s /etc/nginx/sites-available/learn.sankaraeye.in /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Install SSL Certificate via Certbot:
```bash
sudo certbot --nginx -d learn.sankaraeye.in
```

---

## 4. Canonical Super Admin Credentials

| Name | Email | Password | Role |
| :--- | :--- | :--- | :--- |
| **Dr. Saravanan** | `saravanan@sankaraeye.com` | `Saravanan@2026` | Super Administrator |
| **Prabhanjan** | `prabhanjan@sankaraeye.com` | `Prabhanjan@2026` | Super Administrator |
| **Radhika Saranam** | `radhika@sankaraeye.com` | `Radhika@2026` | Super Administrator |

---

## 5. Recovering / Reconciling Past Paid Applications

If any applicants paid before the Nginx upload limit was raised, their payments are saved in Razorpay.
Run this one command inside the project directory to automatically fetch them from Razorpay and create their application submissions:

```bash
docker compose exec fellowship-app pnpm run reconcile-razorpay
```
*(Or if running directly with Node/PM2: `pnpm run reconcile-razorpay`)*

This script automatically:
1. Queries Razorpay for all successful charges in the last 48 hours.
2. Identifies any payments missing in the database.
3. Automatically inserts the application record, generates their reference ID, and emails them their receipt!

