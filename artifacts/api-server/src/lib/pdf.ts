import PDFDocument from "pdfkit";
import { Buffer } from "node:buffer";

export type LetterData = {
  candidateName: string;
  candidateCode: string;
  programName: string;
  specialityName: string;
  unitName: string;
  unitCity: string;
  allocatedAt: string;
  status: string;
};

export async function generateAllocationLetter(data: LetterData): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
      doc.on("error", reject);

      // Header
      doc.fontSize(22).fillColor("#E8741A").text("SANKARA EYE FOUNDATION - INDIA", { align: "center" });
      doc.moveDown(0.2);
      doc.fontSize(11).fillColor("#444").text("Sri Kanchi Kamakoti Medical Trust", { align: "center" });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#E8741A").lineWidth(1).stroke();
      doc.moveDown(1);

      doc.fontSize(16).fillColor("#111").text("Fellowship Allocation Letter", { align: "center" });
      doc.moveDown(1);

      doc.fontSize(11).fillColor("#000").text(`Date: ${new Date(data.allocatedAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`);
      doc.text(`Candidate ID: ${data.candidateCode}`);
      doc.moveDown(1);

      doc.fontSize(12).text(`Dear ${data.candidateName},`);
      doc.moveDown(0.5);

      const intro = data.status === "SELECTED"
        ? `We are pleased to inform you that, based on your performance in the entrance examination, psychometric assessment, and interview, you have been SELECTED for the following fellowship at Sankara Eye Foundation - India.`
        : data.status === "WAITLISTED"
          ? `Based on your performance, you have been placed on the WAITLIST for the following fellowship. We will notify you if a seat becomes available.`
          : `We regret to inform you that, based on your overall performance, your application could not be accommodated this admission cycle.`;

      doc.fontSize(11).text(intro, { align: "justify" });
      doc.moveDown(1);

      doc.fontSize(12).fillColor("#E8741A").text("Allocation Details", { underline: false });
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor("#000");
      const rows: Array<[string, string]> = [
        ["Program", data.programName],
        ["Speciality", data.specialityName || "—"],
        ["Posting Unit", data.unitName || "—"],
        ["Location", data.unitCity || "—"],
        ["Status", data.status],
      ];
      for (const [k, v] of rows) {
        doc.font("Helvetica-Bold").text(`${k}:`, { continued: true }).font("Helvetica").text(`  ${v}`);
      }
      doc.moveDown(1.5);

      doc.fontSize(11).text(
        "This letter is generated electronically by the Sankara Eye Foundation Fellowship Admissions System. For any queries, please contact the program office.",
        { align: "justify" },
      );

      doc.moveDown(3);
      doc.fontSize(11).text("Yours sincerely,");
      doc.text("Program Director");
      doc.text("Fellowship Admissions");
      doc.text("Sankara Eye Foundation - India");

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
