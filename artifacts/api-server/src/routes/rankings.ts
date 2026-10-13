import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { 
  readDb, 
  specialitiesTable, 
  candidatesTable, 
  unitsTable
} from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeScoresForProgram, getSpecialitySegment } from "../lib/scoring";
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

      const scores = await computeScoresForProgram(programId);
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

// GET /rankings/export — Export separate rank sheets per specialization as Excel workbook
router.get(
  "/rankings/export",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const programId = Number(req.query["programId"]);
    if (!programId) { res.status(400).json({ error: "programId required" }); return; }

    try {
      const scores = await computeScoresForProgram(programId);
      const specs = await readDb.select().from(specialitiesTable).where(eq(specialitiesTable.programId, programId));

      const wb = XLSX.utils.book_new();

      // Generate separate rank sheets for each specialization
      for (const spec of specs) {
        const specCandidates = scores.filter(s => s.specialityScores[spec.id] !== undefined);
        
        // Sort by total score descending (Total DESC), then rank ascending
        specCandidates.sort((a, b) => {
          const scoreA = a.specialityScores[spec.id] ?? 0;
          const scoreB = b.specialityScores[spec.id] ?? 0;
          if (scoreB !== scoreA) return scoreB - scoreA;
          const rankA = a.specialityRanks[spec.id] ?? 999;
          const rankB = b.specialityRanks[spec.id] ?? 999;
          return rankA - rankB;
        });

        const specRows = specCandidates.map((s) => {
          const rank = s.specialityRanks[spec.id] ?? 999;
          const score = s.specialityScores[spec.id] ?? 0;
          const intScore = s.specialityInterviewScores[spec.id] ?? 0;

          return {
            "Rank": rank,
            "Application No": s.candidateCode,
            "Student Name": s.fullName,
            "Speciality": spec.name,
            "MCQ": Number(s.mcqScore.toFixed(1)),
            "Viva": Number(intScore.toFixed(1)),
            "Mind Matters": Number(s.psychometricScore.toFixed(1)),
            "Total": Number(score.toFixed(2)),
          };
        });

        // Limit sheet name to maximum 31 characters as required by excel
        const sheetName = spec.name.substring(0, 30);
        const wsSpec = buildStyledSheet(specRows, "0B4A8F");
        XLSX.utils.book_append_sheet(wb, wsSpec, sheetName);
      }

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      
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

export default router;
