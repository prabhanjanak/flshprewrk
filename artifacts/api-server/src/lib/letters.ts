import "./afm-fonts";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export interface CallLetterData {
  candidateName: string;
  candidateCode: string;
  specialization: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  applicationId?: string | number;
  interviewDate?: string;
  reportingTime?: string;
  venue?: string;
}

export interface OfferLetterData {
  candidateName: string;
  candidateCode: string;
  specialization: string;
  unitName: string;
  cmoName?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  durationMonths?: number;
  effectiveDate?: string;
  stipendAmount?: string;
  stipendWords?: string;
  issuanceDate?: string;
  interviewDate?: string;
  inductionDate?: string;
}

export function numberToWordsIndian(num: number): string {
  if (num <= 0) return "Rupees Forty Thousand Only";
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + inWords(n % 100) : "");
    if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + inWords(n % 1000) : "");
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + inWords(n % 100000) : "");
    return inWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + inWords(n % 10000000) : "");
  }

  return `Rupees ${inWords(num).trim()} Only`;
}

export function isRetinaSpecialty(specialization: string | null | undefined): boolean {
  if (!specialization) return false;
  const lower = specialization.toLowerCase().trim();
  if (lower.includes("retina") || lower.includes("vitreo") || lower.includes("vrs")) return true;
  if (/\b(vr|mr|v\.r|m\.r)\b/i.test(specialization)) return true;
  return false;
}

export function formatPhaseDurations(specialization: string | null | undefined, rawDuration?: number | string | null): {
  phase1: string;
  phase2: string;
  phaseSummary: string;
  tenureText: string;
  totalMonths: number;
} {
  const spec = (specialization || "").toLowerCase().trim();

  if (spec.includes("cataract") || spec.includes("iol")) {
    return {
      phase1: "18 Months (Cataract & IOL)",
      phase2: "Not Applicable",
      phaseSummary: "Phase 1: 18 Months",
      tenureText: "18 Months",
      totalMonths: 18,
    };
  }
  if (spec.includes("medical retina") || (spec.includes("retina") && (spec.includes("mr") || spec.includes("medical")))) {
    return {
      phase1: "18 Months (Medical Retina)",
      phase2: "Not Applicable",
      phaseSummary: "Phase 1: 18 Months",
      tenureText: "18 Months",
      totalMonths: 18,
    };
  }
  if (spec.includes("vitreo") || spec.includes("vrs") || (spec.includes("retina") && !spec.includes("medical"))) {
    return {
      phase1: "Not Applicable",
      phase2: "24 Months (Vitreo Retina)",
      phaseSummary: "Phase 2: 24 Months",
      tenureText: "24 Months",
      totalMonths: 24,
    };
  }
  // Glaucoma, Cornea, Pediatric, Phaco Refractive, Oculoplasty, etc.
  return {
    phase1: "6 Months (IOL)",
    phase2: "18 Months (Speciality)",
    phaseSummary: "Phase 1: 6 Months (IOL) + Phase 2: 18 Months (Speciality)",
    tenureText: "24 Months",
    totalMonths: 24,
  };
}

export function cleanDoctorName(rawName: string | null | undefined): string {
  if (!rawName) return "";
  // Strip all repeated leading Dr, Dr., DR, Doctor prefixes
  return rawName.replace(/^(?:\s*(?:dr\.?|doctor)\s*)+/gi, "").trim();
}

export function formatDoctorName(rawName: string | null | undefined): string {
  const clean = cleanDoctorName(rawName);
  return clean ? `Dr. ${clean}` : "";
}

function getLogoPaths() {
  const root = process.cwd();
  const tryPaths = [
    path.join(__dirname, "assets"),
    path.join(__dirname, "../assets"),
    path.join(__dirname, "../../assets"),
    path.join(root, "api", "assets"),
    path.join(root, "assets"),
    path.join(root, "artifacts", "api-server", "assets"),
    path.join(root, "..", "fellowship-exam", "public", "assets"),
    path.join(root, "extracted_logos"),
  ];

  let sefLogo: string | null = null;
  let savLogo: string | null = null;

  for (const dir of tryPaths) {
    const sef = path.join(dir, "sankara_eye_foundation_logo.png");
    const sav = path.join(dir, "sankara_academy_vision_logo.png");
    if (!sefLogo && fs.existsSync(sef)) sefLogo = sef;
    if (!savLogo && fs.existsSync(sav)) savLogo = sav;
  }

  return { sefLogo, savLogo };
}

// ── 1. Call Letter PDF Generator (Verbatim SAV Word Document Standard, Exactly 2 Pages) ──
export async function generateCallLetterPdf(data: CallLetterData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const isRetina = isRetinaSpecialty(data.specialization);
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 28, bottom: 20, left: 42, right: 42 },
        bufferPages: true,
        autoFirstPage: false,
      });
      const buffers: Buffer[] = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      const colors = {
        navy: "#0b4a8f",
        darkNavy: "#062b54",
        dark: "#1e293b",
        slate: "#334155",
        lightSlate: "#64748b",
        border: "#cbd5e1",
        accent: "#d97706",
        tableHeader: "#e2e8f0",
      };

      const left = 40;
      const contentWidth = 515;
      const { sefLogo, savLogo } = getLogoPaths();

      const defaultInterviewDate = isRetina ? "7th December 2026, Monday" : "8th December 2026, Tuesday";
      const interviewDate = data.interviewDate || defaultInterviewDate;
      const reportingTime = data.reportingTime || "8:00 AM Sharp";
      const venue = data.venue || "Sankara Eye Hospital, Varthur Main Road, Kundalahalli Gate, Bangalore – 560037";
      const offerDayText = isRetina ? "7th December 2026" : "8th December 2026";

      const letterTitle = isRetina
        ? "FELLOWSHIP INTERVIEW CALL LETTER — VITREO RETINA (VR) & MEDICAL RETINA (MR)"
        : "FELLOWSHIP INTERVIEW CALL LETTER — ANTERIOR SEGMENT & SUBSPECIALTIES";

      const cleanName = cleanDoctorName(data.candidateName);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1: Logos, Title, Candidate Info, Institutional Intro & Phase Table
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Header Logos & Branding
      if (sefLogo && fs.existsSync(sefLogo)) {
        doc.image(sefLogo, left, 28, { width: 95 });
      }
      if (savLogo && fs.existsSync(savLogo)) {
        doc.image(savLogo, left + contentWidth - 38, 25, { width: 38 });
      }

      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(13).text("SANKARA ACADEMY OF VISION", left, 28, { width: contentWidth, align: "center" });
      doc.fillColor(colors.dark).font("Helvetica").fontSize(8).text("Educational unit of Sankara Eye Foundation, India · Sri Kanchi Kamakoti Medical Trust", left, 44, { width: contentWidth, align: "center" });
      doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(7.5).text("www.sankaraeye.com · radhika@sankaraeye.com", left, 56, { width: contentWidth, align: "center" });
      doc.strokeColor(colors.navy).lineWidth(1.2).moveTo(left, 70).lineTo(left + contentWidth, 70).stroke();

      // Call Letter Banner
      doc.rect(left, 78, contentWidth, 22).fill(colors.navy);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9.5).text(letterTitle, left, 84, { width: contentWidth, align: "center" });

      // Candidate Greeting Box
      doc.rect(left, 108, contentWidth, 38).fill("#f8fafc");
      doc.strokeColor(colors.border).lineWidth(0.6).rect(left, 108, contentWidth, 38).stroke();

      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(10.5).text(`Dear Dr. ${cleanName},`, left + 14, 115);
      doc.fillColor(colors.slate).font("Helvetica").fontSize(8.2).text(
        `Registration Code: ${data.candidateCode}   |   Subspecialty Stream: ${data.specialization || "Fellowship"}   |   Email: ${data.email}`,
        left + 14, 131
      );

      // Intro Paragraphs (SAV Original Text Verbatim)
      let curY = 154;
      doc.fillColor(colors.dark).font("Helvetica").fontSize(8.4).text(
        "Thank you for your interest in the Fellowship programme at Sankara Eye Foundation, India (www.sankaraeye.com).\n\n" +
        "Sankara Eye Foundation is a group of 13 hospitals across the country with a medical and support team of 3000, we perform over 200,000 vision restoring surgeries every year. Training at Sankara is coordinated by the Sankara Academy of Vision.\n\n" +
        "With a combination of state of the art diagnostic and surgical facilities, faculty of national eminence and a large inflow of patients, fellows would benefit from a comprehensive training in their specialty; this would enable them a confidence to practice independently. There is an emphasis during the training towards clinical research apart from the surgical training.\n\n" +
        "Training is offered across various units of Sankara and the same would be communicated to you at the interview. Candidates could also be deputed to other sister units during training to maximize surgical exposure.\n\n" +
        "Postgraduates in Ophthalmology recognized by the Medical Council of India would be eligible for applying for the same.\n\n" +
        "The organization offers an 18-month Cataract and IOL Fellowship (DO candidates for whom it would be 24 months). During this candidate can expect to perform a high volume of surgery based on their competency including techniques of small incision cataract surgery and phacoemulsification.\n\n" +
        "Subspecialty training is offered in Glaucoma, Cornea, Pediatric Ophthalmology, Phaco Refractive, Orbit and Oculoplasty. We would also offer training in Medical Retina. This comprises of 2 parts an initial exposure to cataract and thereafter a subspecialty training as detailed below.",
        left, curY, { width: contentWidth, lineGap: 2.2 }
      );

      // Table of Subspecialty Training Structure (Phase#1 & Phase#2)
      curY = doc.y + 12;
      doc.rect(left, curY, contentWidth, 18).fill(colors.tableHeader);
      doc.strokeColor(colors.border).lineWidth(0.8).rect(left, curY, contentWidth, 18).stroke();

      doc.fillColor(colors.darkNavy).font("Helvetica-Bold").fontSize(8).text("Subspecialty", left + 8, curY + 5);
      doc.fillColor(colors.darkNavy).font("Helvetica-Bold").fontSize(8).text("Phase#1 (IOL) Duration", left + 205, curY + 5);
      doc.fillColor(colors.darkNavy).font("Helvetica-Bold").fontSize(8).text("Phase#2 Speciality", left + 365, curY + 5);

      const tableRows: [string, string, string][] = [
        ["Cataract & IOL", "18 Months", "Not applicable"],
        ["Medical Retina*", "18 months", "Not applicable"],
        ["Vitreo Retina", "Not applicable", "24 months"],
        ["Glaucoma", "6 months", "18 months"],
        ["Pediatric Ophthalmology & Strabismus", "6 months", "18 months"],
        ["Cornea", "6 months", "18 months"],
        ["Phaco Refractive", "6 months", "18 months"],
        ["Oculoplasty", "6 months", "18 months"],
      ];

      curY += 18;
      tableRows.forEach(([spec, p1, p2], idx) => {
        const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        const rowH = 14;
        doc.rect(left, curY, contentWidth, rowH).fill(rowBg);
        doc.strokeColor(colors.border).lineWidth(0.3).rect(left, curY, contentWidth, rowH).stroke();

        doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(7.5).text(spec, left + 8, curY + 3.5);
        doc.fillColor(colors.slate).font("Helvetica").fontSize(7.5).text(p1, left + 205, curY + 3.5);
        doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(7.5).text(p2, left + 365, curY + 3.5);
        curY += rowH;
      });

      // Footnote below table
      curY += 5;
      doc.fillColor(colors.lightSlate).font("Helvetica-Oblique").fontSize(7.2).text(
        "*During the speciality phase too, cataract exposure would continue.\n(For DO Candidates phase 1 of the training would be 6 months longer than indicated)",
        left + 8, curY, { width: contentWidth - 16, lineGap: 1.5 }
      );

      // Page 1 Footer
      doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(7).text(
        "Page 1 of 2 · Sankara Academy of Vision Fellowship Admissions",
        left, 792, { width: contentWidth, align: "center" }
      );

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2: Selection Assessment, Schedule Box, Credentials & Key Updates
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Top Running Header Page 2
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(10).text("SANKARA ACADEMY OF VISION", left, 28);
      doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(8).text(
        `Interview Call Letter — Dr. ${cleanName} [ ${data.candidateCode} ]`,
        left, 28, { width: contentWidth, align: "right" }
      );
      doc.strokeColor(colors.border).lineWidth(0.8).moveTo(left, 42).lineTo(left + contentWidth, 42).stroke();

      // Selection Process Intro
      curY = 56;
      doc.fillColor(colors.dark).font("Helvetica").fontSize(8.6).text(
        "The selection process would comprise of an objective assessment of your theoretical knowledge and an OSCE and skills evaluation with an interview by a panel of faculty.",
        left, curY, { width: contentWidth, lineGap: 2.2 }
      );

      // Interview Schedule & Venue Card
      curY = doc.y + 14;
      doc.rect(left, curY, contentWidth, 96).fill("#f8fafc");
      doc.strokeColor(colors.navy).lineWidth(1.2).rect(left, curY, contentWidth, 96).stroke();

      doc.rect(left, curY, contentWidth, 20).fill(colors.navy);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5).text("SELECTION ASSESSMENT & INTERVIEW SCHEDULE", left + 10, curY + 6);

      let sy = curY + 28;
      doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("DATE & DAY:", left + 14, sy);
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(9.5).text(interviewDate, left + 120, sy);

      sy += 20;
      doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("REPORTING TIME:", left + 14, sy);
      doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(9.5).text(reportingTime, left + 120, sy);

      sy += 20;
      doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8).text("VENUE ADDRESS:", left + 14, sy);
      doc.fillColor(colors.dark).font("Helvetica").fontSize(8.2).text(
        "Sankara Eye Hospital, Varthur Main Road, Kundalahalli Gate, Bangalore – 560037",
        left + 120, sy, { width: 375 }
      );

      // Physical Verification & Offer Release Note
      curY += 108;
      doc.fillColor(colors.dark).font("Helvetica").fontSize(8.4).text(
        `You are requested to carry your educational credentials and a complete CV, one passport size color photograph and relevant original certificates for verification at the interview. Selected candidates will be given an offer by close of day on the ${offerDayText}, other candidates in the merit list would be in the waiting list.`,
        left, curY, { width: contentWidth, lineGap: 2.2 }
      );

      // Key Updates Box
      curY = doc.y + 16;
      doc.rect(left, curY, contentWidth, 18).fill(colors.tableHeader);
      doc.strokeColor(colors.border).lineWidth(0.8).rect(left, curY, contentWidth, 18).stroke();
      doc.fillColor(colors.darkNavy).font("Helvetica-Bold").fontSize(8.5).text("KEY UPDATES & MANDATORY REGULATIONS", left + 10, curY + 5);

      const keyUpdates = [
        "The Applicants appearing for the interviews will have to clear the results of PG(MS/MD) and DNB (Theory & Practical’s), those appearing for the PG exams and awaiting for the results shall not be eligible for the interview final selection process.",
        "Applicants who are under Government bond or Compulsory Rural Service will have to submit ‘No Objection Certificate’ during the time of examination.",
        "All the selected fellows will need to submit NOC from their State Medical Council within 3 days of accepting the Fellowship Offer, without which the joining will not be agreeable.",
        "Selected Fellows will have to undergo a 2 day induction program mandatory at Bangalore on 2nd & 3rd January 2027, a security non-refundable deposit of Rs.8850 including GST shall be collected towards this induction program.",
        "The reporting at the selected units shall be on 6th January 2027. You would be paid a stipend for the duration of the training.",
      ];

      curY += 26;
      keyUpdates.forEach((item, idx) => {
        doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8.2).text(`${idx + 1}.`, left + 6, curY);
        doc.fillColor(colors.dark).font("Helvetica").fontSize(8.2).text(item, left + 20, curY, {
          width: contentWidth - 26,
          lineGap: 2,
        });
        curY = doc.y + 7;
      });

      // Coordinator Clarifications Box
      curY += 14;
      doc.rect(left, curY, contentWidth, 32).fill("#fffbeb");
      doc.strokeColor("#f59e0b").lineWidth(0.8).rect(left, curY, contentWidth, 32).stroke();

      doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(9.5).text(
        "For clarifications contact Radhika (Course Coordinator) on 9666677505.",
        left, curY + 10, { width: contentWidth, align: "center" }
      );

      // Page 2 Footer
      doc.fillColor(colors.lightSlate).font("Helvetica-Oblique").fontSize(7).text(
        "Page 2 of 2 · Sankara Academy of Vision · Educational unit of Sankara Eye Foundation, India · Sri Kanchi Kamakoti Medical Trust",
        left, 792, { width: contentWidth, align: "center", lineBreak: false }
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ── 2. Offer Letter PDF Generator (Same-to-Same from Institutional Doc, Exactly 2 Pages) ──
export async function generateOfferLetterPdf(data: OfferLetterData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 28, bottom: 20, left: 45, right: 45 },
        bufferPages: true,
        autoFirstPage: false,
      });
      const buffers: Buffer[] = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      const colors = {
        navy: "#0b4a8f",
        darkNavy: "#062b54",
        dark: "#1e293b",
        slate: "#334155",
        lightSlate: "#64748b",
        border: "#cbd5e1",
        bullet: "#0b4a8f",
      };

      const left = 45;
      const contentWidth = 505;
      const { sefLogo, savLogo } = getLogoPaths();

      const defaultInterviewDate = isRetinaSpecialty(data.specialization) ? "7th December 2026" : "8th December 2026";
      const interviewDate = data.interviewDate || defaultInterviewDate;
      const phaseDetails = formatPhaseDurations(data.specialization, data.durationMonths);
      const effectiveDate = data.effectiveDate || "6th January 2027";
      const unit = data.unitName || "Bangalore Main Hospital";
      
      // Clean up CMO / Reporting doctor name
      let reportingDoctor = data.cmoName || "Dr. Kaushik Murali";
      reportingDoctor = reportingDoctor.replace(/ - Chief Medical Officer$/i, "").trim();

      let stipendNum = 40000;
      if (data.stipendAmount) {
        const parsed = Number(String(data.stipendAmount).replace(/[^0-9]/g, ""));
        if (parsed > 0) stipendNum = parsed;
      }
      const stipendWords = data.stipendWords || numberToWordsIndian(stipendNum).replace(/^Rupees\s+/i, "").replace(/\s+Only$/i, "");
      const issueDate = data.issuanceDate || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const cleanName = cleanDoctorName(data.candidateName);
      const durationText = `${phaseDetails.totalMonths} Months`;
      const inductionDates = data.inductionDate || "2nd & 3rd July 2026 at Bangalore Main Hospital (For Testing Only)";

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1: Header, Recipient, Subject, Intro, Table & Section A
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Top Header Logos & Branding
      if (sefLogo && fs.existsSync(sefLogo)) {
        doc.image(sefLogo, left, 26, { width: 95 });
      }
      if (savLogo && fs.existsSync(savLogo)) {
        doc.image(savLogo, left + contentWidth - 38, 24, { width: 38 });
      }

      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(13).text("SANKARA ACADEMY OF VISION", left, 26, { width: contentWidth, align: "center" });
      doc.fillColor(colors.dark).font("Helvetica").fontSize(8).text("Educational unit of Sankara Eye Foundation, India · Sri Kanchi Kamakoti Medical Trust", left, 42, { width: contentWidth, align: "center" });
      doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(7.5).text("www.sankaraeye.com · radhika@sankaraeye.com", left, 54, { width: contentWidth, align: "center" });
      doc.strokeColor(colors.navy).lineWidth(1.2).moveTo(left, 68).lineTo(left + contentWidth, 68).stroke();

      // Date Top Right
      doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(9).text(`Date: ${issueDate}`, left, 76, { width: contentWidth, align: "right" });

      // Recipient Greeting & Address
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(10).text(`Dear Dr. ${cleanName}`, left, 76);
      if (data.address) {
        doc.fillColor(colors.slate).font("Helvetica").fontSize(8.2).text(data.address.toUpperCase(), left, 90, { width: 340, lineGap: 1.5 });
      }

      // Subject
      const subY = data.address ? Math.max(118, doc.y + 4) : 100;
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(10).text("Sub: Fellowship Offer Letter", left, subY, { underline: true });

      // Opening Offer Paragraphs
      let curY = subY + 16;
      doc.fillColor(colors.dark).font("Helvetica").fontSize(8.6).text(
        `This refers to your interview dated for our Fellowship program on ${interviewDate}.\n\n` +
        `Sankara Academy of Vision, Educational unit of Sankara Eye Foundation, India is pleased to offer you fellowship in ${data.specialization} at Sankara Eye Hospital – ${unit} for a period of ${durationText} effective ${effectiveDate}. You shall report to duty on ${effectiveDate}.`,
        left, curY, { width: contentWidth, lineGap: 2.2 }
      );

      // ─────────────────────────────────────────────────────────────────
      // Table: Fellowship Appointment & Reporting Details
      // ─────────────────────────────────────────────────────────────────
      curY = doc.y + 8;
      const tableW = contentWidth;
      const headerH = 17;
      doc.rect(left, curY, tableW, headerH).fill(colors.navy);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.2).text("FELLOWSHIP APPOINTMENT & REPORTING DETAILS", left + 8, curY + 4.5);

      curY += headerH;
      const apptRows: [string, string, string?][] = [
        ["Selected Doctor", `Dr. ${cleanName}`],
        ["Allocated Subspecialty", data.specialization || "Vitreo Retina", colors.navy],
        ["Assigned Hospital Unit", `Sankara Eye Hospital – ${unit}`],
        ["Reporting Authority", `Dr. ${reportingDoctor} - Chief Medical Officer`],
        ["Tenure & Start Date", `${durationText} (Effective from ${effectiveDate})`],
        ["Monthly Stipend", `Rs ${stipendNum.toLocaleString("en-IN")}/- per month (${stipendWords} Only)`],
        ["Mandatory Induction", `${inductionDates}`],
      ];

      const col1W = 155;
      const col2W = tableW - col1W;

      apptRows.forEach(([label, val, customCol], idx) => {
        const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        const rowH = 15;
        doc.rect(left, curY, tableW, rowH).fill(rowBg);
        doc.strokeColor(colors.border).lineWidth(0.4).rect(left, curY, tableW, rowH).stroke();

        doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(7.8).text(label, left + 8, curY + 3.5, { width: col1W - 12 });
        doc.fillColor(customCol || colors.dark).font(customCol ? "Helvetica-Bold" : "Helvetica").fontSize(7.8).text(val, left + col1W, curY + 3.5, { width: col2W - 10 });
        curY += rowH;
      });

      // ─────────────────────────────────────────────────────────────────
      // Section A: Stipend, Deposit & Core Leave Rules
      // ─────────────────────────────────────────────────────────────────
      curY += 8;
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8.8).text("SECTION A: STIPEND, DEPOSIT & CORE LEAVE RULES", left, curY);

      const sectionAPoints = [
        `Induction Program: Mandatory 2-day induction program scheduled at Sankara Eye Hospital, Bangalore on ${inductionDates}.`,
        `Monthly Stipend: Stipend of Rs ${stipendNum.toLocaleString("en-IN")} (${stipendWords} Only) per month subject to statutory deductions as applicable.`,
        `Security Deposit: Entire first month stipend and 15 days of second & third months' stipend held interest-free only after the successful completion of the fellowship.`,
        `Earned Leave: You would be eligible for 1-day leave of earned for each month of your tenure apart from the declared holidays.`,
        `Compliance: Strict adherence to the policies and code of conduct of Sankara Eye Foundation, India.`,
      ];

      curY = doc.y + 4;
      sectionAPoints.forEach((pt, idx) => {
        doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8).text(`${idx + 1}.`, left + 4, curY);
        doc.fillColor(colors.dark).font("Helvetica").fontSize(8).text(pt, left + 18, curY, {
          width: contentWidth - 18,
          lineGap: 1.8,
        });
        curY = doc.y + 4;
      });

      // Page 1 Footer
      doc.strokeColor(colors.border).lineWidth(0.8).moveTo(left, 785).lineTo(left + contentWidth, 785).stroke();
      doc.fillColor(colors.lightSlate).font("Helvetica-Oblique").fontSize(7.5).text(
        "Page 1 of 2 · Sankara Academy of Vision · Educational unit of Sankara Eye Foundation, India",
        left, 792, { width: contentWidth, align: "center", lineBreak: false }
      );

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2: Section B, Institutional Compliance & Signatory
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Top Running Header Page 2
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(10).text("SANKARA ACADEMY OF VISION", left, 26);
      doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(8).text(
        `Fellowship Offer Letter — Dr. ${cleanName} [ ${data.candidateCode} ]`,
        left, 26, { width: contentWidth, align: "right" }
      );
      doc.strokeColor(colors.border).lineWidth(0.8).moveTo(left, 39).lineTo(left + contentWidth, 39).stroke();

      // Section B
      curY = 46;
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8.8).text("SECTION B: HOSPITAL REGULATIONS & MANDATORY DOCUMENTS", left, curY);

      const sectionBPoints = [
        `Reporting CMO: Report to Dr. ${reportingDoctor} - Chief Medical Officer at Sankara Eye Hospital – ${unit}.`,
        `Deputation: Possible deputation to other units of Sankara hospitals during your fellowship tenure to maximize surgical volume.`,
        `SAV Uniform Policy: Mandatory wearing of institute-issued apron or scrubs while on duty across all clinical and surgical suites.`,
        `Mandatory Documents: On the date of joining you are requested to bring 3 passport-size color photographs along with Originals and photocopies of: 1. MBBS Degree Certificate, 2. DOMS/MS/DNB Certificate, 3. State Medical Council Registration Certificate, 4. Medical Fitness Certificate, 5. PAN card, Residential Proof & Age Proof.`,
        `Acceptance Validation: Validate acceptance within 3 days on receipt of this letter by sending an email to radhika@sankaraeye.com. Receiving no response will invalidate this offer granted to you.`,
      ];

      curY = doc.y + 4;
      sectionBPoints.forEach((pt, idx) => {
        doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8).text(`${idx + 6}.`, left + 4, curY);
        doc.fillColor(colors.dark).font("Helvetica").fontSize(8).text(pt, left + 18, curY, {
          width: contentWidth - 18,
          lineGap: 1.8,
        });
        curY = doc.y + 4;
      });

      // Additional Compliance Clauses
      const complianceClauses = [
        "Your joining shall be subject to the clearance of your PG result where applicable or submission of relieving order from your previous employment.",
        "Please be informed that due diligence shall be initiated in the first six months of your reporting. In this process of verification, if there are confirmed unfavorable reports of your academic credentials, past experience, banking transactions or social standing, your services shall be discontinued with immediate effect.",
        "Sankara Eye Foundation, India follows an equal opportunity policy and a policy of zero tolerance to any form of harassment. Please update yourself on the grievance redressal policy as part of your induction.",
        "Your Fellowship with Sankara Academy of Vision can be discontinued if found non-conforming to the rules of the organization or on disciplinary grounds or your action is shown to have maligned the reputation of the organization.",
      ];

      curY = doc.y + 6;
      complianceClauses.forEach((clause) => {
        doc.fillColor(colors.dark).font("Helvetica").fontSize(8).text(clause, left, curY, {
          width: contentWidth,
          lineGap: 2,
        });
        curY = doc.y + 4.5;
      });

      curY = doc.y + 6;
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8.8).text(
        "Our journey together will certainly be inspiring, challenging, rewarding and satisfying.",
        left, curY, { width: contentWidth }
      );

      curY = doc.y + 8;
      doc.fillColor(colors.dark).font("Helvetica").fontSize(8.8).text("Wishing you the very best,", left, curY);

      curY = doc.y + 16;
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(10.5).text("Dr. Kaushik Murali", left, curY);
      curY = doc.y + 2;
      doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(8.2).text(
        "President\nMedical Administration, Quality & Education\nSankara Eye Foundation, India",
        left, curY, { lineGap: 1.5 }
      );

      // Page 2 Footer
      doc.strokeColor(colors.border).lineWidth(0.8).moveTo(left, 785).lineTo(left + contentWidth, 785).stroke();
      doc.fillColor(colors.lightSlate).font("Helvetica-Oblique").fontSize(7.5).text(
        "Page 2 of 2 · Sankara Academy of Vision · Educational unit of Sankara Eye Foundation, India",
        left, 792, { width: contentWidth, align: "center", lineBreak: false }
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ── 3. Official Student List / Candidate Directory PDF Generator (Landscape) ──
export interface StudentDirectoryItem {
  slNo: number;
  candidateCode: string;
  candidateName: string;
  email: string;
  phone?: string | null;
  qualification?: string | null;
  college?: string | null;
  specialization?: string | null;
  status: string;
  unitName?: string | null;
  submittedAt?: string | null;
}

export interface StudentDirectoryPdfData {
  programName?: string;
  academicSession?: string;
  generationDate?: string;
  candidates: StudentDirectoryItem[];
}

export async function generateStudentDirectoryPdf(data: StudentDirectoryPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 25,
        size: "A4",
        layout: "landscape",
        bufferPages: true,
        autoFirstPage: false,
      });
      const buffers: Buffer[] = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      const colors = {
        navy: "#0b4a8f",
        darkNavy: "#062b54",
        dark: "#1e293b",
        slate: "#334155",
        lightSlate: "#64748b",
        border: "#cbd5e1",
        cardBg: "#f8fafc",
        accent: "#d97706",
        green: "#166534",
        greenBg: "#dcfce7",
        amber: "#92400e",
        amberBg: "#fef3c7",
        blueBg: "#e0f2fe",
      };

      const left = 25;
      const contentWidth = 792; // 842 - 50
      const { sefLogo, savLogo } = getLogoPaths();
      const session = data.academicSession || "December 2026";
      const programName = data.programName || "Central Fellowship Program";
      const genDate = data.generationDate || new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

      const colWidths = {
        sl: 30,
        code: 80,
        name: 145,
        contact: 135,
        qualification: 120,
        stream: 130,
        status: 75,
        unit: 77,
      };

      const renderHeader = (isFirstPage: boolean) => {
        doc.addPage();
        let curY = 20;

        if (isFirstPage) {
          if (sefLogo && fs.existsSync(sefLogo)) {
            doc.image(sefLogo, left, curY, { width: 95 });
          }
          if (savLogo && fs.existsSync(savLogo)) {
            doc.image(savLogo, left + contentWidth - 45, curY - 2, { width: 45 });
          }

          doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(13).text("SANKARA ACADEMY OF VISION", left, curY, { width: contentWidth, align: "center" });
          doc.fillColor(colors.dark).font("Helvetica").fontSize(7.5).text("Educational unit of Sankara Eye Foundation, India · Sri Kanchi Kamakoti Medical Trust", left, curY + 16, { width: contentWidth, align: "center" });
          doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(8.5).text(`FELLOWSHIP CANDIDATE DIRECTORY & ADMISSIONS ROSTER — ${session.toUpperCase()}`, left, curY + 27, { width: contentWidth, align: "center" });
          doc.strokeColor(colors.navy).lineWidth(1).moveTo(left, curY + 39).lineTo(left + contentWidth, curY + 39).stroke();

          // Sub banner
          doc.rect(left, curY + 43, contentWidth, 20).fill("#f1f5f9");
          doc.strokeColor(colors.border).lineWidth(0.5).rect(left, curY + 43, contentWidth, 20).stroke();
          doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(8).text(
            `Program: ${programName}   |   Session: ${session}   |   Total Candidates: ${data.candidates.length}`,
            left + 12, curY + 49
          );
          doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(7.5).text(
            `Generated On: ${genDate} · Sankara Academy of Vision`,
            left + 450, curY + 49, { width: 330, align: "right" }
          );

          curY += 67;
        } else {
          doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8.5).text(`SANKARA ACADEMY OF VISION — CANDIDATE DIRECTORY (${session})`, left, curY);
          doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(7.5).text(`Total Candidates: ${data.candidates.length}`, left + contentWidth - 150, curY, { width: 150, align: "right" });
          doc.strokeColor(colors.border).lineWidth(0.5).moveTo(left, curY + 13).lineTo(left + contentWidth, curY + 13).stroke();
          curY += 18;
        }

        // Table Header
        doc.rect(left, curY, contentWidth, 19).fill(colors.navy);
        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5);

        let colX = left;
        doc.text("#", colX + 2, curY + 5.5, { width: colWidths.sl, align: "center" });
        colX += colWidths.sl;
        doc.text("REG CODE", colX + 6, curY + 5.5, { width: colWidths.code });
        colX += colWidths.code;
        doc.text("CANDIDATE NAME", colX + 6, curY + 5.5, { width: colWidths.name });
        colX += colWidths.name;
        doc.text("CONTACT DETAILS", colX + 6, curY + 5.5, { width: colWidths.contact });
        colX += colWidths.contact;
        doc.text("QUALIFICATION", colX + 6, curY + 5.5, { width: colWidths.qualification });
        colX += colWidths.qualification;
        doc.text("SPECIALIZATION", colX + 6, curY + 5.5, { width: colWidths.stream });
        colX += colWidths.stream;
        doc.text("STATUS", colX + 6, curY + 5.5, { width: colWidths.status, align: "center" });
        colX += colWidths.status;
        doc.text("ALLOCATED UNIT", colX + 6, curY + 5.5, { width: colWidths.unit });

        return curY + 19;
      };

      let curY = renderHeader(true);
      const bottomLimit = 548;

      data.candidates.forEach((c, idx) => {
        const rowHeight = 25;
        if (curY + rowHeight > bottomLimit) {
          curY = renderHeader(false);
        }

        const isEven = idx % 2 === 0;
        doc.rect(left, curY, contentWidth, rowHeight).fill(isEven ? "#ffffff" : "#f8fafc");
        doc.strokeColor(colors.border).lineWidth(0.3).rect(left, curY, contentWidth, rowHeight).stroke();

        let colX = left;
        // Sl No
        doc.fillColor(colors.lightSlate).font("Helvetica-Bold").fontSize(7.5).text(String(c.slNo || idx + 1), colX, curY + 7.5, { width: colWidths.sl, align: "center" });
        colX += colWidths.sl;

        // Reg Code
        doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(8).text(c.candidateCode || "—", colX + 6, curY + 7.5, { width: colWidths.code - 8 });
        colX += colWidths.code;

        // Candidate Name
        const docName = cleanDoctorName(c.candidateName);
        doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(8).text(`Dr. ${docName}`, colX + 6, curY + 4, { width: colWidths.name - 8, lineBreak: false });
        if (c.submittedAt) {
          const dtStr = new Date(c.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
          doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(6.5).text(`Applied: ${dtStr}`, colX + 6, curY + 14.5, { width: colWidths.name - 8 });
        }
        colX += colWidths.name;

        // Contact Info
        doc.fillColor(colors.slate).font("Helvetica").fontSize(7).text(c.email || "—", colX + 6, curY + 4, { width: colWidths.contact - 8, lineBreak: false });
        if (c.phone) {
          doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(6.8).text(`Ph: ${c.phone}`, colX + 6, curY + 14, { width: colWidths.contact - 8 });
        }
        colX += colWidths.contact;

        // Qualification & College
        const qualText = [c.qualification, c.college].filter(Boolean).join(" · ") || "MBBS / MS / DNB";
        doc.fillColor(colors.dark).font("Helvetica").fontSize(7.2).text(qualText, colX + 6, curY + 5, { width: colWidths.qualification - 8, height: 17, ellipsis: true });
        colX += colWidths.qualification;

        // Specialization
        const specText = c.specialization || "Ophthalmology Fellowship";
        doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(7.2).text(specText, colX + 6, curY + 5, { width: colWidths.stream - 8, height: 17, ellipsis: true });
        colX += colWidths.stream;

        // Status Badge
        const stLower = (c.status || "pending").toLowerCase();
        let stLabel = "Pending";
        let stBg = colors.amberBg;
        let stColor = colors.amber;
        if (stLower === "approved" || stLower === "verified" || stLower === "scheduled") {
          stLabel = "Approved";
          stBg = colors.greenBg;
          stColor = colors.green;
        } else if (stLower === "allocated" || stLower === "completed") {
          stLabel = "Allocated";
          stBg = colors.blueBg;
          stColor = colors.navy;
        } else if (stLower === "rejected") {
          stLabel = "Rejected";
          stBg = "#fee2e2";
          stColor = "#991b1b";
        }
        doc.rect(colX + 5, curY + 5.5, colWidths.status - 10, 14).fill(stBg);
        doc.fillColor(stColor).font("Helvetica-Bold").fontSize(6.5).text(stLabel, colX + 5, curY + 9, { width: colWidths.status - 10, align: "center" });
        colX += colWidths.status;

        // Unit
        doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(7.5).text(c.unitName || "—", colX + 6, curY + 7.5, { width: colWidths.unit - 8 });

        curY += rowHeight;
      });

      // Footers across all pages
      const pages = doc.bufferedPageRange();
      const pageCount = pages.count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.strokeColor(colors.border).lineWidth(0.5).moveTo(left, 568).lineTo(left + contentWidth, 568).stroke();
        doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(7).text(
          `Sankara Academy of Vision · Official Admissions Roster · December 2026 Session · Generated on ${genDate}`,
          left, 574, { width: 550 }
        );
        doc.text(`Page ${i + 1} of ${pageCount}`, left + contentWidth - 100, 574, { width: 100, align: "right" });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

