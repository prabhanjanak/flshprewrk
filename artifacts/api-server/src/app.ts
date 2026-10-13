import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

import { db, applicationSubmissionsTable, applicationFormsTable, programsTable, candidatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { requireAuth, requireRole } from "./middleware/auth";
import { attachMockMode } from "./middleware/mock";
import { parseSpecializationString, formatDOBToStandard } from "./lib/utils";

const app: Express = express();
app.use(attachMockMode);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// GUARANTEED PRINT ROUTE (Directly on app to avoid router conflicts)
app.get(
  "/api/v2/generate-print/:id",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.id, id));
      if (!sub) return res.status(404).json({ error: "Submission not found" });

      const [form] = await db.select().from(applicationFormsTable).where(eq(applicationFormsTable.id, sub.formId));
      const [program] = form ? await db.select().from(programsTable).where(eq(programsTable.id, form.programId)) : [null];
      
      let candidateCode = "PENDING";
      if (sub.email) {
        const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.email, sub.email));
        if (candidate) candidateCode = candidate.candidateCode;
      }

      const doc = new PDFDocument({ 
        margin: 36, 
        size: 'LETTER', 
        bufferPages: true,
        info: { Title: `Application - ${sub.fullName}`, Author: 'Sankara Academy of Vision' }
      });
      const filename = `Application_${sub.fullName.replace(/\s+/g, '_')}_${id}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename=${filename}`);
      res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline' blob: data:; img-src 'self' data: blob:;");
      doc.pipe(res);

      const colors = { primary: '#0f172a', secondary: '#475569', accent: '#0b4a8f', muted: '#94a3b8', border: '#e2e8f0', bgSection: '#f8fafc' };

      const drawSectionHeader = (title: string) => {
        if (doc.y > 680) {
          doc.addPage();
          doc.y = 36;
        }
        doc.moveDown(0.6);
        const y = doc.y;
        doc.rect(36, y, 540, 18).fill(colors.bgSection);
        doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(10).text(title.toUpperCase(), 44, y + 4, { width: 520 });
        doc.strokeColor(colors.border).lineWidth(0.5).moveTo(36, y + 18).lineTo(576, y + 18).stroke();
        doc.y = y + 24;
      };

      const renderApplicationRecordRow = (label: string, value: any) => {
        const valText = (value === null || value === undefined || value === "null" || value === "") ? "—" : String(value);
        const startY = doc.y;
        doc.fillColor(colors.secondary).font('Helvetica-Bold').fontSize(9).text(label.toUpperCase(), 36, startY, { width: 115, lineGap: 1 });
        const labelEndY = doc.y;
        doc.fillColor(colors.primary).font('Helvetica').fontSize(9.5).text(`: ${valText}`, 155, startY, { width: 310, lineGap: 1 });
        const valueEndY = doc.y;
        doc.y = Math.max(labelEndY, valueEndY) + 3;
      };

      const renderGeneralRow = (label: string, value: any) => {
        const valText = (value === null || value === undefined || value === "null" || value === "") ? "—" : String(value);
        if (doc.y > 700) {
          doc.addPage();
          doc.y = 36;
        }
        const currentY = doc.y;
        doc.fillColor(colors.secondary).font('Helvetica-Bold').fontSize(8.5).text(label.toUpperCase(), 36, currentY, { width: 145, lineGap: 1 });
        const labelEndY = doc.y;
        doc.fillColor(colors.primary).font('Helvetica').fontSize(9).text(`: ${valText}`, 185, currentY, { width: 390, lineGap: 1 });
        const valueEndY = doc.y;
        doc.y = Math.max(labelEndY, valueEndY) + 4;
      };

      const parseSpecializations = (spec: string | null | undefined): string[] => {
        return parseSpecializationString(spec);
      };

      const parseCenterPreferences = (cp: string | null | undefined, customAnswers?: any, sections?: any[]): Record<string, string> => {
        if (cp) {
          try {
            const parsed = JSON.parse(cp);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
          } catch { }
        }
        if (customAnswers && typeof customAnswers === "object") {
          const prefs: Record<string, string> = {};
          Object.entries(customAnswers).forEach(([key, val]) => {
            if (key.startsWith("unit_") && val) {
              let label = key.replace("unit_", "").replace(/_/g, " ").toUpperCase();
              if (sections) {
                sections.forEach((sec: any) => {
                  sec.fields?.forEach((f: any) => {
                    if (f.id === key) label = f.label.replace(" Preferred Center", "");
                  });
                });
              }
              prefs[label] = Array.isArray(val) ? val.join(", ") : String(val);
            }
          });
          return prefs;
        }
        return {};
      };

      // Header (Compact Letter scaled)
      doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(18).text('SANKARA ACADEMY OF VISION', 36, 36, { width: 440, align: 'left' });
      doc.fillColor(colors.primary).font('Helvetica').fontSize(9).text('Educational unit of Sankara Eye Foundation, India', 36, 57, { width: 440, align: 'left' });
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8.5).text('FELLOWSHIP PROGRAM ADMISSIONS RECORD', 36, 70, { width: 440, align: 'left' });
      doc.strokeColor(colors.accent).lineWidth(1.5).moveTo(36, 84).lineTo(576, 84).stroke();

      // Photo on the top right
      const photoUrl = sub.photoUrl;
      const photoX = 491;
      const photoY = 94;
      const photoW = 85;
      const photoH = 105;

      if (photoUrl && photoUrl.startsWith("/objects/")) {
        const localPath = path.join(process.cwd(), "uploads", photoUrl.replace("/objects/", ""));
        try {
          doc.image(localPath, photoX, photoY, { width: photoW, height: photoH });
          doc.rect(photoX, photoY, photoW, photoH).strokeColor(colors.border).lineWidth(1).stroke();
        } catch (e) {
          doc.rect(photoX, photoY, photoW, photoH).fill('#f1f5f9');
          doc.fillColor(colors.muted).font('Helvetica').fontSize(7.5).text('PHOTO NOT AVAILABLE', photoX, photoY + 45, { width: photoW, align: 'center' });
        }
      } else {
        doc.rect(photoX, photoY, photoW, photoH).fill('#f1f5f9');
        doc.fillColor(colors.muted).font('Helvetica').fontSize(7.5).text('NO PHOTO UPLOADED', photoX, photoY + 45, { width: photoW, align: 'center' });
      }

      doc.y = 94;
      doc.fillColor(colors.accent).font('Helvetica-Bold').fontSize(11).text('APPLICATION SUMMARY', 36, 94, { width: 350 });
      doc.y = 112;

      renderApplicationRecordRow('Registration No.', candidateCode);
      renderApplicationRecordRow('Application ID', `#APP-${id}`);
      renderApplicationRecordRow('Program', program?.name || 'Fellowship Program');
      renderApplicationRecordRow('Submission Date', sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
      renderApplicationRecordRow('Application Status', sub.status.toUpperCase());
      
      // Ensure cursor is below the photo height before continuing
      if (doc.y < 210) {
        doc.y = 210;
      }

      drawSectionHeader('Personal & Communication Details');
      renderGeneralRow('Full Name', sub.fullName);
      renderGeneralRow('Email Address', sub.email);
      renderGeneralRow('Phone Number', sub.phone);
      renderGeneralRow('Date of Birth', formatDOBToStandard(sub.dateOfBirth));
      renderGeneralRow('Gender / Marital', [sub.gender, sub.maritalStatus].filter(Boolean).join(" · ") || "—");
      renderGeneralRow('Permanent Address', sub.permanentAddress);

      drawSectionHeader('Academic & Professional Qualifications');
      renderGeneralRow('Degree / Qualifications', sub.degree);
      renderGeneralRow('Medical College / University', [sub.medicalCollege, sub.university].filter(Boolean).join(" · ") || "—");
      renderGeneralRow('Medical Council Reg No', sub.medicalCouncilNumber);
      if (sub.pgQualifications) renderGeneralRow('PG Qualifications', sub.pgQualifications);
      if (sub.doQualification && sub.doDetails) renderGeneralRow('DO Details', sub.doDetails);
      if (sub.msMdQualification && sub.msMdDetails) renderGeneralRow('MS / MD Details', sub.msMdDetails);
      if (sub.dnbQualification && sub.dnbDetails) renderGeneralRow('DNB Details', sub.dnbDetails);
      if (sub.otherTraining) renderGeneralRow('Other Training', sub.otherTraining);

      drawSectionHeader('Applied Specialization & Center Preferences');
      const specs = parseSpecializations(sub.specialization);
      const centerPrefs = parseCenterPreferences(sub.centerPreference, sub.customAnswers, form?.sectionsConfig ?? undefined);
      specs.forEach((sp, idx) => {
        if (doc.y > 700) {
          doc.addPage();
          doc.y = 36;
        }
        const currentY = doc.y;
        doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(9.5).text(`${idx + 1}. ${sp}`, 36, currentY, { width: 220, lineGap: 1 });
        const spEndY = doc.y;
        doc.fillColor(colors.secondary).font('Helvetica').fontSize(9).text(`Preferred Center: ${centerPrefs[sp] || 'Any Center'}`, 260, currentY, { width: 315, lineGap: 1 });
        const centerEndY = doc.y;
        doc.y = Math.max(spEndY, centerEndY) + 4;
      });

      // Clinical & Experience Details if present
      if (sub.diagnosticSkills || sub.surgicalExperience || sub.totalSurgeries) {
        drawSectionHeader('Clinical & Surgical Profile');
        if (sub.diagnosticSkills) renderGeneralRow('Diagnostic Skills', sub.diagnosticSkills);
        if (sub.surgicalExperience) renderGeneralRow('Surgical Experience', sub.surgicalExperience);
        if (sub.totalSurgeries) renderGeneralRow('Total Surgeries Done', sub.totalSurgeries);
      }

      // Research & Publications
      if (sub.publications || sub.presentations) {
        drawSectionHeader('Research & Publications');
        if (sub.publications) renderGeneralRow('Publications', sub.publications);
        if (sub.presentations) renderGeneralRow('Presentations', sub.presentations);
      }

      drawSectionHeader('Payment & Verification');
      renderGeneralRow('Payment Reference ID', sub.paymentId || '—');
      renderGeneralRow('Payment Mode', sub.paymentMode || 'Online');
      renderGeneralRow('Fee Status', sub.paymentId ? 'Verified & Paid' : 'Pending');
      
      if (doc.y > 670) {
        doc.addPage();
        doc.y = 36;
      }
      doc.moveDown(0.5);
      doc.fillColor(colors.secondary).font('Helvetica-Oblique').fontSize(8).text(
        'Declaration: I hereby declare that the information provided above is true and authentic to the best of my knowledge and belief.',
        36, doc.y, { width: 540, lineGap: 1 }
      );

      // Sign-off verification boxes
      doc.moveDown(1.5);
      const signY = doc.y;
      if (signY < 720) {
        doc.strokeColor(colors.border).lineWidth(0.5).moveTo(36, signY + 30).lineTo(180, signY + 30).stroke();
        doc.fillColor(colors.secondary).font('Helvetica').fontSize(7.5).text('Candidate Signature', 36, signY + 34, { width: 144, align: 'center' });

        doc.strokeColor(colors.border).lineWidth(0.5).moveTo(234, signY + 30).lineTo(378, signY + 30).stroke();
        doc.fillColor(colors.secondary).font('Helvetica').fontSize(7.5).text('Reviewer Seal & Signature', 234, signY + 34, { width: 144, align: 'center' });

        doc.strokeColor(colors.border).lineWidth(0.5).moveTo(432, signY + 30).lineTo(576, signY + 30).stroke();
        doc.fillColor(colors.secondary).font('Helvetica').fontSize(7.5).text('Date of Verification', 432, signY + 34, { width: 144, align: 'center' });
      }

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor(colors.muted).fontSize(7.5).text(
          `Page ${i + 1} of ${range.count} | Letter Format | Sankara Academy of Vision Admissions System`,
          36,
          doc.page.height - 24,
          { width: 540, align: 'center' }
        );
      }

      doc.end();
    } catch (e) {
      console.error("[print-gen] error:", e);
      if (!res.headersSent) res.status(500).json({ error: "Failed to generate PDF" });
    }
  }
);

app.use("/objects", express.static(path.join(process.cwd(), "uploads")));

const candidateDistPaths = [
  path.join(fileURLToPath(new URL(".", import.meta.url)), "../../fellowship-exam/dist"),
  path.join(process.cwd(), "artifacts/fellowship-exam/dist"),
  path.join(process.cwd(), "public"),
  path.join(process.cwd(), "dist/public"),
];

const examDist = candidateDistPaths.find((p) => fs.existsSync(p));

if (examDist) {
  // Serve static files from the build directory
  app.use(express.static(examDist));

  // Handle SPA routing: any non-API route serves index.html
  app.use((req, res, next) => {
    // Skip API and static objects
    if (req.path.startsWith("/api") || req.path.startsWith("/objects")) {
      return next();
    }
    res.sendFile(path.join(examDist, "index.html"));
  });
}

// Centralized Express error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, "Express request error");
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = typeof err.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  const message = statusCode === 500 && process.env.NODE_ENV === "production"
    ? "An internal server error occurred"
    : err.message || "Internal server error";

  res.status(statusCode).json({ error: message });
});

export default app;

