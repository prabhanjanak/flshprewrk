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
    
    // Check if token exists in user_sessions and is active
    const [session] = await db.select().from(userSessionsTable).where(eq(userSessionsTable.token, token));
    if (!session || !session.isActive) {
      res.status(401).json({ error: "Session has been terminated or is invalid" });
      return;
    }

    // Check inactivity timeout
    const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, "session_inactivity_timeout"));
    const timeoutMinutes = setting ? parseInt(setting.value, 10) : 30; // default 30 mins

    const now = new Date();
    const lastActive = new Date(session.lastActivityAt);
    const inactiveDiffMs = now.getTime() - lastActive.getTime();

    if (inactiveDiffMs > timeoutMinutes * 60 * 1000) {
      await db.update(userSessionsTable).set({ isActive: false }).where(eq(userSessionsTable.id, session.id));
      res.status(401).json({ error: "Session expired due to inactivity" });
      return;
    }

    // Check if user is active
    const [userRecord] = await db.select({ id: usersTable.id, active: usersTable.active }).from(usersTable).where(eq(usersTable.id, verified.userId));
    if (!userRecord || userRecord.active === false) {
      res.status(403).json({ error: "User account is disabled or revoked" });
      return;
    }

    // Non-blocking update of lastActivityAt
    db.update(userSessionsTable)
      .set({ lastActivityAt: now })
      .where(eq(userSessionsTable.id, session.id))
      .catch((err) => console.error("Failed to update session activity:", err));

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
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

