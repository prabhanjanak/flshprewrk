import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, candidatesTable, documentsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

router.get("/documents/me", requireAuth, requireRole("student"), async (req, res) => {
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.userId, req.user!.userId));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
  const docs = await db.select().from(documentsTable).where(eq(documentsTable.candidateId, c.id));
  res.json(docs.map((d) => ({ id: d.id, docType: d.docType, fileName: d.fileName, fileUrl: d.fileUrl, uploadedAt: d.uploadedAt.toISOString() })));
});

router.post("/documents/me", requireAuth, requireRole("student"), async (req, res) => {
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.userId, req.user!.userId));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
  const { docType, fileName, fileUrl } = req.body as { docType: string; fileName: string; fileUrl?: string };
  if (!docType || !fileName) { res.status(400).json({ error: "Missing fields" }); return; }
  const [d] = await db.insert(documentsTable).values({ candidateId: c.id, docType, fileName, fileUrl: fileUrl ?? null }).returning();
  if (!d) { res.status(500).json({ error: "Failed" }); return; }
  res.json({ id: d.id, docType: d.docType, fileName: d.fileName, fileUrl: d.fileUrl, uploadedAt: d.uploadedAt.toISOString() });
});

export default router;
