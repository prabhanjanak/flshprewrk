import { Router, Request, Response } from "express";
import { db, programsTable, candidatesTable, applicationsTable, applicationSubmissionsTable, specialitiesTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs/promises";
import QRCode from "qrcode";
import { formatDOBToStandard } from "../lib/utils";

const router: Router = Router();

// ── 1. Admin: Update Program Hall Ticket Settings ──────────────────────────────
router.patch(
  "/programs/:id/hall-ticket-settings",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const {
        hallTicketEnabled,
        hallTicketReleased,
        hallTicketPrefix,
        examDate,
        examVenue,
        examInstructions,
      } = req.body;

      const [updated] = await db
        .update(programsTable)
        .set({
          ...(hallTicketEnabled !== undefined && { hallTicketEnabled }),
          ...(hallTicketReleased !== undefined && { hallTicketReleased }),
          ...(hallTicketPrefix !== undefined && { hallTicketPrefix }),
          ...(examDate !== undefined && { examDate }),
          ...(examVenue !== undefined && { examVenue }),
          ...(examInstructions !== undefined && { examInstructions }),
        })
        .where(eq(programsTable.id, id))
        .returning();

      if (!updated) return res.status(404).json({ error: "Program not found" });

      res.json({ success: true, program: updated });
    } catch (err: any) {
      console.error("[hall-ticket-settings] error:", err);
      res.status(500).json({ error: "Failed to update hall ticket settings" });
    }
  }
);

// ── 2. Admin: Bulk Generate Hall Ticket Numbers ────────────────────────────────
router.post(
  "/programs/:id/generate-hall-tickets",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req: Request, res: Response) => {
    try {
      const programId = Number(req.params.id);
      const [program] = await db.select().from(programsTable).where(eq(programsTable.id, programId));
      if (!program) return res.status(404).json({ error: "Program not found" });

      const prefix = program.hallTicketPrefix || `${program.code}-2026`;

      // Get all approved applications without a hall ticket number
      const applications = await db
        .select({
          id: applicationsTable.id,
          candidateId: applicationsTable.candidateId,
          specialityId: applicationsTable.specialityId,
          hallTicketNumber: applicationsTable.hallTicketNumber,
        })
        .from(applicationsTable)
        .where(eq(applicationsTable.status, "approved"));

      // Also get application submissions to assign hall tickets
      const submissions = await db
        .select()
        .from(applicationSubmissionsTable)
        .where(eq(applicationSubmissionsTable.status, "approved"));

      let count = 0;
      // Get highest existing sequence number for this prefix
      const existing = await db.execute(sql`
        SELECT hall_ticket_number FROM applications WHERE hall_ticket_number LIKE ${prefix + '-%'}
      `);
      let seq = existing.rows.length + 1;

      for (const app of applications) {
        if (!app.hallTicketNumber) {
          const ht = `${prefix}-${String(seq).padStart(3, "0")}`;
          await db
            .update(applicationsTable)
            .set({ hallTicketNumber: ht })
            .where(eq(applicationsTable.id, app.id));
          seq++;
          count++;
        }
      }

      res.json({
        success: true,
        message: `Generated ${count} new hall ticket numbers with prefix '${prefix}'.`,
        totalActive: seq - 1,
      });
    } catch (err: any) {
      console.error("[generate-hall-tickets] error:", err);
      res.status(500).json({ error: "Failed to generate hall tickets" });
    }
  }
);

// ── Helper: Draw Single Hall Ticket Page ──────────────────────────────────────
async function drawHallTicketPage(doc: any, data: {
  candidateName: string;
  candidateCode: string;
  hallTicketNumber: string;
  programName: string;
  examDate: string;
  examVenue: string;
  examInstructions: string;
  photoUrl?: string | null;
  dob?: string | null;
  email: string;
  phone?: string | null;
  specialityName?: string | null;
}) {
  const colors = {
    navy: "#0b4a8f",
    dark: "#0f172a",
    slate: "#475569",
    border: "#cbd5e1",
    bgMuted: "#f8fafc",
    accentGold: "#b45309",
  };

  const pageWidth = 612;
  const left = 36;
  const contentWidth = 540;

  // Outer Border Box
  doc.rect(left, 36, contentWidth, 720).strokeColor(colors.navy).lineWidth(1.5).stroke();

  // Header Banner
  doc.rect(left, 36, contentWidth, 76).fill(colors.bgMuted);
  doc.strokeColor(colors.border).lineWidth(0.5).moveTo(left, 112).lineTo(left + contentWidth, 112).stroke();

  doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(16).text("SANKARA ACADEMY OF VISION", left, 48, { width: contentWidth, align: "center" });
  doc.fillColor(colors.dark).font("Helvetica").fontSize(9).text("Educational unit of Sankara Eye Foundation · Sri Kanchi Kamakoti Medical Trust", left, 68, { width: contentWidth, align: "center" });
  doc.fillColor(colors.accentGold).font("Helvetica-Bold").fontSize(8.5).text("CENTRAL ADMISSIONS & EXAMINATION BOARD", left, 82, { width: contentWidth, align: "center" });
  doc.fillColor(colors.slate).font("Helvetica").fontSize(7.5).text("Website: admissions.sankaraeye.com · Email: admissions@sankaraeye.com", left, 96, { width: contentWidth, align: "center" });

  // Document Title Ribbon
  doc.rect(left, 112, contentWidth, 24).fill(colors.navy);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11).text(
    `OFFICIAL EXAMINATION ADMIT CARD / HALL TICKET — ${data.programName.toUpperCase()}`,
    left,
    118,
    { width: contentWidth, align: "center" }
  );

  // Candidate Photo & QR Section
  const photoX = left + contentWidth - 95;
  const photoY = 148;
  const photoW = 85;
  const photoH = 105;

  let hasPhoto = false;
  if (data.photoUrl && data.photoUrl.startsWith("/objects/")) {
    const localPath = path.join(process.cwd(), "uploads", data.photoUrl.replace("/objects/", ""));
    try {
      doc.image(localPath, photoX, photoY, { width: photoW, height: photoH });
      doc.rect(photoX, photoY, photoW, photoH).strokeColor(colors.border).lineWidth(1).stroke();
      hasPhoto = true;
    } catch {}
  }
  if (!hasPhoto) {
    doc.rect(photoX, photoY, photoW, photoH).fill("#f1f5f9");
    doc.strokeColor(colors.border).lineWidth(1).stroke();
    doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("AFFIX PASSPORT\nPHOTO HERE\n(If not printed)", photoX, photoY + 38, { width: photoW, align: "center" });
  }

  // Hall Ticket Primary Key Details Box
  doc.rect(left + 12, 148, contentWidth - 125, 105).fill("#f8fafc");
  doc.strokeColor(colors.border).lineWidth(0.5).rect(left + 12, 148, contentWidth - 125, 105).stroke();

  doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(9).text("HALL TICKET / ROLL NO.", left + 20, 158);
  doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(18).text(data.hallTicketNumber, left + 20, 172);

  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("CANDIDATE REG NO:", left + 20, 202);
  doc.fillColor(colors.dark).font("Helvetica").fontSize(9.5).text(data.candidateCode || "—", left + 145, 202);

  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("APPLICANT NAME:", left + 20, 218);
  doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(10).text(data.candidateName.toUpperCase(), left + 145, 218);

  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("PROGRAM / STREAM:", left + 20, 234);
  doc.fillColor(colors.dark).font("Helvetica").fontSize(9).text(data.specialityName ? `${data.programName} (${data.specialityName})` : data.programName, left + 145, 234);

  // Section 1: Candidate Personal Details Grid
  doc.rect(left + 12, 268, contentWidth - 24, 60).fill("#ffffff");
  doc.strokeColor(colors.border).lineWidth(0.5).rect(left + 12, 268, contentWidth - 24, 60).stroke();
  doc.rect(left + 12, 268, contentWidth - 24, 16).fill("#e2e8f0");
  doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8.5).text("1. CANDIDATE PROFILE DETAILS", left + 20, 272);

  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("EMAIL ADDRESS:", left + 20, 292);
  doc.fillColor(colors.dark).font("Helvetica").fontSize(8.5).text(data.email, left + 110, 292);

  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("CONTACT NO:", left + 300, 292);
  doc.fillColor(colors.dark).font("Helvetica").fontSize(8.5).text(data.phone || "—", left + 380, 292);

  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("DATE OF BIRTH:", left + 20, 308);
  doc.fillColor(colors.dark).font("Helvetica").fontSize(8.5).text(formatDOBToStandard(data.dob) || "—", left + 110, 308);

  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("ADMIT STATUS:", left + 300, 308);
  doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8.5).text("VERIFIED & ELIGIBLE", left + 380, 308);

  // Section 2: Examination Schedule & Center Venue Box
  doc.rect(left + 12, 342, contentWidth - 24, 90).fill("#f8fafc");
  doc.strokeColor(colors.navy).lineWidth(1).rect(left + 12, 342, contentWidth - 24, 90).stroke();
  doc.rect(left + 12, 342, contentWidth - 24, 18).fill(colors.navy);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9).text("2. EXAMINATION SCHEDULE & ASSIGNED VENUE", left + 20, 346);

  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8.5).text("EXAMINATION DATE & TIME:", left + 20, 368);
  doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(10).text(data.examDate || "As per central schedule announcement", left + 180, 368);

  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8.5).text("REPORTING TIME:", left + 20, 386);
  doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(9.5).text("45 minutes before scheduled start time", left + 180, 386);

  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8.5).text("ASSIGNED EXAMINATION VENUE:", left + 20, 404);
  doc.fillColor(colors.dark).font("Helvetica").fontSize(8.5).text(
    data.examVenue || "Sankara Academy of Vision / Assigned Regional Center",
    left + 180, 404, { width: 330 }
  );

  // Section 3: Important Instructions
  doc.rect(left + 12, 446, contentWidth - 24, 160).fill("#ffffff");
  doc.strokeColor(colors.border).lineWidth(0.5).rect(left + 12, 446, contentWidth - 24, 160).stroke();
  doc.rect(left + 12, 446, contentWidth - 24, 16).fill("#e2e8f0");
  doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8.5).text("3. CANDIDATE INSTRUCTIONS & REGULATIONS", left + 20, 450);

  const defaultInstructions = [
    "1. This Admit Card must be printed on standard Letter/A4 paper and presented at the examination hall.",
    "2. Candidate must carry a valid Government Original Photo ID (Aadhaar / Passport / Voter ID / Driving License).",
    "3. Electronic devices, smartwatches, calculators, and unauthorized materials are strictly prohibited.",
    "4. Candidate should report to the assigned center at least 45 minutes prior to the examination start time.",
    "5. Hall Ticket barcode/QR will be scanned at the entry gate for identity and credential verification.",
    "6. Any malpractice or impersonation will lead to immediate disqualification and regulatory action.",
  ];

  let instY = 470;
  defaultInstructions.forEach((inst) => {
    doc.fillColor(colors.dark).font("Helvetica").fontSize(7.5).text(inst, left + 20, instY, { width: contentWidth - 40, lineGap: 1 });
    instY += 16;
  });

  if (data.examInstructions) {
    doc.fillColor(colors.accentGold).font("Helvetica-Bold").fontSize(7.5).text(`Note: ${data.examInstructions}`, left + 20, instY, { width: contentWidth - 40 });
  }

  // QR Code for Validation
  try {
    const qrData = `SAV-VERIFY:${data.hallTicketNumber}:${data.candidateCode}:${data.candidateName}`;
    const qrBuffer = await QRCode.toBuffer(qrData, { width: 60, margin: 1 });
    doc.image(qrBuffer, left + 20, 620, { width: 55, height: 55 });
    doc.fillColor(colors.slate).font("Helvetica").fontSize(6.5).text("Scan to Validate", left + 20, 680, { width: 55, align: "center" });
  } catch {}

  // Signatures Section
  const signY = 660;
  doc.strokeColor(colors.border).lineWidth(0.5).moveTo(left + 120, signY).lineTo(left + 280, signY).stroke();
  doc.fillColor(colors.slate).font("Helvetica").fontSize(7.5).text("Candidate Signature (In presence of Invigilator)", left + 120, signY + 4, { width: 160, align: "center" });

  doc.strokeColor(colors.border).lineWidth(0.5).moveTo(left + 350, signY).lineTo(left + 510, signY).stroke();
  doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(7.5).text("Controller of Examinations (SAV)", left + 350, signY + 4, { width: 160, align: "center" });

  // Footer Disclaimer
  doc.fillColor(colors.slate).font("Helvetica-Oblique").fontSize(6.5).text(
    "Generated automatically by Sankara Academy of Vision Central Examination Portal · Valid for authorized 2026 Admissions Session only.",
    left,
    738,
    { width: contentWidth, align: "center" }
  );
}

// ── 3. Public: Candidate Hall Ticket Download / Print ─────────────────────────
router.get("/hall-tickets/download/:identifier", async (req: Request, res: Response) => {
  try {
    const rawId = String(req.params.identifier).trim();

    // Find submission or application matching identifier (ID, email, or candidateCode)
    let sub: any = null;
    let candidate: any = null;
    let application: any = null;

    if (!isNaN(Number(rawId))) {
      [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.id, Number(rawId)));
    }

    if (!sub) {
      [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, rawId));
    }

    if (sub?.email) {
      const c = await db.select().from(candidatesTable).where(eq(candidatesTable.email, sub.email));
      candidate = c[0] || null;
    }

    if (candidate) {
      const apps = await db.select().from(applicationsTable).where(eq(applicationsTable.candidateId, candidate.id));
      application = apps[0] || null;
    }

    if (!sub && !candidate) {
      return res.status(404).json({ error: "Candidate record not found for hall ticket." });
    }

    // Lookup program
    const formId = sub?.formId;
    let program: any = null;
    if (formId) {
      const [form] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.id, sub.id));
      const progs = await db.select().from(programsTable).limit(1);
      program = progs[0] || null;
    } else {
      const progs = await db.select().from(programsTable).limit(1);
      program = progs[0] || null;
    }

    const candidateName = sub?.fullName || candidate?.fullName || "Candidate";
    const candidateCode = sub?.candidateCode || candidate?.candidateCode || `SAV-${sub?.id || '2026'}`;
    const hallTicketNumber = application?.hallTicketNumber || `${program?.hallTicketPrefix || 'SAV-2026'}-${String(sub?.id || 1).padStart(3, "0")}`;

    const doc = new PDFDocument({ margin: 36, size: "LETTER" });
    const filename = `HallTicket_${candidateName.replace(/\s+/g, "_")}_${hallTicketNumber}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    doc.pipe(res);

    await drawHallTicketPage(doc, {
      candidateName,
      candidateCode,
      hallTicketNumber,
      programName: program?.name || "Fellowship / VCT Examination",
      examDate: program?.examDate || "June / August 2026 Session",
      examVenue: program?.examVenue || "Sankara Academy of Vision Campus",
      examInstructions: program?.examInstructions || "",
      photoUrl: sub?.photoUrl || null,
      dob: sub?.dateOfBirth || candidate?.dateOfBirth,
      email: sub?.email || candidate?.email || "",
      phone: sub?.phone || candidate?.phone,
      specialityName: sub?.specialization ? JSON.parse(sub.specialization)[0] : null,
    });

    doc.end();
  } catch (err: any) {
    console.error("[hall-ticket-download] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate hall ticket PDF" });
  }
});

// ── 4. Admin: Batch Export All Hall Tickets for a Program ─────────────────────
router.get(
  "/programs/:id/batch-hall-tickets-pdf",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req: Request, res: Response) => {
    try {
      const programId = Number(req.params.id);
      const [program] = await db.select().from(programsTable).where(eq(programsTable.id, programId));
      if (!program) return res.status(404).json({ error: "Program not found" });

      const cands = await db.select().from(candidatesTable).where(sql`status != 'rejected'`);
      const subs = await db.select().from(applicationSubmissionsTable).where(sql`status != 'rejected'`);

      const list: Array<{
        name: string;
        code: string;
        email: string;
        phone: string | null;
        dob: string | null;
        photoUrl: string | null;
        speciality: string | null;
      }> = [];

      for (const c of cands) {
        list.push({
          name: c.fullName,
          code: c.candidateCode,
          email: c.email,
          phone: c.phone,
          dob: c.dateOfBirth,
          photoUrl: null,
          speciality: null,
        });
      }

      for (const s of subs) {
        if (!list.some((x) => x.email.toLowerCase() === s.email.toLowerCase())) {
          list.push({
            name: s.fullName,
            code: s.email || `SAV-${s.id}`,
            email: s.email,
            phone: s.phone,
            dob: s.dateOfBirth,
            photoUrl: s.photoUrl,
            speciality: s.specialization ? (parseSpecHelper(s.specialization)[0] || null) : null,
          });
        }
      }

      if (list.length === 0) {
        return res.status(400).json({ error: "No candidate records found for this program." });
      }

      const doc = new PDFDocument({ margin: 36, size: "LETTER", autoFirstPage: false });
      const filename = `Batch_HallTickets_${program.code}_${new Date().toISOString().split("T")[0]}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      doc.pipe(res);

      let seq = 1;
      for (const item of list) {
        doc.addPage();
        const htNum = `${program.hallTicketPrefix || program.code + "-2026"}-${String(seq).padStart(3, "0")}`;
        await drawHallTicketPage(doc, {
          candidateName: item.name,
          candidateCode: item.code,
          hallTicketNumber: htNum,
          programName: program.name,
          examDate: program.examDate || "Academic Year 2026",
          examVenue: program.examVenue || "Sankara Academy of Vision",
          examInstructions: program.examInstructions || "",
          photoUrl: item.photoUrl,
          dob: item.dob,
          email: item.email,
          phone: item.phone,
          specialityName: item.speciality,
        });
        seq++;
      }

      doc.end();
    } catch (err: any) {
      console.error("[batch-hall-tickets] error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Failed to generate batch hall tickets PDF" });
    }
  }
);

function parseSpecHelper(specStr: string | null | undefined): string[] {
  if (!specStr) return [];
  try {
    const parsed = JSON.parse(specStr);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return specStr.split(",").map((s) => s.trim()).filter(Boolean);
}

export default router;
