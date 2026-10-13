import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { db, candidatesTable, specialitiesTable, candidatePreferencesTable, documentsTable, programsTable, applicationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

// Excel serial date → JS Date string (YYYY-MM-DD)
function excelDateToString(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s.length > 0) return s;
    return null;
  }
  if (typeof v === "number") {
    // Excel epoch is Dec 30, 1899
    const ms = (v - 25569) * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0] ?? null;
  }
  return null;
}

// Normalise a name (trim, title-case prefix "Dr")
function normName(s: string): string {
  return s.trim().replace(/^dr\.?\s+/i, "Dr. ");
}

function getCanonicalSpecialtyName(name: string): string {
  const norm = name.toLowerCase().trim();
  if (norm.includes("medical retina")) return "Medical Retina";
  if (norm.includes("vitreo-retina") || norm.includes("vitreo retina") || norm.includes("pediatric retina") || norm.includes("retina")) {
    return "Vitreo Retina";
  }
  if (norm.includes("pediatric") || norm.includes("pediatric ophthalmology")) return "Pediatric Ophthalmology";
  if (norm.includes("cornea & anterior segment") || norm.includes("cornea") || norm.includes("ocular surface")) return "Cornea";
  if (norm.includes("glaucoma")) return "Glaucoma";
  if (norm.includes("iol") || norm.includes("fellowship")) return "IOL Fellowship";
  if (norm.includes("oculoplasty")) return "Oculoplasty";
  if (norm.includes("phaco") || norm.includes("refractive")) return "Phaco Refractive";
  return name; // fallback
}

// Map Excel specialization label → canonical name used in DB
const SPEC_ALIAS: Record<string, string> = {
  "iol": "IOL Fellowship",
  "cornea": "Cornea",
  "glaucoma": "Glaucoma",
  "oculoplasty": "Oculoplasty",
  "pediatric ophthalmology": "Pediatric Ophthalmology",
  "phaco refractive": "Phaco Refractive",
  "medical retina": "Medical Retina",
  "vitreo retina": "Vitreo Retina",
};

// Column indices in the Excel
const COL = {
  TIMESTAMP: 0,
  SPECIALIZATION: 1,
  CORNEA_CENTER: 2,
  GLAUCOMA_CENTER: 3,
  IOL_CENTER: 4,
  OCULOPLASTY_CENTER: 5,
  PEDIATRIC_CENTER: 6,
  PHACO_CENTER: 7,
  MEDICAL_RETINA_CENTER: 8,
  VITREO_RETINA_CENTER: 9,
  FULL_NAME: 13,
  ADDRESS: 14,
  PHONE: 16,
  EMAIL: 17,
  DOB: 18,
  MARITAL_STATUS: 19,
  QUALIFICATION: 26,
  DO_QUAL: 27,
  MS_QUAL: 28,
  DNB_QUAL: 29,
  REG_NUMBER: 34,
  PUBLICATIONS: 63,
  LOR1_LINK: 65,
  LOR1_NAME: 66,
  LOR2_LINK: 69,
  LOR2_NAME: 70,
  OTHER_INFO: 73,
  PAYMENT_LINK: 75,
  PHOTO_LINK: 76,
};

// Spec name → which center column to read
const SPEC_CENTER_COL: Record<string, number> = {
  "Cornea": COL.CORNEA_CENTER,
  "Glaucoma": COL.GLAUCOMA_CENTER,
  "IOL Fellowship": COL.IOL_CENTER,
  "Oculoplasty": COL.OCULOPLASTY_CENTER,
  "Pediatric Ophthalmology": COL.PEDIATRIC_CENTER,
  "Phaco Refractive": COL.PHACO_CENTER,
  "Medical Retina": COL.MEDICAL_RETINA_CENTER,
  "Vitreo Retina": COL.VITREO_RETINA_CENTER,
};

function cell(row: unknown[], col: number): string {
  const v = row[col];
  if (v == null) return "";
  return String(v).trim();
}

router.post("/import/excel", requireAuth, requireRole("super_admin", "central_exam_coordinator"), async (_req, res) => {
  try {
    const xlsxPath = path.resolve(
      process.cwd(),
      "../../attached_assets/Fellowship_Application_form_-_Jan_2026_(Responses)_1777703761557.xlsx",
    );

    if (!fs.existsSync(xlsxPath)) {
      res.status(404).json({ error: "Excel file not found at " + xlsxPath });
      return;
    }

    const wb = XLSX.readFile(xlsxPath);
    const ws = wb.Sheets[wb.SheetNames[0]!];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];
    const dataRows = rows.slice(1).filter((r: unknown[]) => r[COL.FULL_NAME] && r[COL.EMAIL]);

    // --- Step 1: Ensure all specialities exist in DB ---
    const [program] = await db.select().from(programsTable).limit(1);
    if (!program) { res.status(500).json({ error: "No program found in DB" }); return; }

    // All unique spec names from this Excel
    const excelSpecNames = Object.values(SPEC_ALIAS);
    const existingSpecs = await db.select().from(specialitiesTable);

    const specNameToId: Record<string, number> = {};
    for (const sp of existingSpecs) {
      specNameToId[sp.name.toLowerCase()] = sp.id;
    }

    // Insert any missing specialities
    for (const specName of excelSpecNames) {
      if (!specNameToId[specName.toLowerCase()]) {
        const code = specName.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 4);
        const [inserted] = await db.insert(specialitiesTable).values({
          programId: program.id,
          name: specName,
          code,
          seats: 0,
        }).returning();
        if (inserted) specNameToId[specName.toLowerCase()] = inserted.id;
      }
    }

    // --- Step 2: Group rows by email (dedup) ---
    type RowGroup = {
      latestTs: number;
      masterRow: unknown[];
      specializations: { specName: string; centerPreference: string }[];
      lor1Link: string; lor1Name: string;
      lor2Link: string; lor2Name: string;
      paymentLink: string; photoLink: string;
    };

    const emailGroups: Record<string, RowGroup> = {};

    for (const row of dataRows) {
      const email = cell(row as unknown[], COL.EMAIL).toLowerCase().replace(/\s+/g, "");
      if (!email) continue;

      const ts = typeof row[COL.TIMESTAMP] === "number" ? (row[COL.TIMESTAMP] as number) : 0;
      const rawSpec = cell(row as unknown[], COL.SPECIALIZATION);
      const canonSpec = getCanonicalSpecialtyName(rawSpec);
      const centerCol = SPEC_CENTER_COL[canonSpec];
      const centerPref = centerCol != null ? cell(row as unknown[], centerCol) : "";

      if (!emailGroups[email]) {
        emailGroups[email] = {
          latestTs: ts,
          masterRow: row as unknown[],
          specializations: [],
          lor1Link: cell(row as unknown[], COL.LOR1_LINK),
          lor1Name: cell(row as unknown[], COL.LOR1_NAME),
          lor2Link: cell(row as unknown[], COL.LOR2_LINK),
          lor2Name: cell(row as unknown[], COL.LOR2_NAME),
          paymentLink: cell(row as unknown[], COL.PAYMENT_LINK),
          photoLink: cell(row as unknown[], COL.PHOTO_LINK),
        };
      } else if (ts > emailGroups[email].latestTs) {
        // Latest submission wins for personal data
        emailGroups[email].latestTs = ts;
        emailGroups[email].masterRow = row as unknown[];
        // Update docs from latest if they have better links
        const lr1 = cell(row as unknown[], COL.LOR1_LINK);
        if (lr1) emailGroups[email].lor1Link = lr1;
        const lr2 = cell(row as unknown[], COL.LOR2_LINK);
        if (lr2) emailGroups[email].lor2Link = lr2;
        const pay = cell(row as unknown[], COL.PAYMENT_LINK);
        if (pay) emailGroups[email].paymentLink = pay;
        const ph = cell(row as unknown[], COL.PHOTO_LINK);
        if (ph) emailGroups[email].photoLink = ph;
      }

      // Always collect specialization (merge across all submissions)
      const grp = emailGroups[email];
      if (canonSpec && !grp.specializations.find((s) => s.specName === canonSpec)) {
        grp.specializations.push({ specName: canonSpec, centerPreference: centerPref && centerPref !== "Not Applicable" ? centerPref : "" });
      }
    }

    // --- Step 3: Get existing candidates to avoid re-inserting ---
    const existingCandidates = await db.select().from(candidatesTable);
    const existingByEmail = new Map(existingCandidates.map((c) => [c.email.toLowerCase(), c]));
    const totalExisting = existingCandidates.length;

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    // --- Step 4: Upsert candidates ---
    for (const [email, grp] of Object.entries(emailGroups)) {
      const r = grp.masterRow;
      const fullName = normName(cell(r, COL.FULL_NAME));
      const phone = cell(r, COL.PHONE).replace(/\D/g, "").slice(-10) || null;
      const dob = excelDateToString(r[COL.DOB]);
      const address = cell(r, COL.ADDRESS) || null;
      const qual = [cell(r, COL.QUALIFICATION), cell(r, COL.MS_QUAL), cell(r, COL.DO_QUAL), cell(r, COL.DNB_QUAL)]
        .filter(Boolean).join("; ") || null;

      let candidateId: number;

      const existing = existingByEmail.get(email);
      if (existing) {
        // Update with latest data
        await db.update(candidatesTable).set({
          fullName,
          phone: phone ?? existing.phone,
          dateOfBirth: dob ?? existing.dateOfBirth,
          address: address ?? existing.address,
          qualification: qual ?? existing.qualification,
        }).where(eq(candidatesTable.id, existing.id));
        candidateId = existing.id;
        updated++;
      } else {
        const seq = totalExisting + inserted + 1;
        const candidateCode = `CAND-2026-${String(seq).padStart(3, "0")}`;
        const [newC] = await db.insert(candidatesTable).values({
          candidateCode,
          fullName,
          email,
          phone: phone ?? null,
          dateOfBirth: dob ?? null,
          address: address ?? null,
          qualification: qual ?? null,
          status: "pending",
        }).returning();
        if (!newC) { skipped++; continue; }
        candidateId = newC.id;
        inserted++;
      }

      // --- Step 5: Upsert speciality preferences ---
      const existingPrefs = await db.select().from(candidatePreferencesTable)
        .where(eq(candidatePreferencesTable.candidateId, candidateId));
      const existingSpecIds = new Set(existingPrefs.map((p) => p.specialityId));

      let prefOrder = existingPrefs.length > 0
        ? Math.max(...existingPrefs.map((p) => p.preferenceOrder)) + 1
        : 1;

      for (const { specName } of grp.specializations) {
        const specId = specNameToId[specName.toLowerCase()];
        if (!specId) continue;
        if (existingSpecIds.has(specId)) continue;
        await db.insert(candidatePreferencesTable).values({
          candidateId,
          specialityId: specId,
          preferenceOrder: prefOrder++,
        });

        // Also insert into applicationsTable as pending (since imported candidate is pending by default)
        const existingApp = await db.select().from(applicationsTable).where(
          and(
            eq(applicationsTable.candidateId, candidateId),
            eq(applicationsTable.specialityId, specId)
          )
        );
        if (existingApp.length === 0) {
          await db.insert(applicationsTable).values({
            candidateId,
            specialityId: specId,
            status: "pending",
          });
        }
      }

      // --- Step 6: Upsert documents (Drive links) ---
      const existingDocs = await db.select().from(documentsTable)
        .where(eq(documentsTable.candidateId, candidateId));
      const existingDocTypes = new Set(existingDocs.map((d) => d.docType));

      const docEntries: { docType: string; fileName: string; fileUrl: string }[] = [];
      if (grp.lor1Link && !existingDocTypes.has("LOR1"))
        docEntries.push({ docType: "LOR1", fileName: grp.lor1Name || "Letter of Recommendation 1", fileUrl: grp.lor1Link });
      if (grp.lor2Link && !existingDocTypes.has("LOR2"))
        docEntries.push({ docType: "LOR2", fileName: grp.lor2Name || "Letter of Recommendation 2", fileUrl: grp.lor2Link });
      if (grp.paymentLink && !existingDocTypes.has("PAYMENT"))
        docEntries.push({ docType: "PAYMENT", fileName: "Payment Screenshot", fileUrl: grp.paymentLink });
      if (grp.photoLink && !existingDocTypes.has("PHOTO"))
        docEntries.push({ docType: "PHOTO", fileName: "Passport Photo", fileUrl: grp.photoLink });

      if (docEntries.length > 0) {
        await db.insert(documentsTable).values(docEntries.map((d) => ({ ...d, candidateId })));
      }
    }

    res.json({
      success: true,
      totalRowsInExcel: dataRows.length,
      uniqueCandidates: Object.keys(emailGroups).length,
      inserted,
      updated,
      skipped,
    });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Column auto-detection logic ─────────────────────────────────────────────
const FIELD_PATTERNS: Record<string, string[]> = {
  TIMESTAMP:            ["timestamp"],
  SPECIALIZATION:       ["applying for", "subspecialt", "which you are applying"],
  CORNEA_CENTER:        ["cornea"],
  GLAUCOMA_CENTER:      ["glaucoma"],
  IOL_CENTER:           ["iol"],
  OCULOPLASTY_CENTER:   ["oculoplasty"],
  PEDIATRIC_CENTER:     ["pediatric"],
  PHACO_CENTER:         ["phaco"],
  REFERRAL_SOURCE:      ["hear about", "referred"],
  REFERRAL_NAME:        ["faculty", "trainee", "referred by name", "referred by"],
  FULL_NAME:            ["name in full", "full name"],
  PERMANENT_ADDRESS:    ["permanent address"],
  MAILING_ADDRESS:      ["mailing address", "preferred mailing"],
  PHONE:                ["mobile number", "phone"],
  EMAIL:                ["e-mail", "email"],
  DOB:                  ["date of birth"],
  MARITAL_STATUS:       ["marital"],
  HEALTH:               ["ailments", "medical condition", "suffering"],
  DEGREE:               ["degrees & other", "degree"],
  MEDICAL_COLLEGE:      ["medical college"],
  UNIVERSITY:           ["university from", "university"],
  PG_QUALIFICATIONS:    ["postgraduate"],
  MEDICAL_COUNCIL_NUMBER: ["medical council registration", "registration number"],
  PUBLICATIONS:         ["publications"],
  PRESENTATIONS:        ["presentations"],
  LOR1_LINK:            ["lor 1,", "lor 1 ", "letter of recommendation 1"],
  LOR1_NAME:            ["name & designation", "designation of reference"],
  LOR1_CONTACT:         ["contact number of reference"],
  LOR1_EMAIL:           ["email id of reference"],
  LOR2_LINK:            ["lor 2,", "lor 2 ", "letter of recommendation 2"],
  OTHER_INFO:           ["anything more", "other information", "pertinent"],
  PAYMENT_LINK:         ["transaction id", "utr", "screenshot"],
  PHOTO_LINK:           ["passport size", "passport photo", "photograph"],
};

function autoDetectMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  headers.forEach((header, idx) => {
    const lower = header.toLowerCase();
    for (const [field, patterns] of Object.entries(FIELD_PATTERNS)) {
      if (!(field in mapping) && patterns.some((p) => lower.includes(p))) {
        mapping[field] = idx;
        break;
      }
    }
  });
  return mapping;
}

const FIELD_LABELS: Record<string, string> = {
  TIMESTAMP: "Timestamp", SPECIALIZATION: "Specialization", CORNEA_CENTER: "Cornea Center",
  GLAUCOMA_CENTER: "Glaucoma Center", IOL_CENTER: "IOL Center", OCULOPLASTY_CENTER: "Oculoplasty Center",
  PEDIATRIC_CENTER: "Pediatric Center", PHACO_CENTER: "Phaco Center", REFERRAL_SOURCE: "Referral Source",
  REFERRAL_NAME: "Referred By", FULL_NAME: "Full Name", PERMANENT_ADDRESS: "Permanent Address",
  MAILING_ADDRESS: "Mailing Address", PHONE: "Phone", EMAIL: "Email", DOB: "Date of Birth",
  MARITAL_STATUS: "Marital Status", HEALTH: "Health Declaration", DEGREE: "Degree",
  MEDICAL_COLLEGE: "Medical College", UNIVERSITY: "University", PG_QUALIFICATIONS: "PG Qualifications",
  MEDICAL_COUNCIL_NUMBER: "Council Reg. No.", PUBLICATIONS: "Publications", PRESENTATIONS: "Presentations",
  LOR1_LINK: "LOR 1 Link", LOR1_NAME: "LOR 1 Referee Name", LOR1_CONTACT: "LOR 1 Contact",
  LOR1_EMAIL: "LOR 1 Email", LOR2_LINK: "LOR 2 Link", OTHER_INFO: "Other Information",
  PAYMENT_LINK: "Payment Screenshot", PHOTO_LINK: "Passport Photo",
};

// POST /import/excel/detect — accepts base64-encoded Excel, returns columns + suggested mapping
router.post("/import/excel/detect", requireAuth, requireRole("super_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const { fileData, fileName } = req.body as { fileData?: string; fileName?: string };
    if (!fileData) return res.status(400).json({ error: "fileData (base64) is required" });

    const buf = Buffer.from(fileData, "base64");
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]!];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];
    if (rows.length === 0) return res.status(400).json({ error: "Excel file is empty" });

    const headers = (rows[0] as unknown[]).map((h) => String(h ?? "").trim());
    const suggestedMapping = autoDetectMapping(headers);
    const totalDataRows = rows.slice(1).filter((r) => r.some((c) => c != null && c !== "")).length;

    res.json({
      columns: headers,
      suggestedMapping,
      fieldLabels: FIELD_LABELS,
      totalDataRows,
      sheetName: wb.SheetNames[0],
      fileName: fileName ?? "unknown.xlsx",
    });
  } catch (err) {
    console.error("Detect error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /import/excel/process — process with given mapping
router.post("/import/excel/process", requireAuth, requireRole("super_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const { fileData, programId, mapping } = req.body as {
      fileData?: string; programId?: number; mapping?: Record<string, number>;
    };
    if (!fileData || !programId || !mapping) {
      return res.status(400).json({ error: "fileData, programId, and mapping are required" });
    }

    const buf = Buffer.from(fileData, "base64");
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]!];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];
    const dataRows = rows.slice(1).filter((r: unknown[]) => {
      const nameIdx = mapping["FULL_NAME"] ?? mapping["EMAIL"];
      return nameIdx != null ? r[nameIdx] : r.some((c) => c != null && c !== "");
    });

    const [program] = await db.select().from(programsTable).where(eq(programsTable.id, programId));
    if (!program) return res.status(400).json({ error: "Program not found" });

    const existingSpecs = await db.select().from(specialitiesTable);
    const specNameToId: Record<string, number> = {};
    for (const sp of existingSpecs) {
      specNameToId[sp.name.toLowerCase()] = sp.id;
    }

    const col = (row: unknown[], key: string): string => {
      const idx = mapping[key];
      if (idx == null) return "";
      const v = row[idx];
      return v == null ? "" : String(v).trim();
    };

    const SPEC_CENTER_KEYS: Record<string, string> = {
      "cornea": "CORNEA_CENTER", "glaucoma": "GLAUCOMA_CENTER",
      "iol": "IOL_CENTER", "iol fellowship": "IOL_CENTER",
      "oculoplasty": "OCULOPLASTY_CENTER", "pediatric ophthalmology": "PEDIATRIC_CENTER",
      "phaco refractive": "PHACO_CENTER", "medical retina": "MEDICAL_RETINA_CENTER",
      "vitreo retina": "VITREO_RETINA_CENTER",
    };

    type RowGroup = {
      latestTs: number; masterRow: unknown[];
      specializations: { specName: string; centerPreference: string }[];
      lor1Link: string; lor2Link: string; paymentLink: string; photoLink: string;
    };

    const emailGroups: Record<string, RowGroup> = {};

    for (const row of dataRows) {
      const email = col(row, "EMAIL").toLowerCase().replace(/\s+/g, "");
      if (!email) continue;

      const ts = typeof row[mapping["TIMESTAMP"] ?? -1] === "number" ? (row[mapping["TIMESTAMP"]!] as number) : 0;
      const rawSpec = col(row, "SPECIALIZATION");
      const canonSpec = getCanonicalSpecialtyName(rawSpec);
      const centerKey = SPEC_CENTER_KEYS[canonSpec.toLowerCase()];
      const centerPref = centerKey ? col(row, centerKey) : "";

      if (!emailGroups[email]) {
        emailGroups[email] = {
          latestTs: ts, masterRow: row,
          specializations: canonSpec ? [{ specName: canonSpec, centerPreference: centerPref }] : [],
          lor1Link: col(row, "LOR1_LINK"), lor2Link: col(row, "LOR2_LINK"),
          paymentLink: col(row, "PAYMENT_LINK"), photoLink: col(row, "PHOTO_LINK"),
        };
      } else {
        if (canonSpec) {
          const exists = emailGroups[email].specializations.some((s) => s.specName === canonSpec);
          if (!exists) emailGroups[email].specializations.push({ specName: canonSpec, centerPreference: centerPref });
        }
        if (ts > emailGroups[email].latestTs) {
          emailGroups[email].latestTs = ts;
          emailGroups[email].masterRow = row;
        }
        if (!emailGroups[email].lor1Link) emailGroups[email].lor1Link = col(row, "LOR1_LINK");
        if (!emailGroups[email].lor2Link) emailGroups[email].lor2Link = col(row, "LOR2_LINK");
        if (!emailGroups[email].paymentLink) emailGroups[email].paymentLink = col(row, "PAYMENT_LINK");
        if (!emailGroups[email].photoLink) emailGroups[email].photoLink = col(row, "PHOTO_LINK");
      }
    }

    let inserted = 0; let updated = 0; let skipped = 0;

    for (const [emailKey, group] of Object.entries(emailGroups)) {
      const masterRow = group.masterRow;
      const fullName = normName(col(masterRow, "FULL_NAME"));
      const email = emailKey;
      if (!fullName || !email) { skipped++; continue; }

      const primarySpec = group.specializations[0]?.specName ?? null;
      const primaryCenter = group.specializations[0]?.centerPreference ?? null;

      const dobRaw = col(masterRow, "DOB");
      const dob = excelDateToString(mapping["DOB"] != null ? masterRow[mapping["DOB"]!] : null) ?? (dobRaw || null);

      const candidateData = {
        candidateCode: `SAV-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        fullName,
        email,
        phone: col(masterRow, "PHONE") || null,
        dateOfBirth: dob,
        address: col(masterRow, "PERMANENT_ADDRESS") || null,
        qualification: col(masterRow, "DEGREE") || null,
        collegeName: col(masterRow, "MEDICAL_COLLEGE") || null,
        status: "pending",
      };

      const existing = await db.select().from(candidatesTable).where(eq(candidatesTable.email, email));

      if (existing.length > 0) {
        await db.update(candidatesTable).set({
          fullName: candidateData.fullName,
          phone: candidateData.phone ?? existing[0]!.phone,
        }).where(eq(candidatesTable.email, email));
        updated++;
      } else {
        const [newCand] = await db.insert(candidatesTable).values(candidateData as never).returning();
        if (newCand) {
          for (const { specName } of group.specializations) {
            if (!specNameToId[specName.toLowerCase()]) {
              const code = specName.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 4);
              const [ins] = await db.insert(specialitiesTable).values({
                programId: programId, name: specName, code, seats: 0,
              }).returning();
              if (ins) specNameToId[specName.toLowerCase()] = ins.id;
            }
            const specId = specNameToId[specName.toLowerCase()];
            if (specId) {
              await db.insert(candidatePreferencesTable).values({
                candidateId: newCand.id,
                specialityId: specId,
                preferenceOrder: group.specializations.findIndex((s) => s.specName === specName) + 1,
              }).onConflictDoNothing();

              // Ensure Application is created
              const existingApp = await db.select().from(applicationsTable).where(
                and(
                  eq(applicationsTable.candidateId, newCand.id),
                  eq(applicationsTable.specialityId, specId)
                )
              );
              if (existingApp.length === 0) {
                await db.insert(applicationsTable).values({
                  candidateId: newCand.id,
                  specialityId: specId,
                  status: "pending",
                });
              }
            }
          }

          const docEntries: { candidateId: number; docType: string; fileName: string; fileUrl: string | null }[] = [];
          if (group.lor1Link) docEntries.push({ candidateId: newCand.id, docType: "LOR1", fileName: "LOR1.pdf", fileUrl: group.lor1Link });
          if (group.lor2Link) docEntries.push({ candidateId: newCand.id, docType: "LOR2", fileName: "LOR2.pdf", fileUrl: group.lor2Link });
          if (group.paymentLink) docEntries.push({ candidateId: newCand.id, docType: "PAYMENT", fileName: "payment.jpg", fileUrl: group.paymentLink });
          if (group.photoLink) docEntries.push({ candidateId: newCand.id, docType: "PHOTO", fileName: "photo.jpg", fileUrl: group.photoLink });
          if (docEntries.length > 0) {
            await db.insert(documentsTable).values(docEntries as never).onConflictDoNothing();
          }
        }
        inserted++;
      }
    }

    res.json({ success: true, totalRowsInExcel: dataRows.length, uniqueCandidates: Object.keys(emailGroups).length, inserted, updated, skipped });
  } catch (err) {
    console.error("Process error:", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;

