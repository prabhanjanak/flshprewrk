import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, candidatesTable, globalSettingsTable, auditLogsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";
import { logger } from "../lib/logger";

import { parseSpecializationString } from "../lib/utils";

const router: Router = Router();

// Defensive migration to guarantee is_mind_matter exists on panels table
db.execute(sql`ALTER TABLE interview_panels ADD COLUMN IF NOT EXISTS is_mind_matter BOOLEAN NOT NULL DEFAULT FALSE;`)
  .catch(err => {
    logger.error({ err }, "Defensive schema migration for is_mind_matter failed");
  });

// ── helpers ──────────────────────────────────────────────────────────────────

async function getPanels(isMockMode: boolean = false, programId?: number | null) {
  const query = programId
    ? sql`
        SELECT ip.id, ip.name, ip.room_number, ip.program_id, ip.speciality_id, ip.is_active, ip.is_mind_matter, ip.created_at
        FROM interview_panels ip
        WHERE ip.is_mock = ${isMockMode} AND (ip.program_id = ${programId} OR ip.program_id IS NULL)
        ORDER BY ip.room_number
      `
    : sql`
        SELECT ip.id, ip.name, ip.room_number, ip.program_id, ip.speciality_id, ip.is_active, ip.is_mind_matter, ip.created_at
        FROM interview_panels ip
        WHERE ip.is_mock = ${isMockMode}
        ORDER BY ip.room_number
      `;

  const panels = (await db.execute(query)).rows as Array<Record<string, unknown>>;

  const members = (await db.execute(sql`
    SELECT ipm.panel_id, ipm.doctor_id, ipm.is_main, ipm.marks_entry_enabled,
           u.full_name as doctor_name, u.email as doctor_email
    FROM interview_panel_members ipm
    JOIN users u ON u.id = ipm.doctor_id
  `)).rows as Array<Record<string, unknown>>;

  return panels.map((p) => ({
    id: p["id"],
    name: p["name"],
    roomNumber: p["room_number"],
    programId: p["program_id"],
    specialityId: p["speciality_id"],
    isActive: p["is_active"],
    isMindMatter: p["is_mind_matter"],
    createdAt: p["created_at"],
    members: members
      .filter((m) => m["panel_id"] === p["id"])
      .map((m) => ({
        doctorId: m["doctor_id"],
        doctorName: m["doctor_name"],
        doctorEmail: m["doctor_email"],
        isMain: m["is_main"],
        marksEntryEnabled: m["marks_entry_enabled"] === true,
      })),
  }));
}

async function getPanelQueue(panelId: number) {
  return (await db.execute(sql`
    SELECT pq.id, pq.panel_id, pq.candidate_id, pq.queue_position, pq.status, pq.called_at, pq.created_at,
           c.full_name as candidate_name, c.candidate_code
    FROM panel_queue pq
    JOIN candidates c ON c.id = pq.candidate_id
    WHERE pq.panel_id = ${panelId}
    ORDER BY pq.queue_position ASC, pq.created_at ASC
  `)).rows as Array<Record<string, unknown>>;
}

// ── Panel CRUD ────────────────────────────────────────────────────────────────

router.get("/panels",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator", "doctor", "display_operator" as never),
  async (req: any, res) => {
    const programId = req.query.programId ? Number(req.query.programId) : null;
    res.json(await getPanels(req.isMockMode, programId));
  }
);

router.post("/panels",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const { name, roomNumber, programId, specialityId, doctorIds, mainDoctorId, isMindMatter } = req.body as {
      name: string; roomNumber: string; programId?: number; specialityId?: number;
      doctorIds?: number[]; mainDoctorId?: number; isMindMatter?: boolean;
    };
    if (!name || !roomNumber) return res.status(400).json({ error: "name and roomNumber required" });

    const isMock = (req as any).isMockMode ?? false;
    const finalSpecId = isMindMatter ? null : (specialityId ?? null);
    const [panel] = (await db.execute(sql`
      INSERT INTO interview_panels (name, room_number, program_id, speciality_id, is_mind_matter, is_mock)
      VALUES (${name}, ${roomNumber}, ${programId ?? null}, ${finalSpecId}, ${isMindMatter ?? false}, ${isMock})
      RETURNING *
    `)).rows as Array<Record<string, unknown>>;

    if (doctorIds?.length) {
      for (const did of doctorIds) {
        await db.execute(sql`
          INSERT INTO interview_panel_members (panel_id, doctor_id, is_main, marks_entry_enabled)
          VALUES (${panel!["id"]}, ${did}, ${did === mainDoctorId}, ${did === mainDoctorId})
          ON CONFLICT (panel_id, doctor_id) DO NOTHING
        `);
      }
    }

    // Auto-assign ALL candidates when creating a Mind Matter panel
    if (isMindMatter) {
      const allCandidates = (await db.execute(sql`
        SELECT id FROM candidates WHERE is_mock = ${isMock} ORDER BY full_name ASC
      `)).rows as Array<Record<string, unknown>>;
      for (let i = 0; i < allCandidates.length; i++) {
        const cid = Number(allCandidates[i]!["id"]);
        await db.execute(sql`
          INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status, called_at)
          VALUES (${panel!["id"]}, ${cid}, ${i}, 'waiting', NULL)
          ON CONFLICT (panel_id, candidate_id) DO NOTHING
        `);
      }
      logger.info(`Mind Matter panel ${panel!["id"]} created — auto-assigned ${allCandidates.length} candidates to queue.`);
    }

    const allPanels = await getPanels((req as any).isMockMode);
    const created = allPanels.find((p) => String(p.id) === String(panel!["id"])) ?? {
      id: panel!["id"], name, roomNumber, specialityId: finalSpecId,
      isMindMatter: isMindMatter ?? false, isActive: true, programId: programId ?? null,
      createdAt: new Date().toISOString(), members: [],
    };
    res.status(201).json(created);
  }
);

router.patch("/panels/:id",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const id = Number(req.params["id"]);
    const { name, roomNumber, isActive, specialityId, isMindMatter, doctorIds, mainDoctorId } = req.body as {
      name?: string; roomNumber?: string; isActive?: boolean; specialityId?: number | null; isMindMatter?: boolean;
      doctorIds?: number[]; mainDoctorId?: number | null;
    };
    const isMock = (req as any).isMockMode ?? false;
    const parts: string[] = [];
    if (name !== undefined) parts.push(`name = '${name.replace(/'/g, "''")}'`);
    if (roomNumber !== undefined) parts.push(`room_number = '${roomNumber.replace(/'/g, "''")}'`);
    if (isActive !== undefined) parts.push(`is_active = ${isActive}`);
    
    if (isMindMatter !== undefined) {
      parts.push(`is_mind_matter = ${isMindMatter}`);
      if (isMindMatter === true) {
        parts.push(`speciality_id = NULL`);
      }
    }
    
    if (specialityId !== undefined && isMindMatter !== true) {
      parts.push(`speciality_id = ${specialityId === null ? "NULL" : specialityId}`);
    }

    try {
      await db.transaction(async (tx) => {
        if (parts.length) {
          await tx.execute(sql.raw(`UPDATE interview_panels SET ${parts.join(", ")} WHERE id = ${id}`));
        }

        if (doctorIds !== undefined) {
          // 1. Delete members not in the new list
          if (doctorIds.length === 0) {
            await tx.execute(sql`
              DELETE FROM interview_panel_members WHERE panel_id = ${id}
            `);
          } else {
            await tx.execute(sql.raw(`
              DELETE FROM interview_panel_members 
              WHERE panel_id = ${id} AND doctor_id NOT IN (${doctorIds.join(",")})
            `));
          }

          // 2. Reset others first to prevent unique constraint violation
          await tx.execute(sql`
            UPDATE interview_panel_members
            SET marks_entry_enabled = FALSE, is_main = FALSE
            WHERE panel_id = ${id}
          `);

          // 3. Insert or update the new list of members
          for (const did of doctorIds) {
            const isMain = did === mainDoctorId;
            await tx.execute(sql`
              INSERT INTO interview_panel_members (panel_id, doctor_id, is_main, marks_entry_enabled)
              VALUES (${id}, ${did}, ${isMain}, ${isMain})
              ON CONFLICT (panel_id, doctor_id) DO UPDATE SET
                is_main = ${isMain},
                marks_entry_enabled = ${isMain}
            `);
          }
        }
      });

      // Auto-assign ALL candidates when converted to a Mind Matter panel
      if (isMindMatter === true) {
        const allCandidates = (await db.execute(sql`
          SELECT id FROM candidates WHERE is_mock = ${isMock} ORDER BY full_name ASC
        `)).rows as Array<Record<string, unknown>>;
        for (let i = 0; i < allCandidates.length; i++) {
          const cid = Number(allCandidates[i]!["id"]);
          await db.execute(sql`
            INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status, called_at)
            VALUES (${id}, ${cid}, ${i}, 'waiting', NULL)
            ON CONFLICT (panel_id, candidate_id) DO NOTHING
          `);
        }
        logger.info(`Panel ${id} updated to Mind Matter — auto-assigned ${allCandidates.length} candidates.`);
      }

      const allPanels = await getPanels((req as any).isMockMode);
      const updated = allPanels.find((p) => String(p.id) === String(id)) ?? { error: "Not found" };
      res.json(updated);
    } catch (err: any) {
      logger.error({ err }, "Failed to patch interview panel");
      res.status(500).json({ error: err.message || "Failed to patch interview panel." });
    }
  }
);

router.delete("/panels/:id",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const id = Number(req.params["id"]);
    await db.execute(sql`DELETE FROM panel_queue WHERE panel_id = ${id}`);
    await db.execute(sql`DELETE FROM interview_panel_members WHERE panel_id = ${id}`);
    await db.execute(sql`DELETE FROM interview_panels WHERE id = ${id}`);
    res.json({ success: true });
  }
);

// ── Panel Members ──────────────────────────────────────────────────────────────

router.post("/panels/:id/members",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const panelId = Number(req.params["id"]);
    const { doctorId, isMain, marksEntryEnabled } = req.body as { doctorId: number; isMain?: boolean; marksEntryEnabled?: boolean };
    
    try {
      const [panelRow] = (await db.execute(sql`
        SELECT is_mind_matter FROM interview_panels WHERE id = ${panelId}
      `)).rows as Array<{ is_mind_matter: boolean }>;

      const isMindMatter = panelRow?.is_mind_matter === true;
      
      let finalIsMain = isMain ?? false;
      let finalMarksEntry = marksEntryEnabled ?? false;
      
      // For Mind Matter panels, marks entry is tied directly to the Main Doctor status
      if (isMindMatter) {
        if (isMain !== undefined) {
          finalMarksEntry = isMain;
        } else if (marksEntryEnabled !== undefined) {
          finalIsMain = marksEntryEnabled;
        }
      }

      await db.transaction(async (tx) => {
        // isMain is still exclusive — only one main doctor per panel
        if (finalIsMain) {
          await tx.execute(sql`
            UPDATE interview_panel_members SET is_main = FALSE
            WHERE panel_id = ${panelId} AND doctor_id != ${doctorId}
          `);
        }

        // marks_entry_enabled is now INDEPENDENT per doctor — multiple doctors can be enabled
        await tx.execute(sql`
          INSERT INTO interview_panel_members (panel_id, doctor_id, is_main, marks_entry_enabled)
          VALUES (${panelId}, ${doctorId}, ${finalIsMain}, ${finalMarksEntry})
          ON CONFLICT (panel_id, doctor_id) DO UPDATE SET 
            is_main = ${finalIsMain},
            marks_entry_enabled = ${finalMarksEntry}
        `);
      });

      res.json({ success: true });
    } catch (err: any) {
      logger.error({ err }, "Failed to update panel member configurations");
      res.status(550).json({ error: err.message || "Failed to update member configurations." });
    }
  }
);

router.delete("/panels/:id/members/:doctorId",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const panelId = Number(req.params["id"]);
    const doctorId = Number(req.params["doctorId"]);
    await db.execute(sql`
      DELETE FROM interview_panel_members WHERE panel_id = ${panelId} AND doctor_id = ${doctorId}
    `);
    res.json({ success: true });
  }
);

// ── Queue Management ───────────────────────────────────────────────────────────

router.get("/panels/:id/queue",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator", "doctor", "display_operator" as never),
  async (req, res) => {
    const panelId = Number(req.params["id"]);
    const rows = await getPanelQueue(panelId);
    res.json(rows.map((r) => ({
      id: r["id"], panelId: r["panel_id"], candidateId: r["candidate_id"],
      candidateName: r["candidate_name"], candidateCode: r["candidate_code"],
      queuePosition: r["queue_position"], status: r["status"],
      calledAt: r["called_at"], createdAt: r["created_at"],
    })));
  }
);

router.post("/panels/:id/queue",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const panelId = Number(req.params["id"]);
    const { candidateId } = req.body as { candidateId: number };

    // Validate if the candidate has applied for the panel's mapped specialization
    const [panelRow] = (await db.execute(sql`
      SELECT speciality_id FROM interview_panels WHERE id = ${panelId}
    `)).rows as Array<Record<string, unknown>>;

    if (panelRow && panelRow["speciality_id"]) {
      const specId = Number(panelRow["speciality_id"]);
      
      const prefs = (await db.execute(sql`
        SELECT id FROM candidate_preferences 
        WHERE candidate_id = ${candidateId} AND speciality_id = ${specId}
      `)).rows;

      const apps = (await db.execute(sql`
        SELECT id FROM applications 
        WHERE candidate_id = ${candidateId} AND speciality_id = ${specId}
      `)).rows;

      if (prefs.length === 0 && apps.length === 0) {
        // Fallback check: see if the specialization name exists in the parsed application submissions
        let hasApplied = false;
        const [candidate] = (await db.execute(sql`
          SELECT email FROM candidates WHERE id = ${candidateId}
        `)).rows as Array<{ email: string }>;

        if (candidate && candidate.email) {
          const submissions = (await db.execute(sql`
            SELECT specialization FROM application_submissions 
            WHERE email = ${candidate.email} OR candidate_id = ${candidateId}
          `)).rows as Array<{ specialization: string | null }>;

          const [specRow] = (await db.execute(sql`
            SELECT name FROM specialities WHERE id = ${specId}
          `)).rows as Array<{ name: string }>;

          if (specRow && specRow.name) {
            hasApplied = submissions.some(sub => {
              if (!sub.specialization) return false;
              const parsedSpecs = parseSpecializationString(sub.specialization);
              return parsedSpecs.some(specName => specName.toLowerCase() === specRow.name.toLowerCase());
            });
          }
        }

        if (!hasApplied) {
          return res.status(400).json({ error: "Candidate has not applied for this panel's specialization." });
        }
      }
    }

    // Get max position
    const [maxRow] = (await db.execute(sql`
      SELECT COALESCE(MAX(queue_position), -1) as max_pos FROM panel_queue WHERE panel_id = ${panelId}
    `)).rows as Array<Record<string, unknown>>;
    const nextPos = Number(maxRow!["max_pos"]) + 1;

    await db.execute(sql`
      INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status, called_at)
      VALUES (${panelId}, ${candidateId}, ${nextPos}, 'waiting', NULL)
      ON CONFLICT (panel_id, candidate_id) DO UPDATE 
      SET status = 'waiting', queue_position = ${nextPos}, called_at = NULL
    `);
    res.json({ success: true });
  }
);

router.patch("/panels/:id/queue/:candidateId",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator", "doctor"),
  async (req, res) => {
    const panelId = Number(req.params["id"]);
    const candidateId = Number(req.params["candidateId"]);
    const { status } = req.body as { status: string };

    if (status === "in_progress") {
      // Mark any existing in_progress as done first
      await db.execute(sql`
        UPDATE panel_queue SET status = 'done' WHERE panel_id = ${panelId} AND status = 'in_progress'
      `);
      await db.execute(sql`
        UPDATE panel_queue SET status = 'in_progress', called_at = NOW()
        WHERE panel_id = ${panelId} AND candidate_id = ${candidateId}
      `);
      // Update doctor_panel_status for all panel members
      const members = (await db.execute(sql`
        SELECT doctor_id FROM interview_panel_members WHERE panel_id = ${panelId}
      `)).rows as Array<Record<string, unknown>>;
      for (const m of members) {
        await db.execute(sql`
          INSERT INTO doctor_panel_status (doctor_id, is_engaged, engaged_since, current_candidate_id, updated_at)
          VALUES (${m["doctor_id"]}, TRUE, NOW(), ${candidateId}, NOW())
          ON CONFLICT (doctor_id) DO UPDATE
            SET is_engaged = TRUE, engaged_since = NOW(), current_candidate_id = ${candidateId}, updated_at = NOW()
        `);
      }
    } else if (status === "done" || status === "completed") {
      await db.execute(sql`
        UPDATE panel_queue SET status = 'done' WHERE panel_id = ${panelId} AND candidate_id = ${candidateId}
      `);
      const members = (await db.execute(sql`
        SELECT doctor_id FROM interview_panel_members WHERE panel_id = ${panelId}
      `)).rows as Array<Record<string, unknown>>;
      for (const m of members) {
        await db.execute(sql`
          UPDATE doctor_panel_status SET is_engaged = FALSE, current_candidate_id = NULL, updated_at = NOW()
          WHERE doctor_id = ${m["doctor_id"]}
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
        for (const m of members) {
          await db.execute(sql`
            INSERT INTO doctor_panel_status (doctor_id, is_engaged, engaged_since, current_candidate_id, updated_at)
            VALUES (${m["doctor_id"]}, TRUE, NOW(), ${nextId}, NOW())
            ON CONFLICT (doctor_id) DO UPDATE
              SET is_engaged = TRUE, engaged_since = NOW(), current_candidate_id = ${nextId}, updated_at = NOW()
          `);
        }
      }
    } else {
      await db.execute(sql`
        UPDATE panel_queue SET status = ${status} WHERE panel_id = ${panelId} AND candidate_id = ${candidateId}
      `);
    }
    res.json({ success: true });
  }
);

router.delete("/panels/:id/queue/:candidateId",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const panelId = Number(req.params["id"]);
    const candidateId = Number(req.params["candidateId"]);
    try {
      await db.execute(sql`
        DELETE FROM panel_queue WHERE panel_id = ${panelId} AND candidate_id = ${candidateId}
      `);

      // Audit Log
      const ipAddress = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim();
      const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
      await db.insert(auditLogsTable).values({
        userId: req.user!.userId,
        userEmail: req.user!.email,
        action: "QUEUE_REMOVE",
        details: `Removed candidate ${cand?.fullName || candidateId} from panel queue ID ${panelId}`,
        ipAddress,
      });

      res.json({ success: true });
    } catch (err: any) {
      logger.error({ err }, "Failed to remove from queue");
      res.status(500).json({ error: err.message || "Failed to remove from queue" });
    }
  }
);

// POST /panels/:id/queue/auto-assign — Auto-assign all matching candidates to queue (sorted A-Z by first name)
router.post("/panels/:id/queue/auto-assign",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const panelId = Number(req.params["id"]);
    const isMock = (req as any).isMockMode ?? false;
    try {
      // Get panel's speciality
      const [panelRow] = (await db.execute(sql`
        SELECT speciality_id, is_mind_matter FROM interview_panels WHERE id = ${panelId}
      `)).rows as Array<Record<string, unknown>>;

      if (!panelRow) return res.status(404).json({ error: "Panel not found" });

      const specId = panelRow["speciality_id"] ? Number(panelRow["speciality_id"]) : null;

      // Get candidates already in queue (not done) to avoid duplicates
      const existingQueue = (await db.execute(sql`
        SELECT candidate_id FROM panel_queue WHERE panel_id = ${panelId} AND status != 'done'
      `)).rows as Array<Record<string, unknown>>;
      const existingIds = new Set(existingQueue.map(r => Number(r["candidate_id"])));

      // Get ALL candidates in the correct mock mode
      const allCandidates = (await db.execute(sql`
        SELECT id, full_name, email FROM candidates WHERE is_mock = ${isMock} ORDER BY full_name ASC
      `)).rows as Array<Record<string, unknown>>;

      let matchingCandidates: Array<{ id: number; fullName: string }>;

      if (!specId) {
        // General panel: all candidates are eligible
        matchingCandidates = allCandidates.map(r => ({ id: Number(r["id"]), fullName: String(r["full_name"]) }));
      } else {
        // Get speciality name for application_submissions fallback
        const [specRow] = (await db.execute(sql`
          SELECT name FROM specialities WHERE id = ${specId}
        `)).rows as Array<Record<string, unknown>>;
        const specName = specRow ? String(specRow["name"]) : null;

        // Get candidates matching via candidate_preferences or applications tables
        const prefMatches = new Set<number>(
          ((await db.execute(sql`
            SELECT DISTINCT candidate_id FROM candidate_preferences WHERE speciality_id = ${specId}
          `)).rows as Array<Record<string, unknown>>).map(r => Number(r["candidate_id"]))
        );
        const appMatches = new Set<number>(
          ((await db.execute(sql`
            SELECT DISTINCT candidate_id FROM applications WHERE speciality_id = ${specId}
          `)).rows as Array<Record<string, unknown>>).map(r => Number(r["candidate_id"]))
        );

        // Get all application_submissions for fallback matching
        const allSubmissions = specName ? (await db.execute(sql`
          SELECT email, candidate_id, specialization FROM application_submissions
          WHERE specialization IS NOT NULL
        `)).rows as Array<Record<string, unknown>> : [];

        matchingCandidates = allCandidates
          .filter(c => {
            const cid = Number(c["id"]);
            if (prefMatches.has(cid) || appMatches.has(cid)) return true;
            // Fallback: check application_submissions by email or candidate_id
            if (specName) {
              return allSubmissions.some(sub => {
                const matchesCandidate =
                  (sub["candidate_id"] && Number(sub["candidate_id"]) === cid) ||
                  (sub["email"] && c["email"] && String(sub["email"]).toLowerCase() === String(c["email"]).toLowerCase());
                if (!matchesCandidate) return false;
                const raw = String(sub["specialization"] ?? "");
                const parsedSpecs = parseSpecializationString(raw);
                return parsedSpecs.some(s => s.toLowerCase() === specName.toLowerCase());
              });
            }
            return false;
          })
          .map(r => ({ id: Number(r["id"]), fullName: String(r["full_name"]) }));

        // Sort A-Z by first name
        matchingCandidates.sort((a, b) => {
          const fa = (a.fullName ? a.fullName.trim().split(/\s+/)[0] || "" : "").toLowerCase();
          const fb = (b.fullName ? b.fullName.trim().split(/\s+/)[0] || "" : "").toLowerCase();
          return fa.localeCompare(fb);
        });
      }

      // Get current max queue position
      const [maxRow] = (await db.execute(sql`
        SELECT COALESCE(MAX(queue_position), -1) as max_pos FROM panel_queue WHERE panel_id = ${panelId}
      `)).rows as Array<Record<string, unknown>>;
      let nextPos = Number(maxRow!["max_pos"]) + 1;

      let added = 0;
      for (const cand of matchingCandidates) {
        if (existingIds.has(cand.id)) continue;
        await db.execute(sql`
          INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status, called_at)
          VALUES (${panelId}, ${cand.id}, ${nextPos}, 'waiting', NULL)
          ON CONFLICT (panel_id, candidate_id) DO NOTHING
        `);
        nextPos++;
        added++;
      }

      res.json({ success: true, added });
    } catch (err: any) {
      logger.error({ err }, "Auto-assign failed");
      res.status(500).json({ error: err.message || "Failed to auto-assign" });
    }
  }
);

// POST /panels/:id/queue/reorder — Drag and drop queue ordering
router.post("/panels/:id/queue/reorder",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const panelId = Number(req.params["id"]);
    const { candidateIds } = req.body as { candidateIds: number[] };
    if (!Array.isArray(candidateIds)) {
      res.status(400).json({ error: "candidateIds array required" });
      return;
    }
    try {
      for (let i = 0; i < candidateIds.length; i++) {
        await db.execute(sql`
          UPDATE panel_queue 
          SET queue_position = ${i} 
          WHERE panel_id = ${panelId} AND candidate_id = ${candidateIds[i]}
        `);
      }

      // Audit Log
      const ipAddress = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim();
      await db.insert(auditLogsTable).values({
        userId: req.user!.userId,
        userEmail: req.user!.email,
        action: "QUEUE_REORDER",
        details: `Reordered queue for panel ID ${panelId} containing ${candidateIds.length} candidates.`,
        ipAddress,
      });

      res.json({ success: true });
    } catch (err: any) {
      logger.error({ err }, "Queue reordering failed");
      res.status(500).json({ error: err.message || "Failed to reorder queue." });
    }
  }
);

// POST /panels/:id/queue/insert — Emergency priority candidate insertion
router.post("/panels/:id/queue/insert",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const panelId = Number(req.params["id"]);
    const { candidateId, position } = req.body as { candidateId: number; position: number };
    if (!candidateId || position == null) {
      res.status(400).json({ error: "candidateId and position required" });
      return;
    }
    try {
      // Shift subsequent queue entries down
      await db.execute(sql`
        UPDATE panel_queue 
        SET queue_position = queue_position + 1 
        WHERE panel_id = ${panelId} AND queue_position >= ${position}
      `);

      // Insert target candidate at position
      await db.execute(sql`
        INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status)
        VALUES (${panelId}, ${candidateId}, ${position}, 'waiting')
        ON CONFLICT (panel_id, candidate_id) DO UPDATE 
        SET queue_position = ${position}, status = 'waiting', called_at = NULL
      `);

      // Audit Log
      const ipAddress = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim();
      const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
      await db.insert(auditLogsTable).values({
        userId: req.user!.userId,
        userEmail: req.user!.email,
        action: "QUEUE_INSERT",
        details: `Inserted candidate ${cand?.fullName || candidateId} at priority position ${position} in panel ID ${panelId}`,
        ipAddress,
      });

      res.json({ success: true });
    } catch (err: any) {
      logger.error({ err }, "Emergency queue insertion failed");
      res.status(500).json({ error: err.message || "Failed to insert candidate." });
    }
  }
);

// POST /panels/:id/queue/reassign — Transfer candidate to another panel
router.post("/panels/:id/queue/reassign",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const sourcePanelId = Number(req.params["id"]);
    const { candidateId, targetPanelId } = req.body as { candidateId: number; targetPanelId: number };
    if (!candidateId || !targetPanelId) {
      res.status(400).json({ error: "candidateId and targetPanelId required" });
      return;
    }
    try {
      // 1. Remove from source panel queue
      await db.execute(sql`
        DELETE FROM panel_queue 
        WHERE panel_id = ${sourcePanelId} AND candidate_id = ${candidateId}
      `);

      // 2. Fetch max position on target panel
      const [maxRow] = (await db.execute(sql`
        SELECT COALESCE(MAX(queue_position), -1) as max_pos FROM panel_queue WHERE panel_id = ${targetPanelId}
      `)).rows as Array<Record<string, unknown>>;
      const nextPos = Number(maxRow!["max_pos"]) + 1;

      // 3. Add to target panel queue
      await db.execute(sql`
        INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status)
        VALUES (${targetPanelId}, ${candidateId}, ${nextPos}, 'waiting')
        ON CONFLICT (panel_id, candidate_id) DO UPDATE 
        SET queue_position = ${nextPos}, status = 'waiting', called_at = NULL
      `);

      // 4. Release doctors' engagement status on source panel if they were interviewing this student
      await db.execute(sql`
        UPDATE doctor_panel_status 
        SET is_engaged = FALSE, current_candidate_id = NULL, updated_at = NOW()
        WHERE current_candidate_id = ${candidateId}
      `);

      // Audit Log
      const ipAddress = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim();
      const [cand] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
      await db.insert(auditLogsTable).values({
        userId: req.user!.userId,
        userEmail: req.user!.email,
        action: "STUDENT_REASSIGNMENT",
        details: `Reassigned candidate ${cand?.fullName || candidateId} from panel ID ${sourcePanelId} to panel ID ${targetPanelId}`,
        ipAddress,
      });

      res.json({ success: true });
    } catch (err: any) {
      logger.error({ err }, "Candidate queue reassignment failed");
      res.status(500).json({ error: err.message || "Failed to reassign candidate." });
    }
  }
);


// ── Public Display Endpoint (display_operator or admin) ────────────────────────

router.get("/display/live", async (req: any, res) => {
    try {
      // Use the middleware-populated isMockMode or fallback to setting
      let isMock = req.isMockMode;
      if (isMock === undefined) {
        const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, "mock_mode"));
        isMock = setting?.value === "true";
      }

      const panels = (await db.execute(sql`
        SELECT ip.id, ip.name, ip.room_number, ip.is_active, ip.program_id, ip.speciality_id, ip.is_mind_matter
        FROM interview_panels ip
        WHERE ip.is_active = TRUE AND ip.is_mock = ${isMock}
        ORDER BY ip.room_number
      `)).rows as Array<Record<string, unknown>>;

      const result = await Promise.all(panels.map(async (p) => {
        const panelId = Number(p["id"]);
        const programId = p["program_id"] ? Number(p["program_id"]) : null;

        const inProgress = (await db.execute(sql`
          SELECT pq.candidate_id, pq.called_at, c.candidate_code, c.full_name
          FROM panel_queue pq
          JOIN candidates c ON c.id = pq.candidate_id
          WHERE pq.panel_id = ${panelId} AND pq.status = 'in_progress'
          LIMIT 1
        `)).rows as Array<Record<string, unknown>>;

        const nextUp = (await db.execute(sql`
          SELECT pq.candidate_id, c.candidate_code, c.full_name, pq.queue_position
          FROM panel_queue pq
          JOIN candidates c ON c.id = pq.candidate_id
          WHERE pq.panel_id = ${panelId} AND pq.status = 'waiting'
          ORDER BY pq.queue_position ASC
          LIMIT 3
        `)).rows as Array<Record<string, unknown>>;

        const members = (await db.execute(sql`
          SELECT u.full_name as doctor_name
          FROM interview_panel_members ipm
          JOIN users u ON u.id = ipm.doctor_id
          WHERE ipm.panel_id = ${panelId}
          ORDER BY ipm.is_main DESC
        `)).rows as Array<Record<string, unknown>>;

        let batch = null;
        if (programId) {
          const batches = (await db.execute(sql`
            SELECT name, segment, date, timing, venue
            FROM batches
            WHERE program_id = ${programId} AND is_mock = ${isMock}
            LIMIT 1
          `)).rows as Array<Record<string, unknown>>;
          batch = batches[0] ?? null;
        }

        const current = inProgress[0] ?? null;
        return {
          panelId,
          panelName: p["name"],
          roomNumber: p["room_number"],
          specialityId: p["speciality_id"],
          isActive: p["is_active"],
          isMindMatter: p["is_mind_matter"] === true || p["is_mind_matter"] === 1,
          members: members.map(m => m.doctor_name),
          batch: batch,
          current: current ? {
            candidateCode: current["candidate_code"],
            fullName: current["full_name"],
            calledAt: current["called_at"],
          } : null,
          nextQueue: nextUp.map((n) => ({ 
            candidateCode: n["candidate_code"],
            fullName: n["full_name"]
          })),
        };
      }));

      res.json(result);
    } catch (error) {
      logger.error({ error }, "Display live failed");
      res.status(500).json({ error: (error as Error).message });
    }
  }
);

// ── Legacy doctor panel status (preserved) ─────────────────────────────────────

async function getLegacyPanelStatus() {
  const rows = await db.execute(sql`
    SELECT dps.id, dps.doctor_id, dps.is_engaged, dps.engaged_since, dps.current_candidate_id, dps.updated_at,
           u.full_name as doctor_name, u.email as doctor_email, u.unit_id,
           un.name as unit_name,
           c.full_name as current_candidate_name, c.candidate_code as current_candidate_code
    FROM doctor_panel_status dps
    JOIN users u ON u.id = dps.doctor_id
    LEFT JOIN units un ON un.id = u.unit_id
    LEFT JOIN candidates c ON c.id = dps.current_candidate_id
    ORDER BY u.full_name
  `);
  return rows.rows;
}

router.get("/panel/live", requireAuth, requireRole("central_exam_coordinator", "super_admin", "program_admin"), async (req, res) => {
  const doctors = await db.select().from(usersTable).where(eq(usersTable.role, "doctor"));
  for (const d of doctors) {
    await db.execute(sql`INSERT INTO doctor_panel_status (doctor_id) VALUES (${d.id}) ON CONFLICT (doctor_id) DO NOTHING`);
  }
  const fresh = await getLegacyPanelStatus();
  res.json(fresh.map((r: Record<string, unknown>) => ({
    doctorId: r["doctor_id"], doctorName: r["doctor_name"], doctorEmail: r["doctor_email"],
    unitId: r["unit_id"], unitName: r["unit_name"],
    isEngaged: r["is_engaged"], engagedSince: r["engaged_since"],
    currentCandidateId: r["current_candidate_id"], currentCandidateName: r["current_candidate_name"],
    currentCandidateCode: r["current_candidate_code"], updatedAt: r["updated_at"],
  })));
});

router.patch("/panel/status/:doctorId", requireAuth, requireRole("central_exam_coordinator", "super_admin", "program_admin"), async (req, res) => {
  const doctorId = Number(req.params.doctorId);
  const { isEngaged, candidateId } = req.body as { isEngaged: boolean; candidateId?: number | null };
  await db.execute(sql`INSERT INTO doctor_panel_status (doctor_id) VALUES (${doctorId}) ON CONFLICT (doctor_id) DO NOTHING`);
  if (isEngaged) {
    await db.execute(sql`
      UPDATE doctor_panel_status SET is_engaged = true, engaged_since = now(), current_candidate_id = ${candidateId ?? null}, updated_at = now()
      WHERE doctor_id = ${doctorId}
    `);
  } else {
    await db.execute(sql`
      UPDATE doctor_panel_status SET is_engaged = false, engaged_since = null, current_candidate_id = null, updated_at = now()
      WHERE doctor_id = ${doctorId}
    `);
  }
  const [row] = (await db.execute(sql`
    SELECT dps.*, c.full_name as candidate_name
    FROM doctor_panel_status dps LEFT JOIN candidates c ON c.id = dps.current_candidate_id
    WHERE dps.doctor_id = ${doctorId}
  `)).rows;
  res.json({ doctorId, isEngaged: (row as Record<string, unknown>)["is_engaged"], currentCandidateId: (row as Record<string, unknown>)["current_candidate_id"], currentCandidateName: (row as Record<string, unknown>)["candidate_name"] });
});

router.patch("/panel/status", requireAuth, requireRole("doctor"), async (req, res) => {
  const doctorId = req.user!.userId;
  const { isEngaged, candidateId } = req.body as { isEngaged: boolean; candidateId?: number | null };
  await db.execute(sql`INSERT INTO doctor_panel_status (doctor_id) VALUES (${doctorId}) ON CONFLICT (doctor_id) DO NOTHING`);
  if (isEngaged) {
    await db.execute(sql`
      UPDATE doctor_panel_status SET is_engaged = true, engaged_since = now(), current_candidate_id = ${candidateId ?? null}, updated_at = now()
      WHERE doctor_id = ${doctorId}
    `);
  } else {
    await db.execute(sql`
      UPDATE doctor_panel_status SET is_engaged = false, engaged_since = null, current_candidate_id = null, updated_at = now()
      WHERE doctor_id = ${doctorId}
    `);
  }
  const [row] = (await db.execute(sql`
    SELECT dps.*, c.full_name as candidate_name
    FROM doctor_panel_status dps LEFT JOIN candidates c ON c.id = dps.current_candidate_id
    WHERE dps.doctor_id = ${doctorId}
  `)).rows;
  res.json({ doctorId, isEngaged: (row as Record<string, unknown>)["is_engaged"], currentCandidateId: (row as Record<string, unknown>)["current_candidate_id"], currentCandidateName: (row as Record<string, unknown>)["candidate_name"] });
});

router.get("/panel/my-status", requireAuth, requireRole("doctor"), async (req, res) => {
  const doctorId = req.user!.userId;
  await db.execute(sql`INSERT INTO doctor_panel_status (doctor_id) VALUES (${doctorId}) ON CONFLICT (doctor_id) DO NOTHING`);
  const [row] = (await db.execute(sql`
    SELECT dps.*, c.full_name as candidate_name, c.candidate_code,
           ip.id as panel_id, ip.name as panel_name, ip.room_number, ip.speciality_id,
           ip.is_mind_matter, s.name as speciality_name, ipm.is_main as is_main_doctor,
           ipm.marks_entry_enabled
    FROM doctor_panel_status dps
    LEFT JOIN candidates c ON c.id = dps.current_candidate_id
    LEFT JOIN interview_panel_members ipm ON ipm.doctor_id = ${doctorId}
    LEFT JOIN interview_panels ip ON ip.id = ipm.panel_id
    LEFT JOIN specialities s ON s.id = ip.speciality_id
    WHERE dps.doctor_id = ${doctorId}
    ORDER BY ip.is_active DESC, ip.is_mind_matter DESC, ip.id DESC
    LIMIT 1
  `)).rows;
  res.json({
    isEngaged: (row as Record<string, unknown>)["is_engaged"] ?? false,
    currentCandidateId: (row as Record<string, unknown>)["current_candidate_id"],
    currentCandidateName: (row as Record<string, unknown>)["candidate_name"],
    currentCandidateCode: (row as Record<string, unknown>)["candidate_code"],
    panelId: (row as Record<string, unknown>)["panel_id"] ?? null,
    panelName: (row as Record<string, unknown>)["panel_name"],
    roomNumber: (row as Record<string, unknown>)["room_number"],
    specialityId: (row as Record<string, unknown>)["speciality_id"],
    specialityName: (row as Record<string, unknown>)["speciality_name"],
    isMindMatter: (row as Record<string, unknown>)["is_mind_matter"] === true || (row as Record<string, unknown>)["is_mind_matter"] === 1,
    isMain: (row as Record<string, unknown>)["is_main_doctor"] === true,
    marksEntryEnabled: (row as Record<string, unknown>)["marks_entry_enabled"] === true,
  });
});

export default router;
