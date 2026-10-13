import type { Request, Response, NextFunction } from "express";
import { db, globalSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function attachMockMode(req: any, res: Response, next: NextFunction) {
  try {
    const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, "mock_mode"));
    req.isMockMode = setting?.value === "true";
  } catch (e) {
    req.isMockMode = false;
  }
  next();
}
