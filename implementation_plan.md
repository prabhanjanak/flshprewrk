# Speciality and Preferred Location Table Column & Excel Export Enhancements

This plan details the implementation to ensure that specialities and their corresponding selected center locations are displayed correctly as `Speciality: Location` badges in the **"Applied For"** column on the Submissions Queue page and formatted cleanly in all Excel exports.

## User Review Required

> [!NOTE]
> The change will update the display format of the "Applied For" column in the Submissions table, and matching columns in the downloaded Excel sheets, to combine the Specialization with the corresponding Town selection (e.g. `IOL: Jaipur, Ludhiana, Kanpur` or `Oculoplasty: Bangalore`).
> It will also robustly filter out any `"Not Applicable"` or empty center preferences from showing up as active specializations, resolving cases where a candidate applied for multiple specialities but only a subset was shown as active.

---

## Proposed Changes

### Frontend Component

#### [MODIFY] [ApplicationFormsPage.tsx](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/fellowship-exam/src/pages/ApplicationFormsPage.tsx)

- Define a normalization color helper `getSpecColorClass` to correctly map specialties (e.g. `"IOL"`, `"IOL Fellowship"`) to their corresponding colors in `SPEC_BADGE_COLORS` case-insensitively.
- Update the **"Applied For"** column rendering inside the Submissions queue table:
  - Parse the center preferences from `s.centerPreference` and `s.formData` using the existing `parseCenterPreferences` function.
  - Filter out any entries where the location is `"Not Applicable"` or empty.
  - If valid preferences are found, display them as badges with the format `${speciality}: ${location}` (e.g. `Oculoplasty: Bangalore`).
  - Fall back to mapping over specialization list if no center preferences are found.

---

### Backend API Routes

#### [MODIFY] [application-forms.ts](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/api-server/src/routes/application-forms.ts)

- Update the export route `GET /application-forms/:id/export`:
  - Implement a backend `getCenterPrefs` helper that parses `s.centerPreference` and merges it with custom answers from `s.formData` and `s.customAnswers` to capture all preferences.
  - Format the `"Specialities"` (and `"Select 1 option from the dropbox"`) columns in the Excel row by mapping the parsed center preferences where the location is not `"Not Applicable"` (case-insensitive) or empty.
  - Semicolon-separate multiple specialities, formatting them as `Speciality1: Location1; Speciality2: Location2` (e.g. `Glaucoma: Coimbatore, Bangalore, Guntur; Medical Retina: Coimbatore, Bangalore, Guntur`).

#### [MODIFY] [candidates.ts](file:///c:/Users/HP/Documents/Sankara/New_Project/2%20EXAM%20OPS%20SYSTEM%2520FOR%2520DOCTORS/Projects/Version%2520Zips/v1.0.2/savprojectv2-version2/artifacts/api-server/src/routes/candidates.ts)

- Update the candidates export route `GET /candidates/export`:
  - Fetch all active forms to map center preferences from the candidate's linked submission.
  - Implement the exact same `getCenterPrefs` parser to format the `"Specialities"` column in the candidates' Excel sheets using the unified `Speciality: Center` list, filtering out `"Not Applicable"`.
  - Format the `"Preferred Center"` column in the Excel sheets so it is a readable semicolon-separated string of active preferences (e.g. `Cornea: Bangalore; Phaco Refractive: Bangalore`) rather than raw JSON.

---

## Verification Plan

### Automated Verifications
- Build the frontend and backend to check for compile errors:
  - Frontend: `npm run build` or `pnpm build` under the frontend folder
  - Backend: TypeScript compilation check

### Manual Verification
1. Open the Submissions Queue page for any application form.
2. Confirm that the **"Applied For"** column lists both specialities and selected center locations beautifully as styled badges (e.g., `IOL: Jaipur, Ludhiana, Kanpur`), filtering out any `"Not Applicable"` options.
3. Click the **"Excel Export"** button in Submissions queue. Download the sheet and check that:
   - `"Specialities"` column lists `Speciality: Selected Town` properly.
4. Click the **"Download Candidates Excel"** button in Candidates Directory. Verify that the `"Specialities"` and `"Preferred Center"` columns are cleanly formatted strings and do not contain raw JSON or `"Not Applicable"` preferences.
