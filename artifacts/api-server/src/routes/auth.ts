import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, unitsTable, userSessionsTable, auditLogsTable } from "@workspace/db";
import { signToken, hashPassword, comparePassword } from "../lib/auth";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

async function formatUser(user: typeof usersTable.$inferSelect) {
  let unitName: string | null = null;
  if (user.unitId) {
    const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, user.unitId));
    unitName = unit?.name ?? null;
  }
  return {
    id: user.id,
    email: user.email,
    salutation: user.salutation ?? null,
    fullName: user.fullName,
    employeeId: user.employeeId ?? null,
    designation: (user as Record<string, unknown>)["designation"] as string | null ?? null,
    gender: (user as Record<string, unknown>)["gender"] as string | null ?? null,
    avatarSeed: (user as Record<string, unknown>)["avatarSeed"] as string | null ?? null,
    role: user.role,
    unitId: user.unitId,
    unitName,
    programId: user.programId,
    forcePasswordReset: user.forcePasswordReset,
  };
}

router.post("/auth/login", async (req, res) => {
  const { email, password, networkIp, deviceInfo: clientDeviceInfo } = req.body as {
    email: string;
    password: string;
    networkIp?: string;
    deviceInfo?: string;
  };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const lowered = email.toLowerCase().trim();
  if (!lowered.endsWith("@sankaraeye.com")) {
    res.status(403).json({ error: "Only @sankaraeye.com accounts are allowed" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, lowered));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (!user.active) {
    res.status(403).json({ error: "Account is disabled" });
    return;
  }
  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  
  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  // Store active session in database
  const fallbackIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim();
  const ipAddress = (networkIp && networkIp.trim()) ? networkIp.trim() : fallbackIp;

  const fallbackDeviceInfo = String(req.headers["user-agent"] || "Unknown Device");
  const deviceInfo = (clientDeviceInfo && clientDeviceInfo.trim()) ? clientDeviceInfo.trim() : fallbackDeviceInfo;
  
  await db.insert(userSessionsTable).values({
    userId: user.id,
    token,
    ipAddress,
    deviceInfo,
    isActive: true,
  });

  // Write Login Audit Log
  await db.insert(auditLogsTable).values({
    userId: user.id,
    userEmail: user.email,
    userName: user.fullName,
    action: "LOGIN",
    details: `Successfully logged in. IP: ${ipAddress}, Agent: ${deviceInfo}`,
    ipAddress,
  });

  res.json({ token, user: await formatUser(user) });
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  try {
    const token = req.sessionToken;
    if (token) {
      await db.update(userSessionsTable).set({ isActive: false }).where(eq(userSessionsTable.token, token));
      
      // Log manual logout audit
      const ipAddress = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim();
      await db.insert(auditLogsTable).values({
        userId: req.user!.userId,
        userEmail: req.user!.email,
        action: "LOGOUT",
        details: "User manually logged out.",
        ipAddress,
      });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to logout" });
  }
});

router.get("/auth/sessions", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const sessions = await db.select().from(userSessionsTable).where(eq(userSessionsTable.isActive, true));
    const users = await db.select().from(usersTable);

    const result = sessions.map((s) => {
      const u = users.find((x) => x.id === s.userId);
      return {
        id: s.id,
        userId: s.userId,
        userName: u?.fullName ?? "Unknown User",
        userEmail: u?.email ?? "Unknown Email",
        role: u?.role ?? "student",
        ipAddress: s.ipAddress,
        deviceInfo: s.deviceInfo,
        createdAt: s.createdAt.toISOString(),
        lastActivityAt: s.lastActivityAt.toISOString(),
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch active sessions" });
  }
});

router.post("/auth/sessions/terminate", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const { sessionId } = req.body as { sessionId: number };
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  try {
    const [sess] = await db.select().from(userSessionsTable).where(eq(userSessionsTable.id, sessionId));
    if (!sess) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    await db.update(userSessionsTable).set({ isActive: false }).where(eq(userSessionsTable.id, sessionId));

    // Audit log
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, sess.userId));
    const ipAddress = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim();
    await db.insert(auditLogsTable).values({
      userId: req.user!.userId,
      userEmail: req.user!.email,
      action: "SESSION_TERMINATE",
      details: `Admin terminated active session for user: ${u?.email || "ID " + sess.userId}`,
      ipAddress,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to terminate session" });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(await formatUser(user));
});

router.post("/auth/change-password", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Both current and new password required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const ok = await comparePassword(currentPassword, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const passwordHash = await hashPassword(newPassword);
  const [updated] = await db.update(usersTable)
    .set({ passwordHash, forcePasswordReset: false })
    .where(eq(usersTable.id, userId))
    .returning();
  if (!updated) {
    res.status(500).json({ error: "Failed to update password" });
    return;
  }
  res.json({ success: true, user: await formatUser(updated) });
});

// Admin: reset any user's password
router.post("/auth/admin-reset-password", requireAuth, async (req, res) => {
  const caller = req.user!;
  if (caller.role !== "super_admin") {
    res.status(403).json({ error: "Only super admins can reset passwords" });
    return;
  }
  const { userId, newPassword } = req.body as { userId: number; newPassword: string };
  if (!userId || !newPassword) {
    res.status(400).json({ error: "userId and newPassword required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  const passwordHash = await hashPassword(newPassword);
  const [updated] = await db.update(usersTable)
    .set({ passwordHash, forcePasswordReset: true })
    .where(eq(usersTable.id, userId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
