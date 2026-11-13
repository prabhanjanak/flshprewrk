import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import PDFDocument from "pdfkit";
import { inArray } from "drizzle-orm";
import { db, uploadedFilesTable } from "@workspace/db";
import { getLogoPaths, formatDoctorName } from "./letters";
import {
  parseSpecializationString,
  formatDOBToStandard,
  formatToDDMMYYYY,
  formatToLocalDateTime,
  parseSurgicalExperience,
  parseDiagnosticSkills,
} from "./utils";

export interface ApplicationPdfScoreBreakdownItem {
  panelName?: string | null;
  specialityName?: string | null;
  score?: number | null;
  isMindMatter?: boolean;
  remarks?: string | null;
}

export interface ApplicationPdfScoreData {
  mcq?: string | number | null;
  psychometric?: string | number | null;
  specialityTotal?: number | null;
  total110?: number | null;
  breakdown?: ApplicationPdfScoreBreakdownItem[];
}

export interface ApplicationPdfInput {
  sub?: any;
  form?: any;
  program?: any;
  candidate?: any;
  scores?: ApplicationPdfScoreData | null;
  includeScores?: boolean;
}

const COLORS = {
  navy: "#0b3a6e",
  slate900: "#0f172a",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748b",
  slate400: "#94a3b8",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  bgLight: "#f8fafc",
  bgHeader: "#f1f5f9",
  amber: "#b45309",
  amberLight: "#fffbeb",
  amberBorder: "#fde68a",
  emerald: "#047857",
  blue: "#0369a1",
  white: "#ffffff",
};

const PAGE_LEFT = 36;
const CONTENT_WIDTH = 540;
const PAGE_RIGHT = PAGE_LEFT + CONTENT_WIDTH; // 576
const CONTENT_BOTTOM = 742; // Safe content floor on LETTER (792pt height)

const STANDARD_FIELD_KEYS = new Set([
  "fullName", "full_name", "email", "phone", "mobile", "dateOfBirth", "date_of_birth", "dob",
  "gender", "maritalStatus", "marital_status", "spouseDetails", "spouse_details",
  "permanentAddress", "permanent_address", "mailingAddress", "mailing_address",
  "healthDeclaration", "health_declaration", "healthDetails", "health_details",
  "medicalConditions", "medical_conditions", "previousApplicationMonthYear", "previous_application_month_year",
  "specialization", "specializations", "speciality", "centerPreference", "center_preference",
  "referralSource", "referral_source", "referredByName", "referred_by_name", "mediaSource", "media_source",
  "degree", "medicalCollege", "medical_college", "collegeName", "college_name", "university",
  "pgQualifications", "pg_qualifications", "doQualification", "do_qualification", "doDetails", "do_details",
  "msMdQualification", "ms_md_qualification", "msMdDetails", "ms_md_details",
  "dnbQualification", "dnb_qualification", "dnbDetails", "dnb_details",
  "otherTraining", "other_training", "medicalCouncilNumber", "medical_council_number",
  "diagnosticSkills", "diagnostic_skills", "surgicalExperience", "surgical_experience",
  "totalSurgeries", "total_surgeries", "publications", "presentations", "otherInformation", "other_information",
  "lor1Url", "lor1_url", "lor1RefName", "lor1_ref_name", "lor1RefContact", "lor1_ref_contact", "lor1RefEmail", "lor1_ref_email",
  "lor2Url", "lor2_url", "lor2RefName", "lor2_ref_name", "lor2RefContact", "lor2_ref_contact", "lor2RefEmail", "lor2_ref_email",
  "declarationAccepted", "declaration_accepted", "paymentUrl", "payment_url", "photoUrl", "photo_url",
  "paidAmount", "paid_amount", "paymentId", "payment_id", "paymentMode", "payment_mode",
  "candidateCode", "candidate_code", "status", "saveAsDraft", "save_as_draft",
  "customAnswers", "custom_answers", "formData", "form_data", "agree", "submit", "csrfToken",
]);

function cleanDisplayValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "";
  if (Array.isArray(val)) {
    return val
      .map((v) => cleanDisplayValue(v))
      .filter((v) => v && v !== "—")
      .join(", ");
  }
  if (typeof val === "object") {
    try {
      const entries = Object.entries(val as Record<string, unknown>)
        .map(([k, v]) => `${prettifyKey(k)}: ${cleanDisplayValue(v)}`)
        .filter((s) => !s.endsWith(": "));
      return entries.join(" | ");
    } catch {
      return "";
    }
  }
  const str = String(val).replace(/\u0000/g, "").trim();
  if (!str || str === "null" || str === "undefined" || str === "[object Object]") return "";
  if (str.toLowerCase() === "true") return "Yes";
  if (str.toLowerCase() === "false") return "No";
  return str;
}

function displayOrDash(val: unknown): string {
  const c = cleanDisplayValue(val);
  return c || "—";
}

function prettifyKey(raw: string): string {
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function normalizeSpecToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isMatchingSpecialityKey(prefKey: string, appliedSpecs: string[]): boolean {
  if (appliedSpecs.length === 0) return true;
  const nk = normalizeSpecToken(prefKey);
  if (!nk) return false;
  return appliedSpecs.some((sp) => {
    const ns = normalizeSpecToken(sp);
    if (!ns) return false;
    if (ns === nk || ns.includes(nk) || nk.includes(ns)) return true;
    // Common clinical synonyms / abbreviations
    const pairs: Array<[string, string]> = [
      ["vitreo", "vr"],
      ["medicalretina", "mr"],
      ["cataract", "iol"],
      ["anterior", "cataract"],
      ["anterior", "phaco"],
      ["pediatric", "paediatric"],
      ["oculoplasty", "orbit"],
    ];
    return pairs.some(
      ([a, b]) =>
        ((ns.includes(a) || ns.includes(b)) && (nk.includes(a) || nk.includes(b)))
    );
  });
}

function formatCenterPreferences(
  rawPref: unknown,
  appliedSpecs: string[],
  customAnswers?: unknown,
  formData?: unknown,
  labelMap?: Map<string, string>
): Array<{ speciality: string; preferences: string }> {
  const rows: Array<{ speciality: string; preferences: string }> = [];
  let parsed: any = rawPref;
  if (typeof rawPref === "string") {
    const trimmed = rawPref.trim();
    if (trimmed) {
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          return [{ speciality: appliedSpecs.join(", ") || "Center Preference", preferences: trimmed }];
        }
      } else {
        return [{ speciality: appliedSpecs.join(", ") || "Center Preference", preferences: trimmed }];
      }
    } else {
      parsed = null;
    }
  }

  if (Array.isArray(parsed)) {
    const list = parsed.map((x) => cleanDisplayValue(x)).filter(Boolean);
    if (list.length > 0) {
      rows.push({ speciality: appliedSpecs.join(", ") || "Preferred Units", preferences: list.join("  →  ") });
    }
  } else if (parsed && typeof parsed === "object") {
    for (const [key, val] of Object.entries(parsed)) {
      if (!isMatchingSpecialityKey(key, appliedSpecs)) continue;
      let valStr = "";
      if (Array.isArray(val)) {
        valStr = val
          .map((item, idx) => {
            const c = cleanDisplayValue(item);
            return c ? `${idx + 1}. ${c}` : "";
          })
          .filter(Boolean)
          .join("   |   ");
      } else {
        valStr = cleanDisplayValue(val);
      }
      if (valStr) {
        rows.push({ speciality: key, preferences: valStr });
      }
    }
  }

  if (rows.length === 0) {
    const sources = [customAnswers, formData];
    for (const src of sources) {
      if (!src || typeof src !== "object" || Array.isArray(src)) continue;
      for (const [key, val] of Object.entries(src as Record<string, unknown>)) {
        if (!key.startsWith("unit_") || !val) continue;
        const specGuess = (labelMap?.get(key) || key.replace(/^unit_/, "").replace(/_/g, " "))
          .replace(/Preferred Center/i, "")
          .trim();
        if (!isMatchingSpecialityKey(specGuess, appliedSpecs)) continue;
        const valStr = Array.isArray(val)
          ? val.map((item, idx) => `${idx + 1}. ${cleanDisplayValue(item)}`).filter(Boolean).join("   |   ")
          : cleanDisplayValue(val);
        if (valStr && !rows.some((r) => normalizeSpecToken(r.speciality) === normalizeSpecToken(specGuess))) {
          rows.push({ speciality: prettifyKey(specGuess), preferences: valStr });
        }
      }
    }
  }

  return rows;
}

function cleanSpouseValue(maritalStatus: unknown, spouseDetails: unknown): string {
  const m = cleanDisplayValue(maritalStatus).toLowerCase();
  const s = cleanDisplayValue(spouseDetails);
  if (!s || s === "0" || s === "-" || s.toLowerCase() === "na" || s.toLowerCase() === "n/a" || s.toLowerCase() === "nil" || s.toLowerCase() === "none") {
    return m.includes("married") && !m.includes("unmarried") ? "Not Specified" : "N/A";
  }
  return s;
}

function extractCustomFieldLabelMap(form: any): Map<string, string> {
  const labelMap = new Map<string, string>();
  if (!form) return labelMap;

  if (Array.isArray(form.customFields)) {
    for (const f of form.customFields) {
      if (f && f.id && f.label) {
        labelMap.set(String(f.id), String(f.label));
      }
    }
  }
  if (Array.isArray(form.sectionsConfig)) {
    for (const sec of form.sectionsConfig) {
      if (Array.isArray(sec?.fields)) {
        for (const f of sec.fields) {
          const id = f?.id || f?.name || f?.key;
          const label = f?.label || f?.title;
          if (id && label) labelMap.set(String(id), String(label));
        }
      }
      if (Array.isArray(sec?.customFields)) {
        for (const f of sec.customFields) {
          if (f?.id && f?.label) labelMap.set(String(f.id), String(f.label));
        }
      }
    }
  }
  return labelMap;
}

/**
 * Resolves a candidate's passport photo from local disk, tmp uploads, Neon Postgres uploaded_files,
 * data URI, or HTTP URL, and normalizes orientation & JPEG format via sharp for reliable PDFKit embedding.
 */
export async function resolveCandidatePhotoBuffer(rawUrl: string | null | undefined): Promise<Buffer | null> {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let rawBuffer: Buffer | null = null;

  try {
    if (trimmed.startsWith("data:image/")) {
      const commaIdx = trimmed.indexOf(",");
      if (commaIdx !== -1) {
        rawBuffer = Buffer.from(trimmed.slice(commaIdx + 1), "base64");
      }
    } else if (/^https?:\/\//i.test(trimmed)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const resp = await fetch(trimmed, { signal: controller.signal });
        if (resp.ok) {
          const contentType = resp.headers.get("content-type") || "";
          if (!contentType || contentType.startsWith("image/") || contentType.includes("octet-stream")) {
            rawBuffer = Buffer.from(await resp.arrayBuffer());
          }
        }
      } finally {
        clearTimeout(timer);
      }
    } else {
      const cleaned = trimmed
        .replace(/^\/?(api\/)?storage\/files\//, "")
        .replace(/^\/?(api\/)?objects\//, "")
        .replace(/^\/?uploads\//, "")
        .replace(/^\/+/, "");

      const diskCandidates = [
        path.resolve(process.cwd(), "uploads", cleaned),
        path.resolve(process.cwd(), "artifacts/api-server/uploads", cleaned),
        path.resolve(os.tmpdir(), "uploads", cleaned),
        path.resolve(os.tmpdir(), cleaned),
      ];
      if (path.isAbsolute(trimmed) && !trimmed.startsWith("/objects") && !trimmed.startsWith("/api")) {
        diskCandidates.unshift(trimmed);
      }

      for (const fp of diskCandidates) {
        try {
          if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            rawBuffer = fs.readFileSync(fp);
            break;
          }
        } catch {
          // ignore unreadable candidate path
        }
      }

      if (!rawBuffer) {
        const baseName = path.basename(cleaned);
        const dbKeys = Array.from(
          new Set(
            [
              trimmed,
              cleaned,
              `/${cleaned}`,
              `/objects/${cleaned}`,
              `objects/${cleaned}`,
              `uploads/${cleaned}`,
              `/uploads/${cleaned}`,
              baseName,
            ].filter(Boolean)
          )
        );
        try {
          const rows = await db
            .select({ fileData: uploadedFilesTable.fileData, contentType: uploadedFilesTable.contentType })
            .from(uploadedFilesTable)
            .where(inArray(uploadedFilesTable.filePath, dbKeys))
            .limit(1);
          if (rows[0]?.fileData) {
            const ct = (rows[0].contentType || "").toLowerCase();
            if (!ct.includes("pdf")) {
              rawBuffer = Buffer.from(rows[0].fileData);
            }
          }
        } catch {
          // ignore DB error when offline/testing
        }
      }
    }

    if (!rawBuffer || rawBuffer.length < 32) return null;
    // Skip PDF files accidentally saved in photoUrl
    if (rawBuffer.subarray(0, 4).toString("utf8") === "%PDF") return null;

    try {
      const sharpMod: any = (await import("sharp")).default;
      return await sharpMod(rawBuffer, { failOn: "none" })
        .rotate()
        .resize(300, 360, { fit: "cover", position: "center" })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch {
      return rawBuffer;
    }
  } catch {
    return null;
  }
}

/**
 * Stamps US Letter page footers cleanly without triggering PDFKit blank page overflow.
 */
export function stampLetterPageFooters(
  doc: PDFKit.PDFDocument,
  footerLabel = "CONFIDENTIAL — SANKARA ACADEMY OF VISION · FELLOWSHIP ADMISSIONS DOSSIER"
): void {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  const generatedStamp = formatToLocalDateTime(new Date());

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(range.start + i);
    const page = doc.page;
    const prevBottomMargin = page.margins.bottom;
    page.margins.bottom = 0;

    try {
      const footerRuleY = page.height - 32;
      const footerTextY = page.height - 24;

      doc.save();
      doc.strokeColor(COLORS.border).lineWidth(0.6)
        .moveTo(PAGE_LEFT, footerRuleY)
        .lineTo(PAGE_RIGHT, footerRuleY)
        .stroke();

      doc.fillColor(COLORS.slate500).font("Helvetica").fontSize(7.2)
        .text(footerLabel, PAGE_LEFT, footerTextY, { width: 350, lineBreak: false });

      doc.fillColor(COLORS.slate600).font("Helvetica-Bold").fontSize(7.2)
        .text(
          `Generated ${generatedStamp}   |   Page ${i + 1} of ${totalPages} (US Letter)`,
          PAGE_LEFT,
          footerTextY,
          { width: CONTENT_WIDTH, align: "right", lineBreak: false }
        );
      doc.restore();
    } finally {
      page.margins.bottom = prevBottomMargin;
    }
  }
}

/**
 * Appends a single complete candidate application onto an existing US Letter PDFKit document.
 */
export async function appendApplicationToPdfDoc(
  doc: PDFKit.PDFDocument,
  input: ApplicationPdfInput
): Promise<void> {
  const { sub, form, program, candidate, scores, includeScores } = input;
  const fd = sub?.formData && typeof sub.formData === "object" ? sub.formData : {};

  const fullNameRaw = cleanDisplayValue(sub?.fullName || fd.fullName || candidate?.fullName) || "Applicant";
  const candidateCode = cleanDisplayValue(candidate?.candidateCode || fd.candidateCode) || (sub?.id ? `APP-${String(sub.id).padStart(4, "0")}` : "N/A");
  const statusStr = (cleanDisplayValue(sub?.status || candidate?.status) || "pending").toUpperCase();
  const submittedStr = sub?.submittedAt ? formatToDDMMYYYY(sub.submittedAt) : (candidate?.createdAt ? formatToDDMMYYYY(candidate.createdAt) : "—");
  const programStr = cleanDisplayValue(program?.name || form?.title) || "Ophthalmology Fellowship Program";
  const emailStr = cleanDisplayValue(sub?.email || fd.email || candidate?.email) || "—";
  const phoneStr = cleanDisplayValue(sub?.phone || fd.phone || candidate?.phone) || "—";

  const rawSpec = sub?.specialization ?? sub?.specializations ?? fd.specialization ?? fd.specializations ?? candidate?.specialityName ?? null;
  const appliedSpecs = Array.isArray(rawSpec)
    ? rawSpec.map((s) => cleanDisplayValue(s)).filter(Boolean)
    : parseSpecializationString(typeof rawSpec === "string" ? rawSpec : cleanDisplayValue(rawSpec) || null);
  const specSummaryStr = appliedSpecs.length > 0 ? appliedSpecs.join(", ") : cleanDisplayValue(rawSpec) || "Not Specified";

  const photoUrl = cleanDisplayValue(sub?.photoUrl || fd.photoUrl || "");
  const [photoBuffer, { sefLogo, savLogo }] = await Promise.all([
    resolveCandidatePhotoBuffer(photoUrl),
    Promise.resolve(getLogoPaths()),
  ]);

  let currY = 26;

  const drawContinuationHeader = () => {
    doc.save();
    doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(8)
      .text(`${fullNameRaw.toUpperCase()}  (${candidateCode})`, PAGE_LEFT, 22, { width: 340, lineBreak: false });
    doc.fillColor(COLORS.slate500).font("Helvetica").fontSize(7.5)
      .text("Sankara Academy of Vision · Candidate Application Dossier", PAGE_LEFT, 22, { width: CONTENT_WIDTH, align: "right", lineBreak: false });
    doc.strokeColor(COLORS.borderLight).lineWidth(0.75)
      .moveTo(PAGE_LEFT, 34).lineTo(PAGE_RIGHT, 34).stroke();
    doc.restore();
    currY = 44;
  };

  const ensureSpace = (needed: number) => {
    if (currY + needed > CONTENT_BOTTOM) {
      doc.addPage({ size: "LETTER", margins: { top: 30, bottom: 34, left: 36, right: 36 } });
      drawContinuationHeader();
    }
  };

  const drawSectionHeader = (num: string, title: string, minFollow = 44) => {
    ensureSpace(24 + minFollow);
    doc.save();
    doc.rect(PAGE_LEFT, currY, CONTENT_WIDTH, 18).fill(COLORS.bgHeader);
    doc.rect(PAGE_LEFT, currY, 3.5, 18).fill(COLORS.navy);
    doc.strokeColor(COLORS.borderLight).lineWidth(0.5)
      .moveTo(PAGE_LEFT, currY + 18).lineTo(PAGE_RIGHT, currY + 18).stroke();
    doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(8.5)
      .text(`${num}.  ${title.toUpperCase()}`, PAGE_LEFT + 10, currY + 5, { width: CONTENT_WIDTH - 16, lineBreak: false });
    doc.restore();
    currY += 23;
  };

  interface KvItem {
    label: string;
    value: string;
    fullWidth?: boolean;
  }

  const drawKvGrid = (items: KvItem[]) => {
    // Group into visual rows: either 1 fullWidth cell or 2 half-width cells side by side
    const rows: KvItem[][] = [];
    let pendingPair: KvItem[] = [];
    for (const item of items) {
      if (item.fullWidth) {
        if (pendingPair.length > 0) {
          rows.push(pendingPair);
          pendingPair = [];
        }
        rows.push([item]);
      } else {
        pendingPair.push(item);
        if (pendingPair.length === 2) {
          rows.push(pendingPair);
          pendingPair = [];
        }
      }
    }
    if (pendingPair.length > 0) rows.push(pendingPair);

    const halfWidth = (CONTENT_WIDTH - 10) / 2; // 265 each, 10pt gutter

    for (const row of rows) {
      const isFull = row.length === 1 && Boolean(row[0].fullWidth);
      const cellW = isFull ? CONTENT_WIDTH : halfWidth;

      let maxH = 0;
      const cellMetrics = row.map((cell) => {
        doc.font("Helvetica-Bold").fontSize(7);
        const labelH = doc.heightOfString(cell.label.toUpperCase(), { width: cellW - 10 });
        doc.font("Helvetica").fontSize(8.6);
        const valText = cell.value || "—";
        const valH = doc.heightOfString(valText, { width: cellW - 10, lineGap: 1.4 });
        const totalH = labelH + valH + 10;
        if (totalH > maxH) maxH = totalH;
        return { labelH, valText };
      });

      const rowH = Math.max(24, maxH);
      ensureSpace(rowH + 2);

      row.forEach((cell, idx) => {
        const cx = isFull ? PAGE_LEFT : PAGE_LEFT + idx * (halfWidth + 10);
        const metric = cellMetrics[idx];

        doc.save();
        doc.rect(cx, currY, cellW, rowH).fill(COLORS.white);
        doc.strokeColor(COLORS.borderLight).lineWidth(0.5).rect(cx, currY, cellW, rowH).stroke();
        doc.fillColor(COLORS.slate500).font("Helvetica-Bold").fontSize(6.8)
          .text(cell.label.toUpperCase(), cx + 6, currY + 4, { width: cellW - 12 });
        doc.fillColor(COLORS.slate900).font("Helvetica").fontSize(8.6)
          .text(metric.valText, cx + 6, currY + 4 + metric.labelH + 2, { width: cellW - 12, lineGap: 1.4 });
        doc.restore();
      });

      currY += rowH + 4;
    }
  };

  // ── 0. Institutional Header (SEF Left Logo + Center Title + SAV Right Logo) ──
  doc.save();
  if (sefLogo && fs.existsSync(sefLogo)) {
    doc.image(sefLogo, PAGE_LEFT, 22, { fit: [84, 42], valign: "center" });
  }
  if (savLogo && fs.existsSync(savLogo)) {
    doc.image(savLogo, PAGE_RIGHT - 44, 22, { fit: [44, 42], align: "right", valign: "center" });
  }

  doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(13.5)
    .text("SANKARA ACADEMY OF VISION", PAGE_LEFT + 88, 24, { width: CONTENT_WIDTH - 140, align: "center" });
  doc.fillColor(COLORS.slate600).font("Helvetica").fontSize(7.6)
    .text("An Educational Unit of Sankara Eye Foundation, India · Sri Kanchi Kamakoti Medical Trust", PAGE_LEFT + 88, 41, { width: CONTENT_WIDTH - 140, align: "center" });
  doc.fillColor(COLORS.amber).font("Helvetica-Bold").fontSize(8)
    .text("FELLOWSHIP CANDIDATE APPLICATION DOSSIER", PAGE_LEFT + 88, 53, { width: CONTENT_WIDTH - 140, align: "center" });

  doc.strokeColor(COLORS.navy).lineWidth(1.5).moveTo(PAGE_LEFT, 68).lineTo(PAGE_RIGHT, 68).stroke();
  doc.strokeColor(COLORS.amber).lineWidth(0.75).moveTo(PAGE_LEFT, 71).lineTo(PAGE_RIGHT, 71).stroke();
  doc.restore();

  currY = 78;

  // ── Candidate Identity Banner + Passport Photo Box ──
  const photoBoxW = 88;
  const photoBoxH = 104;
  const heroCardW = CONTENT_WIDTH - photoBoxW - 10; // 442

  doc.save();
  doc.rect(PAGE_LEFT, currY, heroCardW, photoBoxH).fill(COLORS.bgLight);
  doc.strokeColor(COLORS.border).lineWidth(0.75).rect(PAGE_LEFT, currY, heroCardW, photoBoxH).stroke();
  doc.rect(PAGE_LEFT, currY, 4, photoBoxH).fill(COLORS.navy);

  const formattedDoctorHeading = formatDoctorName(fullNameRaw) || fullNameRaw;
  doc.fillColor(COLORS.slate900).font("Helvetica-Bold").fontSize(13)
    .text(formattedDoctorHeading, PAGE_LEFT + 12, currY + 8, { width: heroCardW - 22, ellipsis: true, height: 18 });

  // Meta badges line
  doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(8)
    .text(`Code: ${candidateCode}   |   Status: ${statusStr}   |   Submitted: ${submittedStr}`, PAGE_LEFT + 12, currY + 28, { width: heroCardW - 22 });

  doc.fillColor(COLORS.slate700).font("Helvetica").fontSize(8.2)
    .text(`Program / Form: ${programStr}`, PAGE_LEFT + 12, currY + 42, { width: heroCardW - 22, ellipsis: true, height: 12 });

  doc.fillColor(COLORS.slate700).font("Helvetica").fontSize(8.2)
    .text(`Email: ${emailStr}   |   Mobile: ${phoneStr}`, PAGE_LEFT + 12, currY + 56, { width: heroCardW - 22, height: 13, ellipsis: true });

  doc.fillColor(COLORS.slate500).font("Helvetica-Bold").fontSize(7)
    .text("APPLIED SPECIALITIES:", PAGE_LEFT + 12, currY + 72, { width: heroCardW - 22 });
  doc.fillColor(COLORS.slate900).font("Helvetica-Bold").fontSize(8.3)
    .text(specSummaryStr, PAGE_LEFT + 12, currY + 82, { width: heroCardW - 22, height: 20, ellipsis: true });

  // Photo Box on Right
  const photoX = PAGE_LEFT + heroCardW + 10;
  doc.rect(photoX, currY, photoBoxW, photoBoxH).fill(COLORS.white);
  doc.strokeColor(COLORS.border).lineWidth(0.8).rect(photoX, currY, photoBoxW, photoBoxH).stroke();
  if (photoBuffer) {
    try {
      doc.image(photoBuffer, photoX + 3, currY + 3, {
        fit: [photoBoxW - 6, photoBoxH - 6],
        align: "center",
        valign: "center",
      });
    } catch {
      doc.fillColor(COLORS.slate400).font("Helvetica").fontSize(7)
        .text("PHOTO\nUNAVAILABLE", photoX + 4, currY + 42, { width: photoBoxW - 8, align: "center" });
    }
  } else {
    doc.fillColor(COLORS.slate400).font("Helvetica").fontSize(7)
      .text("PASSPORT\nPHOTO\nNOT UPLOADED", photoX + 4, currY + 36, { width: photoBoxW - 8, align: "center" });
  }
  doc.restore();

  currY += photoBoxH + 10;

  // ── SECTION 1: Applied Specializations & Preferred Study Centers ──
  const labelMap = extractCustomFieldLabelMap(form);
  drawSectionHeader("01", "Applied Specializations & Preferred Study Centers", 52);
  const centerRows = formatCenterPreferences(
    sub?.centerPreference ?? fd.centerPreference,
    appliedSpecs,
    sub?.customAnswers,
    fd,
    labelMap
  );
  const s1Items: KvItem[] = [
    { label: "Selected Fellowship Specialities", value: specSummaryStr, fullWidth: true },
  ];
  for (const cr of centerRows) {
    s1Items.push({
      label: `Center Preference — ${cr.speciality}`,
      value: cr.preferences,
      fullWidth: true,
    });
  }
  const refSrc = cleanDisplayValue(sub?.referralSource || fd.referralSource);
  const refName = cleanDisplayValue(sub?.referredByName || fd.referredByName);
  const medSrc = cleanDisplayValue(sub?.mediaSource || fd.mediaSource);
  const prevApp = cleanDisplayValue(sub?.previousApplicationMonthYear || fd.previousApplicationMonthYear);
  if (refSrc || refName || medSrc || prevApp) {
    s1Items.push(
      { label: "Referral / Awareness Source", value: [refSrc, refName ? `Referred by: ${refName}` : "", medSrc].filter(Boolean).join(" · ") || "—" },
      { label: "Previous Application Month/Year", value: prevApp || "First Time Applicant" }
    );
  }
  drawKvGrid(s1Items);
  currY += 4;

  // ── SECTION 2: Personal, Contact & Health Details ──
  drawSectionHeader("02", "Personal, Contact & Health Details", 64);
  const dobFormatted = formatDOBToStandard(sub?.dateOfBirth || fd.dateOfBirth || candidate?.dateOfBirth);
  const marital = cleanDisplayValue(sub?.maritalStatus || fd.maritalStatus);
  const spouseFormatted = cleanSpouseValue(marital, sub?.spouseDetails ?? fd.spouseDetails);
  const permAddr = cleanDisplayValue(sub?.permanentAddress || fd.permanentAddress || candidate?.address);
  const mailAddr = cleanDisplayValue(sub?.mailingAddress || fd.mailingAddress) || permAddr;
  const healthDecl = cleanDisplayValue(sub?.healthDeclaration || fd.healthDeclaration);
  const healthNotes = [cleanDisplayValue(sub?.medicalConditions || fd.medicalConditions), cleanDisplayValue(sub?.healthDetails || fd.healthDetails)]
    .filter(Boolean)
    .join(" — ");

  const s2Items: KvItem[] = [
    { label: "Full Name", value: fullNameRaw },
    { label: "Date of Birth", value: dobFormatted },
    { label: "Gender", value: displayOrDash(sub?.gender || fd.gender || candidate?.gender) },
    { label: "Marital Status", value: marital || "—" },
    { label: "Email Address", value: emailStr },
    { label: "Mobile / Contact No.", value: phoneStr },
  ];
  if (marital.toLowerCase().includes("married") && !marital.toLowerCase().includes("unmarried")) {
    s2Items.push({ label: "Spouse Details", value: spouseFormatted, fullWidth: true });
  }
  s2Items.push(
    { label: "Mailing / Communication Address", value: mailAddr || "—", fullWidth: true },
    {
      label: "Permanent Address",
      value: !permAddr ? "—" : permAddr === mailAddr ? "Same as Mailing Address" : permAddr,
      fullWidth: true,
    },
    { label: "Health Declaration", value: healthDecl || "—" },
    { label: "Known Medical Conditions / Remarks", value: healthNotes || "None Reported" }
  );
  drawKvGrid(s2Items);
  currY += 4;

  // ── SECTION 3: Academic Qualifications & Medical Council Registration ──
  drawSectionHeader("03", "Academic Qualifications & Medical Council Registration", 68);
  const pgItems: KvItem[] = [
    { label: "Qualifying UG Degree", value: displayOrDash(sub?.degree || fd.degree || candidate?.qualification) },
    { label: "MBBS Medical College", value: displayOrDash(sub?.medicalCollege || fd.medicalCollege || candidate?.collegeName) },
    { label: "Affiliated University", value: displayOrDash(sub?.university || fd.university) },
    { label: "Medical Council Registration No.", value: displayOrDash(sub?.medicalCouncilNumber || fd.medicalCouncilNumber) },
    {
      label: "MS / MD Ophthalmology",
      value: `${cleanDisplayValue(sub?.msMdQualification) || (sub?.msMdDetails ? "Yes" : "No")}${cleanDisplayValue(sub?.msMdDetails) ? ` — ${cleanDisplayValue(sub?.msMdDetails)}` : ""}`,
    },
    {
      label: "DNB / DO Qualifications",
      value: [
        (sub?.dnbQualification || sub?.dnbDetails) ? `DNB: ${cleanDisplayValue(sub?.dnbDetails) || "Yes"}` : "",
        (sub?.doQualification || sub?.doDetails) ? `DO: ${cleanDisplayValue(sub?.doDetails) || "Yes"}` : "",
      ]
        .filter(Boolean)
        .join("  |  ") || "—",
    },
  ];
  const pgQual = cleanDisplayValue(sub?.pgQualifications || fd.pgQualifications);
  if (pgQual) {
    pgItems.push({ label: "PG Qualification Summary", value: pgQual, fullWidth: true });
  }
  const otherTrain = cleanDisplayValue(sub?.otherTraining || fd.otherTraining);
  if (otherTrain) {
    pgItems.push({ label: "Other Fellowship / Clinical Training", value: otherTrain, fullWidth: true });
  }
  drawKvGrid(pgItems);
  currY += 4;

  // ── SECTION 4: Clinical & Diagnostic Proficiencies ──
  drawSectionHeader("04", "Clinical & Diagnostic Proficiencies", 48);
  const skills = parseDiagnosticSkills(sub?.diagnosticSkills ?? fd.diagnosticSkills);
  if (skills.length > 0) {
    const pairWidth = CONTENT_WIDTH / 2; // 270 each
    const skillNameW = 180;
    const skillLvlW = 84;

    ensureSpace(22);
    doc.save();
    doc.rect(PAGE_LEFT, currY, CONTENT_WIDTH, 16).fill(COLORS.navy);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7);
    doc.text("INSTRUMENT / DIAGNOSTIC SKILL", PAGE_LEFT + 6, currY + 5, { width: skillNameW - 6 });
    doc.text("PROFICIENCY", PAGE_LEFT + skillNameW, currY + 5, { width: skillLvlW - 4, align: "center" });
    doc.text("INSTRUMENT / DIAGNOSTIC SKILL", PAGE_LEFT + pairWidth + 6, currY + 5, { width: skillNameW - 6 });
    doc.text("PROFICIENCY", PAGE_LEFT + pairWidth + skillNameW, currY + 5, { width: skillLvlW - 4, align: "center" });
    doc.restore();
    currY += 16;

    for (let i = 0; i < skills.length; i += 2) {
      const leftSkill = skills[i];
      const rightSkill = skills[i + 1];

      doc.font("Helvetica").fontSize(8.2);
      const h1 = doc.heightOfString(leftSkill.name, { width: skillNameW - 8 });
      const h2 = rightSkill ? doc.heightOfString(rightSkill.name, { width: skillNameW - 8 }) : 0;
      const rowH = Math.max(18, Math.max(h1, h2) + 8);

      ensureSpace(rowH);
      const bg = (i / 2) % 2 === 0 ? COLORS.white : COLORS.bgLight;
      doc.save();
      doc.rect(PAGE_LEFT, currY, CONTENT_WIDTH, rowH).fill(bg);
      doc.strokeColor(COLORS.borderLight).lineWidth(0.5).rect(PAGE_LEFT, currY, CONTENT_WIDTH, rowH).stroke();
      doc.moveTo(PAGE_LEFT + pairWidth, currY).lineTo(PAGE_LEFT + pairWidth, currY + rowH).stroke();

      const drawSkillCell = (sk: { name: string; level: string }, baseX: number) => {
        const lvlColor =
          sk.level.toLowerCase().includes("expert")
            ? COLORS.emerald
            : sk.level.toLowerCase().includes("inter")
            ? COLORS.blue
            : COLORS.amber;
        doc.fillColor(COLORS.slate900).font("Helvetica").fontSize(8.2)
          .text(sk.name, baseX + 6, currY + 4, { width: skillNameW - 10 });
        doc.fillColor(lvlColor).font("Helvetica-Bold").fontSize(7.8)
          .text(sk.level, baseX + skillNameW, currY + 4, { width: skillLvlW - 4, align: "center" });
      };

      drawSkillCell(leftSkill, PAGE_LEFT);
      if (rightSkill) drawSkillCell(rightSkill, PAGE_LEFT + pairWidth);
      doc.restore();
      currY += rowH;
    }
    currY += 8;
  } else {
    const rawDiag = cleanDisplayValue(sub?.diagnosticSkills ?? fd.diagnosticSkills);
    const displayDiag = rawDiag && !rawDiag.startsWith("{") && !rawDiag.startsWith("[")
      ? rawDiag
      : "No diagnostic proficiencies listed";
    drawKvGrid([{ label: "Diagnostic Proficiencies", value: displayDiag, fullWidth: true }]);
    currY += 4;
  }

  // ── SECTION 5: Surgical Experience & Operative Log ──
  drawSectionHeader("05", "Surgical Experience & Operative Log", 52);
  const surgeries = parseSurgicalExperience(sub?.surgicalExperience ?? fd.surgicalExperience);
  const declaredTotal = cleanDisplayValue(sub?.totalSurgeries ?? fd.totalSurgeries);

  if (surgeries.length > 0) {
    const computedSup = surgeries.reduce((acc, s) => acc + (Number(s.supervision) || 0), 0);
    const computedInd = surgeries.reduce((acc, s) => acc + (Number(s.independent) || 0), 0);
    const computedSum = computedSup + computedInd;
    const headlineTotal = declaredTotal && Number(declaredTotal) > 0 ? declaredTotal : String(computedSum);

    ensureSpace(22);
    doc.save();
    doc.rect(PAGE_LEFT, currY, CONTENT_WIDTH, 18).fill(COLORS.amberLight);
    doc.strokeColor(COLORS.amberBorder).lineWidth(0.6).rect(PAGE_LEFT, currY, CONTENT_WIDTH, 18).stroke();
    doc.fillColor(COLORS.amber).font("Helvetica-Bold").fontSize(8.2)
      .text(`TOTAL SURGERIES PERFORMED: ${headlineTotal}   (Independent: ${computedInd}  ·  Under Supervision: ${computedSup})`, PAGE_LEFT + 8, currY + 5, { width: CONTENT_WIDTH - 16 });
    doc.restore();
    currY += 22;

    const c1 = 270;
    const c2 = 90;
    const c3 = 90;
    const c4 = 90;

    ensureSpace(20);
    doc.save();
    doc.rect(PAGE_LEFT, currY, CONTENT_WIDTH, 16).fill(COLORS.navy);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.2);
    doc.text("SURGICAL PROCEDURE / CATEGORY", PAGE_LEFT + 8, currY + 5, { width: c1 - 12 });
    doc.text("SUPERVISION", PAGE_LEFT + c1, currY + 5, { width: c2 - 8, align: "right" });
    doc.text("INDEPENDENT", PAGE_LEFT + c1 + c2, currY + 5, { width: c3 - 8, align: "right" });
    doc.text("TOTAL", PAGE_LEFT + c1 + c2 + c3, currY + 5, { width: c4 - 8, align: "right" });
    doc.restore();
    currY += 16;

    surgeries.forEach((sg, idx) => {
      const sup = Number(sg.supervision) || 0;
      const ind = Number(sg.independent) || 0;
      const tot = Number(sg.total) || (sup + ind);
      const rowH = 18;
      ensureSpace(rowH);

      doc.save();
      doc.rect(PAGE_LEFT, currY, CONTENT_WIDTH, rowH).fill(idx % 2 === 0 ? COLORS.white : COLORS.bgLight);
      doc.strokeColor(COLORS.borderLight).lineWidth(0.5).rect(PAGE_LEFT, currY, CONTENT_WIDTH, rowH).stroke();
      doc.fillColor(COLORS.slate900).font("Helvetica-Bold").fontSize(8.2)
        .text(sg.procedure, PAGE_LEFT + 8, currY + 5, { width: c1 - 12, ellipsis: true, height: 11 });
      doc.fillColor(COLORS.slate700).font("Helvetica").fontSize(8.4)
        .text(String(sup), PAGE_LEFT + c1, currY + 5, { width: c2 - 8, align: "right" })
        .text(String(ind), PAGE_LEFT + c1 + c2, currY + 5, { width: c3 - 8, align: "right" });
      doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(8.4)
        .text(String(tot), PAGE_LEFT + c1 + c2 + c3, currY + 5, { width: c4 - 8, align: "right" });
      doc.restore();
      currY += rowH;
    });

    ensureSpace(18);
    doc.save();
    doc.rect(PAGE_LEFT, currY, CONTENT_WIDTH, 18).fill(COLORS.bgHeader);
    doc.strokeColor(COLORS.border).lineWidth(0.6).rect(PAGE_LEFT, currY, CONTENT_WIDTH, 18).stroke();
    doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(8.2)
      .text("AGGREGATE TOTAL", PAGE_LEFT + 8, currY + 5, { width: c1 - 12 })
      .text(String(computedSup), PAGE_LEFT + c1, currY + 5, { width: c2 - 8, align: "right" })
      .text(String(computedInd), PAGE_LEFT + c1 + c2, currY + 5, { width: c3 - 8, align: "right" })
      .text(headlineTotal, PAGE_LEFT + c1 + c2 + c3, currY + 5, { width: c4 - 8, align: "right" });
    doc.restore();
    currY += 24;
  } else {
    drawKvGrid([
      { label: "Total Surgeries Performed", value: declaredTotal || "0", fullWidth: true },
    ]);
    currY += 4;
  }

  // ── SECTION 6: Research, Publications & Conference Presentations ──
  drawSectionHeader("06", "Research, Publications & Conference Presentations", 46);
  const s6Items: KvItem[] = [
    { label: "Journal Publications", value: displayOrDash(sub?.publications || fd.publications), fullWidth: true },
    { label: "Conference Paper / Poster Presentations", value: displayOrDash(sub?.presentations || fd.presentations), fullWidth: true },
  ];
  const otherInfo = cleanDisplayValue(sub?.otherInformation || fd.otherInformation);
  if (otherInfo) {
    s6Items.push({ label: "Other Academic Honors / Relevant Information", value: otherInfo, fullWidth: true });
  }
  drawKvGrid(s6Items);
  currY += 4;

  // ── SECTION 7: Additional Form Disclosures (Dynamic / Custom Fields) ──
  const extraItems: KvItem[] = [];
  const seenExtraKeys = new Set<string>();

  const collectExtraFromObj = (obj: any) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    for (const [key, rawVal] of Object.entries(obj)) {
      if (STANDARD_FIELD_KEYS.has(key) || seenExtraKeys.has(key) || key.startsWith("unit_")) continue;
      const valStr = cleanDisplayValue(rawVal);
      if (!valStr || valStr.startsWith("{") && valStr.length > 500) continue;
      seenExtraKeys.add(key);
      const label = labelMap.get(key) || prettifyKey(key);
      extraItems.push({ label, value: valStr, fullWidth: valStr.length > 65 });
    }
  };
  collectExtraFromObj(sub?.customAnswers);
  collectExtraFromObj(fd);

  if (extraItems.length > 0) {
    drawSectionHeader("07", "Additional Application Disclosures", 36);
    drawKvGrid(extraItems);
    currY += 4;
  }

  // ── SECTION 8: Entrance Performance & Assessment Scores (when present or requested) ──
  const mcqScore = scores?.mcq ?? candidate?.mcqScore ?? null;
  const psychScore = scores?.psychometric ?? candidate?.psychometricScore ?? null;
  const specScore = scores?.specialityTotal ?? null;
  const hasAnyScore =
    Boolean(includeScores) ||
    mcqScore != null ||
    psychScore != null ||
    specScore != null ||
    (scores?.breakdown && scores.breakdown.length > 0);

  let secNum = extraItems.length > 0 ? 8 : 7;
  const nextSecNum = () => String(secNum++).padStart(2, "0");

  if (hasAnyScore) {
    drawSectionHeader(nextSecNum(), "Entrance Performance & Interview Evaluation Summary", 54);
    const mcqNum = mcqScore != null && !isNaN(Number(mcqScore)) ? Number(mcqScore) : null;
    const psychNum = psychScore != null && !isNaN(Number(psychScore)) ? Number(psychScore) : null;
    const specNum = specScore != null && !isNaN(Number(specScore)) ? Number(specScore) : null;
    const computed110 =
      scores?.total110 != null
        ? Number(scores.total110)
        : (mcqNum ?? 0) + (psychNum ?? 0) + (specNum ?? 0);

    ensureSpace(38);
    const boxW = (CONTENT_WIDTH - 18) / 4; // 130.5 each
    const scoreBoxes = [
      { label: "MCQ ENTRANCE", val: mcqNum !== null ? `${mcqNum.toFixed(1).replace(/\.0$/, "")} / 50` : "— / 50", bg: COLORS.bgLight, fg: COLORS.slate900 },
      { label: "MIND MATTERS", val: psychNum !== null ? `${psychNum.toFixed(1).replace(/\.0$/, "")} / 10` : "— / 10", bg: COLORS.bgLight, fg: COLORS.slate900 },
      { label: "SPECIALITY VIVA", val: specNum !== null ? `${specNum.toFixed(1).replace(/\.0$/, "")} / 50` : "— / 50", bg: COLORS.bgLight, fg: COLORS.slate900 },
      { label: "AGGREGATE SCORE", val: `${computed110.toFixed(1).replace(/\.0$/, "")} / 110`, bg: COLORS.amberLight, fg: COLORS.amber },
    ];
    scoreBoxes.forEach((sb, idx) => {
      const bx = PAGE_LEFT + idx * (boxW + 6);
      doc.save();
      doc.rect(bx, currY, boxW, 34).fill(sb.bg);
      doc.strokeColor(idx === 3 ? COLORS.amberBorder : COLORS.borderLight).lineWidth(0.75).rect(bx, currY, boxW, 34).stroke();
      doc.fillColor(COLORS.slate500).font("Helvetica-Bold").fontSize(6.8)
        .text(sb.label, bx + 4, currY + 5, { width: boxW - 8, align: "center" });
      doc.fillColor(sb.fg).font("Helvetica-Bold").fontSize(11)
        .text(sb.val, bx + 4, currY + 16, { width: boxW - 8, align: "center" });
      doc.restore();
    });
    currY += 40;

    if (scores?.breakdown && scores.breakdown.length > 0) {
      for (const b of scores.breakdown) {
        drawKvGrid([
          {
            label: b.isMindMatter ? `Mind Matters Panel — ${b.panelName || "Panel"}` : `${b.specialityName || "Speciality"} Panel — ${b.panelName || "Panel"}`,
            value: `Score: ${b.score ?? "—"}${b.isMindMatter ? " / 10" : " / 50"}${b.remarks ? `   |   Remarks: ${b.remarks}` : ""}`,
            fullWidth: true,
          },
        ]);
      }
    }
    currY += 2;
  }

  // ── SECTION 9: Referees (LORs), Payment & Document Checklist ──
  drawSectionHeader(nextSecNum(), "Academic Referees (LORs), Fee Verification & Attachments", 62);
  const lor1Text = [
    cleanDisplayValue(sub?.lor1RefName || fd.lor1RefName),
    cleanDisplayValue(sub?.lor1RefContact || fd.lor1RefContact),
    cleanDisplayValue(sub?.lor1RefEmail || fd.lor1RefEmail),
  ]
    .filter(Boolean)
    .join(" · ");
  const lor2Text = [
    cleanDisplayValue(sub?.lor2RefName || fd.lor2RefName),
    cleanDisplayValue(sub?.lor2RefContact || fd.lor2RefContact),
    cleanDisplayValue(sub?.lor2RefEmail || fd.lor2RefEmail),
  ]
    .filter(Boolean)
    .join(" · ");

  const lor1Status = cleanDisplayValue(sub?.lor1Url || fd.lor1Url) ? "Letter Uploaded" : "Pending / Not Attached";
  const lor2Status = cleanDisplayValue(sub?.lor2Url || fd.lor2Url) ? "Letter Uploaded" : "Pending / Not Attached";
  const paidAmt = sub?.paidAmount != null ? `Rs. ${sub.paidAmount}` : cleanDisplayValue(sub?.paymentMode || fd.paymentMode) ? "Verified" : "—";
  const payMeta = [paidAmt, cleanDisplayValue(sub?.paymentMode || fd.paymentMode), cleanDisplayValue(sub?.paymentId || fd.paymentId) ? `Ref: ${cleanDisplayValue(sub?.paymentId || fd.paymentId)}` : ""]
    .filter(Boolean)
    .join("   |   ");

  drawKvGrid([
    { label: `Referee 1 (${lor1Status})`, value: lor1Text || "Not Provided" },
    { label: `Referee 2 (${lor2Status})`, value: lor2Text || "Not Provided" },
    { label: "Application Fee & Transaction Reference", value: payMeta || "—", fullWidth: true },
  ]);
  currY += 4;

  // ── SECTION 10: Applicant Declaration & Official Verification Sign-off ──
  ensureSpace(112); // Keeps declaration + BOTH signatures safely together on the same page
  drawSectionHeader(nextSecNum(), "Applicant Declaration & Official Verification", 78);

  const declYes = sub?.declarationAccepted === true || String(sub?.declarationAccepted).toLowerCase() === "true" || !sub;
  doc.save();
  doc.rect(PAGE_LEFT, currY, CONTENT_WIDTH, 32).fill(COLORS.bgLight);
  doc.strokeColor(COLORS.borderLight).lineWidth(0.6).rect(PAGE_LEFT, currY, CONTENT_WIDTH, 32).stroke();
  doc.fillColor(COLORS.slate700).font("Helvetica").fontSize(8)
    .text(
      `Declaration Accepted: ${declYes ? "Yes — Confirmed" : "Pending"}   |   I hereby affirm that all academic credentials, surgical logs, diagnostic proficiencies, and identity details furnished in this fellowship application are true and complete to the best of my knowledge.`,
      PAGE_LEFT + 8,
      currY + 6,
      { width: CONTENT_WIDTH - 16, lineGap: 1.5 }
    );
  doc.restore();
  currY += 40;

  // Signature block (compact dual signature bar)
  const sigBoxW = (CONTENT_WIDTH - 20) / 2;
  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(0.6)
    .rect(PAGE_LEFT, currY, sigBoxW, 42).stroke()
    .rect(PAGE_LEFT + sigBoxW + 20, currY, sigBoxW, 42).stroke();

  doc.fillColor(COLORS.slate500).font("Helvetica-Bold").fontSize(7)
    .text("APPLICANT DECLARATION & SUBMISSION VERIFICATION", PAGE_LEFT + 8, currY + 6, { width: sigBoxW - 16 })
    .text("ACADEMIC & ADMISSIONS COMMITTEE VERIFICATION", PAGE_LEFT + sigBoxW + 28, currY + 6, { width: sigBoxW - 16 });

  doc.fillColor(COLORS.slate900).font("Helvetica").fontSize(8)
    .text(`${fullNameRaw}  (${submittedStr})`, PAGE_LEFT + 8, currY + 24, { width: sigBoxW - 16, ellipsis: true });
  doc.fillColor(COLORS.slate400).font("Helvetica").fontSize(7.5)
    .text("Authorized Signatory / Institutional Seal", PAGE_LEFT + sigBoxW + 28, currY + 24, { width: sigBoxW - 16 });
  doc.restore();
  currY += 46;
}

/**
 * Generates an individual US Letter Application Dossier PDF buffer with SEF + SAV logos.
 */
export async function generateApplicationPdfBuffer(input: ApplicationPdfInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 30, bottom: 34, left: 36, right: 36 },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    appendApplicationToPdfDoc(doc, input)
      .then(() => {
        stampLetterPageFooters(doc);
        doc.end();
      })
      .catch(reject);
  });
}
