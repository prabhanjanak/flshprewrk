import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, documentTemplatesTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Get templates for a program
router.get("/programs/:programId/templates", requireAuth, async (req, res) => {
  const programId = Number(req.params.programId);
  const templates = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.programId, programId));
  res.json(templates);
});

// Add a template to a program
router.post("/document-templates", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const { programId, name, googleDocId } = req.body;
  if (!programId || !name || !googleDocId) return res.status(400).json({ error: "Missing fields" });
  
  const [template] = await db.insert(documentTemplatesTable).values({
    programId, name, googleDocId
  }).returning();
  
  res.json(template);
});

// Delete a template
router.delete("/document-templates/:id", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(documentTemplatesTable).where(eq(documentTemplatesTable.id, id));
  res.json({ success: true });
});

export default router;
