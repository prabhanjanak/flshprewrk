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
  const lower = specialization.toLowerCase();
  return lower.includes("retina") || lower.includes("vrs") || lower.includes("vitreo");
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

// ── 1. Call Letter PDF Generator ──────────────────────────────────────────────
export async function generateCallLetterPdf(data: CallLetterData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const isRetina = isRetinaSpecialty(data.specialization);
      const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
      const buffers: Buffer[] = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      const colors = {
        navy: "#0b4a8f",
        dark: "#1e293b",
        slate: "#475569",
        lightSlate: "#64748b",
        border: "#cbd5e1",
        accent: "#d97706",
      };

      const left = 40;
      const contentWidth = 515;
      const { sefLogo, savLogo } = getLogoPaths();

      // Header Logos & Title
      if (sefLogo && fs.existsSync(sefLogo)) {
        doc.image(sefLogo, left, 34, { width: 90 });
      }
      if (savLogo && fs.existsSync(savLogo)) {
        doc.image(savLogo, left + contentWidth - 36, 30, { width: 36 });
      }

      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(13).text("SANKARA ACADEMY OF VISION", left, 32, { width: contentWidth, align: "center" });
      doc.fillColor(colors.dark).font("Helvetica").fontSize(7.5).text("Educational unit of Sankara Eye Foundation, India · Sri Kanchi Kamakoti Medical Trust", left, 47, { width: contentWidth, align: "center" });
      doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(8).text("CENTRAL FELLOWSHIP ADMISSIONS & SELECTION BOARD 2026", left, 58, { width: contentWidth, align: "center" });
      doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(7).text("www.sankaraeye.com · admissions@sankaraeye.com", left, 69, { width: contentWidth, align: "center" });

      doc.strokeColor(colors.navy).lineWidth(1).moveTo(left, 82).lineTo(left + contentWidth, 82).stroke();

      const defaultInterviewDate = isRetina ? "1st June 2026, Monday" : "8th June 2026, Monday";
      const interviewDate = data.interviewDate || defaultInterviewDate;
      const reportingTime = data.reportingTime || "8:00 AM Sharp";
      const venue = data.venue || "Sankara Eye Hospital, Varthur Main Road, Kundalahalli Gate, Bangalore – 560037";

      const letterTitle = isRetina
        ? "FELLOWSHIP INTERVIEW CALL LETTER — RETINA & VITREO RETINAL SURGERY"
        : "FELLOWSHIP INTERVIEW CALL LETTER — ANTERIOR SEGMENT & SUBSPECIALTIES";

      doc.rect(left, 90, contentWidth, 20).fill(colors.navy);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9).text(letterTitle, left, 95, { width: contentWidth, align: "center" });

      // Candidate Greeting Box
      doc.rect(left, 116, contentWidth, 42).fill("#f8fafc");
      doc.strokeColor(colors.border).lineWidth(0.5).rect(left, 116, contentWidth, 42).stroke();

      const cleanName = (data.candidateName || "").replace(/^Dr\.?\s*/i, "");
      doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(10).text(`Dear Dr. ${cleanName}`, left + 14, 124);
      doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(8).text(
        `Registration Code: ${data.candidateCode}  |  Stream: ${data.specialization || "Fellowship"}  |  Email: ${data.email}`,
        left + 14, 140
      );

      // Intro
      let y = 166;
      doc.fillColor(colors.dark).font("Helvetica").fontSize(8).text(
        "Thank you for your interest in the Fellowship programme at Sankara Eye Foundation, India (www.sankaraeye.com). Sankara Eye Foundation is a group of 13 hospitals across India with over 3,000 medical professionals performing 200,000+ vision-restoring surgeries annually. Training is coordinated by the Sankara Academy of Vision with state-of-the-art diagnostic and surgical facilities, recognized faculty of national eminence, and extensive surgical exposure.",
        left, y, { width: contentWidth, lineGap: 2 }
      );

      // Table of phases
      y = 216;
      doc.rect(left, y, contentWidth, 16).fill("#e2e8f0");
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(7.5).text("SUBSPECIALTY TRAINING DURATION & STRUCTURE", left + 8, y + 4.5);

      const tableRows = [
        ["Cataract & IOL", "18 Months", "Not Applicable"],
        ["Medical Retina*", "18 Months", "Not Applicable"],
        ["Vitreo Retina", "Not Applicable", "24 Months"],
        ["Glaucoma", "6 Months (IOL Phase)", "18 Months (Subspecialty)"],
        ["Pediatric Ophthalmology & Strabismus", "6 Months (IOL Phase)", "18 Months (Subspecialty)"],
        ["Cornea & External Eye Diseases", "6 Months (IOL Phase)", "18 Months (Subspecialty)"],
        ["Phaco Refractive / Oculoplasty", "6 Months (IOL Phase)", "18 Months (Subspecialty)"],
      ];

      y += 16;
      tableRows.forEach(([spec, p1, p2], idx) => {
        const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(left, y, contentWidth, 14).fill(rowBg);
        doc.strokeColor(colors.border).lineWidth(0.3).rect(left, y, contentWidth, 14).stroke();
        doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(7.2).text(spec, left + 8, y + 3.5);
        doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(7.2).text(p1, left + 210, y + 3.5);
        doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(7.2).text(p2, left + 360, y + 3.5);
        y += 14;
      });

      // Schedule Box
      y += 8;
      doc.rect(left, y, contentWidth, 68).fill("#f8fafc");
      doc.strokeColor(colors.navy).lineWidth(1.2).rect(left, y, contentWidth, 68).stroke();
      doc.rect(left, y, contentWidth, 16).fill(colors.navy);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8).text("SELECTION ASSESSMENT & INTERVIEW SCHEDULE", left + 8, y + 4.5);

      doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(7.5).text("DATE & DAY:", left + 14, y + 24);
      doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(9).text(interviewDate, left + 105, y + 24);

      doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(7.5).text("REPORTING TIME:", left + 300, y + 24);
      doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(9).text(reportingTime, left + 395, y + 24);

      doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(7.5).text("VENUE ADDRESS:", left + 14, y + 42);
      doc.fillColor(colors.dark).font("Helvetica").fontSize(8).text(venue, left + 105, y + 42, { width: 395 });

      // Mandatory Regulations Box
      y += 76;
      doc.rect(left, y, contentWidth, 136).fill("#ffffff");
      doc.strokeColor(colors.border).lineWidth(0.5).rect(left, y, contentWidth, 136).stroke();
      doc.rect(left, y, contentWidth, 15).fill("#e2e8f0");
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(7.5).text("MANDATORY REGULATIONS & KEY UPDATES", left + 8, y + 4);

      const updates = [
        "1. Degree Eligibility: Candidates appearing must have cleared PG (MS/MD) and DNB (Theory & Practicals). Result-awaited candidates are not eligible for final selection.",
        "2. Government Bond / Rural Service: Applicants under government bond must submit a 'No Objection Certificate (NOC)' at the time of examination.",
        "3. State Medical Council NOC: Selected fellows must submit NOC from their State Medical Council within 3 days of accepting the Fellowship Offer.",
        "4. Induction Program: Selected Fellows must undergo a mandatory 2-day induction program in Bangalore on 2nd & 3rd July 2026. A non-refundable security deposit of Rs. 8,850 (incl. GST) will be collected towards this program.",
        "5. Unit Reporting: Reporting at selected units will be on 6th July 2026. A monthly stipend is paid for the entire duration.",
        "6. Required Documents: Carry educational credentials, complete CV, 1 passport color photo, and all original certificates for physical verification.",
      ];

      let uy = y + 20;
      updates.forEach((u) => {
        doc.fillColor(colors.dark).font("Helvetica").fontSize(7.2).text(u, left + 8, uy, { width: contentWidth - 16, lineGap: 1.5 });
        uy += 18;
      });

      // Footer
      y += 144;
      doc.fillColor(colors.accent).font("Helvetica-Bold").fontSize(7.5).text("For clarifications, please contact: Radhika (Admissions Coordinator) on 9666677505", left, y, { width: contentWidth, align: "center" });

      doc.fillColor(colors.lightSlate).font("Helvetica-Oblique").fontSize(6.5).text(
        "Sankara Academy of Vision · Sankara Eye Care Institutions, India · Official Call Letter",
        left, 780, { width: contentWidth, align: "center" }
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ── 2. Offer Letter PDF Generator (Structured Tables, Large Fonts, Exactly 2 Pages) ──
export async function generateOfferLetterPdf(data: OfferLetterData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: "A4",
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
        tableHeader: "#e2e8f0",
        accent: "#d97706",
      };

      const left = 40;
      const contentWidth = 515;
      const { sefLogo, savLogo } = getLogoPaths();

      const defaultInterviewDate = isRetinaSpecialty(data.specialization) ? "1st June 2026" : "8th June 2026";
      const interviewDate = data.interviewDate || defaultInterviewDate;
      const duration = data.durationMonths || (isRetinaSpecialty(data.specialization) ? 24 : 18);
      const effectiveDate = data.effectiveDate || "6th July 2026";
      const unit = data.unitName || "Jaipur";
      const cmo = data.cmoName || "Dr. Neeraj Shah - Chief Medical Officer";

      let stipendNum = 40000;
      if (data.stipendAmount) {
        const parsed = Number(String(data.stipendAmount).replace(/[^0-9]/g, ""));
        if (parsed > 0) stipendNum = parsed;
      }
      const stipendWords = data.stipendWords || numberToWordsIndian(stipendNum);
      const issueDate = data.issuanceDate || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const cleanName = cleanDoctorName(data.candidateName);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1: Header, Recipient, Subject, Structured Table & Core Terms
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Top Header Logos & Branding
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

      // Date Top Right
      doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(9.5).text(`Date: ${issueDate}`, left, 78, { width: contentWidth, align: "right" });

      // Recipient Greeting & Address
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(11).text(`Dear Dr. ${cleanName},`, left, 78);
      if (data.address) {
        doc.fillColor(colors.slate).font("Helvetica").fontSize(8.5).text(data.address.toUpperCase(), left, 92, { width: 340, lineGap: 1.5 });
      }

      // Subject Banner Box
      const subY = data.address ? Math.max(122, doc.y + 6) : 110;
      doc.rect(left, subY, contentWidth, 20).fill(colors.navy);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10).text("OFFICIAL FELLOWSHIP OFFER & APPOINTMENT LETTER", left, subY + 5.5, { width: contentWidth, align: "center" });

      // Opening Offer Paragraph
      let curY = subY + 28;
      doc.fillColor(colors.dark).font("Helvetica").fontSize(9.2).text(
        `This refers to your interview dated for our Central Fellowship Program on ${interviewDate}.\n\n` +
        `Sankara Academy of Vision, Educational unit of Sankara Eye Foundation, India is pleased to offer you fellowship in ${data.specialization} at Sankara Eye Hospital – ${unit} for a period of ${duration} Months effective ${effectiveDate}. You shall report to duty on ${effectiveDate}.`,
        left, curY, { width: contentWidth, lineGap: 2.5 }
      );

      // ── STRUCTURED KEY OFFER & REPORTING DETAILS TABLE ──
      curY = doc.y + 10;
      doc.rect(left, curY, contentWidth, 18).fill(colors.tableHeader);
      doc.strokeColor(colors.border).lineWidth(0.8).rect(left, curY, contentWidth, 18).stroke();
      doc.fillColor(colors.darkNavy).font("Helvetica-Bold").fontSize(8.5).text("FELLOWSHIP APPOINTMENT & REPORTING DETAILS", left + 10, curY + 5);

      const tableItems: [string, string][] = [
        ["Selected Doctor", `Dr. ${cleanName} (Reg Code: ${data.candidateCode})`],
        ["Subspecialty Stream", data.specialization],
        ["Assigned Hospital Unit", `Sankara Eye Hospital – ${unit}`],
        ["Reporting Authority", cmo],
        ["Fellowship Tenure", `${duration} Months (Effective from ${effectiveDate})`],
        ["Monthly Stipend", `Rs ${stipendNum.toLocaleString("en-IN")}/- (${stipendWords})`],
        ["Mandatory Induction", `2nd & 3rd July 2026 at Sankara Eye Hospital, Bangalore`],
        ["Duty Commencement Date", `${effectiveDate} (Bangalore / Allocated Unit)`],
      ];

      curY += 18;
      tableItems.forEach(([label, val], idx) => {
        const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        const rowH = 16.5;
        doc.rect(left, curY, contentWidth, rowH).fill(rowBg);
        doc.strokeColor(colors.border).lineWidth(0.4).rect(left, curY, contentWidth, rowH).stroke();

        // Key column (165 pt)
        doc.fillColor(colors.slate).font("Helvetica-Bold").fontSize(8.2).text(label, left + 8, curY + 4.5, { width: 155 });
        // Value column (340 pt)
        doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(8.5).text(val, left + 170, curY + 4.5, { width: 335 });
        curY += rowH;
      });

      // Section A: Terms & Stipend Conditions (Points on Page 1)
      curY += 10;
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(9.5).text("SECTION A: STIPEND, DEPOSIT & CORE LEAVE RULES", left, curY);
      doc.strokeColor(colors.navy).lineWidth(0.8).moveTo(left, curY + 13).lineTo(left + 260, curY + 13).stroke();

      const page1Points = [
        `1. Induction Program: You shall be attending mandate two-day induction program scheduled at Sankara Eye Hospital, Bangalore on 2nd & 3rd July 2026.`,
        `2. Monthly Stipend: You shall be paid a stipend of Rs ${stipendNum.toLocaleString("en-IN")} (${stipendWords}) per month subject to income tax and other statutory deductions as applicable.`,
        `3. Security Deposit: Your entire first month stipend and 15 days of second & third months' stipend would be held as a deposit which would be paid back interest free only after the successful completion of the fellowship. This would be forfeited if you discontinue the fellowship or if the fellowship is terminated due to disciplinary issues.`,
        `4. Earned Leave: You would be eligible for 1-day leave earned for each month of your tenure apart from declared holidays.`,
        `5. Appointment & Compliance: Your Fellowship Appointment letter together with terms and conditions shall be handed to you on your date of joining. You will adhere to the policies of Sankara Eye Foundation, India.`,
      ];

      curY += 20;
      page1Points.forEach((pt) => {
        doc.fillColor(colors.dark).font("Helvetica").fontSize(8.3).text(pt, left, curY, {
          width: contentWidth,
          lineGap: 2,
        });
        curY = doc.y + 4.5;
      });

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2: Code of Conduct, Mandatory Documents, Due Diligence & Signatory
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Top Running Header Page 2
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(10).text("SANKARA ACADEMY OF VISION", left, 28);
      doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(8).text(
        `Fellowship Offer Letter — Dr. ${cleanName} [ ${data.candidateCode} ]`,
        left, 28, { width: contentWidth, align: "right" }
      );
      doc.strokeColor(colors.border).lineWidth(0.8).moveTo(left, 42).lineTo(left + contentWidth, 42).stroke();

      // Section B: Hospital Regulations & Training Guidelines
      curY = 52;
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(9.5).text("SECTION B: HOSPITAL REGULATIONS, DEPUTATION & CONDUCT", left, curY);
      doc.strokeColor(colors.navy).lineWidth(0.8).moveTo(left, curY + 13).lineTo(left + 300, curY + 13).stroke();

      const page2PointsSectionB = [
        `6. Reporting CMO: You shall report to ${cmo} at Sankara Eye Hospital – ${unit}.`,
        `7. Inter-Unit Deputation: You may be deputed to other units of Sankara hospitals (for a period of not more than 3 months at a time) during your fellowship tenure to maximize clinical and surgical exposure.`,
        `8. Course Extension Policy: Extension of Fellowship Course is not possible. In rare cases Dean-SAV may approve an extension duration not beyond 3 months, which shall be a non-stipendable period.`,
        `9. Training Cost Reimbursement: If the fellowship is discontinued prematurely by you or due to disciplinary actions, you will be required to reimburse training and accommodation expenses incurred by Sankara Academy of Vision.`,
        `10. External Examinations (ICO/FICO): Written permission must be obtained in advance from the Unit CMO and Dean SAV before appearing for external examinations.`,
        `11. Uniform & Scrubs Policy: As per SAV Uniform Policy, you must wear the institute-issued apron or scrubs on all working days while on duty.`,
        `12. Property Indemnity: In case of damage to hospital instruments or books due to negligence, the replacement cost shall be recovered from your deposit.`,
      ];

      curY += 20;
      page2PointsSectionB.forEach((pt) => {
        doc.fillColor(colors.dark).font("Helvetica").fontSize(8.2).text(pt, left, curY, {
          width: contentWidth,
          lineGap: 1.8,
        });
        curY = doc.y + 4;
      });

      // Section C: Verification & Joining Documents
      curY += 4;
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(9.5).text("SECTION C: MANDATORY DOCUMENTS & VERIFICATION", left, curY);
      doc.strokeColor(colors.navy).lineWidth(0.8).moveTo(left, curY + 13).lineTo(left + 280, curY + 13).stroke();

      const page2PointsSectionC = [
        `13. Mandatory Joining Documents: Bring 3 passport photos, Originals and photocopies of: MBBS Degree, DOMS/MS/DNB Degree Certificate, Medical Council Registration, Medical Fitness Certificate, PAN Card, and Residential/Age Proof.`,
        `14. PG Clearance / Relieving Order: Joining is strictly subject to clearance of your PG results or submission of a relieving order from your previous employer.`,
        `15. Background Due Diligence: Background verification shall be conducted in the first 6 months. Any adverse academic, banking, or credential reports will lead to immediate termination.`,
        `16. Equal Opportunity & Anti-Harassment: Sankara Eye Foundation follows a strict zero-tolerance policy towards harassment and adheres to equal opportunity norms.`,
        `17. Acceptance Deadline: Validate your acceptance within 3 days by emailing radhika@sankaraeye.com. Failure to respond within 3 days will invalidate this offer and pass it to the next candidate on the merit list.`,
      ];

      curY += 20;
      page2PointsSectionC.forEach((pt) => {
        doc.fillColor(colors.dark).font("Helvetica").fontSize(8.2).text(pt, left, curY, {
          width: contentWidth,
          lineGap: 1.8,
        });
        curY = doc.y + 4;
      });

      // Closing Statement & Signatory Block
      curY += 8;
      doc.fillColor(colors.darkNavy).font("Helvetica-Bold").fontSize(8.8).text(
        "Our journey together will certainly be inspiring, challenging, rewarding and satisfying.",
        left, curY, { width: contentWidth }
      );

      curY = doc.y + 8;
      doc.fillColor(colors.slate).font("Helvetica").fontSize(8.5).text("Wishing you the very best,", left, curY);

      curY = doc.y + 18;
      doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(10).text("Dr. Kaushik Murali", left, curY);
      doc.fillColor(colors.dark).font("Helvetica-Bold").fontSize(8).text(
        "President\nMedical Administration, Quality & Education\nSankara Eye Foundation, India",
        left, doc.y + 2, { lineGap: 1.5 }
      );

      // Running Page Footers across both pages
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.strokeColor(colors.border).lineWidth(0.5).moveTo(left, 800).lineTo(left + contentWidth, 800).stroke();
        doc.fillColor(colors.lightSlate).font("Helvetica").fontSize(7).text(
          `Sankara Academy of Vision · Fellowship Offer Letter · ${data.candidateCode}`,
          left, 806, { width: 300 }
        );
        doc.text(`Page ${i + 1} of ${pages.count}`, left + contentWidth - 100, 806, { width: 100, align: "right" });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
