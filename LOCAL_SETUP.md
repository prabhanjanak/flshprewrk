# Sankara Fellowship Exam System — Local Setup Guide
### Run the full system on your laptop (Windows & Linux)

---

## What you get
| Component | Technology | Port |
|-----------|-----------|------|
| API / Backend | Node.js + Express | 8080 |
| Admin Web App | React + Vite (served by API) | 8080 |
| Database | PostgreSQL | 5432 |

After setup, open: **http://localhost:8080/admin**  
Login: `saravanan@sankaraeye.com` / `Saravanan@2026`

---

## PART A — Windows Setup

### A1. Install Prerequisites

Install these tools once (download and run the installer):

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 20 LTS or 22 LTS | https://nodejs.org/ |
| pnpm | latest | (step below) |
| PostgreSQL | 15 or 16 | https://www.postgresql.org/download/windows/ |
| Git (optional) | latest | https://git-scm.com/ |

After Node.js is installed, open **Command Prompt** (cmd) and run:
```
npm install -g pnpm
```

Verify everything works:
```
node --version
pnpm --version
psql --version
```

---

### A2. Extract the Project

Right-click the downloaded `fellowship-exam-deploy.zip` and select **Extract All**.  
This creates a folder called `fellowship-platform`. Remember where it is.

Open **Command Prompt** and navigate to it:
```
cd C:\Users\YourName\Downloads\fellowship-platform
```

---

### A3. Create the Database

Open the **Start Menu**, search for **psql**, and open the PostgreSQL shell (enter your superuser password when prompted).

Inside psql, run these commands **one at a time**:
```sql
CREATE DATABASE sankara_fellowship;
CREATE USER sankara WITH PASSWORD 'sankara_dev';
GRANT ALL PRIVILEGES ON DATABASE sankara_fellowship TO sankara;
\q
```

---

### A4. Create the .env File

Inside the `fellowship-platform` folder, create a new file called **`.env`**  
(in Notepad: File → Save As → type `.env` → change "Save as type" to "All Files").

Paste this content:
```
DATABASE_URL=postgresql://sankara:sankara_dev@localhost:5432/sankara_fellowship
JWT_SECRET=replace-this-with-a-long-random-string-abc123xyz
SESSION_SECRET=replace-this-with-another-long-random-string-def456uvw
NODE_ENV=production
PORT=8080
BASE_PATH=/admin
```

To generate strong random secrets, run this in Command Prompt:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Run it twice — use the first output for `JWT_SECRET` and the second for `SESSION_SECRET`.

---

### A5. Install Dependencies

In Command Prompt (inside the `fellowship-platform` folder):
```
pnpm install
```
This downloads all packages. It may take 2–5 minutes the first time.

---

### A6. Set Up the Database Schema

```
pnpm --filter @workspace/db run push
```

This creates all the database tables automatically.

---

### A7. Build the Application

```
pnpm --filter @workspace/fellowship-exam run build
pnpm --filter @workspace/api-server run build
```

---

### A8. Start the Server

```
node artifacts\api-server\dist\index.mjs
```

You should see:
```
{"level":"info","msg":"Server listening","port":8080}
```

Open your browser and go to: **http://localhost:8080/admin**

---

### A9. Login

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `saravanan@sankaraeye.com` | `Saravanan@2026` |

The super admin can create additional users from the Users section.

---

### A10. Keep it Running (Windows — optional)

To run the server in the background without keeping a terminal open, install PM2:
```
npm install -g pm2
pm2 start "node artifacts\api-server\dist\index.mjs" --name fellowship
pm2 save
pm2 startup
```

---

## PART B — Linux Setup (Ubuntu / Debian)

### B1. Install Prerequisites

Open a terminal and run:
```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
npm install -g pnpm

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Verify:
```bash
node --version    # v20.x
pnpm --version
psql --version
```

---

### B2. Extract the Project

```bash
cd ~
unzip fellowship-exam-deploy.zip -d fellowship-platform
cd fellowship-platform
```

---

### B3. Create the Database

```bash
sudo -u postgres psql -c "CREATE DATABASE sankara_fellowship;"
sudo -u postgres psql -c "CREATE USER sankara WITH PASSWORD 'sankara_dev';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE sankara_fellowship TO sankara;"
```

---

### B4. Create the .env File

```bash
nano .env
```

Paste this content:
```
DATABASE_URL=postgresql://sankara:sankara_dev@localhost:5432/sankara_fellowship
JWT_SECRET=replace-this-with-a-long-random-string
SESSION_SECRET=replace-this-with-another-long-random-string
NODE_ENV=production
PORT=8080
BASE_PATH=/admin
```

Generate strong secrets:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Save and exit: `Ctrl+X` → `Y` → `Enter`

---

### B5. Install Dependencies

```bash
pnpm install
```

---

### B6. Set Up the Database Schema

```bash
pnpm --filter @workspace/db run push
```

---

### B7. Build the Application

```bash
pnpm --filter @workspace/fellowship-exam run build
pnpm --filter @workspace/api-server run build
```

---

### B8. Start the Server

**For testing (foreground — stops when you close terminal):**
```bash
PORT=8080 node artifacts/api-server/dist/index.mjs
```

**For production (background with PM2):**
```bash
sudo npm install -g pm2
pm2 start "node artifacts/api-server/dist/index.mjs" --name fellowship
pm2 save
pm2 startup
# Run the command that pm2 prints (it starts with "sudo env ...")
```

Open your browser: **http://localhost:8080/admin**

---

### B9. Login

| Email | Password |
|-------|----------|
| `saravanan@sankaraeye.com` | `Saravanan@2026` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `pnpm: command not found` | Run `npm install -g pnpm` and reopen the terminal |
| `Port 8080 already in use` | Change `PORT=8081` in `.env` |
| `Database connection error` | Check PostgreSQL is running: `pg_isready` (Linux) or check Services app (Windows) |
| `Cannot find module` errors | Run `pnpm install` again |
| Schema errors after update | Run `pnpm --filter @workspace/db run push` again |
| `ENOENT .env` error | Make sure `.env` is in the **root** of the project folder, not inside any subfolder |

---

## Updating After Code Changes

```bash
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/fellowship-exam run build
pnpm --filter @workspace/api-server run build
pm2 restart fellowship
```

---

## Stopping the Server

- **With PM2:** `pm2 stop fellowship`
- **Without PM2:** Press `Ctrl + C` in the terminal
