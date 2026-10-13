FELLOWSHIP PORTAL - UI/UX MODERNIZATION UPDATE v1.0.4
=====================================================

This update completes the "Command Center" modernization and addresses critical 
workflow gaps identified during administrative testing.

FILES INCLUDED IN THIS PACKAGE:
-------------------------------
1. src/pages/LoginPage.tsx            - Modernized "Institutional Gateway" UI.
2. src/pages/DashboardPage.tsx        - Fixed header truncation & Cycle Report download.
3. src/pages/CandidatesPage.tsx       - Implemented Manual Entry flow & Payment fixes.
4. src/pages/ApplicationFormsPage.tsx - Added Manual Entry buttons to forms.
5. src/pages/BatchesPage.tsx          - Fixed program selection in Batch Protocol.
6. src/pages/ProfilePage.tsx          - Centralized SMTP & Seed Registry settings.
7. src/components/AppSidebar.tsx      - Navigation cleanup (removed legacy routes).
8. src/App.tsx                        - Routing updates for system stability.

INSTALLATION INSTRUCTIONS:
--------------------------
1. Connect to the server via FTP/SFTP.
2. Navigate to the frontend source directory: `/artifacts/fellowship-exam/`.
3. Replace the existing files with the versions provided in this ZIP.
4. If running in production mode, rebuild the application:
   npm run build
5. Refresh the browser cache (Ctrl+F5) to see the new animations and layout fixes.

KEY ENHANCEMENTS:
-----------------
- MANUAL ENTRY: Admins can now fill full application forms on behalf of candidates 
  directly from the Candidates or Application Forms pages.
- PAYMENT VISIBILITY: Verified candidates now explicitly show "PAID (Verified)" 
  if the granular payment record is archived or missing.
- COMMAND CENTER: Full responsive layout for the login page and dashboard headers.
- LOGISTICS: Fixed "Deploy Batch Protocol" errors related to program selection.

DATABASE CHANGES:
-----------------
No database schema changes (migrations) are required for this update.

-----------------------------------------------------
PREPARED BY: ANTIGRAVITY AI CODING ASSISTANT
DATE: 16 MAY 2026
