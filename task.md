# Tasks

## Approved Infrastructure & Performance Optimizations

- [x] Implement database connection pooling configurations in [index.ts (db package)](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/lib/db/src/index.ts)
- [x] Configure database read/write separation with `db` (writer) and `readDb` (reader) instances in [index.ts (db package)](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/lib/db/src/index.ts)
- [x] Add indexing to [candidates.ts](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/lib/db/src/schema/candidates.ts), [interviews.ts](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/lib/db/src/schema/interviews.ts), and [preferences.ts](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/lib/db/src/schema/preferences.ts)
- [x] Setup `CREATE INDEX IF NOT EXISTS` migration statements inside `runStartupFixes` in [index.ts (api-server)](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/api-server/src/index.ts)
- [x] Create server network IP auto-detection service [network.ts](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/api-server/src/lib/network.ts)
- [x] Expose public `GET /system-ip` endpoint in [health.ts](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/api-server/src/routes/health.ts)
- [x] Optimize scoring queries and eliminate O(N^2) search loops in [scoring.ts](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/api-server/src/lib/scoring.ts)
- [x] Optimize candidate listing and prevent full table scans on associated tables in [candidates.ts (routes)](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/api-server/src/routes/candidates.ts)
- [x] Route all query/SELECT endpoints to `readDb` (e.g. rankings, reports, dashboard, and candidates listing)
- [x] Integrate system network IP display in frontend:
  - [x] Update [LoginPage.tsx](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/fellowship-exam/src/pages/LoginPage.tsx) status banner
  - [x] Update [DashboardPage.tsx](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/fellowship-exam/src/pages/DashboardPage.tsx) header
  - [x] Update [ActiveSessionsPage.tsx](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/fellowship-exam/src/pages/ActiveSessionsPage.tsx) header
- [x] Verify build and compilation of the monorepo packages
- [x] Verify functionality end-to-end
- [/] Clean up Create Panel trigger variables in `InterviewsPage.tsx`
- [ ] Generalize the Candidate Dossier evaluation card in `InterviewsPage.tsx` to support both VIVA and Mind Matter panels
- [ ] Update success toast messages and enforce marksEntryEnabled checks inside the dossier view
- [ ] Verify frontend compilation by running a local build
- [ ] Manually verify persistence and layout functionality in the web browser
