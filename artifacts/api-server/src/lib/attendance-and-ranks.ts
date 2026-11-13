import "./afm-fonts";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";

export interface AttendanceRow {
  candidateId: number;
  candidateCode: string;
  hallTicketNumber?: string | null;
  fullName: string;
  email: string;
  phone?: string | null;
  qualification?: string | null;
  college?: string | null;
  preferenceOrder?: number | null;
  allSpecialities: string[];
  mcqScore?: number | null;
  psychometricScore?: number | null;
  vivaScore?: number | null;
  status: string;
}

export interface SpecialityAttendanceGroup {
  specialityId: number;
  specialityName: string;
  specialityCode: string;
  rows: AttendanceRow[];
}

export interface RankSheetRow {
  rank: number | null;
  candidateCode: string;
  fullName: string;
  qualification?: string | null;
  otherSpecialities?: string[];
  mcqScore: number | null;
  psychometricScore: number | null;
  vivaScore: number | null;
  totalScore: number | null;
  status: string;
  unitName?: string | null;
}

export interface SpecialityRankSheetGroup {
  specialityId: number;
  specialityName: string;
  specialityCode: string;
  rows: RankSheetRow[];
}

function getLogoPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "logo.png"),
    path.resolve(cwd, "artifacts/api-server/logo.png"),
    path.resolve(cwd, "artifacts/fellowship-exam/public/logo.png"),
    path.resolve(cwd, "public/logo.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function drawReportHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  subtitle: string,
  bannerTitle: string,
  bannerRight: string,
  accentHex = "#C2410C"
): number {
  const left = 28;
  const pageWidth = doc.page.width - 56;
  const top = 24;

  // Top accent strip
  doc.rect(left, top, pageWidth, 4).fill(accentHex);

  const logoPath = getLogoPath();
  let textLeft = left;
  if (logoPath) {
    try {
      doc.image(logoPath, left, top + 10, { height: 34 });
      textLeft = left + 46;
    } catch {
      textLeft = left;
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#0F172A")
    .text("SANKARA ACADEMY OF VISION — FELLOWSHIP SELECTION", textLeft, top + 10, {
      width: pageWidth - (textLeft - left) - 180,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(accentHex)
    .text(title, textLeft, top + 27, {
      width: pageWidth - (textLeft - left) - 180,
    });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#475569")
    .text(subtitle, left + pageWidth - 220, top + 12, {
      width: 220,
      align: "right",
    });

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#64748B")
    .text(`Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`, left + pageWidth - 220, top + 26, {
      width: 220,
      align: "right",
    });

  // Speciality banner
  const bannerY = top + 50;
  doc.roundedRect(left, bannerY, pageWidth, 24, 3).fill("#0F172A");
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#FFFFFF")
    .text(bannerTitle, left + 10, bannerY + 6.5, { width: pageWidth * 0.6 });
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("#FDBA74")
    .text(bannerRight, left + pageWidth * 0.55, bannerY + 7, {
      width: pageWidth * 0.45 - 10,
      align: "right",
    });

  return bannerY + 30;
}

export async function generateAttendanceSheetPdf(options: {
  programName: string;
  academicSession?: string;
  groups: SpecialityAttendanceGroup[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 28,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 28;
    const pageWidth = doc.page.width - 56; // ~785.89
    const bottomLimit = doc.page.height - 62;

    const cols = [
      { label: "S.No", w: 28, align: "center" as const },
      { label: "Code & Hall Ticket", w: 88, align: "left" as const },
      { label: "Candidate Name", w: 150, align: "left" as const },
      { label: "Qualification & College", w: 110, align: "left" as const },
      { label: "Mobile & Email", w: 118, align: "left" as const },
      { label: "MCQ (/50)", w: 54, align: "center" as const },
      { label: "Mind Matter", w: 54, align: "center" as const },
      { label: "Candidate Signature", w: 112, align: "center" as const },
      { label: "Remarks / Panel", w: 71.8, align: "left" as const },
    ];

    const drawTableHeader = (y: number): number => {
      const h = 22;
      doc.rect(left, y, pageWidth, h).fill("#EA580C");
      let cx = left;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#FFFFFF");
      for (const col of cols) {
        doc.text(col.label, cx + 4, y + 7, {
          width: col.w - 8,
          align: col.align,
        });
        cx += col.w;
      }
      return y + h;
    };

    const drawFooter = (totalCount: number) => {
      const fy = doc.page.height - 52;
      doc
        .moveTo(left, fy)
        .lineTo(left + pageWidth, fy)
        .strokeColor("#CBD5E1")
        .lineWidth(0.6)
        .stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#0F172A")
        .text(
          `Total Listed: ${totalCount}    |    Present: ____________    |    Absent: ____________`,
          left,
          fy + 8
        );

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#334155")
        .text(
          "Exam Coordinator Signature: ______________________        Speciality Panel Lead: ______________________",
          left,
          fy + 22,
          { width: pageWidth, align: "right" }
        );
    };

    const activeGroups = options.groups.filter((g) => g.rows.length > 0);
    if (activeGroups.length === 0) {
      const startY = drawReportHeader(
        doc,
        "FINAL EXAMINATION & INTERVIEW ATTENDANCE SHEET",
        `${options.programName}${options.academicSession ? ` (${options.academicSession})` : ""}`,
        "SPECIALITY ATTENDANCE REGISTER",
        "No matching candidates found"
      );
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#64748B")
        .text("No candidates matched the selected speciality or status filter.", left, startY + 24, {
          align: "center",
          width: pageWidth,
        });
      doc.end();
      return;
    }

    activeGroups.forEach((group, gIdx) => {
      if (gIdx > 0) doc.addPage();

      let curY = drawReportHeader(
        doc,
        "FINAL EXAMINATION & INTERVIEW ATTENDANCE SHEET",
        `${options.programName}${options.academicSession ? ` (${options.academicSession})` : ""}`,
        `SPECIALITY: ${group.specialityName.toUpperCase()} (${group.specialityCode})`,
        `Candidates: ${group.rows.length}   |   Panel Date: ______________`
      );
      curY = drawTableHeader(curY);

      group.rows.forEach((row, idx) => {
        const isMulti = row.allSpecialities.length > 1;
        const otherSpecs = row.allSpecialities.filter(
          (s) => s.toLowerCase() !== group.specialityName.toLowerCase()
        );
        const rowH = isMulti ? 36 : 32;

        if (curY + rowH > bottomLimit) {
          drawFooter(group.rows.length);
          doc.addPage();
          curY = drawReportHeader(
            doc,
            "FINAL EXAMINATION & INTERVIEW ATTENDANCE SHEET (CONT.)",
            `${options.programName}${options.academicSession ? ` (${options.academicSession})` : ""}`,
            `SPECIALITY: ${group.specialityName.toUpperCase()} (${group.specialityCode})`,
            `Continued — Total Candidates: ${group.rows.length}`
          );
          curY = drawTableHeader(curY);
        }

        const bg = idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
        doc.rect(left, curY, pageWidth, rowH).fill(bg);
        doc
          .rect(left, curY, pageWidth, rowH)
          .strokeColor("#CBD5E1")
          .lineWidth(0.5)
          .stroke();

        // Column dividers
        let divX = left;
        for (let c = 0; c < cols.length - 1; c++) {
          divX += cols[c]!.w;
          doc
            .moveTo(divX, curY)
            .lineTo(divX, curY + rowH)
            .strokeColor("#E2E8F0")
            .lineWidth(0.5)
            .stroke();
        }

        let cx = left;

        // 1. S.No
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0F172A");
        doc.text(String(idx + 1), cx + 2, curY + 11, { width: cols[0]!.w - 4, align: "center" });
        cx += cols[0]!.w;

        // 2. Code & HT
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#0F172A");
        doc.text(row.candidateCode, cx + 4, curY + 6, { width: cols[1]!.w - 8, ellipsis: true });
        if (row.hallTicketNumber) {
          doc.font("Helvetica").fontSize(7).fillColor("#475569");
          doc.text(`HT: ${row.hallTicketNumber}`, cx + 4, curY + 17, { width: cols[1]!.w - 8, ellipsis: true });
        }
        cx += cols[1]!.w;

        // 3. Name + multi-speciality note
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0F172A");
        doc.text(row.fullName, cx + 4, curY + 5, { width: cols[2]!.w - 8, ellipsis: true });
        if (isMulti) {
          const prefStr = row.preferenceOrder ? `Pref #${row.preferenceOrder} · ` : "";
          doc.font("Helvetica").fontSize(6.8).fillColor("#B45309");
          doc.text(`${prefStr}Also: ${otherSpecs.join(", ")}`, cx + 4, curY + 17, {
            width: cols[2]!.w - 8,
            height: 16,
            ellipsis: true,
          });
        } else if (row.preferenceOrder) {
          doc.font("Helvetica").fontSize(7).fillColor("#64748B");
          doc.text(`Preference #${row.preferenceOrder}`, cx + 4, curY + 18, { width: cols[2]!.w - 8 });
        }
        cx += cols[2]!.w;

        // 4. Qualification & College
        doc.font("Helvetica").fontSize(7.5).fillColor("#1E293B");
        doc.text(row.qualification || "MS / DNB / DO", cx + 4, curY + 6, {
          width: cols[3]!.w - 8,
          ellipsis: true,
        });
        if (row.college) {
          doc.font("Helvetica").fontSize(6.8).fillColor("#64748B");
          doc.text(row.college, cx + 4, curY + 17, {
            width: cols[3]!.w - 8,
            ellipsis: true,
          });
        }
        cx += cols[3]!.w;

        // 5. Mobile & Email
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#0F172A");
        doc.text(row.phone || "—", cx + 4, curY + 6, { width: cols[4]!.w - 8, ellipsis: true });
        doc.font("Helvetica").fontSize(6.8).fillColor("#475569");
        doc.text(row.email || "—", cx + 4, curY + 17, { width: cols[4]!.w - 8, ellipsis: true });
        cx += cols[4]!.w;

        // 6. MCQ Score / Present box
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#1E293B");
        const mcqText = row.mcqScore != null ? `${Number(row.mcqScore).toFixed(1)}/50` : "[  ] P";
        doc.text(mcqText, cx + 2, curY + 11, { width: cols[5]!.w - 4, align: "center" });
        cx += cols[5]!.w;

        // 7. Mind Matter
        const mmText = row.psychometricScore != null ? `${Number(row.psychometricScore).toFixed(1)}/10` : "[  ] P";
        doc.text(mmText, cx + 2, curY + 11, { width: cols[6]!.w - 4, align: "center" });
        cx += cols[6]!.w;

        // 8. Candidate Signature (intentionally blank box for physical signature)
        cx += cols[7]!.w;

        // 9. Remarks / Viva indicator if already scored
        if (row.vivaScore != null) {
          doc.font("Helvetica").fontSize(7).fillColor("#047857");
          doc.text(`Viva: ${Number(row.vivaScore).toFixed(1)}/50`, cx + 4, curY + 11, {
            width: cols[8]!.w - 8,
            ellipsis: true,
          });
        }

        curY += rowH;
      });

      drawFooter(group.rows.length);
    });

    doc.end();
  });
}

export function generateAttendanceSheetExcel(options: {
  groups: SpecialityAttendanceGroup[];
}): Buffer {
  const wb = XLSX.utils.book_new();
  const consolidatedRows: Record<string, any>[] = [];

  for (const group of options.groups) {
    if (group.rows.length === 0) continue;

    const sheetRows = group.rows.map((r, i) => {
      const otherSpecs = r.allSpecialities.filter(
        (s) => s.toLowerCase() !== group.specialityName.toLowerCase()
      );
      const record = {
        "S.No": i + 1,
        "Speciality": group.specialityName,
        "Speciality Code": group.specialityCode,
        "Candidate Code": r.candidateCode,
        "Hall Ticket No": r.hallTicketNumber || "—",
        "Candidate Name": r.fullName,
        "Preference Order": r.preferenceOrder ?? "—",
        "Other Applied Specialities": otherSpecs.length > 0 ? otherSpecs.join(", ") : "Single Speciality",
        "Mobile": r.phone || "—",
        "Email": r.email,
        "PG Qualification": r.qualification || "—",
        "Medical College": r.college || "—",
        "MCQ Marks (/50)": r.mcqScore != null ? Number(r.mcqScore.toFixed(1)) : "Pending",
        "Mind Matter (/10)": r.psychometricScore != null ? Number(r.psychometricScore.toFixed(1)) : "Pending",
        "Doctor Viva (/50)": r.vivaScore != null ? Number(r.vivaScore.toFixed(1)) : "Pending",
        "Attendance Status": "",
        "Candidate Signature": "",
        "Panel / Remarks": "",
      };
      consolidatedRows.push(record);
      return record;
    });

    const sheetName = group.specialityName.replace(/[\\/?*\[\]:]/g, "").slice(0, 31) || `Spec_${group.specialityId}`;
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws["!cols"] = [
      { wch: 6 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 26 }, { wch: 12 }, { wch: 24 }, { wch: 15 }, { wch: 28 },
      { wch: 20 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 16 }, { wch: 24 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  if (consolidatedRows.length === 0) {
    const ws = XLSX.utils.json_to_sheet([{ Note: "No candidates found for selected filters" }]);
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Sheet");
  } else {
    const wsAll = XLSX.utils.json_to_sheet(consolidatedRows);
    wsAll["!cols"] = [
      { wch: 6 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 26 }, { wch: 12 }, { wch: 24 }, { wch: 15 }, { wch: 28 },
      { wch: 20 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
      { wch: 16 }, { wch: 24 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsAll, "All Specialities");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function generateRankSheetPdf(options: {
  programName: string;
  academicSession?: string;
  groups: SpecialityRankSheetGroup[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 28,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 28;
    const pageWidth = doc.page.width - 56;
    const bottomLimit = doc.page.height - 56;

    const cols = [
      { label: "Rank", w: 42, align: "center" as const },
      { label: "Code", w: 78, align: "left" as const },
      { label: "Candidate Name", w: 165, align: "left" as const },
      { label: "PG Qualification", w: 125, align: "left" as const },
      { label: "MCQ (/50)", w: 62, align: "center" as const },
      { label: "Mind Matter (/10)", w: 72, align: "center" as const },
      { label: "Doctor Viva (/50)", w: 72, align: "center" as const },
      { label: "Total (/110)", w: 68, align: "center" as const },
      { label: "Status / Unit", w: 101.8, align: "left" as const },
    ];

    const drawTableHeader = (y: number): number => {
      const h = 22;
      doc.rect(left, y, pageWidth, h).fill("#1E293B");
      let cx = left;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#FFFFFF");
      for (const col of cols) {
        doc.text(col.label, cx + 4, y + 7, { width: col.w - 8, align: col.align });
        cx += col.w;
      }
      return y + h;
    };

    const drawFooter = () => {
      const fy = doc.page.height - 46;
      doc
        .moveTo(left, fy)
        .lineTo(left + pageWidth, fy)
        .strokeColor("#CBD5E1")
        .lineWidth(0.6)
        .stroke();
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#334155")
        .text(
          "Total Formula: MCQ (Max 50) + Mind Matter (Max 10) + Doctor Interview Viva (Max 50) = 110 Marks        |        Controller of Examinations: ______________________",
          left,
          fy + 10,
          { width: pageWidth }
        );
    };

    const activeGroups = options.groups.filter((g) => g.rows.length > 0);
    if (activeGroups.length === 0) {
      drawReportHeader(
        doc,
        "OFFICIAL FELLOWSHIP MERIT RANK SHEET",
        `${options.programName}${options.academicSession ? ` (${options.academicSession})` : ""}`,
        "MERIT RANKING REGISTER",
        "No ranked candidates found",
        "#1E40AF"
      );
      doc.end();
      return;
    }

    activeGroups.forEach((group, gIdx) => {
      if (gIdx > 0) doc.addPage();

      let curY = drawReportHeader(
        doc,
        "OFFICIAL FELLOWSHIP MERIT RANK SHEET",
        `${options.programName}${options.academicSession ? ` (${options.academicSession})` : ""}`,
        `SPECIALITY MERIT LIST: ${group.specialityName.toUpperCase()} (${group.specialityCode})`,
        `Total Candidates: ${group.rows.length}   |   Max Marks: 110`,
        "#1E40AF"
      );
      curY = drawTableHeader(curY);

      group.rows.forEach((row, idx) => {
        const rowH = row.otherSpecialities && row.otherSpecialities.length > 0 ? 30 : 25;
        if (curY + rowH > bottomLimit) {
          drawFooter();
          doc.addPage();
          curY = drawReportHeader(
            doc,
            "OFFICIAL FELLOWSHIP MERIT RANK SHEET (CONT.)",
            `${options.programName}${options.academicSession ? ` (${options.academicSession})` : ""}`,
            `SPECIALITY MERIT LIST: ${group.specialityName.toUpperCase()} (${group.specialityCode})`,
            `Continued — Total: ${group.rows.length}`,
            "#1E40AF"
          );
          curY = drawTableHeader(curY);
        }

        const bg = idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
        doc.rect(left, curY, pageWidth, rowH).fill(bg);
        doc
          .rect(left, curY, pageWidth, rowH)
          .strokeColor("#CBD5E1")
          .lineWidth(0.5)
          .stroke();

        let cx = left;
        const textY = curY + 8;

        // Rank
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(row.rank ? "#1D4ED8" : "#94A3B8");
        doc.text(row.rank ? `#${row.rank}` : "Pend", cx + 2, textY, { width: cols[0]!.w - 4, align: "center" });
        cx += cols[0]!.w;

        // Code
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#334155");
        doc.text(row.candidateCode, cx + 4, textY, { width: cols[1]!.w - 8, ellipsis: true });
        cx += cols[1]!.w;

        // Name
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0F172A");
        doc.text(row.fullName, cx + 4, row.otherSpecialities?.length ? curY + 5 : textY, {
          width: cols[2]!.w - 8,
          ellipsis: true,
        });
        if (row.otherSpecialities && row.otherSpecialities.length > 0) {
          doc.font("Helvetica").fontSize(6.5).fillColor("#B45309");
          doc.text(`Also applied: ${row.otherSpecialities.join(", ")}`, cx + 4, curY + 16, {
            width: cols[2]!.w - 8,
            ellipsis: true,
          });
        }
        cx += cols[2]!.w;

        // Qualification
        doc.font("Helvetica").fontSize(7.5).fillColor("#475569");
        doc.text(row.qualification || "—", cx + 4, textY, { width: cols[3]!.w - 8, ellipsis: true });
        cx += cols[3]!.w;

        // MCQ
        doc.font("Helvetica").fontSize(8.5).fillColor("#0F172A");
        doc.text(row.mcqScore != null ? row.mcqScore.toFixed(1) : "—", cx + 2, textY, {
          width: cols[4]!.w - 4,
          align: "center",
        });
        cx += cols[4]!.w;

        // Mind Matter
        doc.font("Helvetica").fontSize(8.5).fillColor("#B45309");
        doc.text(row.psychometricScore != null ? row.psychometricScore.toFixed(1) : "—", cx + 2, textY, {
          width: cols[5]!.w - 4,
          align: "center",
        });
        cx += cols[5]!.w;

        // Doctor Viva
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#4338CA");
        doc.text(row.vivaScore != null ? row.vivaScore.toFixed(1) : "Pending", cx + 2, textY, {
          width: cols[6]!.w - 4,
          align: "center",
        });
        cx += cols[6]!.w;

        // Total
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#0F172A");
        doc.text(row.totalScore != null ? row.totalScore.toFixed(1) : "—", cx + 2, textY, {
          width: cols[7]!.w - 4,
          align: "center",
        });
        cx += cols[7]!.w;

        // Status / Unit
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155");
        const statusStr = row.unitName ? `${row.status.toUpperCase()} (${row.unitName})` : row.status.toUpperCase();
        doc.text(statusStr, cx + 4, textY, { width: cols[8]!.w - 8, ellipsis: true });

        curY += rowH;
      });

      drawFooter();
    });

    doc.end();
  });
}

