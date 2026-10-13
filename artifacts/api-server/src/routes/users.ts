import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, unitsTable, programsTable, doctorAssignmentsTable, interviewScoresTable, interviewPanelMembersTable, applicationFormsTable, candidatesTable } from "@workspace/db";
import { hashPassword } from "../lib/auth";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

const COORDINATOR_MANAGEABLE_ROLES = ["central_exam_coordinator", "unit_coordinator", "doctor"];

function fmtUser(u: typeof usersTable.$inferSelect, unitName: string | null, programName: string | null) {
  const ur = u as Record<string, unknown>;
  return {
    id: u.id,
    email: u.email,
    salutation: u.salutation ?? null,
    fullName: u.fullName,
    employeeId: u.employeeId ?? null,
    designation: (ur["designation"] as string | null) ?? null,
    gender: (ur["gender"] as string | null) ?? null,
    avatarSeed: (ur["avatarSeed"] as string | null) ?? null,
    role: u.role,
    unitId: u.unitId,
    unitName,
    programId: u.programId,
    programName,
    active: u.active,
    forcePasswordReset: u.forcePasswordReset,
    createdAt: u.createdAt.toISOString(),
  };
}

router.get(
  "/users",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const role = (req.query["role"] as string | undefined) ?? undefined;
    const callerRole = req.user!.role;
    let all = await db.select().from(usersTable);

    if (callerRole === "central_exam_coordinator") {
      all = all.filter((u) => COORDINATOR_MANAGEABLE_ROLES.includes(u.role));
    }

    const filtered = role ? all.filter((u) => u.role === role) : all;
    const units = await db.select().from(unitsTable);
    const progs = await db.select().from(programsTable);

    const out = filtered.map((u) => {
      const unit = u.unitId ? units.find((x) => x.id === u.unitId) : null;
      const prog = u.programId ? progs.find((x) => x.id === u.programId) : null;
      return fmtUser(u, unit?.name ?? null, prog?.name ?? null);
    });
    res.json(out);
  }
);

router.post(
  "/users",
  requireAuth,
  requireRole("super_admin", "central_exam_coordinator"),
  async (req, res) => {
    const callerRole = req.user!.role;
    const { email, fullName, salutation, employeeId, designation, gender, avatarSeed, password, role, unitId, programId } = req.body as {
      email: string; fullName: string; salutation?: string; employeeId?: string;
      designation?: string; gender?: string; avatarSeed?: string;
      password?: string; role: string; unitId?: number | null; programId?: number | null;
    };

    if (!email || !fullName || !role) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (callerRole === "central_exam_coordinator" && !COORDINATOR_MANAGEABLE_ROLES.includes(role)) {
      res.status(403).json({ error: "You can only create coordinators and doctors" });
      return;
    }

    const lowered = email.toLowerCase();
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, lowered));
    if (existing.length > 0) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }

    const passwordHash = await hashPassword(password || "Welcome@123");
    const [user] = await db.insert(usersTable).values({
      email: lowered, fullName, salutation: salutation ?? null,
      employeeId: employeeId ?? null,
      ...(designation !== undefined && { designation }),
      ...(gender !== undefined && { gender }),
      ...(avatarSeed !== undefined && { avatarSeed }),
      passwordHash, role: role as any,
      unitId: unitId ?? null,
      programId: programId ?? null,
      forcePasswordReset: true,
    }).returning();

    if (!user) { res.status(500).json({ error: "Failed to create user" }); return; }

    const units = await db.select().from(unitsTable);
    const unit = user.unitId ? units.find((x) => x.id === user.unitId) : null;
    res.status(201).json(fmtUser(user, unit?.name ?? null, null));
  }
);

router.patch(
  "/users/:userId",
  requireAuth,
  requireRole("super_admin", "central_exam_coordinator"),
  async (req, res) => {
    const id = Number(req.params["userId"]);
    const callerRole = req.user!.role;

    if (callerRole === "central_exam_coordinator") {
      const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
      if (!target || !COORDINATOR_MANAGEABLE_ROLES.includes(target.role)) {
        res.status(403).json({ error: "You can only manage coordinators and doctors" });
        return;
      }
    }

    const { active, role, unitId, fullName, salutation, employeeId, designation, gender, avatarSeed, email } = req.body as {
      active?: boolean; role?: string; unitId?: number | null; fullName?: string;
      salutation?: string; employeeId?: string; designation?: string; gender?: string; avatarSeed?: string; email?: string;
    };

    if (callerRole === "central_exam_coordinator" && role && !COORDINATOR_MANAGEABLE_ROLES.includes(role)) {
      res.status(403).json({ error: "You cannot assign this role" });
      return;
    }

    const update: Record<string, unknown> = {};
    if (active !== undefined) update["active"] = active;
    if (role !== undefined) update["role"] = role;
    if (unitId !== undefined) update["unitId"] = unitId;
    if (fullName !== undefined) update["fullName"] = fullName;
    if (salutation !== undefined) update["salutation"] = salutation;
    if (employeeId !== undefined) update["employeeId"] = employeeId;
    if (designation !== undefined) update["designation"] = designation;
    if (gender !== undefined) update["gender"] = gender;
    if (avatarSeed !== undefined) update["avatarSeed"] = avatarSeed;
    if (email !== undefined) update["email"] = email.toLowerCase();

    const [u] = await db.update(usersTable).set(update).where(eq(usersTable.id, id)).returning();
    if (!u) { res.status(404).json({ error: "Not found" }); return; }

    const units = await db.select().from(unitsTable);
    const unit = u.unitId ? units.find((x) => x.id === u.unitId) : null;
    res.json(fmtUser(u, unit?.name ?? null, null));
  }
);

router.delete(
  "/users/:userId",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = Number(req.params["userId"]);
    const callerId = req.user!.userId;

    if (id === callerId) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }

    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (target.role === "super_admin") {
      res.status(403).json({ error: "Cannot delete super admin accounts" });
      return;
    }

    console.log(`[delete_user] Starting cleanup for user ${id} (${target.fullName})`);
    
    const errors: any[] = [];
    
    const safeExec = async (label: string, fn: () => Promise<any>) => {
      try {
        console.log(`[delete_user] STEP: ${label}...`);
        await fn();
        console.log(`[delete_user] STEP: ${label} DONE`);
      } catch (e: any) {
        console.error(`[delete_user] STEP: ${label} FAILED:`, e);
        errors.push({ step: label, error: e?.message || String(e) });
      }
    };

    await safeExec("doctor_panel_status", () => db.execute(sql`DELETE FROM doctor_panel_status WHERE doctor_id = ${id}`));
    await safeExec("panel_members", () => db.delete(interviewPanelMembersTable).where(eq(interviewPanelMembersTable.doctorId, id)));
    await safeExec("assignments", () => db.delete(doctorAssignmentsTable).where(eq(doctorAssignmentsTable.doctorId, id)));
    await safeExec("scores", () => db.delete(interviewScoresTable).where(eq(interviewScoresTable.doctorId, id)));
    await safeExec("forms_nullify", () => db.update(applicationFormsTable).set({ createdBy: null }).where(eq(applicationFormsTable.createdBy, id)));
    await safeExec("candidates_nullify", () => db.update(candidatesTable).set({ userId: null }).where(eq(candidatesTable.userId, id)));

    try {
      console.log(`[delete_user] Final deletion of user ${id}...`);
      const result = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
      console.log(`[delete_user] Final deletion result:`, result);
      
      if (result.length === 0) {
        res.status(404).json({ error: "User record disappeared during cleanup" });
        return;
      }

      res.json({ success: true, cleanupErrors: errors.length > 0 ? errors : undefined });
    } catch (error: any) {
      console.error("[delete_user] CRITICAL ERROR on final delete:", error);
      res.status(500).json({ 
        error: "Final deletion failed", 
        details: error?.message || String(error),
        cleanupErrors: errors,
        hint: "This usually means a FK constraint is still active."
      });
    }
  }
);

export default router;
