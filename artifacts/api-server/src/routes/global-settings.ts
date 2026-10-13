import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, globalSettingsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

// GET /global-settings — get all settings
router.get("/global-settings", async (_req, res) => {
  try {
    const settings = await db.select().from(globalSettingsTable);
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /global-settings/:key — get a specific setting
router.get("/global-settings/:key", async (req, res) => {
  try {
    const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, req.params.key));
    if (!setting) {
      const defaultVal = req.params.key === "session_inactivity_timeout" ? "60" : "";
      return res.json({ key: req.params.key, value: defaultVal });
    }
    res.json(setting);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /global-settings/:key — update or create a setting
router.patch(
  "/global-settings/:key",
  requireAuth,
  requireRole("super_admin", "program_admin"),
  async (req, res) => {
    try {
      const value = String(req.body.value);
      const key = String(req.params.key);

      const [existing] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, key));

      if (existing) {
        const [updated] = await db.update(globalSettingsTable)
          .set({ value, updatedAt: new Date() })
          .where(eq(globalSettingsTable.id, existing.id))
          .returning();
        res.json(updated);
      } else {
        const [inserted] = await db.insert(globalSettingsTable)
          .values({ key, value })
          .returning();
        res.json(inserted);
      }
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  }
);

export default router;
