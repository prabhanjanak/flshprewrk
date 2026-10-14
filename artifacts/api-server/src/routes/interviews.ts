import { Router } from "express";
import { and, eq, sql, desc } from "drizzle-orm";
import { 
  db, 
  doctorAssignmentsTable, 
  interviewScoresTable, 
  candidatesTable, 
  unitsTable, 
  usersTable, 
  applicationsTable,
  applicationSubmissionsTable,
  specialitiesTable,
  batchCandidatesTable,
  batchesTable,
  auditLogsTable
} from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";
import * as XLSX from "xlsx";

const router: Router = Router();

// Doctor / Admin: get assigned candidates
router.get("/interviews/assignments", requireAuth, requireRole("doctor", "super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const userId = req.user!.userId;

  // 1. Identify active panel and its speciality
  const panelQuery = await db.execute(sql`
    SELECT ip.id as panel_id, ip.speciality_id, s.name as speciality_name, ip.name as panel_name, ip.is_mind_matter
    FROM interview_panel_members ipm
    JOIN interview_panels ip ON ip.id = ipm.panel_id
    LEFT JOIN specialities s ON s.id = ip.speciality_id
    WHERE ipm.doctor_id = ${userId} AND ip.is_active = TRUE
    LIMIT 1
  `);
  const activePanel = panelQuery.rows[0] as { panel_id: number; speciality_id: number | null; speciality_name: string | null; panel_name: string; is_mind_matter?: boolean } | undefined;
  
  const specialityId = activePanel?.speciality_id ?? null;
  const panelId = activePanel?.panel_id ?? null;

  // 2. Try fetching candidates from panel queue
  let queueEntries: Array<Record<string, unknown>> = [];
  if (panelId) {
    queueEntries = (await db.execute(sql`
      SELECT pq.id as queue_id, pq.candidate_id, pq.status as queue_status,
             c.full_name, c.candidate_code, c.email, c.phone, c.qualification, c.college_name, c.status as candidate_status,
             sub.id as submission_id, sub.pg_qualifications, sub.specialization
      FROM panel_queue pq
      JOIN candidates c ON c.id = pq.candidate_id
      LEFT JOIN application_submissions sub ON LOWER(sub.email) = LOWER(c.email)
      WHERE pq.panel_id = ${panelId}
      ORDER BY pq.queue_position ASC, pq.created_at ASC
    `)).rows as Array<Record<string, unknown>>;
  }

  // 3. Fallback: If no panel queue items or no active panel, load candidates by speciality preference or doctor assignments
  if (queueEntries.length === 0) {
    if (specialityId) {
      queueEntries = (await db.execute(sql`
        SELECT DISTINCT c.id as candidate_id, c.id as queue_id, 'pending' as queue_status,
               c.full_name, c.candidate_code, c.email, c.phone, c.qualification, c.college_name, c.status as candidate_status,
               sub.id as submission_id, sub.pg_qualifications, sub.specialization
        FROM candidates c
        JOIN candidate_preferences cp ON cp.candidate_id = c.id
        LEFT JOIN application_submissions sub ON LOWER(sub.email) = LOWER(c.email)
        WHERE cp.speciality_id = ${specialityId} AND c.status != 'rejected'
        ORDER BY c.full_name ASC
      `)).rows as Array<Record<string, unknown>>;
    } else {
      // General list of approved/active candidates
      queueEntries = (await db.execute(sql`
        SELECT DISTINCT c.id as candidate_id, c.id as queue_id, 'pending' as queue_status,
               c.full_name, c.candidate_code, c.email, c.phone, c.qualification, c.college_name, c.status as candidate_status,
               sub.id as submission_id, sub.pg_qualifications, sub.specialization, c.created_at
        FROM candidates c
        LEFT JOIN application_submissions sub ON LOWER(sub.email) = LOWER(c.email)
        WHERE c.status IN ('approved', 'interview_completed', 'allocated', 'pending')
        ORDER BY c.created_at DESC
        LIMIT 100
      `)).rows as Array<Record<string, unknown>>;
    }
  }

  const scores = await db.select().from(interviewScoresTable).where(
    specialityId
      ? eq(interviewScoresTable.specialityId, specialityId)
      : eq(interviewScoresTable.doctorId, userId)
  );

  res.json(queueEntries.map((q) => {
    const candidateId = Number(q["candidate_id"]);
    const sc = scores.find((s) => s.candidateId === candidateId);
    return {
      id: Number(q["queue_id"] ?? candidateId),
      candidateId,
      candidateName: String(q["full_name"] ?? ""),
      candidateCode: String(q["candidate_code"] ?? ""),
      specialityId,
      specialityName: activePanel?.speciality_name ?? (q["specialization"] ? String(q["specialization"]) : (activePanel?.panel_name ?? "Fellowship Specialty")),
      email: String(q["email"] ?? "N/A"),
      phone: String(q["phone"] ?? "N/A"),
      qualification: String(q["qualification"] ?? "N/A"),
      pgQualifications: String(q["pg_qualifications"] ?? "N/A"),
      collegeName: String(q["college_name"] ?? "N/A"),
      submissionId: q["submission_id"] ? Number(q["submission_id"]) : null,
      unitName: null,
      scheduledAt: null,
      status: sc ? "completed" : (q["queue_status"] === "completed" ? "completed" : "pending"),
      existingScore: sc ? { id: sc.id, score: sc.score, remarks: sc.remarks, submittedAt: sc.submittedAt.toISOString() } : null,
    };
  }));
});

// Admin: get all interview scores with candidate/doctor names
router.get("/interviews/scores", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const scores = await db.select().from(interviewScoresTable);
  const candidates = await db.select().from(candidatesTable);
  const users = await db.select().from(usersTable);
  
  // Also get batches to find total marks
  const { db: workspaceDb, batchesTable } = await import("@workspace/db");
  const batches = await db.select().from(batchesTable);

  res.json(scores.map((s) => {
    const cand = candidates.find((c) => c.id === s.candidateId);
    const doc = users.find((u) => u.id === s.doctorId);
    
    // Find batch for this candidate to get total marks
    // (This is an approximation based on the program)
    const batch = batches[0] ?? null; // Use first available batch for total marks

    return {
      id: s.id,
      candidateId: s.candidateId,
      candidateName: cand?.fullName ?? `#${s.candidateId}`,
      candidateCode: cand?.candidateCode ?? "",
      doctorId: s.doctorId,
      doctorName: doc?.fullName ?? `#${s.doctorId}`,
      score: s.score,
      specialityId: s.specialityId,
      totalMarks: batch?.interviewTotalMarks ?? 100,
      remarks: s.remarks,
      submittedAt: s.submittedAt.toISOString(),
    };
  }));
});

// Admin: update an individual score entry
router.patch("/interviews/scores/:scoreId", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const scoreId = Number(req.params.scoreId);
    const { score, remarks } = req.body as { score: number; remarks?: string };
    if (score == null || isNaN(score)) {
      res.status(400).json({ error: "Score is required" });
      return;
    }

    const [existingScore] = await db.select().from(interviewScoresTable).where(eq(interviewScoresTable.id, scoreId));
    if (!existingScore) {
      res.status(404).json({ error: "Score not found" });
      return;
    }

    let maxScore = 50;
    if (existingScore.specialityId) {
      const panelQuery = await db.execute(sql`
        SELECT ip.is_mind_matter
        FROM interview_panel_members ipm
        JOIN interview_panels ip ON ip.id = ipm.panel_id
        WHERE ipm.doctor_id = ${existingScore.doctorId} AND ip.speciality_id = ${existingScore.specialityId}
        LIMIT 1
      `);
      const isMindMatter = (panelQuery.rows[0] as { is_mind_matter: boolean } | undefined)?.is_mind_matter;
      if (isMindMatter) maxScore = 10;
    }

    if (score < 0 || score > maxScore) {
      res.status(400).json({ error: `Score must be between 0 and ${maxScore}` });
      return;
    }

    const [updated] = await db.update(interviewScoresTable)
      .set({ score, remarks: remarks ?? null, submittedAt: new Date() })
      .where(eq(interviewScoresTable.id, scoreId))
      .returning();

    const { recalculateCandidateStatus } = await import("./candidates");
    await recalculateCandidateStatus(existingScore.candidateId);

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete an individual score entry
router.delete("/interviews/scores/:scoreId", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const scoreId = Number(req.params.scoreId);
    const [existingScore] = await db.select().from(interviewScoresTable).where(eq(interviewScoresTable.id, scoreId));
    if (!existingScore) {
      res.status(404).json({ error: "Score not found" });
      return;
    }

    await db.delete(interviewScoresTable).where(eq(interviewScoresTable.id, scoreId));

    const { recalculateCandidateStatus } = await import("./candidates");
    await recalculateCandidateStatus(existingScore.candidateId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: get all doctor assignments (for management panel)
router.get("/interviews/doctor-assignments", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const assigns = await db.select().from(doctorAssignmentsTable);
  const candidates = await db.select().from(candidatesTable);
  const users = await db.select().from(usersTable);
  const units = await db.select().from(unitsTable);
  const scores = await db.select().from(interviewScoresTable);

  const doctors = users.filter((u) => u.role === "doctor");

  res.json(doctors.map((d) => {
    const unit = d.unitId ? units.find((u) => u.id === d.unitId) : null;
    const myAssigns = assigns.filter((a) => a.doctorId === d.id);
    return {
      doctorId: d.id,
      doctorName: d.fullName,
      doctorEmail: d.email,
      unitId: d.unitId,
      unitName: unit?.name ?? null,
      assignments: myAssigns.map((a) => {
        const c = candidates.find((x) => x.id === a.candidateId);
        const sc = scores.find((s) => s.doctorId === d.id && s.candidateId === a.candidateId);
        return {
          id: a.id,
          candidateId: a.candidateId,
          candidateName: c?.fullName ?? "",
          candidateCode: c?.candidateCode ?? "",
          scheduledAt: a.scheduledAt?.toISOString() ?? null,
          status: sc ? "completed" : a.status,
          score: sc?.score ?? null,
        };
      }),
    };
  }));
});

// Admin: assign candidate to doctor
router.post("/interviews/assign", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const { doctorId, candidateId, scheduledAt } = req.body as { doctorId: number; candidateId: number; scheduledAt?: string };
  if (!doctorId || !candidateId) {
    res.status(400).json({ error: "doctorId and candidateId required" });
    return;
  }
  const [d] = await db.select().from(usersTable).where(eq(usersTable.id, doctorId));
  if (!d || d.role !== "doctor") { res.status(404).json({ error: "Doctor not found" }); return; }
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }

  // Resolve specialityId from the doctor's active panel if not provided in request body
  let specialityId = (req.body as any).specialityId;
  if (!specialityId) {
    const panelQuery = await db.execute(sql`
      SELECT ip.speciality_id
      FROM interview_panel_members ipm
      JOIN interview_panels ip ON ip.id = ipm.panel_id
      WHERE ipm.doctor_id = ${doctorId} AND ip.is_active = TRUE
      LIMIT 1
    `);
    specialityId = (panelQuery.rows[0] as { speciality_id: number | null } | undefined)?.speciality_id;
  }

  const existing = await db.select().from(doctorAssignmentsTable).where(
    and(
      eq(doctorAssignmentsTable.doctorId, doctorId),
      eq(doctorAssignmentsTable.candidateId, candidateId),
      specialityId ? eq(doctorAssignmentsTable.specialityId, specialityId) : sql`speciality_id IS NULL`
    ),
  );

  let row;
  if (existing.length > 0) {
    [row] = await db.update(doctorAssignmentsTable)
      .set({ scheduledAt: scheduledAt ? new Date(scheduledAt) : null })
      .where(eq(doctorAssignmentsTable.id, existing[0]!.id))
      .returning();
  } else {
    [row] = await db.insert(doctorAssignmentsTable).values({
      doctorId, candidateId, status: "pending", specialityId,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    }).returning();
  }
  if (!row) { res.status(500).json({ error: "Failed" }); return; }
  res.json({ id: row.id, doctorId, candidateId, status: row.status, specialityId });
});

// Admin: remove candidate from doctor
router.delete("/interviews/assign/:assignmentId", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const id = Number(req.params["assignmentId"]);
  await db.delete(doctorAssignmentsTable).where(eq(doctorAssignmentsTable.id, id));
  res.json({ success: true });
});

// Doctor: submit score
router.post("/interviews/scores", requireAuth, requireRole("doctor"), async (req, res) => {
  const userId = req.user!.userId;
  const { candidateId, score, remarks } = req.body as { candidateId: number; score: number; remarks?: string };
  if (!candidateId || score == null) { res.status(400).json({ error: "Missing fields" }); return; }

  // 1. Identify active panel and its speciality
  const panelQuery = await db.execute(sql`
    SELECT ip.speciality_id, ip.id as panel_id, ip.is_mind_matter, ipm.marks_entry_enabled
    FROM interview_panel_members ipm
    JOIN interview_panels ip ON ip.id = ipm.panel_id
    WHERE ipm.doctor_id = ${userId} AND ip.is_active = TRUE
    LIMIT 1
  `);
  const activePanel = panelQuery.rows[0] as { speciality_id: number | null; panel_id: number; is_mind_matter: boolean; marks_entry_enabled: boolean } | undefined;
  if (!activePanel) {
    return res.status(403).json({ error: "Access denied. Doctor is not currently active in any panel." });
  }
  const specialityId = activePanel.speciality_id;
  const panelId = activePanel.panel_id;

  // 2. STRICT ACCESS CONTROL: Doctor must have marks_entry_enabled = TRUE
  if (!activePanel.marks_entry_enabled) {
    return res.status(403).json({
      error: "Access denied. You do not have marks entry enabled for this panel."
    });
  }

  // 3. Validate score ceiling:
  //    Mind Matter panel max is 10. Regular specialty panel max is 50.
  const maxScore = activePanel.is_mind_matter ? 10 : 50;
  if (score < 0 || score > maxScore) {
    return res.status(400).json({ error: `Score must be between 0 and ${maxScore} marks.` });
  }

  const existing = await db.select().from(interviewScoresTable).where(
    and(
      eq(interviewScoresTable.candidateId, candidateId),
      specialityId
        ? and(
            eq(interviewScoresTable.doctorId, userId),
            eq(interviewScoresTable.specialityId, specialityId)
          )
        : sql`speciality_id IS NULL`
    ),
  );
  let row;
  const now = new Date();
  if (existing.length > 0) {
    [row] = await db.update(interviewScoresTable).set({ 
      score, 
      remarks: remarks ?? null, 
      doctorId: userId, 
      submittedAt: now,
      lastModifiedBy: userId,
      lastModifiedAt: now
    })
      .where(eq(interviewScoresTable.id, existing[0]!.id)).returning();
  } else {
    [row] = await db.insert(interviewScoresTable).values({ 
      candidateId, 
      doctorId: userId, 
      specialityId, 
      score, 
      remarks: remarks ?? null,
      enteredBy: userId,
      enteredAt: now,
      lastModifiedBy: userId,
      lastModifiedAt: now
    }).returning();
  }

  // Update candidatesTable.psychometricScore if this is a Mind Matter panel score
  if (activePanel.is_mind_matter) {
    await db.update(candidatesTable).set({ psychometricScore: String(score) })
      .where(eq(candidatesTable.id, candidateId));
  }
  if (!row) { res.status(500).json({ error: "Failed to submit score" }); return; }

  // Update applicationsTable status for this specialization to completed
  if (specialityId) {
    await db.update(applicationsTable).set({ status: "completed" })
      .where(and(
        eq(applicationsTable.candidateId, candidateId),
        eq(applicationsTable.specialityId, specialityId)
      ));
  }

  // Multi-specialty completion matrix check:
  // Candidate is interview_completed if they have a Mind Mapping score AND all applied specialities have at least one score
  const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
  if (cand) {
    if (cand.status !== "allocated") {
      const apps = await db.select().from(applicationsTable).where(eq(applicationsTable.candidateId, candidateId));
      const scores = await db.select().from(interviewScoresTable).where(eq(interviewScoresTable.candidateId, candidateId));

      let allSpecialtiesCompleted = true;
      for (const app of apps) {
        const hasScore = scores.some(s => s.specialityId === app.specialityId);
        if (!hasScore) {
          allSpecialtiesCompleted = false;
          if (app.status === "completed") {
            await db.update(applicationsTable).set({ status: "approved" }).where(eq(applicationsTable.id, app.id));
          }
        } else {
          if (app.status !== "completed") {
            await db.update(applicationsTable).set({ status: "completed" }).where(eq(applicationsTable.id, app.id));
          }
        }
      }

      if (allSpecialtiesCompleted || scores.length > 0) {
        await db.update(candidatesTable).set({ status: "interview_completed" }).where(eq(candidatesTable.id, candidateId));
      } else {
        if (cand.status === "interview_completed") {
          await db.update(candidatesTable).set({ status: "approved" }).where(eq(candidatesTable.id, candidateId));
        }
      }
    }
  }

  // Audit Log the grade entry
  try {
    const ipAddress = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim();
    const [doc] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const [spec] = specialityId ? await db.select().from(specialitiesTable).where(eq(specialitiesTable.id, specialityId)) : [null];
    const specName = spec?.name ?? "General";
    await db.insert(auditLogsTable).values({
      userId,
      userEmail: req.user!.email,
      action: "MARK_ENTRY",
      details: `Doctor ${doc?.fullName || userId} submitted Specialty ${specName} Viva score: ${score} for candidate ${cand?.fullName || candidateId}`,
      ipAddress,
    });
  } catch (err) {
    console.error("Failed to insert score audit log:", err);
  }

  // Update doctor assignments strictly for this specialization
  await db.update(doctorAssignmentsTable).set({ status: "completed" })
    .where(and(
      eq(doctorAssignmentsTable.doctorId, userId),
      eq(doctorAssignmentsTable.candidateId, candidateId),
      specialityId ? eq(doctorAssignmentsTable.specialityId, specialityId) : sql`speciality_id IS NULL`
    ));

  // Release status for the grading doctor
  await db.execute(sql`
    UPDATE doctor_panel_status SET is_engaged = FALSE, current_candidate_id = NULL, updated_at = NOW()
    WHERE doctor_id = ${userId}
  `);

  // 3. Panel completion check: ALL marks_entry_enabled doctors must score before advancing queue.
  //    Doctors without marks_entry_enabled are observers — they do not block progress.
  const allMembersForRelease = (await db.execute(sql`
    SELECT doctor_id FROM interview_panel_members WHERE panel_id = ${panelId}
  `)).rows as Array<{ doctor_id: number }>;

  const enabledMembers = (await db.execute(sql`
    SELECT doctor_id FROM interview_panel_members
    WHERE panel_id = ${panelId} AND marks_entry_enabled = TRUE
  `)).rows as Array<{ doctor_id: number }>;

  const scoresOnSpec = await db.select().from(interviewScoresTable).where(
    and(
      eq(interviewScoresTable.candidateId, candidateId),
      specialityId ? eq(interviewScoresTable.specialityId, specialityId) : sql`speciality_id IS NULL`
    )
  );

  // Which enabled doctors have submitted a score for this candidate?
  const enabledDoctorIds = new Set(enabledMembers.map(m => m.doctor_id));
  const enabledScores = scoresOnSpec.filter(s => enabledDoctorIds.has(s.doctorId));

  // All enabled doctors scored → advance the queue
  const allEnabledScored = enabledMembers.length > 0 && enabledScores.length >= enabledMembers.length;

  if (allEnabledScored) {
    await db.execute(sql`
      UPDATE panel_queue SET status = 'done'
      WHERE panel_id = ${panelId} AND candidate_id = ${candidateId}
    `);

    // Release engagement status for ALL members on this panel
    for (const m of allMembersForRelease) {
      await db.execute(sql`
        UPDATE doctor_panel_status SET is_engaged = FALSE, current_candidate_id = NULL, updated_at = NOW()
        WHERE doctor_id = ${m.doctor_id}
      `);
    }

    // Automatically summon the next waiting candidate in queue
    const [nextWaiting] = (await db.execute(sql`
      SELECT candidate_id FROM panel_queue
      WHERE panel_id = ${panelId} AND status = 'waiting'
      ORDER BY queue_position ASC, created_at ASC
      LIMIT 1
    `)).rows as Array<Record<string, unknown>>;

    if (nextWaiting) {
      const nextId = Number(nextWaiting["candidate_id"]);
      await db.execute(sql`
        UPDATE panel_queue SET status = 'in_progress', called_at = NOW()
        WHERE panel_id = ${panelId} AND candidate_id = ${nextId}
      `);
      for (const m of allMembersForRelease) {
        await db.execute(sql`
          INSERT INTO doctor_panel_status (doctor_id, is_engaged, engaged_since, current_candidate_id, updated_at)
          VALUES (${m.doctor_id}, TRUE, NOW(), ${nextId}, NOW())
          ON CONFLICT (doctor_id) DO UPDATE
            SET is_engaged = TRUE, engaged_since = NOW(), current_candidate_id = ${nextId}, updated_at = NOW()
        `);
      }
    }
  }

  res.json({ id: row.id, candidateId: row.candidateId, doctorId: row.doctorId, score: row.score, remarks: row.remarks, submittedAt: row.submittedAt.toISOString() });
});

// Helper style constants for Excel sheets
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

// Helper to parse specialization strings
const parseSpecializationString = (spec: string | null | undefined): string[] => {
  if (!spec) return [];
  if (spec.startsWith("[") && spec.endsWith("]")) {
    try {
      const parsed = JSON.parse(spec);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { }
  }
  return spec.split(",").map(s => s.trim()).filter(Boolean);
};

// Doctor: download my scoring Excel evaluations list
router.get("/interviews/my-scores/export", requireAuth, requireRole("doctor"), async (req, res) => {
  try {
    const userId = req.user!.userId;
    
    const scores = await db.select().from(interviewScoresTable).where(eq(interviewScoresTable.doctorId, userId));
    const candidates = await db.select().from(candidatesTable);
    const submissions = await db.select().from(applicationSubmissionsTable);
    const specs = await db.select().from(specialitiesTable);
    
    const rows = scores.map((s) => {
      const c = candidates.find((x) => x.id === s.candidateId);
      const sub = c ? submissions.find((sub) => sub.email.toLowerCase() === c.email.toLowerCase()) : null;
      const spec = s.specialityId ? specs.find((sp) => sp.id === s.specialityId) : null;
      
      return {
        "Candidate Code": c?.candidateCode ?? "N/A",
        "Candidate Name": c?.fullName ?? "N/A",
        "Email": c?.email ?? "N/A",
        "Phone": c?.phone ?? "N/A",
        "MBBS College": sub?.medicalCollege ?? "N/A",
        "UG Qualification": c?.qualification ?? "N/A",
        "PG Qualification": sub?.pgQualifications ?? "N/A",
        "Specialization": spec?.name ?? "General",
        "VIVA Score (max 50)": s.score,
        "Remarks": s.remarks ?? "—",
        "Evaluation Date": s.submittedAt ? s.submittedAt.toLocaleDateString("en-IN") : "N/A"
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = buildStyledSheet(rows, "2563EB");
    XLSX.utils.book_append_sheet(wb, ws, "My Evaluations");
    
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
    res.setHeader("Content-Disposition", `attachment; filename="Doctor_Evaluations_${new Date().toISOString().split("T")[0]}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to export evaluations" });
  }
});

// Admin: download central coordinator master scores sheets
router.get("/interviews/scores/export", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const specId = req.query["specialityId"] ? Number(req.query["specialityId"]) : undefined;
    
    const candidates = await db.select().from(candidatesTable).where(eq(candidatesTable.isMock, (req as any).isMockMode));
    const allSpecs = await db.select().from(specialitiesTable);
    const allSubmissions = await db.select().from(applicationSubmissionsTable);
    const allBatchCand = await db.select().from(batchCandidatesTable);
    const allScores = await db.select().from(interviewScoresTable);
    const allDoctors = await db.select().from(usersTable).where(eq(usersTable.role, "doctor"));
    const allApps = await db.select().from(applicationsTable);    const panelQuery = await db.execute(sql`
      SELECT ip.id, ip.name, ip.room_number, ip.speciality_id, ip.is_mind_matter, ipm.doctor_id
      FROM interview_panels ip
      LEFT JOIN interview_panel_members ipm ON ip.id = ipm.panel_id
    `);
    const allPanels = panelQuery.rows as Array<Record<string, any>>;

    const isMindMatterScore = (s: { doctorId: number; specialityId: number | null }) => {
      return allPanels.some(p => 
        p.speciality_id === s.specialityId && 
        p.doctor_id === s.doctorId && 
        p.is_mind_matter === true
      );
    };

    let filteredCandidates = candidates;
    if (specId !== undefined) {
      const { candidatePreferencesTable, applicationsTable } = await import("@workspace/db");
      const prefs = await db.select().from(candidatePreferencesTable).where(eq(candidatePreferencesTable.specialityId, specId));
      const apps = await db.select().from(applicationsTable).where(eq(applicationsTable.specialityId, specId));
      const eligibleIds = new Set([
        ...prefs.map(p => p.candidateId),
        ...apps.map(a => a.candidateId)
      ]);
      filteredCandidates = candidates.filter(c => eligibleIds.has(c.id));
    }
    
    const rawRows: any[] = [];
    for (const c of filteredCandidates) {
      const sub = allSubmissions.find((s) => s.email.toLowerCase() === c.email.toLowerCase());
      const candidateApps = allApps.filter(app => app.candidateId === c.id);
      
      let candidateSpecs = candidateApps.map(app => allSpecs.find(sp => sp.id === app.specialityId)).filter(Boolean) as any[];
      if (candidateSpecs.length === 0 && sub?.specialization) {
        const parsedNames = parseSpecializationString(sub.specialization);
        candidateSpecs = allSpecs.filter(sp => parsedNames.some(pn => pn.toLowerCase() === sp.name.toLowerCase()));
      }
      if (candidateSpecs.length === 0) {
        candidateSpecs = [{ id: null, name: "General", code: "GEN" }];
      }

      if (specId !== undefined) {
        candidateSpecs = candidateSpecs.filter(sp => sp.id === specId);
      }

      for (const spec of candidateSpecs) {
        const candScores = allScores.filter(s => s.candidateId === c.id && (spec.id ? s.specialityId === spec.id : true));
        const vivaScores = candScores.filter(s => !isMindMatterScore(s));
        const mmScores = candScores.filter(s => isMindMatterScore(s));
        
        const sortedVivaScores = [...vivaScores].sort((a, b) => a.doctorId - b.doctorId);
        
        const doc1 = sortedVivaScores[0]?.score ?? "—";
        const doc2 = sortedVivaScores[1]?.score ?? "—";
        const doc3 = sortedVivaScores[2]?.score ?? "—";
        const doc4 = sortedVivaScores[3]?.score ?? "—";

        const avgVivaScore = vivaScores.length > 0 
          ? vivaScores.reduce((acc, val) => acc + val.score, 0) / vivaScores.length
          : null;

        const candidateBatchCands = allBatchCand.filter((bc) => bc.candidateId === c.id);
        const bcRow = candidateBatchCands[0];
        const rawMcq = bcRow?.mcqScore ?? (c.mcqScore ? Number(c.mcqScore) : null);
        const mcqScore = rawMcq != null ? Number(rawMcq) : null;
        
        const avgMindMatter = mmScores.length > 0
          ? mmScores.reduce((acc, val) => acc + val.score, 0) / mmScores.length
          : null;

        const psychometricScore = avgMindMatter !== null
          ? avgMindMatter
          : (bcRow?.psychometricScore ?? (c.psychometricScore ? Number(c.psychometricScore) : null));

        const totalScore = (mcqScore != null || avgVivaScore != null || psychometricScore != null)
          ? (mcqScore ?? 0) + (avgVivaScore ?? 0) + (psychometricScore ?? 0)
          : null;

        const appForSpec = allApps.find(app => app.candidateId === c.id && app.specialityId === spec.id);
        const status = appForSpec?.status ?? c.status;

        const panel = allPanels.find(p => {
          const pSpecId = p["speciality_id"] !== undefined ? p["speciality_id"] : p["specialityId"];
          return pSpecId != null && Number(pSpecId) === spec.id;
        });
        const panelName = panel ? `${panel["name"]} (Room ${panel["room_number"] || panel["roomNumber"]})` : "General";

        const evaluators = candScores.map(s => allDoctors.find(d => d.id === s.doctorId)?.fullName).filter(Boolean).join(", ") || "None";

        rawRows.push({
          "Candidate Name": c.fullName,
          "Specialty": spec.name,
          "MCQ Marks": mcqScore != null ? mcqScore : "—",
          "Mind Mapping Marks": psychometricScore != null ? psychometricScore : "—",
          "Doctor 1 Marks": doc1,
          "Doctor 2 Marks": doc2,
          "Doctor 3 Marks": doc3,
          "Doctor 4 Marks": doc4,
          "Average Viva": avgVivaScore != null ? Number(avgVivaScore.toFixed(2)) : "—",
          "Final Score": totalScore,
          "Rank": 0, // Will be filled after sorting
          "Status": status,
          "Panel": panelName,
          "Evaluators": evaluators
        });
      }
    }

    // Sort stably: non-null Final Score first, descending order
    rawRows.sort((a, b) => {
      if (a["Final Score"] === null && b["Final Score"] === null) return 0;
      if (a["Final Score"] === null) return 1;
      if (b["Final Score"] === null) return -1;
      return b["Final Score"] - a["Final Score"];
    });

    // Populate the Rank column
    let rank = 1;
    for (let i = 0; i < rawRows.length; i++) {
      if (rawRows[i]["Final Score"] !== null) {
        rawRows[i]["Rank"] = rank++;
      } else {
        rawRows[i]["Rank"] = "—";
      }
    }

    // Format for display
    const finalRows = rawRows.map(row => ({
      "Candidate Name": row["Candidate Name"],
      "Specialty": row["Specialty"],
      "MCQ Marks": row["MCQ Marks"],
      "Mind Mapping Marks": row["Mind Mapping Marks"],
      "Doctor 1 Marks": row["Doctor 1 Marks"],
      "Doctor 2 Marks": row["Doctor 2 Marks"],
      "Doctor 3 Marks": row["Doctor 3 Marks"],
      "Doctor 4 Marks": row["Doctor 4 Marks"],
      "Average Viva": row["Average Viva"],
      "Final Score": row["Final Score"] !== null ? Number(row["Final Score"].toFixed(2)) : "—",
      "Rank": row["Rank"],
      "Status": row["Status"],
      "Panel": row["Panel"],
      "Evaluators": row["Evaluators"]
    }));

    const wb = XLSX.utils.book_new();
    const sheetTitle = specId !== undefined 
      ? (allSpecs.find(s => s.id === specId)?.name || "Specialized") 
      : "Central Marksheet";
    const ws = buildStyledSheet(finalRows, "0B4A8F");
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle.substring(0, 31));
    
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
    const today = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Disposition", `attachment; filename="Central_Coordinator_Marksheet_${today}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to export marksheet" });
  }
});

// Admin: Specialty-wise marks breakdown export (3-sheet workbook)
router.get("/interviews/scores/specialty-export", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const candidates = await db.select().from(candidatesTable).where(eq(candidatesTable.isMock, (req as any).isMockMode));
    const allSpecs = await db.select().from(specialitiesTable);
    const allScores = await db.select().from(interviewScoresTable);
    const allDoctors = await db.select().from(usersTable).where(eq(usersTable.role, "doctor" as any));
    const allApps = await db.select().from(applicationsTable);

    const { candidatePreferencesTable } = await import("@workspace/db");
    const allPrefs = await db.select().from(candidatePreferencesTable);
    const allSubmissions = await db.select().from(applicationSubmissionsTable);

    const panelQuery = await db.execute(sql`
      SELECT ip.id, ip.name, ip.room_number, ip.speciality_id, ip.is_mind_matter, ipm.doctor_id
      FROM interview_panels ip
      LEFT JOIN interview_panel_members ipm ON ip.id = ipm.panel_id
    `);
    const allPanels = panelQuery.rows as Array<Record<string, any>>;

    const isMindMatterScore = (s: { doctorId: number; specialityId: number | null }) => {
      return allPanels.some(p => 
        p.speciality_id === s.specialityId && 
        p.doctor_id === s.doctorId && 
        p.is_mind_matter === true
      );
    };

    const addAutoFilter = (ws: XLSX.WorkSheet) => {
      if (!ws["!ref"]) return;
      try {
        const range = XLSX.utils.decode_range(ws["!ref"]);
        ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: range.e.c, r: range.e.r } }) };
      } catch {}
    };

    // ── SHEET 1: Summary by Specialty ──────────────────────────────────────
    const summaryRows = allSpecs.map(spec => {
      // Candidates for this specialty
      const specCandIds = new Set<number>();
      allApps.filter(a => a.specialityId === spec.id).forEach(a => specCandIds.add(a.candidateId));
      allPrefs.filter(p => p.specialityId === spec.id).forEach(p => specCandIds.add(p.candidateId));

      const specCandidates = candidates.filter(c => specCandIds.has(c.id));
      const specScores = allScores.filter(s => s.specialityId === spec.id);
      
      const specVivaScores = specScores.filter(s => !isMindMatterScore(s));
      const specMmScores = specScores.filter(s => isMindMatterScore(s));

      const mcqScores = specCandidates.map(c => c.mcqScore ? Number(c.mcqScore) : null).filter(v => v !== null) as number[];
      
      const mindScores = specCandidates.map(c => {
        const candMmScores = specMmScores.filter(s => s.candidateId === c.id);
        if (candMmScores.length > 0) {
          return candMmScores.reduce((acc, s) => acc + s.score, 0) / candMmScores.length;
        }
        return c.psychometricScore ? Number(c.psychometricScore) : null;
      }).filter(v => v !== null) as number[];

      const vivaScores = specVivaScores.map(s => s.score);

      const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

      const vivaByCandidate = specCandidates.map(c => {
        const cs = specVivaScores.filter(s => s.candidateId === c.id);
        return cs.length > 0 ? cs.reduce((a, s) => a + s.score, 0) / cs.length : null;
      }).filter(v => v !== null) as number[];

      const avgTotal = specCandidates.map(c => {
        const mcq = c.mcqScore ? Number(c.mcqScore) : 0;
        const candMmScores = specMmScores.filter(s => s.candidateId === c.id);
        const mm = candMmScores.length > 0 
          ? candMmScores.reduce((acc, s) => acc + s.score, 0) / candMmScores.length 
          : (c.psychometricScore ? Number(c.psychometricScore) : 0);
        const cs = specVivaScores.filter(s => s.candidateId === c.id);
        const viva = cs.length > 0 ? cs.reduce((a, s) => a + s.score, 0) / cs.length : 0;
        return mcq + mm + viva;
      });

      return {
        "Specialty": spec.name,
        "Code": spec.code,
        "Total Candidates": specCandidates.length,
        "VIVA Evaluated": new Set(specVivaScores.map(s => s.candidateId)).size,
        "Avg MCQ (Max 50)": avg(mcqScores) ?? "—",
        "Avg VIVA (Max 50)": avg(vivaScores) ?? "—",
        "Avg Mind Matter (Max 10)": avg(mindScores) ?? "—",
        "Avg Total (Max 110)": avgTotal.length > 0 ? Math.round(avgTotal.reduce((a, b) => a + b, 0) / avgTotal.length * 10) / 10 : "—",
      };
    });

    // ── SHEET 2: Candidate Detail (Specialty-wise) ──────────────────────────
    const detailRows: Record<string, any>[] = [];
    for (const spec of allSpecs) {
      const specCandIds = new Set<number>();
      allApps.filter(a => a.specialityId === spec.id).forEach(a => specCandIds.add(a.candidateId));
      allPrefs.filter(p => p.specialityId === spec.id).forEach(p => specCandIds.add(p.candidateId));
      const specCandidates = candidates.filter(c => specCandIds.has(c.id));
      const specScores = allScores.filter(s => s.specialityId === spec.id);
      
      const specVivaScores = specScores.filter(s => !isMindMatterScore(s));
      const specMmScores = specScores.filter(s => isMindMatterScore(s));

      // Get unique doctors who scored VIVA for this specialty, up to 4
      const doctorIdsForSpec = [...new Set(specVivaScores.map(s => s.doctorId))].slice(0, 4);

      for (const c of specCandidates) {
        const candScores = specVivaScores.filter(s => s.candidateId === c.id);
        const avgViva = candScores.length > 0 ? candScores.reduce((a, s) => a + s.score, 0) / candScores.length : null;
        
        const candMmScores = specMmScores.filter(s => s.candidateId === c.id);
        const mm = candMmScores.length > 0 
          ? candMmScores.reduce((acc, s) => acc + s.score, 0) / candMmScores.length 
          : (c.psychometricScore ? Number(c.psychometricScore) : null);
          
        const mcq = c.mcqScore ? Number(c.mcqScore) : null;
        const total = (mcq ?? 0) + (avgViva ?? 0) + (mm ?? 0);

        const row: Record<string, any> = {
          "Specialty": spec.name,
          "Candidate Name": c.fullName,
          "Candidate Code": c.candidateCode,
          "MCQ (Max 50)": mcq ?? "—",
          "Mind Matter (Max 10)": mm ?? "—",
        };

        for (let di = 0; di < 4; di++) {
          const docId = doctorIdsForSpec[di];
          const doc = docId ? allDoctors.find(d => d.id === docId) : undefined;
          const sc = docId ? candScores.find(s => s.doctorId === docId) : undefined;
          row[`Doctor ${di + 1}${doc ? ` (${doc.fullName.split(" ")[0]})` : ""} VIVA`] = sc ? sc.score : "—";
        }

        row["Avg VIVA (Max 50)"] = avgViva !== null ? Math.round(avgViva * 10) / 10 : "—";
        row["Total (Max 110)"] = (mcq !== null || avgViva !== null || mm !== null) ? Math.round(total * 10) / 10 : "—";
        row["Status"] = c.status;
        detailRows.push(row);
      }
    }

    // Sort by specialty then by total desc
    detailRows.sort((a, b) => {
      if (a["Specialty"] !== b["Specialty"]) return (a["Specialty"] as string).localeCompare(b["Specialty"]);
      const ta = typeof a["Total (Max 110)"] === "number" ? a["Total (Max 110)"] : -1;
      const tb = typeof b["Total (Max 110)"] === "number" ? b["Total (Max 110)"] : -1;
      return tb - ta;
    });

    // ── SHEET 3: Doctor Performance ─────────────────────────────────────────
    const doctorRows = allDoctors.map(doc => {
      const docScores = allScores.filter(s => s.doctorId === doc.id);
      const avgScore = docScores.length > 0 ? Math.round(docScores.reduce((a, s) => a + s.score, 0) / docScores.length * 10) / 10 : null;
      const specIds = [...new Set(docScores.map(s => s.specialityId).filter(Boolean))];
      const specNames = specIds.map(id => allSpecs.find(s => s.id === id)?.name).filter(Boolean).join(", ");

      return {
        "Doctor Name": doc.fullName,
        "Email": doc.email,
        "Specialty Panel(s)": specNames || "General",
        "Total Candidates Scored": docScores.length,
        "Avg Score Given": avgScore ?? "—",
        "Min Score": docScores.length > 0 ? Math.min(...docScores.map(s => s.score)) : "—",
        "Max Score": docScores.length > 0 ? Math.max(...docScores.map(s => s.score)) : "—",
      };
    });

    // ── Build Workbook ───────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary["!cols"] = summaryRows[0] ? Object.keys(summaryRows[0]).map((_, i) => ({ wch: i < 2 ? 35 : 22 })) : [];
    addAutoFilter(wsSummary);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Specialty Summary");

    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    wsDetail["!cols"] = detailRows[0] ? Object.keys(detailRows[0]).map(() => ({ wch: 22 })) : [];
    addAutoFilter(wsDetail);
    XLSX.utils.book_append_sheet(wb, wsDetail, "Candidate Detail");

    const wsDoctor = XLSX.utils.json_to_sheet(doctorRows);
    wsDoctor["!cols"] = doctorRows[0] ? Object.keys(doctorRows[0]).map(() => ({ wch: 28 })) : [];
    addAutoFilter(wsDoctor);
    XLSX.utils.book_append_sheet(wb, wsDoctor, "Doctor Performance");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const today = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Disposition", `attachment; filename="SAV_Specialty_Marks_Breakdown_${today}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to export specialty breakdown" });
  }
});

// GET /interviews/viva-summary/:candidateId
router.get("/interviews/viva-summary/:candidateId", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const candidateId = Number(req.params.candidateId);
    const specialityIdRaw = req.query.specialityId;
    const specialityId = specialityIdRaw ? Number(specialityIdRaw) : null;

    if (!specialityId) {
      res.status(400).json({ error: "specialityId query parameter is required" });
      return;
    }

    // 1. Get all interview panels for this speciality
    const panels = (await db.execute(sql`
      SELECT id, name, room_number FROM interview_panels 
      WHERE speciality_id = ${specialityId} AND is_mind_matter = FALSE
    `)).rows as Array<{ id: number; name: string; room_number: string }>;

    // 2. Get marks_entry_enabled panel members
    const panelIds = panels.map(p => p.id);
    let enabledMembers: Array<{ doctor_id: number; doctor_name: string; panel_name: string }> = [];
    if (panelIds.length > 0) {
      enabledMembers = (await db.execute(sql.raw(`
        SELECT ipm.doctor_id, u.full_name as doctor_name, ip.name as panel_name
        FROM interview_panel_members ipm
        JOIN users u ON u.id = ipm.doctor_id
        JOIN interview_panels ip ON ip.id = ipm.panel_id
        WHERE ipm.panel_id IN (${panelIds.join(",")}) AND ipm.marks_entry_enabled = TRUE
      `))).rows as any;
    }

    // 3. Get all scores submitted for this candidate & speciality
    const scores = await db.select().from(interviewScoresTable).where(
      and(
        eq(interviewScoresTable.candidateId, candidateId),
        eq(interviewScoresTable.specialityId, specialityId)
      )
    );

    // 4. Get active override if any
    const { vivaScoreOverridesTable } = await import("@workspace/db");
    const [override] = await db.select().from(vivaScoreOverridesTable).where(
      and(
        eq(vivaScoreOverridesTable.candidateId, candidateId),
        eq(vivaScoreOverridesTable.specialityId, specialityId)
      )
    );

    // 5. Build doctor score breakdown
    const doctors = enabledMembers.map(m => {
      const sc = scores.find(s => s.doctorId === m.doctor_id);
      return {
        doctorId: m.doctor_id,
        doctorName: m.doctor_name,
        panelName: m.panel_name,
        score: sc ? sc.score : null,
        remarks: sc ? sc.remarks : null,
        submittedAt: sc ? sc.submittedAt.toISOString() : null,
        marksEntryEnabled: true
      };
    });

    const submittedScores = doctors.filter(d => d.score !== null) as Array<{ score: number }>;
    const calculatedAverage = submittedScores.length > 0
      ? Number((submittedScores.reduce((sum, d) => sum + d.score, 0) / submittedScores.length).toFixed(2))
      : 0;

    const pendingDoctors = doctors.filter(d => d.score === null).map(d => d.doctorName);

    let overridingUser = null;
    if (override) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, override.overriddenBy));
      overridingUser = u ? u.fullName : `#${override.overriddenBy}`;
    }

    res.json({
      candidateId,
      specialityId,
      doctors,
      calculatedAverage,
      pendingDoctors,
      override: override ? {
        id: override.id,
        overrideScore: override.overrideScore,
        overrideReason: override.overrideReason,
        overriddenBy: overridingUser,
        overriddenAt: override.overriddenAt.toISOString()
      } : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /interviews/viva-override
router.post("/interviews/viva-override", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const { candidateId, specialityId, overrideScore, overrideReason } = req.body as {
      candidateId: number;
      specialityId: number;
      overrideScore: number;
      overrideReason: string;
    };

    if (!candidateId || !specialityId || overrideScore == null) {
      res.status(400).json({ error: "candidateId, specialityId, and overrideScore are required" });
      return;
    }

    if (overrideScore < 0 || overrideScore > 50) {
      res.status(400).json({ error: "Override score must be between 0 and 50" });
      return;
    }

    const { vivaScoreOverridesTable } = await import("@workspace/db");

    // Upsert the override score record
    const existing = await db.select().from(vivaScoreOverridesTable).where(
      and(
        eq(vivaScoreOverridesTable.candidateId, candidateId),
        eq(vivaScoreOverridesTable.specialityId, specialityId)
      )
    );

    const now = new Date();
    let row;
    if (existing.length > 0) {
      [row] = await db.update(vivaScoreOverridesTable)
        .set({
          overrideScore,
          overrideReason: overrideReason || null,
          overriddenBy: req.user!.userId,
          overriddenAt: now
        })
        .where(eq(vivaScoreOverridesTable.id, existing[0]!.id))
        .returning();
    } else {
      [row] = await db.insert(vivaScoreOverridesTable).values({
        candidateId,
        specialityId,
        overrideScore,
        overrideReason: overrideReason || null,
        overriddenBy: req.user!.userId,
        overriddenAt: now
      }).returning();
    }

    // Recalculate status so ranks & scoring are updated
    const { recalculateCandidateStatus } = await import("./candidates");
    await recalculateCandidateStatus(candidateId);

    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /interviews/viva-override/:candidateId/:specialityId
router.delete("/interviews/viva-override/:candidateId/:specialityId", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const candidateId = Number(req.params.candidateId);
    const specialityId = Number(req.params.specialityId);

    const { vivaScoreOverridesTable } = await import("@workspace/db");
    
    await db.delete(vivaScoreOverridesTable).where(
      and(
        eq(vivaScoreOverridesTable.candidateId, candidateId),
        eq(vivaScoreOverridesTable.specialityId, specialityId)
      )
    );

    // Recalculate status
    const { recalculateCandidateStatus } = await import("./candidates");
    await recalculateCandidateStatus(candidateId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

