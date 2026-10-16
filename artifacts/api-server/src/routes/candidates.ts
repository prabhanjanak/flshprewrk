import { Router } from "express";
import { eq, desc, and, inArray, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db,
  readDb,
  candidatesTable,
  unitsTable,
  usersTable,
  programsTable,
  specialitiesTable,
  candidatePreferencesTable,
  documentsTable,
  examAttemptsTable,
  examsTable,
  interviewScoresTable,
  auditLogsTable,
  doctorAssignmentsTable,
  candidateExamAssignmentsTable,
  applicationSubmissionsTable,
  documentTemplatesTable,
  applicationsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendOfferLetterEmail, sendOfferLetterWithAttachment, sendCallLetterWithAttachment } from "../lib/email";
import { processGoogleDocTemplate } from "../lib/google-docs";
import { emailSettingsTable, applicationFormsTable, batchesTable, batchCandidatesTable } from "@workspace/db";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs/promises";
import { parseSpecializationString, formatDOBToStandard, formatToLocalDateTime } from "../lib/utils";
import { generateCallLetterPdf, generateOfferLetterPdf, isRetinaSpecialty } from "../lib/letters";
import * as XLSX from "xlsx";
import * as archiverPkg from "archiver";

const archiver: any = (archiverPkg as any)?.default || archiverPkg;

const router: Router = Router();

async function fullCandidate(c: typeof candidatesTable.$inferSelect) {
  const units = await db.select().from(unitsTable);
  const unit = c.unitId ? units.find((u) => u.id === c.unitId) : null;
  const prefs = await db.select().from(candidatePreferencesTable).where(eq(candidatePreferencesTable.candidateId, c.id));
  const specs = await db.select().from(specialitiesTable);
  const programs = await db.select().from(programsTable);
  const docs = await db.select().from(documentsTable).where(eq(documentsTable.candidateId, c.id));
  const attempts = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.candidateId, c.id));
  const exams = await db.select().from(examsTable);
  const interviews = await db.select().from(interviewScoresTable).where(eq(interviewScoresTable.candidateId, c.id));
  const apps = await db.select().from(applicationsTable).where(eq(applicationsTable.candidateId, c.id));

  // Find linked submission by candidateId or email
  const [sub] = await db.select().from(applicationSubmissionsTable).where(
    or(
      eq(applicationSubmissionsTable.candidateId, c.id),
      eq(applicationSubmissionsTable.email, c.email)
    )
  );

  const mcqAttempts = attempts.filter((a) => {
    const e = exams.find((x) => x.id === a.examId);
    return e?.kind === "mcq";
  });
  const psychoAttempts = attempts.filter((a) => {
    const e = exams.find((x) => x.id === a.examId);
    return e?.kind?.startsWith("psychometric");
  });
  const mcqScore = mcqAttempts.length > 0
    ? mcqAttempts.reduce((s, a) => s + (a.score ?? 0), 0) / mcqAttempts.length
    : (c.mcqScore ? parseFloat(c.mcqScore) : null);
  const psychometricScore = psychoAttempts.length > 0
    ? psychoAttempts.reduce((s, a) => s + (a.score ?? 0), 0) / psychoAttempts.length
    : (c.psychometricScore ? parseFloat(c.psychometricScore) : null);
  const interviewScore = interviews.length > 0
    ? interviews.reduce((s, i) => s + i.score, 0) / interviews.length
    : null;

  const totalScore = (mcqScore != null || psychometricScore != null || interviewScore != null)
    ? (mcqScore ?? 0) + (psychometricScore ?? 0) + (interviewScore ?? 0)
    : null;

  let resolvedPrefs = prefs.sort((a, b) => a.preferenceOrder - b.preferenceOrder).map((p) => {
    const sp = specs.find((s) => s.id === p.specialityId);
    const pg = sp ? programs.find((g) => g.id === sp.programId) : null;
    return {
      id: p.id,
      specialityId: p.specialityId,
      specialityName: sp?.name ?? "",
      specialityCode: sp?.code ?? "",
      programName: pg?.name ?? "",
      preferenceOrder: p.preferenceOrder,
    };
  });

  if (resolvedPrefs.length === 0 && sub?.specialization) {
    const parsedSpecs = parseSpecializationString(sub.specialization);
    resolvedPrefs = parsedSpecs.map((specName, index) => {
      const sp = specs.find((s) => s.name.toLowerCase() === specName.toLowerCase());
      const pg = sp ? programs.find((g) => g.id === sp.programId) : null;
      return {
        id: -(index + 1), // virtual ID
        specialityId: sp?.id ?? 0,
        specialityName: sp?.name ?? specName,
        specialityCode: sp?.code ?? "",
        programName: pg?.name ?? "",
        preferenceOrder: index + 1,
      };
    });
  }

  const specializations = resolvedPrefs.map((p) => p.specialityName).filter(Boolean);

  // Ensure every resolved preference has an application record with a hall ticket number
  const appSpecIds = new Set(apps.map((a) => a.specialityId));
  for (const pref of resolvedPrefs) {
    if (pref.specialityId && pref.specialityId > 0 && !appSpecIds.has(pref.specialityId)) {
      const sp = specs.find((s) => s.id === pref.specialityId);
      const prefix = sp?.code ? sp.code.toUpperCase() : "GEN";
      const year = 2026;
      try {
        const countResult = await db.execute(sql`
          SELECT COUNT(*)::int as count FROM applications WHERE speciality_id = ${pref.specialityId} AND hall_ticket_number IS NOT NULL
        `);
        const seq = Number(countResult.rows[0]?.count ?? 0) + 1;
        const hallTicketNumber = `${prefix}-${year}-${String(seq).padStart(3, "0")}`;
        const [newApp] = await db.insert(applicationsTable).values({
          candidateId: c.id,
          specialityId: pref.specialityId,
          hallTicketNumber,
          status: "approved",
        }).returning();
        if (newApp) {
          apps.push(newApp);
          appSpecIds.add(pref.specialityId);
        }
      } catch {
        // Fallback in-memory application representation if already existing or read-only
        apps.push({
          id: -pref.specialityId,
          candidateId: c.id,
          specialityId: pref.specialityId,
          hallTicketNumber: `${prefix}-${year}-001`,
          status: "approved",
          batchId: null,
          interviewSlot: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
      }
    }
  }

  // Map applied specialities with existing interview scores
  const appliedSpecialities = resolvedPrefs.map((p) => {
    const scoreEntry = interviews.find((i) => i.specialityId === p.specialityId);
    return {
      specialityId: p.specialityId,
      specialityName: p.specialityName,
      specialityCode: p.specialityCode,
      preferenceOrder: p.preferenceOrder,
      score: scoreEntry ? scoreEntry.score : null,
      remarks: scoreEntry ? scoreEntry.remarks : null,
      submittedAt: scoreEntry?.submittedAt ? scoreEntry.submittedAt.toISOString() : null,
      doctorId: scoreEntry ? scoreEntry.doctorId : null,
    };
  });

  return {
    id: c.id,
    candidateCode: c.candidateCode,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    unitId: c.unitId,
    unitName: unit?.name ?? null,
    status: c.status,
    mcqScore,
    psychometricScore,
    interviewScore,
    totalScore,
    rank: null,
    createdAt: c.createdAt.toISOString(),
    dateOfBirth: formatDOBToStandard(c.dateOfBirth),
    gender: c.gender || sub?.gender || null,
    qualification: c.qualification || sub?.degree || null,
    collegeName: c.collegeName || sub?.medicalCollege || null,
    address: c.address || sub?.permanentAddress || null,
    specializations,
    preferences: resolvedPrefs,
    appliedSpecialities,
    interviewScores: interviews.map((i) => ({
      id: i.id,
      specialityId: i.specialityId,
      doctorId: i.doctorId,
      score: i.score,
      remarks: i.remarks,
      submittedAt: i.submittedAt.toISOString(),
    })),
    documents: docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      fileName: d.fileName,
      fileUrl: d.fileUrl ?? null,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    attempts: attempts.map((a) => {
      const e = exams.find((x) => x.id === a.examId);
      return {
        id: a.id,
        examId: a.examId,
        examTitle: e?.title ?? "",
        examKind: e?.kind ?? "",
        score: a.score,
        maxScore: a.maxScore,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        startedAt: a.startedAt.toISOString(),
      };
    }),
    paymentInfo: sub ? {
      amount: sub.paidAmount ? (sub.paidAmount > 100000 ? sub.paidAmount / 100 : sub.paidAmount) : null,
      id: sub.paymentId,
      mode: sub.paymentMode
    } : null,
    centerPreference: sub?.centerPreference ?? null,
    submissionId: sub?.id ?? null,
    reviewNotes: sub?.reviewNotes ?? null,
    pgQualifications: sub?.pgQualifications ?? null,
    applications: apps.map((a) => ({
      id: a.id,
      specialityId: a.specialityId,
      hallTicketNumber: a.hallTicketNumber,
      status: a.status,
      batchId: a.batchId,
      interviewSlot: a.interviewSlot,
    })),
    // Detailed application submission fields for doctor view
    submission: sub ? {
      id: sub.id,
      applicationId: sub.applicationId,
      fullName: sub.fullName,
      email: sub.email,
      phone: sub.phone,
      dateOfBirth: formatDOBToStandard(sub.dateOfBirth),
      gender: sub.gender,
      maritalStatus: sub.maritalStatus,
      spouseDetails: sub.spouseDetails,
      permanentAddress: sub.permanentAddress,
      mailingAddress: sub.mailingAddress,
      degree: sub.degree,
      medicalCollege: sub.medicalCollege,
      university: sub.university,
      medicalCouncilNumber: sub.medicalCouncilNumber,
      pgQualifications: sub.pgQualifications,
      doQualification: sub.doQualification,
      doDetails: sub.doDetails,
      msMdQualification: sub.msMdQualification,
      msMdDetails: sub.msMdDetails,
      dnbQualification: sub.dnbQualification,
      dnbDetails: sub.dnbDetails,
      otherTraining: sub.otherTraining,
      diagnosticSkills: sub.diagnosticSkills,
      surgicalExperience: sub.surgicalExperience,
      totalSurgeries: sub.totalSurgeries,
      publications: sub.publications,
      presentations: sub.presentations,
      healthDeclaration: sub.healthDeclaration,
      healthDetails: sub.healthDetails,
      medicalConditions: sub.medicalConditions,
      previousApplicationMonthYear: sub.previousApplicationMonthYear,
      referralSource: sub.referralSource,
      referredByName: sub.referredByName,
      mediaSource: sub.mediaSource,
      lor1Url: sub.lor1Url,
      lor1RefName: sub.lor1RefName,
      lor1RefContact: sub.lor1RefContact,
      lor1RefEmail: sub.lor1RefEmail,
      lor2Url: sub.lor2Url,
      lor2RefName: sub.lor2RefName,
      lor2RefContact: sub.lor2RefContact,
      lor2RefEmail: sub.lor2RefEmail,
      photoUrl: sub.photoUrl,
      paymentUrl: sub.paymentUrl,
      otherInformation: sub.otherInformation,
      customAnswers: sub.customAnswers ?? null,
      formData: sub.formData ?? null,
      declarationAccepted: sub.declarationAccepted ?? null,
      submittedAt: sub.submittedAt ? sub.submittedAt.toISOString() : null,
    } : null,
  };
}

// GET /candidates — list candidates
router.get("/candidates", requireAuth, async (req, res) => {
  const programId = req.query["programId"] ? Number(req.query["programId"]) : null;
  const unitIdRaw = req.query["unitId"] ? Number(req.query["unitId"]) : undefined;
  const status = req.query["status"] as string | undefined;

  // Unit coordinator: force-filter to their unit
  let effectiveUnit = unitIdRaw;
  if (req.user!.role === "unit_coordinator") {
    const [u] = await readDb.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
    effectiveUnit = u?.unitId ?? -1;
  }

  let candidates = await readDb.select().from(candidatesTable)
    .where(eq(candidatesTable.isMock, (req as any).isMockMode))
    .orderBy(desc(candidatesTable.createdAt));
  if (effectiveUnit !== undefined) candidates = candidates.filter((c) => c.unitId === effectiveUnit);
  if (status) candidates = candidates.filter((c) => c.status === status);

  if (programId) {
    const specs = await readDb.select().from(specialitiesTable).where(eq(specialitiesTable.programId, programId));
    const forms = await readDb.select().from(applicationFormsTable).where(eq(applicationFormsTable.programId, programId));
    const specIds = new Set(specs.map((s) => s.id));
    const formIds = new Set(forms.map((f) => f.id));

    const candIdsFromPrefs = specIds.size > 0 
      ? (await readDb.select({ candidateId: candidatePreferencesTable.candidateId }).from(candidatePreferencesTable).where(inArray(candidatePreferencesTable.specialityId, [...specIds]))).map(p => p.candidateId)
      : [];
    const candIdsFromApps = specIds.size > 0
      ? (await readDb.select({ candidateId: applicationsTable.candidateId }).from(applicationsTable).where(inArray(applicationsTable.specialityId, [...specIds]))).map(a => a.candidateId)
      : [];
    const candIdsFromSubs = formIds.size > 0
      ? (await readDb.select({ candidateId: applicationSubmissionsTable.candidateId }).from(applicationSubmissionsTable).where(inArray(applicationSubmissionsTable.formId, [...formIds]))).map(s => s.candidateId).filter((id): id is number => typeof id === "number" && id > 0)
      : [];

    const allowedCandIds = new Set([...candIdsFromPrefs, ...candIdsFromApps, ...candIdsFromSubs]);
    candidates = candidates.filter((c) => allowedCandIds.has(c.id));
  }

  let units: any[] = [];
  let allPrefs: any[] = [];
  let allSpecs: any[] = [];
  let allDocs: any[] = [];
  let allSubmissions: any[] = [];
  let allApplications: any[] = [];
  let allScores: any[] = [];

  if (candidates.length > 0) {
    const candidateIds = candidates.map((c) => c.id);
    const emails = candidates.map((c) => c.email.toLowerCase().trim()).filter(Boolean);

    units = await readDb.select().from(unitsTable);
    allPrefs = await readDb.select().from(candidatePreferencesTable).where(inArray(candidatePreferencesTable.candidateId, candidateIds));
    allSpecs = await readDb.select().from(specialitiesTable);
    allDocs = await readDb.select().from(documentsTable).where(inArray(documentsTable.candidateId, candidateIds));
    allSubmissions = emails.length > 0 
      ? await readDb.select().from(applicationSubmissionsTable).where(
          or(
            inArray(applicationSubmissionsTable.candidateId, candidateIds),
            inArray(sql`LOWER(email)`, emails)
          )
        )
      : await readDb.select().from(applicationSubmissionsTable).where(inArray(applicationSubmissionsTable.candidateId, candidateIds));
    allApplications = await readDb.select().from(applicationsTable).where(inArray(applicationsTable.candidateId, candidateIds));
    allScores = await readDb.select().from(interviewScoresTable).where(inArray(interviewScoresTable.candidateId, candidateIds));
  }

  const unitsMap = new Map(units.map(u => [u.id, u]));
  const specsMap = new Map(allSpecs.map(s => [s.id, s]));

  const prefsByCandidate = new Map<number, typeof allPrefs>();
  for (const p of allPrefs) {
    if (!prefsByCandidate.has(p.candidateId)) prefsByCandidate.set(p.candidateId, []);
    prefsByCandidate.get(p.candidateId)!.push(p);
  }

  const docsByCandidate = new Map<number, typeof allDocs>();
  for (const d of allDocs) {
    if (!docsByCandidate.has(d.candidateId)) docsByCandidate.set(d.candidateId, []);
    docsByCandidate.get(d.candidateId)!.push(d);
  }

  const submissionsByCandidate = new Map<number, typeof allSubmissions[0]>();
  const submissionsByEmail = new Map<string, typeof allSubmissions[0]>();
  for (const s of allSubmissions) {
    if (s.candidateId) submissionsByCandidate.set(s.candidateId, s);
    if (s.email) submissionsByEmail.set(s.email.toLowerCase().trim(), s);
  }

  const scoresByCandidate = new Map<number, typeof allScores>();
  for (const s of allScores) {
    if (!scoresByCandidate.has(s.candidateId)) scoresByCandidate.set(s.candidateId, []);
    scoresByCandidate.get(s.candidateId)!.push(s);
  }

  const out = candidates.map((c) => {
    const unit = c.unitId ? unitsMap.get(c.unitId) : null;
    const prefs = (prefsByCandidate.get(c.id) || [])
      .sort((a, b) => a.preferenceOrder - b.preferenceOrder);
    let specializations = prefs
      .map((p) => specsMap.get(p.specialityId)?.name ?? "")
      .filter(Boolean);
    if (specializations.length === 0) {
      const sub = submissionsByCandidate.get(c.id) || (c.email ? submissionsByEmail.get(c.email.toLowerCase().trim()) : null);
      if (sub && sub.specialization) {
        specializations = parseSpecializationString(sub.specialization);
      }
    }
    const documents = (docsByCandidate.get(c.id) || [])
      .map((d) => ({ id: d.id, docType: d.docType, fileName: d.fileName, fileUrl: d.fileUrl }));
    const candScores = scoresByCandidate.get(c.id) || [];
    const sub = submissionsByCandidate.get(c.id) || (c.email ? submissionsByEmail.get(c.email.toLowerCase().trim()) : null);

    return {
      id: c.id,
      candidateCode: c.candidateCode,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      unitId: c.unitId,
      unitName: unit?.name ?? null,
      status: c.status,
      specializations,
      preferences: prefs.map((p) => ({
        id: p.id,
        specialityId: p.specialityId,
        preferenceOrder: p.preferenceOrder
      })),
      documents,
      mcqScore: c.mcqScore ? parseFloat(c.mcqScore) : null,
      psychometricScore: c.psychometricScore ? parseFloat(c.psychometricScore) : null,
      interviewScore: candScores.length > 0 ? candScores.reduce((acc: number, s: any) => acc + s.score, 0) / candScores.length : null,
      totalScore: (() => {
        const mcq = c.mcqScore ? parseFloat(c.mcqScore) : null;
        const psy = c.psychometricScore ? parseFloat(c.psychometricScore) : null;
        const intv = candScores.length > 0 ? candScores.reduce((acc: number, s: any) => acc + s.score, 0) / candScores.length : null;
        return (mcq !== null || psy !== null || intv !== null) ? (mcq ?? 0) + (psy ?? 0) + (intv ?? 0) : null;
      })(),
      rank: null,
      createdAt: c.createdAt.toISOString(),
      dateOfBirth: formatDOBToStandard(c.dateOfBirth),
      gender: c.gender,
      qualification: c.qualification,
      collegeName: c.collegeName,
      address: c.address,
      photoUrl: sub?.photoUrl || documents.find(d => d.docType?.toLowerCase().includes("photo"))?.fileUrl || null,
      lor1Url: sub?.lor1Url || documents.find(d => d.docType?.includes("LOR1"))?.fileUrl || null,
      lor2Url: sub?.lor2Url || documents.find(d => d.docType?.includes("LOR2"))?.fileUrl || null,
      lor1RefName: sub?.lor1RefName || null,
      lor2RefName: sub?.lor2RefName || null,
      paymentInfo: (() => {
        const s = sub || allSubmissions.find(s => s.email?.toLowerCase() === c.email?.toLowerCase());
        if (!s) return null;
        return {
          amount: s.paidAmount ? (s.paidAmount > 100000 ? s.paidAmount / 100 : s.paidAmount) : null,
          id: s.paymentId,
          mode: s.paymentMode
        };
      })(),
      centerPreference: sub?.centerPreference ?? null,
      submissionId: sub?.id ?? null,
      reviewNotes: sub?.reviewNotes ?? null,
      pgQualifications: sub?.pgQualifications ?? null,
      applications: allApplications.filter((a) => a.candidateId === c.id).map((a) => ({
        id: a.id,
        specialityId: a.specialityId,
        hallTicketNumber: a.hallTicketNumber,
        status: a.status,
        batchId: a.batchId,
        interviewSlot: a.interviewSlot,
      })),
    };
  });
  res.json(out);
});

// ── Shared style constants for candidate export ────────────────────────────
const HEADER_FONT  = { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" };
const HEADER_ALIGN = { horizontal: "center", vertical: "center", wrapText: false };
const ROW_EVEN     = { patternType: "solid", fgColor: { rgb: "E8F0FE" } }; // light blue
const ROW_ODD      = { patternType: "solid", fgColor: { rgb: "FFFFFF" } }; // white
const BODY_FONT    = { sz: 10, name: "Calibri" };
const BODY_ALIGN   = { horizontal: "left", vertical: "center", wrapText: false };
const THIN_BORDER  = {
  top:    { style: "thin", color: { rgb: "C5D3E8" } },
  bottom: { style: "thin", color: { rgb: "C5D3E8" } },
  left:   { style: "thin", color: { rgb: "C5D3E8" } },
  right:  { style: "thin", color: { rgb: "C5D3E8" } },
};
// Retina segment highlight fill
const RETINA_FILL  = { patternType: "solid", fgColor: { rgb: "FFF3CD" } }; // amber-tinted
const RETINA_FONT  = { sz: 10, name: "Calibri", color: { rgb: "7B3F00" }, bold: true };

// Per-sheet header colour palette (one per sheet)
const SHEET_HEADER_COLORS: Record<string, string> = {
  "General":                "0B4A8F", // deep navy
  "Cornea":                 "006064", // teal
  "Glaucoma":               "311B92", // deep purple
  "IOL Fellowship":         "1A237E", // indigo
  "Medical Retina":         "880E4F", // deep pink
  "Oculoplasty":            "BF360C", // deep orange
  "Pediatric Ophthalmology":"1B5E20", // deep green
  "Phaco Refractive":       "4A148C", // purple
  "Vitreo Retina":          "B71C1C", // deep red
};

function buildStyledSheet(rows: Record<string, any>[], sheetName: string): XLSX.WorkSheet {
  if (rows.length === 0) {
    // Return an empty sheet with just headers
    const ws = XLSX.utils.json_to_sheet([]);
    return ws;
  }

  const headers = Object.keys(rows[0]);
  const numCols = headers.length;
  const numRows = rows.length;
  const headerColor = SHEET_HEADER_COLORS[sheetName] ?? "0B4A8F";

  // Build worksheet data array (header + data rows)
  const wsData: any[][] = [headers, ...rows.map(r => headers.map(h => r[h] ?? ""))];
  const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(wsData);

  // Apply cell styles
  for (let R = 0; R <= numRows; R++) {
    for (let C = 0; C < numCols; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      const cell = ws[addr];

      if (R === 0) {
        // Header row
        cell.s = {
          fill:      { patternType: "solid", fgColor: { rgb: headerColor } },
          font:      HEADER_FONT,
          alignment: HEADER_ALIGN,
          border:    THIN_BORDER,
        };
      } else {
        // Data rows — highlight Retina/Anterior column cells
        const colHeader = headers[C];
        const cellVal   = String(cell.v ?? "");
        const isRetina  = colHeader === "Retina/Anterior" && cellVal === "Retina";
        cell.s = {
          fill:      isRetina ? RETINA_FILL : (R % 2 === 0 ? ROW_ODD : ROW_EVEN),
          font:      isRetina ? RETINA_FONT : BODY_FONT,
          alignment: BODY_ALIGN,
          border:    THIN_BORDER,
        };
      }
    }
  }

  // Auto-fit column widths
  ws["!cols"] = headers.map((h) => {
    let maxLen = h.length;
    for (const row of rows) {
      const v = row[h];
      if (v != null) maxLen = Math.max(maxLen, String(v).length);
    }
    return { wch: Math.min(maxLen + 4, 50) };
  });

  // Freeze header row
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };

  // Auto-filter
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: numCols - 1, r: numRows } }),
  };

  // Row height for header
  ws["!rows"] = [{ hpt: 22 }, ...Array(numRows).fill({ hpt: 18 })];

  return ws;
}

router.get("/candidates/export", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const candidates = await db.select().from(candidatesTable)
      .where(eq(candidatesTable.isMock, (req as any).isMockMode))
      .orderBy(desc(candidatesTable.createdAt));

    // Export ALL candidates (all statuses), not just approved
    const units        = await db.select().from(unitsTable);
    const allPrefs     = await db.select().from(candidatePreferencesTable);
    const allSpecs     = await db.select().from(specialitiesTable);
    const allSubmissions = await db.select().from(applicationSubmissionsTable);
    const allForms     = await db.select().from(applicationFormsTable);

    const resolvedCandidates = candidates.map((c) => {
      const unit  = c.unitId ? units.find((u) => u.id === c.unitId) : null;
      const prefs = allPrefs
        .filter((p) => p.candidateId === c.id)
        .sort((a, b) => a.preferenceOrder - b.preferenceOrder);
      let specializations = prefs
        .map((p) => allSpecs.find((s) => s.id === p.specialityId)?.name ?? "")
        .filter(Boolean);
      const submission = allSubmissions.find(s => s.email?.toLowerCase() === c.email?.toLowerCase());
      
      let activeSpecializations = specializations;
      if (submission?.specialization) {
        activeSpecializations = parseSpecializationString(submission.specialization);
      }

      const getFormattedSpecialityPrefs = (
        specs: string[],
        centerPreferenceStr: string | null | undefined,
        formData: any,
        customAnswers: any,
        sectionsConfig?: any[]
      ): { spec: string; location: string | null }[] => {
        if (specs.length === 0) return [];

        const prefs: Record<string, string> = {};

        if (centerPreferenceStr) {
          try {
            const parsed = JSON.parse(centerPreferenceStr);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              Object.entries(parsed).forEach(([k, v]) => {
                prefs[k] = Array.isArray(v) ? v.join(", ") : String(v);
              });
            }
          } catch { /* not JSON */ }
        }

        const extractUnitFields = (obj: any) => {
          if (obj && typeof obj === "object") {
            Object.entries(obj).forEach(([key, val]) => {
              if (key.startsWith("unit_") && val) {
                let label = key.replace("unit_", "").replace(/_/g, " ").toUpperCase();
                if (sectionsConfig) {
                  sectionsConfig.forEach((sec: any) => {
                    sec.fields?.forEach((f: any) => {
                      if (f.id === key && f.label) {
                        label = f.label.replace(" Preferred Center", "");
                      }
                    });
                  });
                }
                prefs[label] = Array.isArray(val) ? val.join(", ") : String(val);
              }
            });
          }
        };

        extractUnitFields(formData);
        extractUnitFields(customAnswers);
        if (formData && formData.formData) {
          extractUnitFields(formData.formData);
        }

        const normalize = (str: string): string => {
          return str.toLowerCase().replace(/[^a-z0-9]/g, "");
        };

        const normalizedPrefs: Record<string, string> = {};
        Object.entries(prefs).forEach(([k, v]) => {
          normalizedPrefs[normalize(k)] = v;
          if (k.startsWith("unit_")) {
            normalizedPrefs[normalize(k.substring(5))] = v;
          }
        });

        const result: { spec: string; location: string | null }[] = [];
        specs.forEach(spec => {
          const normSpec = normalize(spec);
          let loc = normalizedPrefs[normSpec];

          if (!loc) {
            const key = Object.keys(normalizedPrefs).find(k => k.includes(normSpec) || normSpec.includes(k));
            if (key) {
              loc = normalizedPrefs[key];
            }
          }

          if (!loc && centerPreferenceStr) {
            const trimmedCp = centerPreferenceStr.trim();
            if (!trimmedCp.startsWith("{") && !trimmedCp.startsWith("[") && trimmedCp !== "0" && trimmedCp.toLowerCase() !== "not applicable") {
              loc = trimmedCp;
            }
          }

          if (loc && (loc.toLowerCase().trim() === "not applicable" || loc.toLowerCase().trim() === "not_applicable")) {
            loc = "";
          }

          result.push({
            spec,
            location: loc ? loc.trim() : null
          });
        });

        return result;
      };

      const form = submission ? allForms.find(f => f.id === submission.formId) : null;
      const caParsed = {
        ...((submission?.formData as Record<string, any>) || {}),
        ...((submission?.customAnswers as Record<string, any>) || {})
      };

      const specPrefs = getFormattedSpecialityPrefs(
        activeSpecializations,
        submission?.centerPreference,
        caParsed,
        submission?.customAnswers,
        form?.sectionsConfig ?? undefined
      );

      const specWithCentersList = specPrefs.map(({ spec, location }) => location ? `${spec}: ${location}` : spec);
      const specWithCentersString = specWithCentersList.length > 0 ? specWithCentersList.join("; ") : activeSpecializations.join(", ");
      const centerPrefsString = specPrefs.filter(p => p.location).map(({ spec, location }) => `${spec}: ${location}`).join("; ") || "N/A";
      const finalSpecializations = specPrefs.map(p => p.spec);

      return {
        id: c.id,
        candidateCode: c.candidateCode,
        fullName:      c.fullName,
        email:         c.email,
        phone:         c.phone        || "N/A",
        dateOfBirth:   formatDOBToStandard(c.dateOfBirth),
        gender:        c.gender       || "N/A",
        qualification: c.qualification || "N/A",
        pgQualifications: submission?.pgQualifications || "N/A",
        collegeName:   c.collegeName  || "N/A",
        address:       c.address      || "N/A",
        centerPreference: centerPrefsString,
        specializations: finalSpecializations,
        specialitiesStringFormatted: specWithCentersString,
        status:        c.status,
        unitName:      unit?.name     || "N/A",
        paymentAmount: (() => {
          if (!submission?.paidAmount) return "N/A";
          const amt = submission.paidAmount > 100000 ? submission.paidAmount / 100 : submission.paidAmount;
          return `Rs. ${amt.toLocaleString("en-IN")}`;
        })(),
        paymentMode:   submission?.paymentMode || "N/A",
        createdAt:     c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "N/A",
      };
    });

    const specOrder = [
      "Cornea", "Glaucoma", "IOL Fellowship", "Medical Retina",
      "Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive", "Vitreo Retina",
    ];

    // Status label map
    const STATUS_LABELS: Record<string, string> = {
      pending:              "Pending",
      approved:             "Approved",
      rejected:             "Rejected",
      interview_completed:  "Interview Completed",
      waitlisted:           "Waitlisted",
      allocated:            "Allocated",
    };

    const mapToExcelRow = (rc: typeof resolvedCandidates[0]) => {
      const specsString = rc.specialitiesStringFormatted;
      const hasRetina   = rc.specializations.some(s => s.toLowerCase().includes("retina"));
      const hasBoth     = hasRetina && rc.specializations.some(s => !s.toLowerCase().includes("retina"));
      const segment     = hasBoth ? "Anterior, Retina" : hasRetina ? "Retina" : "Anterior";
      return {
        "Candidate ID":     rc.candidateCode,
        "Name":             rc.fullName,
        "Email":            rc.email,
        "Phone":            rc.phone,
        "Date of Birth":    rc.dateOfBirth,
        "Gender":           rc.gender,
        "Qualification":    rc.qualification,
        "PG Qualification": rc.pgQualifications,
        "College":          rc.collegeName,
        "Mailing Address":  rc.address,
        "Specialities":     specsString,
        "Retina/Anterior":  segment,
        "Preferred Center": rc.centerPreference,
        "Allotted Unit":    rc.unitName,
        "Status":           STATUS_LABELS[rc.status] ?? rc.status,
        "Payment Amount":   rc.paymentAmount,
        "Payment Mode":     rc.paymentMode,
        "Registration Date": rc.createdAt,
      };
    };

    const wb = XLSX.utils.book_new();

    // General sheet — all candidates
    const generalRows = resolvedCandidates.map(mapToExcelRow);
    const generalWs   = buildStyledSheet(generalRows, "General");
    XLSX.utils.book_append_sheet(wb, generalWs, "General");

    // One sheet per speciality — only approved candidates for speciality sheets
    const approvedResolved = resolvedCandidates.filter(c => c.status === "approved");
    for (const spec of specOrder) {
      const specCandidates = approvedResolved.filter(rc =>
        rc.specializations.some(s => {
          const sN = s.toLowerCase(), spN = spec.toLowerCase();
          return spN === "iol fellowship" ? (sN === "iol" || sN === "iol fellowship") : sN === spN;
        })
      );
      const specRows = specCandidates.map(mapToExcelRow);
      const specWs   = buildStyledSheet(specRows, spec);
      XLSX.utils.book_append_sheet(wb, specWs, spec);
    }

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
    const today  = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Disposition", `attachment; filename="SAV_Candidates_${today}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to export candidates" });
  }
});

router.get("/candidates/me", requireAuth, requireRole("student"), async (req, res) => {
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.userId, req.user!.userId));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
  res.json(await fullCandidate(c));
});

router.patch("/candidates/me", requireAuth, requireRole("student"), async (req, res) => {
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.userId, req.user!.userId));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
  const body = req.body as Record<string, string | undefined>;
  const update: Record<string, unknown> = {};
  for (const k of ["fullName", "phone", "dateOfBirth", "gender", "qualification", "collegeName", "address"]) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  const [updated] = await db.update(candidatesTable).set(update).where(eq(candidatesTable.id, c.id)).returning();
  if (!updated) { res.status(500).json({ error: "Failed" }); return; }
  res.json(await fullCandidate(updated));
});

router.patch("/candidates/:candidateId", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "doctor"), async (req, res) => {
  const id = Number(req.params["candidateId"]);
  const body = req.body as Record<string, unknown>;
  const allowed = ["status", "fullName", "email", "candidateCode", "phone", "dateOfBirth", "gender", "qualification", "collegeName", "address", "unitId", "mcqScore", "psychometricScore"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (body[k] !== undefined) update[k] = body[k]; }

  // Get current state before update for allocation tracking
  const [before] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db.update(candidatesTable).set(update).where(eq(candidatesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // Sync email change with application submissions if updated
  if (body.email && body.email !== before.email) {
    await db.update(applicationSubmissionsTable)
      .set({ email: String(body.email) })
      .where(eq(applicationSubmissionsTable.email, before.email))
      .catch(() => {});
  }

  // Support updating reviewNotes on submission
  if (body.reviewNotes !== undefined) {
    await db.update(applicationSubmissionsTable)
      .set({ reviewNotes: String(body.reviewNotes) })
      .where(eq(applicationSubmissionsTable.email, updated.email));
  }

  // Track seat matrix: increment on → allocated, decrement on allocated →
  const oldStatus = before.status;
  const newStatus = updated.status;
  if (newStatus !== oldStatus && (newStatus === "allocated" || oldStatus === "allocated")) {
    const delta = newStatus === "allocated" ? 1 : -1;
    const allUnits = await db.select().from(unitsTable);
    const unitObj = updated.unitId ? allUnits.find((u) => u.id === updated.unitId) : null;
    const unitName = unitObj?.name ?? null;
    let specialityName: string | null = null;
    
    // Extract speciality from reviewNotes if formatted like "Allocated to X"
    if (body.reviewNotes && typeof body.reviewNotes === 'string' && body.reviewNotes.startsWith('Allocated to ')) {
      specialityName = body.reviewNotes.replace('Allocated to ', '').trim();
    } else {
      const prefs = await db.select().from(candidatePreferencesTable).where(eq(candidatePreferencesTable.candidateId, id));
      const firstPref = prefs.sort((a, b) => a.preferenceOrder - b.preferenceOrder)[0];
      if (firstPref) {
        const [spec] = await db.select().from(specialitiesTable).where(eq(specialitiesTable.id, firstPref.specialityId));
        specialityName = spec?.name ?? null;
      }
    }
    
    if (unitName && specialityName) {
      await db.execute(sql`
        INSERT INTO seat_matrix_entries (speciality, unit_name, total_seats, allocated_seats)
        VALUES (${specialityName}, ${unitName}, 0, ${delta > 0 ? 1 : 0})
        ON CONFLICT (speciality, unit_name) DO UPDATE
          SET allocated_seats = GREATEST(0, seat_matrix_entries.allocated_seats + ${delta}), updated_at = NOW()
      `);
    }
  }

  const allUnits = await db.select().from(unitsTable);
  const unit = updated.unitId ? allUnits.find((u) => u.id === updated.unitId) : null;
  res.json({ id: updated.id, candidateCode: updated.candidateCode, fullName: updated.fullName, email: updated.email, phone: updated.phone, unitId: updated.unitId, unitName: unit?.name ?? null, status: updated.status });
});

router.post("/candidates", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const { fullName, email, phone, gender, qualification, collegeName, address, unitId, pgQualifications, centerPreference, specialityIds } = req.body as {
    fullName: string; email: string; phone?: string; gender?: string; qualification?: string; collegeName?: string; address?: string; unitId?: number;
    pgQualifications?: string; centerPreference?: string; specialityIds?: number[];
  };
  if (!fullName || !email) { res.status(400).json({ error: "fullName and email required" }); return; }
  
  const cleanEmail = email.toLowerCase().trim();
  const existing = await db.select().from(candidatesTable).where(eq(candidatesTable.email, cleanEmail));
  if (existing.length > 0) {
    res.status(400).json({ error: "Candidate with this email already exists" });
    return;
  }

  const count = await db.select().from(candidatesTable);
  const candidateCode = `CAND-2026-${String(count.length + 1).padStart(3, "0")}`;
  const [c] = await db.insert(candidatesTable).values({
    candidateCode, fullName, email: cleanEmail, phone: phone ?? null,
    gender: gender ?? null, qualification: qualification ?? null, collegeName: collegeName ?? null,
    address: address ?? null, unitId: unitId ?? null, status: "pending",
  }).returning();
  if (!c) { res.status(500).json({ error: "Failed" }); return; }

  // Insert candidate speciality preferences & applications
  const specialityNames: string[] = [];
  if (Array.isArray(specialityIds) && specialityIds.length > 0) {
    const specs = await db.select().from(specialitiesTable);
    let order = 1;
    for (const specId of specialityIds) {
      const spec = specs.find((s) => s.id === specId);
      if (spec) {
        specialityNames.push(spec.name);
        await db.insert(candidatePreferencesTable).values({
          candidateId: c.id,
          specialityId: spec.id,
          preferenceOrder: order++,
        });

        // Insert into applicationsTable for relational specialization mapping
        const prefix = spec.code ? spec.code.toUpperCase() : "GEN";
        const year = 2026;
        const countResult = await db.execute(sql`
          SELECT COUNT(*)::int as count FROM applications WHERE speciality_id = ${spec.id} AND hall_ticket_number IS NOT NULL
        `);
        const seq = Number(countResult.rows[0]?.count ?? 0) + 1;
        const hallTicketNumber = `${prefix}-${year}-${String(seq).padStart(3, "0")}`;

        await db.insert(applicationsTable).values({
          candidateId: c.id,
          specialityId: spec.id,
          hallTicketNumber,
          status: "approved",
        });
      }
    }
  }

  // Create a corresponding stub submission in application_submissions table to ensure qualifications, center preferences, and LORs display perfectly
  const activeForms = await db.select().from(applicationFormsTable).where(eq(applicationFormsTable.isActive, true));
  const formId = activeForms[0]?.id ?? 1;

  await db.insert(applicationSubmissionsTable).values({
    candidateId: c.id,
    formId,
    fullName: c.fullName,
    email: cleanEmail,
    phone: c.phone,
    permanentAddress: c.address,
    degree: c.qualification,
    medicalCollege: c.collegeName,
    pgQualifications: pgQualifications || null,
    centerPreference: centerPreference || null,
    specialization: specialityNames.length > 0 ? JSON.stringify(specialityNames) : null,
    status: "approved",
    readyForReview: true,
    source: "manual",
  });

  res.json({ id: c.id, candidateCode: c.candidateCode, fullName: c.fullName, email: c.email, phone: c.phone, unitId: c.unitId, unitName: null, status: c.status });
});

// CEC or admin: update MCQ / psychometric / VIVA scores (+ optionally assign to panel queue)
// Helper function to recalculate candidate completion status
export async function recalculateCandidateStatus(candidateId: number): Promise<void> {
  const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
  if (!cand) return;

  // If candidate has an explicit outcome, never automatically demote or change
  if (cand.status === "allocated" || cand.status === "waitlisted" || cand.status === "rejected") return;

  const apps = await db.select().from(applicationsTable).where(eq(applicationsTable.candidateId, candidateId));
  if (apps.length === 0) return;

  const scores = await db.select().from(interviewScoresTable).where(eq(interviewScoresTable.candidateId, candidateId));

  let allSpecialtiesCompleted = true;
  for (const app of apps) {
    const hasScore = scores.some(s => s.specialityId === app.specialityId);
    if (!hasScore) {
      allSpecialtiesCompleted = false;
      // Mark individual specialization application status
      if (app.status === "completed") {
        await db.update(applicationsTable).set({ status: "approved" }).where(eq(applicationsTable.id, app.id));
      }
    } else {
      if (app.status !== "completed") {
        await db.update(applicationsTable).set({ status: "completed" }).where(eq(applicationsTable.id, app.id));
      }
    }
  }

  // Completed if specialties have interview evaluations recorded
  const overallCompleted = allSpecialtiesCompleted || scores.length > 0;

  if (overallCompleted) {
    await db.update(candidatesTable).set({ status: "interview_completed" }).where(eq(candidatesTable.id, candidateId));
  } else {
    if (cand.status === "interview_completed") {
      await db.update(candidatesTable).set({ status: "approved" }).where(eq(candidatesTable.id, candidateId));
    }
  }
}

// CEC or admin: update MCQ / psychometric / VIVA scores (+ optionally assign to panel queue)
router.patch("/candidates/:candidateId/marks", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const id = Number(req.params["candidateId"]);
    const { mcqScore, psychometricScore, vivaScore, specialityId, panelId, targetDoctorId } = req.body as { 
      mcqScore?: number | null; 
      psychometricScore?: number | null; 
      vivaScore?: number | null;
      specialityId?: number | null;
      panelId?: number | null;
      targetDoctorId?: number | null;
    };
    
    // Validations
    if (vivaScore !== undefined && vivaScore !== null) {
      if (vivaScore < 0 || vivaScore > 50) {
        res.status(400).json({ error: "VIVA score must be between 0 and 50." });
        return;
      }
    }
    if (mcqScore !== undefined && mcqScore !== null) {
      if (mcqScore < 0 || mcqScore > 50) {
        res.status(400).json({ error: "MCQ score must be between 0 and 50." });
        return;
      }
    }
    if (psychometricScore !== undefined && psychometricScore !== null) {
      if (psychometricScore < 0 || psychometricScore > 10) {
        res.status(400).json({ error: "Mind Mapping score must be between 0 and 10." });
        return;
      }
    }

    const [candBefore] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
    if (!candBefore) { res.status(404).json({ error: "Candidate not found." }); return; }

    const update: Record<string, unknown> = {};
    if (mcqScore !== undefined) update["mcqScore"] = mcqScore !== null ? String(mcqScore) : null;
    if (psychometricScore !== undefined) update["psychometricScore"] = psychometricScore !== null ? String(psychometricScore) : null;
    
    const [updated] = await db.update(candidatesTable).set(update).where(eq(candidatesTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }

    const ipAddress = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim();

    // Audit logs for MCQ and psychometric changes
    if (mcqScore !== undefined && String(mcqScore) !== String(candBefore.mcqScore)) {
      await db.insert(auditLogsTable).values({
        userId: req.user!.userId,
        userEmail: req.user!.email,
        userName: req.user!.email,
        action: "MARK_MODIFY",
        details: `Updated MCQ Score for candidate ${candBefore.fullName} (${candBefore.candidateCode}) from ${candBefore.mcqScore ?? "N/A"} to ${mcqScore ?? "N/A"}`,
        ipAddress,
      });
    }

    if (psychometricScore !== undefined && String(psychometricScore) !== String(candBefore.psychometricScore)) {
      await db.insert(auditLogsTable).values({
        userId: req.user!.userId,
        userEmail: req.user!.email,
        userName: req.user!.email,
        action: "MARK_MODIFY",
        details: `Updated Mind Mapping Score for candidate ${candBefore.fullName} (${candBefore.candidateCode}) from ${candBefore.psychometricScore ?? "N/A"} to ${psychometricScore ?? "N/A"}`,
        ipAddress,
      });
    }

    // Update or insert direct VIVA score if provided
    if (vivaScore !== undefined) {
      let docId = req.user!.userId;
      if (targetDoctorId && (req.user!.role === "super_admin" || req.user!.role === "program_admin" || req.user!.role === "central_exam_coordinator")) {
        docId = Number(targetDoctorId);
      }

      // We map to the selected specialityId or fallback to the candidate's first preference
      let targetSpecId = specialityId;
      if (!targetSpecId) {
        const [firstPref] = await db.select().from(candidatePreferencesTable)
          .where(eq(candidatePreferencesTable.candidateId, id))
          .orderBy(candidatePreferencesTable.preferenceOrder);
        if (firstPref) {
          targetSpecId = firstPref.specialityId;
        }
      }

      if (targetSpecId) {
        let finalDocId = docId;
        if (!targetDoctorId) {
          const specPanelDoctor = await db.execute(sql`
            SELECT doctor_id FROM interview_panel_members ipm
            JOIN interview_panels ip ON ip.id = ipm.panel_id
            WHERE ip.speciality_id = ${targetSpecId} AND ip.is_active = TRUE
            LIMIT 1
          `);
          if (specPanelDoctor.rows[0]) {
            finalDocId = Number((specPanelDoctor.rows[0] as any).doctor_id);
          }
        }

        const [doc] = await db.select().from(usersTable).where(eq(usersTable.id, finalDocId));
        const doctorName = doc?.fullName ?? `Doctor ID ${finalDocId}`;

        const [spec] = await db.select().from(specialitiesTable).where(eq(specialitiesTable.id, targetSpecId));
        const specName = spec?.name ?? `Specialty ID ${targetSpecId}`;

        // Get any existing Viva score for this specialty (excluding Mind Matters panel scores)
        const existingScores = await db.select().from(interviewScoresTable)
          .where(and(
            eq(interviewScoresTable.candidateId, id),
            eq(interviewScoresTable.specialityId, targetSpecId),
            sql`doctor_id NOT IN (SELECT doctor_id FROM interview_panel_members WHERE panel_id IN (SELECT id FROM interview_panels WHERE is_mind_matter = TRUE))`
          ));
        const existing = existingScores[0];

        const now = new Date();

        if (vivaScore === null) {
          if (existing) {
            await db.delete(interviewScoresTable).where(eq(interviewScoresTable.id, existing.id));
            
            await db.insert(auditLogsTable).values({
              userId: req.user!.userId,
              userEmail: req.user!.email,
              action: "MARK_MODIFY",
              details: `Deleted Specialty ${specName} Viva score entered by Doctor ${doctorName} for candidate ${candBefore.fullName} (${candBefore.candidateCode})`,
              ipAddress,
            });
          }
        } else {
          if (existing) {
            await db.update(interviewScoresTable)
              .set({ 
                score: vivaScore, 
                submittedAt: now,
                lastModifiedBy: req.user!.userId,
                lastModifiedAt: now
              })
              .where(eq(interviewScoresTable.id, existing.id));

            await db.insert(auditLogsTable).values({
              userId: req.user!.userId,
              userEmail: req.user!.email,
              action: "MARK_MODIFY",
              details: `Updated Specialty ${specName} Viva score for candidate ${candBefore.fullName} (${candBefore.candidateCode}) entered by Doctor ${doctorName} from ${existing.score} to ${vivaScore}`,
              ipAddress,
            });
          } else {
            await db.insert(interviewScoresTable).values({
              candidateId: id,
              doctorId: finalDocId,
              specialityId: targetSpecId,
              score: vivaScore,
              remarks: "Coordinator Direct Entry",
              enteredBy: req.user!.userId,
              enteredAt: now,
              lastModifiedBy: req.user!.userId,
              lastModifiedAt: now
            });

            await db.insert(auditLogsTable).values({
              userId: req.user!.userId,
              userEmail: req.user!.email,
              action: "MARK_ENTRY",
              details: `Directly entered Specialty ${specName} Viva score (${vivaScore}) for candidate ${candBefore.fullName} (${candBefore.candidateCode}) attributed to Doctor ${doctorName}`,
              ipAddress,
            });
          }
        }
      }
    }

    // Recalculate status dynamically
    await recalculateCandidateStatus(id);

    // Optionally add to panel queue
    if (panelId) {
      const [maxRow] = (await db.execute(sql`
        SELECT COALESCE(MAX(queue_position), -1) as max_pos FROM panel_queue WHERE panel_id = ${panelId}
      `)).rows as Array<Record<string, unknown>>;
      const nextPos = Number(maxRow!["max_pos"]) + 1;
      await db.execute(sql`
        INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status)
        VALUES (${panelId}, ${id}, ${nextPos}, 'waiting')
        ON CONFLICT (panel_id, candidate_id) DO NOTHING
      `);
    }

    const updatedAny = updated as any;
    res.json({ 
      id: updated.id, 
      mcqScore: updatedAny.mcqScore != null ? Number(updatedAny.mcqScore) : null, 
      psychometricScore: updatedAny.psychometricScore != null ? Number(updatedAny.psychometricScore) : null 
    });
  } catch (err: any) {
    console.error("[candidates-marks-patch] error:", err);
    res.status(500).json({ error: err.message || "An unexpected database error occurred while updating marks." });
  }
});

// Doctor / Coordinator: unified interview assessment, remarks, and selection outcome
router.post("/candidates/:candidateId/doctor-marks", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "doctor"), async (req, res) => {
  try {
    const candidateId = Number(req.params["candidateId"]);
    const { psychometricScore, specialityScores, status, unitId, reviewNotes } = req.body as {
      psychometricScore?: number | null;
      specialityScores?: Array<{ specialityId: number; score?: number | null; remarks?: string }>;
      status?: string;
      unitId?: number | null;
      reviewNotes?: string;
    };

    const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
    if (!cand) {
      return res.status(404).json({ error: "Candidate not found." });
    }

    const userId = req.user!.userId;
    const now = new Date();

    // 1. Optional Psychometry Score (if provided)
    if (psychometricScore !== undefined) {
      if (psychometricScore !== null && (psychometricScore < 0 || psychometricScore > 10)) {
        return res.status(400).json({ error: "Psychometry score must be between 0 and 10." });
      }
      await db.update(candidatesTable)
        .set({ psychometricScore: psychometricScore !== null ? String(psychometricScore) : null })
        .where(eq(candidatesTable.id, candidateId));
    }

    // 2. Speciality Assessment & Remarks (scores optional, max 50)
    if (Array.isArray(specialityScores) && specialityScores.length > 0) {
      for (const item of specialityScores) {
        const scoreVal = typeof item.score === "number" && !isNaN(item.score) 
          ? Math.max(0, Math.min(50, item.score)) 
          : 0;

        const existing = await db.select().from(interviewScoresTable).where(
          and(
            eq(interviewScoresTable.candidateId, candidateId),
            eq(interviewScoresTable.specialityId, item.specialityId)
          )
        );

        if (existing.length > 0) {
          const oldScore = existing[0]!.score;
          await db.update(interviewScoresTable).set({
            score: scoreVal,
            remarks: item.remarks !== undefined ? item.remarks : existing[0]!.remarks,
            doctorId: userId,
            submittedAt: now,
            lastModifiedBy: userId,
            lastModifiedAt: now,
          }).where(eq(interviewScoresTable.id, existing[0]!.id));

          // Log Audit Trail
          try {
            await db.execute(sql`
              INSERT INTO interview_scores_audit (candidate_id, speciality_id, doctor_id, old_score, new_score, remarks, action, changed_by_user_id)
              VALUES (${candidateId}, ${item.specialityId}, ${userId}, ${oldScore}, ${scoreVal}, ${item.remarks ?? null}, 'UPDATE', ${userId})
            `);
          } catch (_) {}
        } else {
          await db.insert(interviewScoresTable).values({
            candidateId,
            doctorId: userId,
            specialityId: item.specialityId,
            score: scoreVal,
            remarks: item.remarks ?? null,
            submittedAt: now,
            enteredBy: userId,
            enteredAt: now,
            lastModifiedBy: userId,
            lastModifiedAt: now,
          });

          // Log Audit Trail
          try {
            await db.execute(sql`
              INSERT INTO interview_scores_audit (candidate_id, speciality_id, doctor_id, old_score, new_score, remarks, action, changed_by_user_id)
              VALUES (${candidateId}, ${item.specialityId}, ${userId}, NULL, ${scoreVal}, ${item.remarks ?? null}, 'INSERT', ${userId})
            `);
          } catch (_) {}
        }
      }
    }

    // 3. Selection / Interview Outcome & Unit Allocation
    if (status) {
      const allowedStatuses = ["approved", "interview_completed", "waitlisted", "allocated", "rejected"];
      if (allowedStatuses.includes(status)) {
        const candUpdate: Record<string, any> = { status };
        if (unitId !== undefined) candUpdate.unitId = unitId;
        await db.update(candidatesTable).set(candUpdate).where(eq(candidatesTable.id, candidateId));
      }
    } else if (unitId !== undefined) {
      await db.update(candidatesTable).set({ unitId }).where(eq(candidatesTable.id, candidateId));
    }

    // 4. Update Review Notes if specified
    if (reviewNotes !== undefined) {
      await db.update(applicationSubmissionsTable)
        .set({ reviewNotes: String(reviewNotes) })
        .where(eq(applicationSubmissionsTable.email, cand.email));
    }

    if (!status) {
      await recalculateCandidateStatus(candidateId);
    }

    const [updatedCandidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
    res.json(await fullCandidate(updatedCandidate!));
  } catch (err: any) {
    console.error("[doctor-marks-post] error:", err);
    res.status(500).json({ error: err.message || "Failed to save marks." });
  }
});

async function createCandidateDossierPdfBuffer(c: any): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const full = await fullCandidate(c);
      const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const colors = {
        primary: '#0f172a',
        secondary: '#475569',
        accent: '#f97316',
        muted: '#94a3b8',
        border: '#e2e8f0',
        bgOrange: '#fff7ed'
      };

      const logoPath = path.join(process.cwd(), 'artifacts', 'fellowship-exam', 'src', 'assets', 'seh_sav_logo_1777703794142.jpg');
      try {
        doc.image(logoPath, 50, 40, { width: 130, height: 65 });
      } catch (e) {
        doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(14).text("SANKARA ACADEMY OF VISION", 50, 50);
      }

      doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(16).text("CANDIDATE DOSSIER", 0, 45, { align: 'right', width: 545 });
      doc.fillColor(colors.secondary).font('Helvetica').fontSize(9).text("Sankara Academy of Vision — Fellowship Admissions", 0, 65, { align: 'right', width: 545 });
      doc.fillColor(colors.secondary).font('Helvetica').fontSize(9).text(`Protocol ID: ${c.candidateCode}`, 0, 78, { align: 'right', width: 545 });
      doc.strokeColor(colors.accent).lineWidth(2).moveTo(50, 112).lineTo(550, 112).stroke();

      const photoUrl = sub?.photoUrl;
      if (photoUrl && photoUrl.startsWith("/objects/")) {
        const localPath = path.join(process.cwd(), "uploads", photoUrl.replace("/objects/", ""));
        try {
          doc.image(localPath, 460, 120, { width: 85, height: 105 });
          doc.rect(460, 120, 85, 105).strokeColor(colors.border).lineWidth(1).stroke();
        } catch (_) {}
      }

      doc.y = 122;
      doc.moveDown(2);

      doc.rect(50, doc.y, 500, 30).fill(colors.bgOrange);
      doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(12).text("ACADEMIC IDENTITY & PROFILE", 65, doc.y - 22);
      doc.moveDown(0.5);

      const leftCol = 70;
      const rightCol = 320;
      let currY = doc.y;

      const renderField = (label: string, value: any, x: number, y: number) => {
        doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, y);
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(11).text(String(value || "—"), x, y + 12);
      };

      renderField("Full Name", full.fullName, leftCol, currY);
      renderField("Contact Identity", full.email, rightCol, currY);
      currY += 40;
      renderField("Contact Phone", full.phone || "—", leftCol, currY);
      renderField("Date of Birth", formatDOBToStandard(full.dateOfBirth), rightCol, currY);
      currY += 40;
      renderField("MBBS Institution", full.collegeName || "—", leftCol, currY);
      renderField("Qualifying MBBS", full.qualification || "—", rightCol, currY);
      currY += 40;

      if (sub?.pgQualifications) {
        doc.rect(50, currY, 500, 24).fill('#f8fafc');
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(10).text("POST-GRADUATE QUALIFICATIONS", 65, currY + 6);
        currY += 32;
        doc.fillColor(colors.secondary).font('Helvetica').fontSize(10).text(sub.pgQualifications, 65, currY, { width: 470 });
        currY = doc.y + 16;
      }

      const bottom = 750;
      doc.strokeColor(colors.accent).lineWidth(2).moveTo(50, bottom).lineTo(550, bottom).stroke();
      doc.fillColor(colors.muted).font('Helvetica').fontSize(8).text("CONFIDENTIAL DOCUMENT - FOR INTERNAL USE ONLY", 50, bottom + 10);
      doc.text("SANKARA ACADEMY OF VISION - FELLOWSHIP ADMISSIONS HUB", 50, bottom + 22);
      doc.text(`Generated on ${formatToLocalDateTime(new Date())}`, 350, bottom + 10, { align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// GET /candidates/export-zip — Download ZIP package containing all candidate application dossiers
router.get("/candidates/export-zip", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const candidates = await db.select().from(candidatesTable)
      .where(eq(candidatesTable.isMock, (req as any).isMockMode))
      .orderBy(desc(candidatesTable.createdAt));

    const archive = new archiverPkg.ZipArchive({ zlib: { level: 6 } });
    const filename = `Candidate_Dossiers_${Date.now()}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    archive.pipe(res);

    for (const c of candidates) {
      try {
        const buffer = await createCandidateDossierPdfBuffer(c);
        const safeName = `${c.candidateCode}_${c.fullName.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
        archive.append(buffer, { name: safeName });
      } catch (err) {
        console.error(`Failed to add PDF for candidate ${c.id}:`, err);
      }
    }

    await archive.finalize();
  } catch (err: any) {
    console.error("[candidates-export-zip] error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message || "Failed to generate ZIP archive." });
  }
});

// GET /candidates/bulk-dossier-pdf — Download combined single PDF book containing all candidate dossiers
router.get("/candidates/bulk-dossier-pdf", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const candidates = await db.select().from(candidatesTable)
      .where(eq(candidatesTable.isMock, (req as any).isMockMode))
      .orderBy(desc(candidatesTable.createdAt));

    const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: false });
    const filename = `Cohort_Dossier_Compilation_${Date.now()}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    doc.pipe(res);

    const colors = {
      primary: '#0f172a',
      secondary: '#475569',
      accent: '#f97316',
      muted: '#94a3b8',
      border: '#e2e8f0',
      bgOrange: '#fff7ed'
    };

    const logoPath = path.join(process.cwd(), 'artifacts', 'fellowship-exam', 'src', 'assets', 'seh_sav_logo_1777703794142.jpg');

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      const full = await fullCandidate(c);
      const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));

      doc.addPage();

      // Background accents
      doc.save();
      doc.fillColor(colors.bgOrange).opacity(0.1);
      doc.circle(550, 50, 150).fill();
      doc.circle(50, 750, 100).fill();
      doc.restore();

      // Header
      try {
        doc.image(logoPath, 50, 40, { width: 130, height: 65 });
      } catch (e) {
        doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(14).text("SANKARA ACADEMY OF VISION", 50, 50);
      }

      doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(16).text("CANDIDATE DOSSIER", 0, 45, { align: 'right', width: 545 });
      doc.fillColor(colors.secondary).font('Helvetica').fontSize(9).text("Sankara Academy of Vision — Fellowship Admissions", 0, 65, { align: 'right', width: 545 });
      doc.fillColor(colors.secondary).font('Helvetica').fontSize(9).text(`Protocol ID: ${c.candidateCode} (Page ${i+1}/${candidates.length})`, 0, 78, { align: 'right', width: 545 });
      doc.strokeColor(colors.accent).lineWidth(2).moveTo(50, 112).lineTo(550, 112).stroke();

      const photoUrl = sub?.photoUrl;
      if (photoUrl && photoUrl.startsWith("/objects/")) {
        const localPath = path.join(process.cwd(), "uploads", photoUrl.replace("/objects/", ""));
        try {
          doc.image(localPath, 460, 120, { width: 85, height: 105 });
          doc.rect(460, 120, 85, 105).strokeColor(colors.border).lineWidth(1).stroke();
        } catch (_) {}
      }

      doc.y = 122;
      doc.moveDown(2);

      doc.rect(50, doc.y, 500, 30).fill(colors.bgOrange);
      doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(12).text("ACADEMIC IDENTITY & PROFILE", 65, doc.y - 22);
      doc.moveDown(0.5);

      const leftCol = 70;
      const rightCol = 320;
      let currY = doc.y;

      const renderField = (label: string, value: any, x: number, y: number) => {
        doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, y);
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(11).text(String(value || "—"), x, y + 12);
      };

      renderField("Full Name", full.fullName, leftCol, currY);
      renderField("Contact Identity", full.email, rightCol, currY);
      currY += 40;
      renderField("Contact Phone", full.phone || "—", leftCol, currY);
      renderField("Date of Birth", formatDOBToStandard(full.dateOfBirth), rightCol, currY);
      currY += 40;
      renderField("MBBS Institution", full.collegeName || "—", leftCol, currY);
      renderField("Qualifying MBBS", full.qualification || "—", rightCol, currY);
      currY += 40;

      if (sub?.pgQualifications) {
        doc.rect(50, currY, 500, 24).fill('#f8fafc');
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(10).text("POST-GRADUATE QUALIFICATIONS", 65, currY + 6);
        currY += 32;
        doc.fillColor(colors.secondary).font('Helvetica').fontSize(10).text(sub.pgQualifications, 65, currY, { width: 470 });
        currY = doc.y + 16;
      }

      const bottom = 750;
      doc.strokeColor(colors.accent).lineWidth(2).moveTo(50, bottom).lineTo(550, bottom).stroke();
      doc.fillColor(colors.muted).font('Helvetica').fontSize(8).text("CONFIDENTIAL DOCUMENT - FOR INTERNAL USE ONLY", 50, bottom + 10);
      doc.text("SANKARA ACADEMY OF VISION - FELLOWSHIP ADMISSIONS HUB", 50, bottom + 22);
      doc.text(`Candidate ${i+1} of ${candidates.length} · Generated on ${formatToLocalDateTime(new Date())}`, 350, bottom + 10, { align: 'right' });
    }

    doc.end();
  } catch (err: any) {
    console.error("[bulk-dossier-pdf] error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message || "Failed to generate bulk PDF compilation." });
  }
});

router.get("/candidates/:candidateId", requireAuth, async (req, res, next) => {
  const id = Number(req.params["candidateId"]);
  if (isNaN(id)) return next();
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await fullCandidate(c));
});

// POST /candidates/:candidateId/documents — Attach / update a document for a candidate
router.post(
  "/candidates/:candidateId/documents",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "doctor"),
  async (req, res) => {
    try {
      const candidateId = Number(req.params["candidateId"]);
      const { docType, fileName, fileUrl } = req.body as { docType: string; fileName?: string; fileUrl: string };
      if (!docType || !fileUrl) {
        return res.status(400).json({ error: "docType and fileUrl are required" });
      }

      const existing = await db.select().from(documentsTable).where(
        and(eq(documentsTable.candidateId, candidateId), eq(documentsTable.docType, docType))
      );

      let doc;
      if (existing.length > 0) {
        [doc] = await db.update(documentsTable).set({
          fileUrl,
          fileName: fileName || `${docType}.pdf`,
          uploadedAt: new Date(),
        }).where(eq(documentsTable.id, existing[0]!.id)).returning();
      } else {
        [doc] = await db.insert(documentsTable).values({
          candidateId,
          docType,
          fileName: fileName || `${docType}.pdf`,
          fileUrl,
          uploadedAt: new Date(),
        }).returning();
      }

      // Also sync to application_submissions if LOR1/LOR2/PHOTO
      if (docType === "LOR1" || docType === "LOR2" || docType === "PHOTO") {
        const field = docType === "LOR1" ? "lor1Url" : (docType === "LOR2" ? "lor2Url" : "photoUrl");
        await db.update(applicationSubmissionsTable)
          .set({ [field]: fileUrl })
          .where(eq(applicationSubmissionsTable.candidateId, candidateId));
      }

      res.status(201).json(doc);
    } catch (err: any) {
      console.error("[candidate-document-attach] error:", err);
      res.status(500).json({ error: err.message || "Failed to attach document" });
    }
  }
);

router.post("/candidates/:candidateId/assign-unit", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const id = Number(req.params["candidateId"]);
  const { unitId } = req.body as { unitId: number };
  const [c] = await db.update(candidatesTable).set({ unitId }).where(eq(candidatesTable.id, id)).returning();
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  const units = await db.select().from(unitsTable);
  const unit = c.unitId ? units.find((u) => u.id === c.unitId) : null;
  res.json({
    id: c.id,
    candidateCode: c.candidateCode,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    unitId: c.unitId,
    unitName: unit?.name ?? null,
    status: c.status,
    mcqScore: null,
    psychometricScore: null,
    interviewScore: null,
    totalScore: null,
    rank: null,
    createdAt: c.createdAt.toISOString(),
  });
});

// Helper: cascade-delete all related records for a set of candidate IDs
async function cascadeDeleteCandidates(ids: number[]) {
  const { inArray, sql } = await import("drizzle-orm");
  if (!ids || ids.length === 0) return;
  
  await db.delete(interviewScoresTable).where(inArray(interviewScoresTable.candidateId, ids)).catch(() => {});
  await db.delete(doctorAssignmentsTable).where(inArray(doctorAssignmentsTable.candidateId, ids)).catch(() => {});
  await db.delete(documentsTable).where(inArray(documentsTable.candidateId, ids)).catch(() => {});
  await db.delete(candidateExamAssignmentsTable).where(inArray(candidateExamAssignmentsTable.candidateId, ids)).catch(() => {});
  await db.delete(examAttemptsTable).where(inArray(examAttemptsTable.candidateId, ids)).catch(() => {});
  await db.delete(candidatePreferencesTable).where(inArray(candidatePreferencesTable.candidateId, ids)).catch(() => {});
  await db.delete(applicationsTable).where(inArray(applicationsTable.candidateId, ids)).catch(() => {});
  await db.delete(batchCandidatesTable).where(inArray(batchCandidatesTable.candidateId, ids)).catch(() => {});
  
  // Clean up any panel queue rows and scoring entries
  await db.execute(sql`DELETE FROM panel_queue WHERE candidate_id = ANY(${ids})`).catch(() => {});
  await db.execute(sql`DELETE FROM interview_panel_member_scores WHERE candidate_id = ANY(${ids})`).catch(() => {});
  await db.execute(sql`DELETE FROM interview_panel_member_scoring_audit WHERE candidate_id = ANY(${ids})`).catch(() => {});
  
  await db.delete(candidatesTable).where(inArray(candidatesTable.id, ids));
}

// DELETE single candidate
router.delete("/candidates/:id", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await cascadeDeleteCandidates([id]);
  res.json({ success: true });
});

// POST bulk-delete candidates
router.post("/candidates/bulk-delete", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"), async (req, res) => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids array required" }); return; }
  await cascadeDeleteCandidates(ids);
  res.json({ success: true, deleted: ids.length });
});

// POST bulk-status update candidates
router.post("/candidates/bulk-status", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"), async (req, res) => {
  const { ids, status } = req.body as { ids: number[]; status: string };
  if (!Array.isArray(ids) || ids.length === 0 || !status) {
    res.status(400).json({ error: "ids array and status string required" });
    return;
  }
  await db.update(candidatesTable)
    .set({ status: status as any })
    .where(inArray(candidatesTable.id, ids));
  
  // Also update linked applications status if applicable
  await db.update(applicationsTable)
    .set({ status: status as any })
    .where(inArray(applicationsTable.candidateId, ids));

  res.json({ success: true, updated: ids.length, status });
});

// POST bulk-assign-batch candidates
router.post("/candidates/bulk-assign-batch", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"), async (req, res) => {
  const { candidateIds, batchId } = req.body as { candidateIds: number[]; batchId: number };
  if (!Array.isArray(candidateIds) || candidateIds.length === 0 || !batchId) {
    res.status(400).json({ error: "candidateIds array and batchId required" });
    return;
  }
  // Update applications
  await db.update(applicationsTable)
    .set({ batchId })
    .where(inArray(applicationsTable.candidateId, candidateIds));

  // Upsert batch_candidates
  for (const cid of candidateIds) {
    await db.insert(batchCandidatesTable)
      .values({ batchId, candidateId: cid })
      .onConflictDoNothing();
  }

  res.json({ success: true, assigned: candidateIds.length, batchId });
});


// Send formal offer letter email
router.post("/candidates/:id/send-offer", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const id = Number(req.params.id);
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }

  // Must be allocated
  if (c.status !== "allocated") {
    res.status(400).json({ error: "Candidate must be allocated before sending an offer letter" });
    return;
  }

  const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));
  const reviewNotes = sub?.reviewNotes || "";
  
  let specialization = "Fellowship";
  if (reviewNotes.startsWith("Allocated to ")) {
    specialization = reviewNotes.replace("Allocated to ", "");
  }

  const units = await db.select().from(unitsTable);
  const unit = c.unitId ? units.find(u => u.id === c.unitId) : null;
  const unitName = unit?.name || "Sankara Eye Hospital";

  try {
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    
    // 1. Get Template ID (priority: passed ID > program ID > global ID)
    let templateId = req.body.templateId; // Use the specific template selected in UI
    
    if (!templateId) {
      // Fallback logic
      templateId = settings?.googleDocsTemplateId;
      const [submission] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));
      if (submission?.formId) {
        const [form] = await db.select().from(applicationFormsTable).where(eq(applicationFormsTable.id, submission.formId));
        if (form?.programId) {
          const [prog] = await db.select().from(programsTable).where(eq(programsTable.id, form.programId));
          const progAny = prog as any;
          if (progAny?.offerLetterTemplateId) {
            templateId = String(progAny.offerLetterTemplateId);
          }
        }
      }
    } else {
      // Fetch the actual google doc ID from our templates table
      const [tpl] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, Number(templateId)));
      if (tpl) templateId = tpl.googleDocId;
    }

    if (templateId && settings?.googleServiceAccountJson) {
      // Build replacements
      const replacements: Record<string, string> = {
        letter_date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        name: c.fullName,
        address: c.address || "",
        interview_date: req.body.interview_date || "—",
        specialization: specialization,
        unit: unitName,
        duration: req.body.duration || "24 Months",
        start_date: req.body.start_date || "—",
        reporting_date: req.body.reporting_date || "—",
        induction_dates: req.body.induction_dates || "—",
        stipend: String(req.body.stipend || "0"),
        stipend_words: req.body.stipend_words || "Zero",
        reporting_doctor: req.body.reporting_doctor || "the Chief Medical Officer",
        signing_authority: req.body.signing_authority || "Director",
        ...(req.body.custom_fields || {})
      };

      const pdfBuffer = await processGoogleDocTemplate({
        templateId,
        serviceAccountJson: settings.googleServiceAccountJson,
        replacements
      });

      await sendOfferLetterWithAttachment({
        toEmail: c.email,
        toName: c.fullName,
        pdfBuffer,
        fileName: `Offer_Letter_${c.candidateCode}.pdf`
      });
    } else {
      // Fallback to HTML template
      await sendOfferLetterEmail({
        toEmail: c.email,
        toName: c.fullName,
        candidateCode: c.candidateCode,
        specialization,
        unitName
      });
    }
    
    // Mark as sent
    const newNotes = reviewNotes + " [OFFER SENT]";
    await db.update(applicationSubmissionsTable)
      .set({ reviewNotes: newNotes })
      .where(eq(applicationSubmissionsTable.email, c.email));

    res.json({ success: true, method: settings?.googleDocsTemplateId ? "google_docs" : "html" });
  } catch (e: any) {
    console.error("[email] Failed to send offer letter", e);
    res.status(500).json({ error: e.message || "Failed to send email." });
  }
});

// Generate and Download PDF
router.post("/candidates/:id/generate-document", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const id = Number(req.params.id);
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }

  const [subForNotes] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));
  const cReviewNotes = subForNotes?.reviewNotes ?? "";
  const specialization = cReviewNotes.includes("Allocated to ") 
    ? cReviewNotes.replace("Allocated to ", "").split(" [")[0] 
    : "Fellowship";

  const units = await db.select().from(unitsTable);
  const unit = c.unitId ? units.find(u => u.id === c.unitId) : null;
  const unitName = unit?.name || "Sankara Eye Hospital";

  try {
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    let googleDocId = req.body.templateId; 

    if (googleDocId && !isNaN(Number(googleDocId))) {
       const [tpl] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, Number(googleDocId)));
       if (tpl) googleDocId = tpl.googleDocId;
    }

    if (!googleDocId) googleDocId = settings?.googleDocsTemplateId;

    if (!googleDocId || !settings?.googleServiceAccountJson) {
      return res.status(400).json({ error: "No document template configured." });
    }

    const replacements: Record<string, string> = {
      letter_date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
      name: c.fullName,
      address: c.address || "",
      interview_date: req.body.interview_date || "—",
      specialization: specialization,
      unit: unitName,
      duration: req.body.duration || "24 Months",
      start_date: req.body.start_date || "—",
      reporting_date: req.body.reporting_date || "—",
      induction_dates: req.body.induction_dates || "—",
      stipend: String(req.body.stipend || "0"),
      stipend_words: req.body.stipend_words || "Zero",
      reporting_doctor: req.body.reporting_doctor || "the Chief Medical Officer",
      signing_authority: req.body.signing_authority || "Director",
      ...(req.body.custom_fields || {})
    };

    const pdfBuffer = await processGoogleDocTemplate({
      templateId: googleDocId,
      serviceAccountJson: settings.googleServiceAccountJson,
      replacements
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Offer_${c.candidateCode}.pdf`);
    res.send(pdfBuffer);
  } catch (e: any) {
    console.error("[doc-gen] failed", e);
    res.status(500).json({ error: e.message || "Failed to generate document." });
  }
});

// GET /candidates/:id/call-letter-pdf (Auto-detects Retina vs Anterior, supports id=0 on-demand)
router.get("/candidates/:id/call-letter-pdf", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    let c: any = null;
    let sub: any = null;
    if (id > 0) {
      const [found] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
      c = found;
      if (c) {
        const [foundSub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));
        sub = foundSub;
      }
    }

    const candidateName = (req.query.candidateName as string) || c?.fullName || "Dr. Candidate";
    const candidateCode = (req.query.candidateCode as string) || c?.candidateCode || "SAV-2027-001";
    let spec = (req.query.specialization as string) || "";
    if (!spec && sub?.specialization) {
      try {
        const parsed = typeof sub.specialization === "string" && sub.specialization.startsWith("[")
          ? JSON.parse(sub.specialization)
          : [sub.specialization];
        spec = Array.isArray(parsed) ? parsed.join(", ") : String(sub.specialization);
      } catch (e) {
        spec = String(sub.specialization);
      }
    }
    if (!spec) spec = "Vitreo Retina";

    const pdfBuffer = await generateCallLetterPdf({
      candidateName,
      candidateCode,
      specialization: spec,
      email: (req.query.email as string) || c?.email || "candidate@sankaraeye.com",
      phone: (req.query.phone as string) || c?.phone || "",
      address: (req.query.address as string) || c?.address || "",
      applicationId: sub?.id || (c?.id || 1),
      interviewDate: (req.query.interviewDate as string) || (isRetinaSpecialty(spec) ? "1st June 2026, Monday" : "8th June 2026, Monday"),
      reportingTime: (req.query.reportingTime as string) || "8:00 AM Sharp",
      venue: (req.query.venue as string) || "Sankara Eye Hospital, Varthur Main Road, Kundalahalli Gate, Bangalore – 560037",
    });

    const isRetina = isRetinaSpecialty(spec);
    const filename = `Interview_Call_Letter_${isRetina ? "Retina" : "Anterior"}_${candidateCode}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("[call-letter-pdf] Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate call letter" });
  }
});

// GET /candidates/:id/offer-letter-pdf (Official Standard Format, supports id=0 on-demand)
router.get("/candidates/:id/offer-letter-pdf", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    let c: any = null;
    let sub: any = null;
    if (id > 0) {
      const [found] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
      c = found;
      if (c) {
        const [foundSub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));
        sub = foundSub;
      }
    }

    const units = await db.select().from(unitsTable);
    
    // Dynamic unit resolution with query override
    let unitName = (req.query.unitName as string) || "";
    if (!unitName && req.query.unitId) {
      const u = units.find((x) => x.id === Number(req.query.unitId));
      if (u) unitName = u.name;
    }
    if (!unitName) {
      const unit = c?.unitId ? units.find((u) => u.id === c.unitId) : null;
      unitName = unit?.name || "Bangalore";
    }

    const cReviewNotes = sub?.reviewNotes ?? "";
    let specialization = (req.query.specialization as string) || "";
    if (!specialization) {
      specialization = cReviewNotes.includes("Allocated to ") 
        ? cReviewNotes.replace("Allocated to ", "").split(" [")[0] 
        : (sub?.specialization ? parseSpecializationString(sub.specialization)[0] : "Vitreo Retina");
    }

    // Dynamic stipend with query override
    const stipendQuery = req.query.stipend as string;
    let stipendFormatted = "Rs 40,000 (Rupees Forty Thousand Only)";
    if (stipendQuery) {
      const num = Number(stipendQuery.replace(/[^0-9]/g, ""));
      if (num > 0) {
        stipendFormatted = `Rs ${num.toLocaleString("en-IN")}`;
      } else {
        stipendFormatted = stipendQuery;
      }
    }

    const duration = req.query.duration ? Number(req.query.duration) : (isRetinaSpecialty(specialization) ? 24 : 18);
    const effectiveDate = (req.query.effectiveDate as string) || "1st January 2027";
    const candidateName = (req.query.candidateName as string) || c?.fullName || "Dr. Tejaswini";
    const candidateCode = (req.query.candidateCode as string) || c?.candidateCode || "SAV-2027-001";

    const pdfBuffer = await generateOfferLetterPdf({
      candidateName,
      candidateCode,
      specialization: specialization || "Vitreo Retina",
      unitName,
      cmoName: (req.query.cmoName as string) || "Dr. Kaushik Murali - Chief Medical Officer",
      address: (req.query.address as string) || c?.address || "Sankara Eye Hospital Campus",
      durationMonths: duration,
      effectiveDate,
      stipendAmount: stipendFormatted,
      interviewDate: req.query.interviewDate as string,
      inductionDate: (req.query.inductionDate as string) || "2nd & 3rd July 2026 at Bangalore Main Hospital (For Testing Only)",
    });

    const filename = `Fellowship_Offer_Letter_${candidateCode}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("[offer-letter-pdf] Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate offer letter" });
  }
});

// POST /candidates/:id/send-call-letter (Emails Call Letter with PDF)
router.post("/candidates/:id/send-call-letter", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
    if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }

    const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));
    let spec = (req.body.specialization as string) || "";
    if (!spec && sub?.specialization) {
      try {
        const parsed = typeof sub.specialization === "string" && sub.specialization.startsWith("[")
          ? JSON.parse(sub.specialization)
          : [sub.specialization];
        spec = Array.isArray(parsed) ? parsed.join(", ") : String(sub.specialization);
      } catch (e) {
        spec = String(sub.specialization);
      }
    }
    if (!spec) spec = "Ophthalmology Fellowship";

    const pdfBuffer = await generateCallLetterPdf({
      candidateName: req.body.candidateName || c.fullName,
      candidateCode: c.candidateCode,
      specialization: spec,
      email: c.email,
      phone: c.phone,
      address: req.body.address || c.address,
      applicationId: sub?.id || c.id,
      interviewDate: req.body.interviewDate,
      reportingTime: req.body.reportingTime,
      venue: req.body.venue,
    });

    const isRetina = isRetinaSpecialty(spec);
    const fileName = `Interview_Call_Letter_${isRetina ? "Retina" : "Anterior"}_${c.candidateCode}.pdf`;

    await sendCallLetterWithAttachment({
      toEmail: c.email,
      toName: c.fullName,
      pdfBuffer,
      fileName,
      interviewDate: req.body.interviewDate,
      reportingTime: req.body.reportingTime,
      venue: req.body.venue,
      specialization: spec,
    });

    res.json({ success: true, isRetina, fileName });
  } catch (err: any) {
    console.error("[send-call-letter] Error:", err);
    const status = err.message?.includes("SMTP") ? 400 : 500;
    res.status(status).json({ error: err.message || "Failed to send call letter" });
  }
});

// POST /candidates/:id/send-offer-letter (Emails Offer Letter with PDF)
router.post("/candidates/:id/send-offer-letter", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
    if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }

    const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));
    const units = await db.select().from(unitsTable);

    let unitName = (req.body.unitName as string) || "";
    if (!unitName && req.body.unitId) {
      const u = units.find((x) => x.id === Number(req.body.unitId));
      if (u) unitName = u.name;
    }
    if (!unitName) {
      const unit = c.unitId ? units.find((u) => u.id === c.unitId) : null;
      unitName = unit?.name || "Jaipur";
    }

    const cReviewNotes = sub?.reviewNotes ?? "";
    let specialization = (req.body.specialization as string) || "";
    if (!specialization) {
      specialization = cReviewNotes.includes("Allocated to ") 
        ? cReviewNotes.replace("Allocated to ", "").split(" [")[0] 
        : (sub?.specialization ? parseSpecializationString(sub.specialization)[0] : "Cataract & IOL");
    }

    const stipendBody = req.body.stipend;
    let stipendFormatted = "Rs 40,000 (Rupees Forty Thousand Only)";
    if (stipendBody) {
      const num = typeof stipendBody === "number" ? stipendBody : Number(String(stipendBody).replace(/[^0-9]/g, ""));
      if (num > 0) {
        stipendFormatted = `Rs ${num.toLocaleString("en-IN")}`;
      } else {
        stipendFormatted = String(stipendBody);
      }
    }

    const duration = req.body.duration ? Number(String(req.body.duration).replace(/[^0-9]/g, "")) : (isRetinaSpecialty(specialization) ? 24 : 18);
    const effectiveDate = (req.body.effectiveDate || req.body.start_date as string) || "6th January 2027";
    const interviewDate = (req.body.interviewDate || req.body.interview_date as string) || (isRetinaSpecialty(specialization) ? "7th December 2026" : "8th December 2026");

    const pdfBuffer = await generateOfferLetterPdf({
      candidateName: req.body.candidateName || c.fullName,
      candidateCode: c.candidateCode,
      specialization: specialization || "Cataract & IOL",
      unitName,
      cmoName: req.body.cmoName,
      address: req.body.address || c.address,
      durationMonths: duration,
      effectiveDate,
      stipendAmount: stipendFormatted,
      interviewDate,
      inductionDate: req.body.inductionDate || "2nd & 3rd July 2026 at Bangalore Main Hospital (For Testing Only)",
    });

    const fileName = `Fellowship_Offer_Letter_${c.candidateCode}.pdf`;

    await sendOfferLetterWithAttachment({
      toEmail: c.email,
      toName: c.fullName,
      pdfBuffer,
      fileName,
      specialization,
      unitName,
    });

    res.json({ success: true, fileName });
  } catch (err: any) {
    console.error("[send-offer-letter] Error:", err);
    const status = err.message?.includes("SMTP") ? 400 : 500;
    res.status(status).json({ error: err.message || "Failed to send offer letter" });
  }
});

// GET /candidates/:id/summary-pdf & /candidates/:id/application-pdf — Full Application Dossier PDF
router.get(["/candidates/:id/summary-pdf", "/candidates/:id/application-pdf", "/candidates/:id/pdf"], requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
    if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }

    const full = await fullCandidate(c);
    const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));
    
    // Get Batch info
    const [bc] = await db.select().from(batchCandidatesTable).where(eq(batchCandidatesTable.candidateId, c.id));
    let batch = null;
    if (bc) {
      [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, bc.batchId));
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const filename = `Dossier_${c.fullName.replace(/\s+/g, '_')}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    doc.pipe(res);

    const colors = {
      primary: '#0f172a',
      secondary: '#475569',
      accent: '#f97316', // Orange
      muted: '#94a3b8',
      border: '#e2e8f0',
      bgOrange: '#fff7ed'
    };

    // --- Background Accents ---
    doc.save();
    doc.fillColor(colors.bgOrange).opacity(0.1);
    doc.circle(550, 50, 150).fill();
    doc.circle(50, 750, 100).fill();
    doc.restore();

    // --- Header ---
    const logoPath = path.join(process.cwd(), 'artifacts', 'fellowship-exam', 'src', 'assets', 'seh_sav_logo_1777703794142.jpg');
    let logoLoaded = false;
    try {
      doc.image(logoPath, 50, 40, { width: 130, height: 65 });
      logoLoaded = true;
    } catch (e) {
      // Logo not found - render text fallback
      doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(14).text("SANKARA ACADEMY OF VISION", 50, 50);
    }

    // Header text - Institution info on right side
    doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(16).text("CANDIDATE DOSSIER", 0, 45, { align: 'right', width: 545 });
    doc.fillColor(colors.secondary).font('Helvetica').fontSize(9).text("Sankara Academy of Vision — Fellowship Admissions", 0, 65, { align: 'right', width: 545 });
    doc.fillColor(colors.secondary).font('Helvetica').fontSize(9).text(`Protocol ID: ${c.candidateCode}`, 0, 78, { align: 'right', width: 545 });

    // Header rule
    doc.strokeColor(colors.accent).lineWidth(2).moveTo(50, 112).lineTo(550, 112).stroke();

    // --- Photo ---
    const photoUrl = sub?.photoUrl;
    if (photoUrl && photoUrl.startsWith("/objects/")) {
      const localPath = path.join(process.cwd(), "uploads", photoUrl.replace("/objects/", ""));
      try {
        doc.image(localPath, 460, 120, { width: 85, height: 105 });
        doc.rect(460, 120, 85, 105).strokeColor(colors.border).lineWidth(1).stroke();
      } catch (e) {
        // Skip if photo file missing
      }
    }

    doc.y = 122;
    doc.moveDown(2);

    // --- Section: Primary Profile ---
    doc.rect(50, doc.y, 500, 30).fill(colors.bgOrange);
    doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(12).text("ACADEMIC IDENTITY & PROFILE", 65, doc.y - 22);
    doc.moveDown(0.5);

    const leftCol = 70;
    const rightCol = 320;
    let currY = doc.y;

    const renderField = (label: string, value: any, x: number, y: number) => {
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, y);
      doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(11).text(String(value || "—"), x, y + 12);
    };

    renderField("Full Name", full.fullName, leftCol, currY);
    renderField("Contact Identity", full.email, rightCol, currY);
    currY += 40;
    renderField("Mobile Registry", full.phone, leftCol, currY);
    renderField("Academic Year", batch?.name || "DECEMBER 2026 CYCLE", rightCol, currY);
    currY += 40;
    renderField("Clinical Segment", (sub?.reviewNotes ?? "").replace("Allocated to ", "") || "Fellowship Track", leftCol, currY);
    renderField("Reporting Unit", full.unitName || "Pending Allocation", rightCol, currY);
    doc.moveDown(4);

    // --- Section: Academic & Professional Credentials ---
    doc.rect(50, doc.y, 500, 20).fill(colors.bgOrange);
    doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(10).text("CLINICAL & SURGICAL PEDIGREE", 65, doc.y - 15);
    doc.moveDown(0.5);

    currY = doc.y;
    renderField("Degree / Qualification", sub?.degree || c.qualification, leftCol, currY);
    renderField("Medical College", sub?.medicalCollege || c.collegeName, rightCol, currY);
    currY += 40;
    renderField("Medical Council No.", sub?.medicalCouncilNumber, leftCol, currY);
    renderField("Surgical Experience", sub?.surgicalExperience || "Standard Residency", rightCol, currY);
    currY += 40;
    renderField("Total Surgeries", sub?.totalSurgeries, leftCol, currY);
    renderField("Research / Publications", (sub?.publications ? "PRESENT" : "NONE LISTED"), rightCol, currY);
    doc.moveDown(5);

    // --- Section: Merit Marksheet ---
    doc.rect(50, doc.y, 500, 25).fill(colors.primary);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(10).text("MERIT PERFORMANCE MATRIX", 65, doc.y - 18);
    doc.moveDown(1);

    const marksTableY = doc.y;
    doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(9);
    doc.text("EVALUATION STAGE", 70, marksTableY);
    doc.text("MAXIMUM", 350, marksTableY);
    doc.text("OBTAINED", 450, marksTableY);
    doc.moveDown(0.5);
    doc.strokeColor(colors.border).lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    const renderMarkRow = (label: string, max: number, obtained: any) => {
      const y = doc.y;
      doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(10).text(label, 70, y);
      doc.fillColor(colors.secondary).font('Helvetica').fontSize(10).text(String(max), 350, y);
      doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(11).text(obtained != null ? Number(obtained).toFixed(2) : "—", 450, y);
      doc.moveDown(0.8);
      doc.strokeColor(colors.border).lineWidth(0.5).moveTo(70, doc.y).lineTo(530, doc.y).stroke();
      doc.moveDown(0.5);
    };

    renderMarkRow("MCQ Assessment", batch?.mcqTotalMarks || 50, full.mcqScore);
    renderMarkRow("Psychometry Profile", batch?.psychometricTotalMarks || 50, full.psychometricScore);
    renderMarkRow("Clinical Interview", batch?.interviewTotalMarks || 100, full.interviewScore);
    
    doc.moveDown(1);
    doc.rect(400, doc.y, 130, 30).fill(colors.bgOrange);
    doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(10).text("AGGREGATE", 410, doc.y - 20);
    doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(14).text(full.totalScore != null ? full.totalScore.toFixed(2) : "—", 480, doc.y - 23);

    doc.moveDown(4);

    // --- Section: Preferences & LORs ---
    doc.fillColor(colors.secondary).font('Helvetica-Bold').fontSize(11).text("STRATEGIC PREFERENCES", 50, doc.y);
    doc.moveDown(0.5);
    
    if (full.preferences.length > 0) {
      full.preferences.forEach((p: any, i: number) => {
        doc.fillColor(colors.primary).font('Helvetica').fontSize(10).text(`${i+1}. ${p.specialityName}`, { indent: 20 });
      });
    } else {
      doc.fillColor(colors.muted).font('Helvetica').fontSize(10).text("Institutional Choice", { indent: 20 });
    }

    doc.moveDown(2);
    doc.fillColor(colors.secondary).font('Helvetica-Bold').fontSize(11).text("PROFESSIONAL REFERENCES (LOR)", 50, doc.y);
    doc.moveDown(0.5);
    
    const renderLOR = (num: number, name: string, contact: string, email: string, status: boolean) => {
      doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(9).text(`LOR ${num}: ${name || "—"}`, { indent: 20 });
      doc.fillColor(colors.secondary).font('Helvetica').fontSize(8).text(`Contact: ${contact || "—"} | Email: ${email || "—"}`, { indent: 35 });
      doc.fillColor(status ? '#10b981' : colors.muted).font('Helvetica-Bold').fontSize(8).text(`STATUS: ${status ? "PROCESSED & VERIFIED" : "PENDING"}`, { indent: 35 });
      doc.moveDown(0.5);
    };

    renderLOR(1, sub?.lor1RefName || "", sub?.lor1RefContact || "", sub?.lor1RefEmail || "", !!sub?.lor1Url);
    renderLOR(2, sub?.lor2RefName || "", sub?.lor2RefContact || "", sub?.lor2RefEmail || "", !!sub?.lor2Url);

    // --- Footer ---
    const bottom = 750;
    doc.strokeColor(colors.accent).lineWidth(2).moveTo(50, bottom).lineTo(550, bottom).stroke();
    doc.fillColor(colors.muted).font('Helvetica').fontSize(8).text("CONFIDENTIAL DOCUMENT - FOR INTERNAL USE ONLY", 50, bottom + 10);
    doc.text("SANKARA ACADEMY OF VISION - FELLOWSHIP ADMISSIONS HUB", 50, bottom + 22);
    doc.text(`Generated on ${formatToLocalDateTime(new Date())}`, 350, bottom + 10, { align: 'right' });

    doc.end();
  } catch (e: any) {
    console.error("[summary-pdf] failed", e);
    res.status(500).json({ error: e.message || "Failed to generate summary PDF." });
  }
});

// POST /candidates/:id/batches — Assign specific applications to batches directly
router.post("/candidates/:id/batches", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const candidateId = Number(req.params.id);
  const { schedules } = req.body as { schedules: { applicationId: number; batchId: number | null }[] };
  
  try {
    for (const s of schedules) {
      let appId = s.applicationId;
      if (appId <= 0) {
        const specId = Math.abs(appId);
        const [existingApp] = await db.select().from(applicationsTable).where(
          and(eq(applicationsTable.candidateId, candidateId), eq(applicationsTable.specialityId, specId))
        );
        if (existingApp) {
          appId = existingApp.id;
        } else {
          const sp = (await db.select().from(specialitiesTable).where(eq(specialitiesTable.id, specId)))[0];
          const prefix = sp?.code ? sp.code.toUpperCase() : "GEN";
          const countResult = await db.execute(sql`
            SELECT COUNT(*)::int as count FROM applications WHERE speciality_id = ${specId} AND hall_ticket_number IS NOT NULL
          `);
          const seq = Number(countResult.rows[0]?.count ?? 0) + 1;
          const hallTicketNumber = `${prefix}-2026-${String(seq).padStart(3, "0")}`;
          const [newApp] = await db.insert(applicationsTable).values({
            candidateId,
            specialityId: specId,
            hallTicketNumber,
            status: "approved",
          }).returning();
          if (newApp) appId = newApp.id;
        }
      }

      if (s.batchId) {
        // 1. Update applicationsTable
        await db.update(applicationsTable)
          .set({ batchId: s.batchId, status: "scheduled" })
          .where(and(eq(applicationsTable.id, appId), eq(applicationsTable.candidateId, candidateId)));
          
        // 2. Insert or update in batchCandidatesTable
        const existing = await db.select().from(batchCandidatesTable).where(
          and(
            eq(batchCandidatesTable.batchId, s.batchId),
            eq(batchCandidatesTable.candidateId, candidateId)
          )
        );
        if (existing.length === 0) {
          await db.insert(batchCandidatesTable).values({
            batchId: s.batchId,
            candidateId,
            status: "assigned"
          });
        }
      } else {
        // Remove batchId
        const [appRow] = await db.select().from(applicationsTable).where(eq(applicationsTable.id, appId));
        if (appRow && appRow.batchId) {
          await db.delete(batchCandidatesTable).where(
            and(
              eq(batchCandidatesTable.batchId, appRow.batchId),
              eq(batchCandidatesTable.candidateId, candidateId)
            )
          );
        }
        await db.update(applicationsTable)
          .set({ batchId: null, status: "approved" })
          .where(and(eq(applicationsTable.id, appId), eq(applicationsTable.candidateId, candidateId)));
      }
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to update schedules" });
  }
});

// ── Merge 2 Candidates / Applications ─────────────────────────────────────────
router.post(
  "/candidates/merge",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    try {
      const { primaryId, secondaryId, deleteSecondary } = req.body;
      const primIdNum = Number(primaryId);
      const secIdNum = Number(secondaryId);

      if (!primIdNum || !secIdNum || primIdNum === secIdNum) {
        return res.status(400).json({ error: "Please select two distinct candidates to merge." });
      }

      const [prim] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, primIdNum));
      const [sec] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, secIdNum));

      if (!prim || !sec) {
        return res.status(404).json({ error: "One or both candidates could not be found." });
      }

      // 1. Re-point Applications
      await db.update(applicationsTable).set({ candidateId: prim.id }).where(eq(applicationsTable.candidateId, sec.id));

      // 2. Re-point Preferences (without duplicate conflicts)
      const existingPrefs = await db.select().from(candidatePreferencesTable).where(eq(candidatePreferencesTable.candidateId, prim.id));
      const secPrefs = await db.select().from(candidatePreferencesTable).where(eq(candidatePreferencesTable.candidateId, sec.id));
      let nextOrder = existingPrefs.length > 0 ? Math.max(...existingPrefs.map((p) => p.preferenceOrder)) + 1 : 1;

      for (const sp of secPrefs) {
        const alreadyHas = existingPrefs.some((ep) => ep.specialityId === sp.specialityId);
        if (!alreadyHas) {
          await db.insert(candidatePreferencesTable).values({
            candidateId: prim.id,
            specialityId: sp.specialityId,
            preferenceOrder: nextOrder++,
          }).onConflictDoNothing().catch(() => {});
        }
      }
      await db.delete(candidatePreferencesTable).where(eq(candidatePreferencesTable.candidateId, sec.id)).catch(() => {});

      // 3. Re-point Interview Scores, Documents, Exams & Doctor Assignments
      await db.update(interviewScoresTable).set({ candidateId: prim.id }).where(eq(interviewScoresTable.candidateId, sec.id)).catch(() => {});
      await db.update(documentsTable).set({ candidateId: prim.id }).where(eq(documentsTable.candidateId, sec.id)).catch(() => {});
      await db.update(examAttemptsTable).set({ candidateId: prim.id }).where(eq(examAttemptsTable.candidateId, sec.id)).catch(() => {});
      await db.update(doctorAssignmentsTable).set({ candidateId: prim.id }).where(eq(doctorAssignmentsTable.candidateId, sec.id)).catch(() => {});
      await db.update(candidateExamAssignmentsTable).set({ candidateId: prim.id }).where(eq(candidateExamAssignmentsTable.candidateId, sec.id)).catch(() => {});
      await db.update(batchCandidatesTable).set({ candidateId: prim.id }).where(eq(batchCandidatesTable.candidateId, sec.id)).catch(() => {});
      await db.update(applicationSubmissionsTable).set({ candidateId: prim.id }).where(eq(applicationSubmissionsTable.candidateId, sec.id)).catch(() => {});

      // 4. Merge demographic / score attributes
      const highestMcq = Math.max(parseFloat(prim.mcqScore || "0"), parseFloat(sec.mcqScore || "0"));
      const highestPsycho = Math.max(parseFloat(prim.psychometricScore || "0"), parseFloat(sec.psychometricScore || "0"));

      await db.update(candidatesTable).set({
        phone: prim.phone || sec.phone,
        dateOfBirth: prim.dateOfBirth || sec.dateOfBirth,
        gender: prim.gender || sec.gender,
        qualification: prim.qualification || sec.qualification,
        collegeName: prim.collegeName || sec.collegeName,
        address: prim.address || sec.address,
        unitId: prim.unitId || sec.unitId,
        mcqScore: highestMcq > 0 ? String(highestMcq) : prim.mcqScore || sec.mcqScore,
        psychometricScore: highestPsycho > 0 ? String(highestPsycho) : prim.psychometricScore || sec.psychometricScore,
      }).where(eq(candidatesTable.id, prim.id));

      // 5. Permanently delete secondary candidate so old profile is removed
      await db.delete(candidatesTable).where(eq(candidatesTable.id, sec.id));

      const mergedCand = await fullCandidate(prim);

      return res.json({
        success: true,
        message: `Successfully merged Candidate ${sec.candidateCode} (${sec.fullName}) into ${prim.candidateCode} (${prim.fullName})`,
        primaryCandidate: mergedCand,
      });
    } catch (err: any) {
      console.error("[merge-candidates] error:", err);
      return res.status(500).json({ error: "Failed to merge candidates", details: err.message });
    }
  }
);

export default router;
