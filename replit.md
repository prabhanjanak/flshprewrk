# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Build**: esbuild (API server)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

---

## Fellowship Exam Management System (`artifacts/fellowship-exam`)

React + Vite + TypeScript admin portal at `/admin`. Express.js API at `artifacts/api-server` (port 8080). Vite proxies `/admin/api → http://localhost:8080`.

### Branding
- Orange: `#ff7a00 → #ff9f43`
- Dark Blue: `#0b1f3a`
- Only `@sankaraeye.com` emails allowed

### Roles
| Role | Access |
|------|--------|
| `super_admin` | Full system access |
| `program_admin` | Programs, candidates, exams, interviews |
| `central_exam_coordinator` | Coordinator/doctor management, candidates, exams |
| `unit_coordinator` | Candidates in their unit only |
| `doctor` | Interview assignments + submit scores |
| `student` | Exam portal (artifacts/fellowship) |
| `display_operator` | Waiting Hall display only (/display) |

### Auth Flow
- JWT stored in `localStorage` as `fellowship_token`
- `AuthContext` provides `user`, `login`, `logout`, `refreshUser`
- `forcePasswordReset: true` → all navigation intercepted by `ForcePasswordResetPage`
- New users get `Welcome@123` + `forcePasswordReset = true`
- `POST /auth/change-password` — change own password (clears force reset)
- `POST /auth/admin-reset-password` — super_admin resets any user's password (sets force reset)

### Seed Credentials
- `saravanan@sankaraeye.com` / `Saravanan@2026` — super_admin (canonical, no force reset)
- `coordinator@sankaraeye.com` / `Welcome@123` — central_exam_coordinator (force reset)
- `doctor@sankaraeye.com` / `Welcome@123` — doctor (force reset)
- `student@sankaraeye.com` / `Welcome@123` — student (force reset)
- 14× `unitcoord.<unitname>@sankaraeye.com` / `Welcome@123` — unit coordinators (force reset)

### DB Schema Notable Columns
- `users.force_password_reset` boolean — set true on new user creation or admin reset

### API Routes (api-server on :8080)
- `POST /auth/login` — returns `{ token, user: { forcePasswordReset } }`
- `GET /auth/me` — returns current user with `forcePasswordReset`
- `POST /auth/change-password` — `{ currentPassword, newPassword }` — clears force reset
- `POST /auth/admin-reset-password` — super_admin only — sets force reset
- `GET /users` — all users with `forcePasswordReset` flag
- `POST /users` — create user (auto Welcome@123, force reset)
- `PATCH /users/:id` — edit name/role/unit/active
- `DELETE /users/:id` — super_admin only
- `GET /candidates` — allows unit_coordinator (auto-filters by their unit)
- `GET /dashboard/summary` — returns `units`, `pendingReview`, `activeExams` (unit-scoped for unit_coordinator)
- `GET /interviews/doctor-assignments` — all doctors + their assigned candidates
- `POST /interviews/assign` — assign candidate to doctor
- `DELETE /interviews/assign/:id` — remove assignment
- `GET /interviews/scores` — all scores with candidate/doctor names
- `PATCH /candidates/:id/marks` — save MCQ/psychometric scores; optional `panelId` adds candidate to panel queue

### Panel Management (interview_panels, interview_panel_members, panel_queue tables)
- `GET /panels` — all panels with members array
- `POST /panels` — create panel `{ name, roomNumber }`
- `PATCH /panels/:id` — update `{ name?, roomNumber?, isActive? }`
- `DELETE /panels/:id` — delete panel
- `POST /panels/:id/members` — add doctor `{ doctorId, isMain? }`
- `DELETE /panels/:id/members/:doctorId` — remove doctor
- `GET /panels/:id/queue` — queue entries for panel
- `POST /panels/:id/queue` — add candidate `{ candidateId }`
- `PATCH /panels/:id/queue/:candidateId` — update status `{ status: waiting|in_progress|done }`
- `DELETE /panels/:id/queue/:candidateId` — remove from queue
- `GET /display/live` — TV display data: all panels with current + next queue

### Email Notifications
- `artifacts/api-server/src/lib/email.ts` — nodemailer service
- Env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Gracefully skips if SMTP vars not set
- Wired into `POST /application-forms/:id/approve` — sends approval email

### Display / Waiting Hall
- Route `/display` — TV-friendly dark page for waiting hall, no sidebar
- Auto-refreshes every 5s; shows each panel's current candidate + next 3 in queue
- Accessible to `display_operator` role (sidebar shows "Waiting Hall" link)
- API: `GET /display/live` — public endpoint

### UI Improvements
- SeatMatrixPage: programs shown as pill tabs (auto-selects first); no dropdown
- AllocationsPage: programs shown as pill tabs (auto-selects first); includes seat availability summary table
- InterviewsPage: default tab is "Interview Panels" with full CRUD + queue management
- CandidatesPage marks dialog: optional panel assignment dropdown

---

## Fellowship Entrance Exam Portal (`artifacts/fellowship`)

Student-facing application form at `/`. React + Vite + Tailwind. Multi-step form with clinical skills tables (use `bg-background` not `bg-white` for dark-mode compatibility).
