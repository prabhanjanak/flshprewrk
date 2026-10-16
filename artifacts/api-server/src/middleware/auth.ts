import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../lib/auth";
import { db, userSessionsTable, globalSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
      sessionToken?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  let token = "";
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    token = header.slice("Bearer ".length);
  } else if (req.query.token && typeof req.query.token === "string") {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  try {
    const verified = verifyToken(token);
    
    // Check if user is active in usersTable
    const [userRecord] = await db
      .select({ id: usersTable.id, active: usersTable.active })
      .from(usersTable)
      .where(eq(usersTable.id, verified.userId));

    if (!userRecord || userRecord.active === false) {
      res.status(403).json({ error: "User account is disabled or revoked" });
      return;
    }

    const now = new Date();

    // Check if token exists in user_sessions; if not, auto-create to prevent invalid lockouts
    const [session] = await db.select().from(userSessionsTable).where(eq(userSessionsTable.token, token));

    if (session) {
      // Non-blocking update of lastActivityAt and ensuring active status
      db.update(userSessionsTable)
        .set({ lastActivityAt: now, isActive: true })
        .where(eq(userSessionsTable.id, session.id))
        .catch((err) => console.error("Failed to update session activity:", err));
    } else {
      // Auto-insert session record for verified token (e.g. after server restart or serverless container migration)
      db.insert(userSessionsTable)
        .values({
          userId: verified.userId,
          token,
          isActive: true,
          ipAddress: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim(),
          deviceInfo: String(req.headers["user-agent"] || "Unknown Device"),
          lastActivityAt: now,
        })
        .catch((err) => console.error("Failed to auto-register session:", err));
    }

    req.user = verified;
    req.sessionToken = token;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    const userRole = req.user.role;

    // Super Admin has full unrestricted access
    if (userRole === "super_admin") {
      next();
      return;
    }

    // Role consolidation: exam_coordinator matches central_exam_coordinator, program_admin, unit_coordinator
    const coordinatorRoles = ["exam_coordinator", "central_exam_coordinator", "program_admin", "unit_coordinator"];
    const isUserCoord = coordinatorRoles.includes(userRole);
    const acceptsCoord = roles.some((r) => coordinatorRoles.includes(r));

    if (roles.includes(userRole) || (isUserCoord && acceptsCoord)) {
      next();
      return;
    }

    res.status(403).json({ error: "Forbidden" });
    return;
  };
}

