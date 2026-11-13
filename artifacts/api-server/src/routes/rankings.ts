import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { 
  readDb, 
  specialitiesTable, 
  candidatesTable, 
  unitsTable,
  programsTable,
  applicationSubmissionsTable
} from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeScoresForProgram, getSpecialitySegment } from "../lib/scoring";
import { generateRankSheetPdf, type SpecialityRankSheetGroup } from "../lib/attendance-and-ranks";
import * as XLSX from "xlsx";

const router: Router = Router();

// Styled spreadsheet helper constants
const HEADER_FONT  = { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" };
const HEADER_ALIGN = { horizontal: "center", vertical: "center", wrapText: false };
const ROW_EVEN     = { patternType: "solid", fgColor: { rgb: "E8F0FE" } };
const ROW_ODD      = { patternType: "solid", fgColor: { rgb: "FFFFFF" } };
const BODY_FONT    = { sz: 10, name: "Calibri" };
const BODY_ALIGN   = { horizontal: "left", vertical: "center", wrapText: false };
const THIN_BORDER  = {
  top:    { style: "thin", color: { rgb: "C5D3E8" } },
  bottom: { style: "thin", color: { rgb: "C5D3E8" } },
  left:   { style: "thin", color: { rgb: "C5D3E8" } },
  right:  { style: "thin", color: { rgb: "C5D3E8" } },
};

function buildStyledSheet(rows: Record<string, any>[], headerColorHex: string = "0B4A8F"): XLSX.WorkSheet {
  if (rows.length === 0) {
    const ws = XLSX.utils.json_to_sheet([]);
    return ws;
  }

  const headers = Object.keys(rows[0]);
  const numCols = headers.length;
  const numRows = rows.length;

  const wsData: any[][] = [headers, ...rows.map(r => headers.map(h => r[h] ?? ""))];
  const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(wsData);

  for (let R = 0; R <= numRows; R++) {
    for (let C = 0; C < numCols; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      const cell = ws[addr];

      if (R === 0) {
        cell.s = {
          fill:      { patternType: "solid", fgColor: { rgb: headerColorHex } },
          font:      HEADER_FONT,
          alignment: HEADER_ALIGN,
          border:    THIN_BORDER,
        };
      } else {
        cell.s = {
          fill:      R % 2 === 0 ? ROW_ODD : ROW_EVEN,
          font:      BODY_FONT,
          alignment: BODY_ALIGN,
          border:    THIN_BORDER,
        };
      }
    }
  }

  ws["!cols"] = headers.map((h) => {
    let maxLen = h.length;
    for (const row of rows) {
      const v = row[h];
      if (v != null) maxLen = Math.max(maxLen, String(v).length);
    }
    return { wch: Math.min(maxLen + 4, 50) };
  });

  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: numCols - 1, r: numRows } }),
  };
  ws["!rows"] = [{ hpt: 22 }, ...Array(numRows).fill({ hpt: 18 })];

  return ws;
}

// GET /rankings — get ranked candidates list
router.get(
  "/rankings",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const programId = Number(req.query["programId"]);
    if (!programId) { res.status(400).json({ error: "programId required" }); return; }

    try {
      const specFilter = req.query["specialityId"] ? Number(req.query["specialityId"]) : undefined;
      const segmentFilter = req.query["segment"] ? String(req.query["segment"]) : undefined;
      const examFilter = req.query["examId"] ? Number(req.query["examId"]) : undefined;

      const scores = await computeScoresForProgram(programId, Boolean((req as any).isMockMode));
      const specs = await readDb.select().from(specialitiesTable).where(eq(specialitiesTable.programId, programId));
      
      let filteredScores = scores;

      // Filter by exam if requested
      if (examFilter) {
        const { examAttemptsTable, candidateExamAssignmentsTable } = await import("@workspace/db");
        const examAttempts = await readDb.select().from(examAttemptsTable).where(eq(examAttemptsTable.examId, examFilter));
        const examAssignments = await readDb.select().from(candidateExamAssignmentsTable).where(eq(candidateExamAssignmentsTable.examId, examFilter));
        const examCandIds = new Set([
          ...examAttempts.map(a => a.candidateId),
          ...examAssignments.map(a => a.candidateId)
        ]);
        if (examCandIds.size > 0) {
          filteredScores = filteredScores.filter(s => examCandIds.has(s.candidateId));
        }
      }

      const candidateIds = filteredScores.map(s => s.candidateId);
      const candidates = candidateIds.length > 0 
        ? await readDb.select().from(candidatesTable).where(inArray(candidatesTable.id, candidateIds))
        : [];
      const unitIds = [...new Set(candidates.map(c => c.unitId).filter(Boolean))] as number[];
      const units = unitIds.length > 0 
        ? await readDb.select().from(unitsTable).where(inArray(unitsTable.id, unitIds))
        : [];

      // Filter by speciality if requested
      if (specFilter) {
        filteredScores = filteredScores.filter(s => s.specialityScores[specFilter] !== undefined);
      }

      // Filter by segment if requested
      if (segmentFilter) {
        filteredScores = filteredScores.filter(s => {
          return s.preferenceSpecIds.some(id => {
            const spec = specs.find(sp => sp.id === id);
            return spec ? getSpecialitySegment(spec.name) === segmentFilter : false;
          });
        });
      }
      res.json(filteredScores.map((s) => {
        const topSpecId = specFilter || s.preferenceSpecIds[0];
        const topSpec = topSpecId ? specs.find((x) => x.id === topSpecId) : null;
        
        const cand = candidates.find((c) => c.id === s.candidateId);
        const unit = cand?.unitId ? units.find((u) => u.id === cand.unitId) : null;

        const vivaStatus = specFilter ? (s.specialityVivaStatus[specFilter] ?? "complete") : (topSpecId ? (s.specialityVivaStatus[topSpecId] ?? "complete") : "complete");
        const enabledDoctorCount = specFilter ? (s.specialityEnabledDoctorCount[specFilter] ?? 0) : (topSpecId ? (s.specialityEnabledDoctorCount[topSpecId] ?? 0) : 0);


        return {
          candidateId: s.candidateId,
          candidateCode: s.candidateCode,
          fullName: s.fullName,
          mcqScore: s.mcqScore,
          psychometricScore: s.psychometricScore,
          interviewScore: specFilter ? (s.specialityInterviewScores[specFilter] ?? 0) : s.interviewScore,
          totalScore: specFilter ? (s.specialityScores[specFilter] ?? 0) : s.totalScore,
          rank: specFilter ? (s.specialityRanks[specFilter] ?? null) : null,
          specialityRank: topSpecId ? (s.specialityRanks[topSpecId] ?? null) : null,
          segmentRank: null,
          topPreference: topSpec?.name ?? null,
          appliedSpecialityNames: s.preferenceSpecIds.map(id => specs.find(sp => sp.id === id)?.name).filter(Boolean),
          specialityBreakdown: s.preferenceSpecIds.map((id) => {
            const sp = specs.find((x) => x.id === id);
            return {
              specialityId: id,
              specialityName: sp?.name ?? "",
              specialityCode: sp?.code ?? "",
              vivaScore: s.specialityInterviewScores[id] ?? 0,
              totalScore: s.specialityScores[id] ?? 0,
              rank: s.specialityRanks[id] ?? null,
              vivaStatus: s.specialityVivaStatus[id] ?? "pending",
            };
          }),
          unitName: unit?.name ?? null,
          status: cand?.status ?? "pending",
          preferredLocations: topSpecId ? (s.preferredLocations[topSpecId] ?? []) : [],
          phone: cand?.phone ?? "",
          email: cand?.email ?? "",
          vivaStatus,
          enabledDoctorCount,
          isPendingViva: vivaStatus === "pending",
        };
      }));

    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

// GET /rankings/export — Export separate rank sheets per specialization + consolidated merit list as Excel workbook
router.get(
  "/rankings/export",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const programId = Number(req.query["programId"]);
    if (!programId) { res.status(400).json({ error: "programId required" }); return; }

    try {
      const specFilter = req.query["specialityId"] && req.query["specialityId"] !== "all"
        ? Number(req.query["specialityId"])
        : undefined;
      const examFilter = req.query["examId"] && req.query["examId"] !== "all"
        ? Number(req.query["examId"])
        : undefined;

      let scores = await computeScoresForProgram(programId, Boolean((req as any).isMockMode));
      if (examFilter && !isNaN(examFilter)) {
        const { examAttemptsTable, candidateExamAssignmentsTable } = await import("@workspace/db");
        const examAttempts = await readDb.select().from(examAttemptsTable).where(eq(examAttemptsTable.examId, examFilter));
        const examAssignments = await readDb.select().from(candidateExamAssignmentsTable).where(eq(candidateExamAssignmentsTable.examId, examFilter));
        const examCandIds = new Set([
          ...examAttempts.map(a => a.candidateId),
          ...examAssignments.map(a => a.candidateId)
        ]);
        if (examCandIds.size > 0) {
          scores = scores.filter(s => examCandIds.has(s.candidateId));
        }
      }

      const allSpecs = await readDb.select().from(specialitiesTable).where(eq(specialitiesTable.programId, programId));
      const specs = specFilter && !isNaN(specFilter) ? allSpecs.filter(s => s.id === specFilter) : allSpecs;

      const candIds = scores.map(s => s.candidateId);
      const candidates = candIds.length > 0
        ? await readDb.select().from(candidatesTable).where(inArray(candidatesTable.id, candIds))
        : [];
      const units = await readDb.select().from(unitsTable);
      const unitMap = new Map(units.map(u => [u.id, u.name]));
      const candMap = new Map(candidates.map(c => [c.id, c]));
      const specNameMap = new Map(allSpecs.map(s => [s.id, s.name]));

      const wb = XLSX.utils.book_new();
      const consolidatedRows: Record<string, any>[] = [];

      // Generate separate rank sheets for each specialization
      for (const spec of specs) {
        const specCandidates = scores.filter(s => s.specialityScores[spec.id] !== undefined);
        
        // Sort graded candidates first by rank/total DESC, then pending viva candidates
        specCandidates.sort((a, b) => {
          const pendA = a.specialityVivaStatus[spec.id] === "pending" ? 1 : 0;
          const pendB = b.specialityVivaStatus[spec.id] === "pending" ? 1 : 0;
          if (pendA !== pendB) return pendA - pendB;
          const scoreA = a.specialityScores[spec.id] ?? 0;
          const scoreB = b.specialityScores[spec.id] ?? 0;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return (a.specialityRanks[spec.id] ?? 9999) - (b.specialityRanks[spec.id] ?? 9999);
        });

        const specRows = specCandidates.map((s) => {
          const isPending = s.specialityVivaStatus[spec.id] === "pending";
          const rank = isPending ? "Pending" : (s.specialityRanks[spec.id] ?? "Pending");
          const totalScore = s.specialityScores[spec.id] ?? 0;
          const intScore = s.specialityInterviewScores[spec.id] ?? 0;
          const cand = candMap.get(s.candidateId);
          const otherSpecs = s.preferenceSpecIds
            .filter(id => id !== spec.id)
            .map(id => specNameMap.get(id))
            .filter(Boolean)
            .join(", ");

          const row = {
            "Rank": rank,
            "Application No": s.candidateCode,
            "Student Name": s.fullName,
            "Speciality": spec.name,
            "Other Applied Specialities": otherSpecs || "—",
            "MCQ (/50)": Number(s.mcqScore.toFixed(1)),
            "Mind Matters (/10)": Number(s.psychometricScore.toFixed(1)),
            "Doctor Viva (/50)": isPending ? "Pending" : Number(intScore.toFixed(1)),
            "Total (/110)": Number(totalScore.toFixed(2)),
            "Status": cand?.status || "approved",
            "Allocated Unit": cand?.unitId ? (unitMap.get(cand.unitId) || "—") : "—",
          };
          consolidatedRows.push(row);
          return row;
        });

        const sheetName = spec.name.replace(/[\\/?*\[\]:]/g, "").substring(0, 30);
        const wsSpec = buildStyledSheet(specRows, "0B4A8F");
        XLSX.utils.book_append_sheet(wb, wsSpec, sheetName);
      }

      if (!specFilter && consolidatedRows.length > 0) {
        const wsAll = buildStyledSheet(consolidatedRows, "1E293B");
        XLSX.utils.book_append_sheet(wb, wsAll, "Consolidated Merit List");
      }

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
      
      const now = new Date();
      const YYYY = now.getFullYear();
      const MM = String(now.getMonth() + 1).padStart(2, "0");
      const DD = String(now.getDate()).padStart(2, "0");
      const HH = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const timestamp = `${YYYY}${MM}${DD}_${HH}${mm}`;
      const filename = `Rankings_${timestamp}.xlsx`;

      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

// GET /rankings/export-pdf — Export official speciality-wise Merit Rank Sheet PDF
router.get(
  "/rankings/export-pdf",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const programId = Number(req.query["programId"]);
    if (!programId) { res.status(400).json({ error: "programId required" }); return; }

    try {
      const specFilter = req.query["specialityId"] && req.query["specialityId"] !== "all"
        ? Number(req.query["specialityId"])
        : undefined;
      const examFilter = req.query["examId"] && req.query["examId"] !== "all"
        ? Number(req.query["examId"])
        : undefined;

      let scores = await computeScoresForProgram(programId, Boolean((req as any).isMockMode));
      if (examFilter && !isNaN(examFilter)) {
        const { examAttemptsTable, candidateExamAssignmentsTable } = await import("@workspace/db");
        const examAttempts = await readDb.select().from(examAttemptsTable).where(eq(examAttemptsTable.examId, examFilter));
        const examAssignments = await readDb.select().from(candidateExamAssignmentsTable).where(eq(candidateExamAssignmentsTable.examId, examFilter));
        const examCandIds = new Set([
          ...examAttempts.map(a => a.candidateId),
          ...examAssignments.map(a => a.candidateId)
        ]);
        if (examCandIds.size > 0) {
          scores = scores.filter(s => examCandIds.has(s.candidateId));
        }
      }

      const [programs, allSpecs, units] = await Promise.all([
        readDb.select().from(programsTable).where(eq(programsTable.id, programId)),
        readDb.select().from(specialitiesTable).where(eq(specialitiesTable.programId, programId)),
        readDb.select().from(unitsTable),
      ]);
      const program = programs[0];
      const specs = specFilter && !isNaN(specFilter) ? allSpecs.filter(s => s.id === specFilter) : allSpecs;
      const candIds = scores.map(s => s.candidateId);
      const candidates = candIds.length > 0
        ? await readDb.select().from(candidatesTable).where(inArray(candidatesTable.id, candIds))
        : [];
      const submissions = candIds.length > 0
        ? await readDb.select().from(applicationSubmissionsTable).where(inArray(applicationSubmissionsTable.candidateId, candIds))
        : [];

      const candMap = new Map(candidates.map(c => [c.id, c]));
      const subByCand = new Map(submissions.filter(s => s.candidateId).map(s => [s.candidateId!, s]));
      const unitMap = new Map(units.map(u => [u.id, u.name]));
      const specNameMap = new Map(allSpecs.map(s => [s.id, s.name]));

      const groups: SpecialityRankSheetGroup[] = specs
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((spec) => {
          const specCandidates = scores.filter(s => s.specialityScores[spec.id] !== undefined);
          specCandidates.sort((a, b) => {
            const pendA = a.specialityVivaStatus[spec.id] === "pending" ? 1 : 0;
            const pendB = b.specialityVivaStatus[spec.id] === "pending" ? 1 : 0;
            if (pendA !== pendB) return pendA - pendB;
            const scoreA = a.specialityScores[spec.id] ?? 0;
            const scoreB = b.specialityScores[spec.id] ?? 0;
            if (scoreB !== scoreA) return scoreB - scoreA;
            return (a.specialityRanks[spec.id] ?? 9999) - (b.specialityRanks[spec.id] ?? 9999);
          });

          return {
            specialityId: spec.id,
            specialityName: spec.name,
            specialityCode: spec.code,
            rows: specCandidates.map((s) => {
              const isPending = s.specialityVivaStatus[spec.id] === "pending";
              const cand = candMap.get(s.candidateId);
              const sub = subByCand.get(s.candidateId);
              const qual = [sub?.pgQualifications || cand?.qualification, sub?.degree].filter(Boolean).join(" · ") || null;
              const otherSpecs = s.preferenceSpecIds
                .filter(id => id !== spec.id)
                .map(id => specNameMap.get(id))
                .filter((n): n is string => Boolean(n));

              return {
                rank: isPending ? null : (s.specialityRanks[spec.id] ?? null),
                candidateCode: s.candidateCode,
                fullName: s.fullName,
                qualification: qual,
                otherSpecialities: otherSpecs,
                mcqScore: s.mcqScore,
                psychometricScore: s.psychometricScore,
                vivaScore: isPending ? null : (s.specialityInterviewScores[spec.id] ?? null),
                totalScore: s.specialityScores[spec.id] ?? null,
                status: cand?.status ?? "approved",
                unitName: cand?.unitId ? (unitMap.get(cand.unitId) ?? null) : null,
              };
            }),
          };
        });

      const pdfBuffer = await generateRankSheetPdf({
        programName: program?.name || "Fellowship Program",
        academicSession: program?.academicYear || "2026",
        groups,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Merit_Rank_Sheet_${program?.code || programId}.pdf"`);
      res.send(pdfBuffer);
    } catch (e: any) {
      console.error("[rankings-export-pdf] error:", e);
      res.status(500).json({ error: e.message || "Failed to generate Rank Sheet PDF" });
    }
  }
);

export default router;
