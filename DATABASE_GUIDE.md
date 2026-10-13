# Database Implementation & Migration Guide

This document provides a comprehensive, step-by-step guide for implementing, managing, and migrating the Fellowship Exam System database. It is intended for senior developers and system administrators.

## 1. Architecture Overview

The application uses **PostgreSQL** as the primary database, with **Drizzle ORM** for schema definition, type safety, and migrations.

- **Dialect:** PostgreSQL
- **ORM:** Drizzle ORM
- **Driver:** `node-postgres` (pg)
- **Schema Location:** `lib/db/src/schema/*.ts`
- **Connection Logic:** `lib/db/src/index.ts`

---

## 2. Local Development Setup

### Prerequisites
- PostgreSQL 14+ installed locally.
- `pnpm` installed.

### Step-by-Step Implementation
1. **Provision Database:**
   Create a new database named `sankara_fellowship` (or as preferred).
   ```sql
   CREATE DATABASE sankara_fellowship;
   ```

2. **Environment Variables:**
   Update your `.env` file in the root directory with the local connection string:
   ```env
   DATABASE_URL=postgresql://<user>:<password>@localhost:5432/sankara_fellowship
   ```

3. **Install Dependencies:**
   ```bash
   pnpm install
   ```

4. **Generate & Push Schema:**
   Drizzle allows you to "push" changes directly for rapid development:
   ```bash
   pnpm --filter @workspace/db drizzle-kit push
   ```

---

## 3. Database Schema Reference

The database is divided into logical modules:
- **`users.ts`**: Admin and coordinator accounts.
- **`candidates.ts`**: Applicant profile data.
- **`application-forms.ts`**: Fellowship application submissions.
- **`exams.ts` & `units.ts`**: Exam scheduling and organizational structure.
- **`payment-settings.ts`**: Razorpay configurations.

You can find the full TypeScript definitions in: `lib/db/src/schema/`

---

## 4. Migrating Local Data to Server (Production)

To push your local database state (including data) to the server, follow these steps:

### Method A: Using the Automated Script (Recommended)

We have provided a PowerShell script to automate the `pg_dump` and `pg_restore` process.

1. **Location:** `scripts/push_local_to_server.ps1`
2. **Configuration:** Open the script and edit the `$Remote...` variables with the server's credentials.
3. **Execution:**
   ```powershell
   .\scripts\push_local_to_server.ps1
   ```

### Method B: Manual CLI Commands

If you prefer manual control:

1. **Dump Local Data:**
   ```bash
   pg_dump -h localhost -U postgres -d fellowship_db -Fc -f local_backup.dump
   ```

2. **Restore to Server:**
   ```bash
   pg_restore -h <SERVER_IP> -U <SERVER_USER> -d <SERVER_DB_NAME> --clean --no-owner --no-acl local_backup.dump
   ```

---

## 5. Server Side Configuration

Once the database is pushed, ensure the server's `.env` is updated:

1. **SSH into Server.**
2. **Update `.env`:**
   ```env
   DATABASE_URL=postgresql://<server_user>:<server_password>@localhost:5432/<server_db_name>
   ```
3. **Restart API Server:**
   ```bash
   pm2 restart fellowship-api
   ```

---

## 6. Maintenance & Backups

### Nightly Backups (Server)
Add a cron job to the server to perform daily backups:
```bash
crontab -e
# Add this line for 2 AM daily backup
0 2 * * * pg_dump -U sankara -d sankara_fellowship -Fc -f /var/backups/db_$(date +\%F).dump
```

---

## Troubleshooting
- **Connection Refused:** Ensure PostgreSQL is configured to allow remote connections (`pg_hba.conf`) if restoring from a remote machine.
- **Drizzle Sync:** If the schema seems out of sync, run `pnpm --filter @workspace/db drizzle-kit check` to verify consistency.

---

## 7. May 2026 Update (v1.0.6 Release) - Database Alignment

This update introduces the manual candidate stepped registration, Daily Reports, corrected payment multipliers, and PDF enhancements. To apply this update to a live/production database (e.g., `learn.sankaraeye.in`) without losing any existing application submissions or candidate data, perform the following two steps.

### Step 7.1: Add Missing Columns to the `candidates` Table
Run the following SQL commands on your PostgreSQL database to add the required columns for candidate score tracking:

```sql
-- Ensure mcq_score and psychometric_score columns exist in the candidates table
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "mcq_score" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "psychometric_score" text;
```

### Step 7.2: Run the Historical Candidate Preferences Sync Script
Historically, candidates approved with multiple specializations (e.g., `{"Cornea", "Phaco Refractive"}`) might have missing entries in the `candidate_preferences` table due to array-formatting mismatches in older versions. We have created a robust, non-destructive synchronization script that will populate this retroactively without any loss of live data.

1. **Verify Connection String:**
   Open the sync script: `artifacts/api-server/scratch/sync_preferences.mjs`.
   Ensure line 46 contains the correct connection string matching your server database credentials:
   ```javascript
   const connectionString = "postgresql://username:password@localhost:5432/your_database_name";
   ```
   *(Alternatively, you can modify it to read from `process.env.DATABASE_URL`).*

2. **Execute the Script:**
   From the root of the project (or inside `artifacts/api-server`), run:
   ```bash
   node artifacts/api-server/scratch/sync_preferences.mjs
   ```

This will output the number of records fixed and synchronized. The synchronizer is idempotent and safe to run multiple times.

---

## 8. June 2026 Update (v1.1.2 Release) - Specialty Deduplication & Multi-Doctor Marks Entry

This update introduces:
1. **Multi-Doctor Marks Entry & Averaging Logic:** Allows multiple doctors per panel to have Marks Entry Enabled. VIVA scores from all enabled doctors are averaged.
2. **Specialty Deduplication:** Automatically groups and deduplicates specialties in all dropdowns and displays.

To apply this update to your live production database (e.g. `learn.sankaraeye.in`):

### Step 8.1: Run the Specialty Deduplication & Cleanup Script
If your production database contains duplicate specialty records (e.g., from old imports or manual entries), you must run the cleanup script to merge duplicates and map all existing applications, preferences, panels, and scores to the standard 8 canonical specialties.

1. **Verify Connection String:**
   Make sure the `DATABASE_URL` environment variable is set on your server, or configure the connection string inside `artifacts/api-server/cleanup_specialities.mjs`.

2. **Execute the Script:**
   From the `artifacts/api-server` directory, run:
   ```bash
   node cleanup_specialities.mjs
   ```

This script will:
- Identify the 8 standard specialties: *Cornea, Glaucoma, IOL Fellowship, Medical Retina, Oculoplasty, Pediatric Ophthalmology, Phaco Refractive, Vitreo Retina*.
- Map any duplicate or non-standard specialty records to these 8 canonical records.
- Safely update all related tables (`allocations`, `applications`, `batch_candidates`, `candidate_preferences`, `doctor_assignments`, `interview_panels`, `interview_scores`).
- Delete all non-canonical specialty records from the `specialities` table.

### Step 8.2: Drop Legacy Unique Index (Automatic)
The backend startup server (`index.ts`) will automatically run a query to drop the legacy `panel_marks_entry_unq` index if it exists, enabling multiple doctors to be marked as entry-enabled simultaneously. If you need to perform this manually:
```sql
DROP INDEX IF EXISTS panel_marks_entry_unq;
```


