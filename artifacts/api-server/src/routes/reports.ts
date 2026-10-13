import { Router } from "express";
import { db, readDb, applicationSubmissionsTable, candidatesTable, usersTable, interviewScoresTable, programsTable, unitsTable, specialitiesTable, applicationsTable, batchesTable, documentsTable, batchCandidatesTable, candidatePreferencesTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import * as XLSX from "xlsx";
import { formatDOBToStandard, parseSpecializationString, formatToDDMMYYYY, formatTo12HrTime, formatToLocalDateTime } from "../lib/utils";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs/promises";

const router: Router = Router();

router.get("/reports/cycle-report", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    // 1. Fetch All Data
    const submissions = await readDb.select().from(applicationSubmissionsTable);
    const candidates = await readDb.select().from(candidatesTable);
    const users = await readDb.select().from(usersTable);
    const scores = await readDb.select().from(interviewScoresTable);
    const programs = await readDb.select().from(programsTable);
    const units = await readDb.select().from(unitsTable);

    // 2. Prepare Detailed Financial & Admissions Sheet
    const financialAdmissionsData = submissions.map(s => {
      const cand = candidates.find(c => c.email === s.email);
      const prog = programs.find(p => p.id === s.formId);
      const unit = cand?.unitId ? units.find(u => u.id === cand.unitId) : null;
      
      return {
        "Student Name": s.fullName,
        "Email ID": s.email,
        "Phone Number": s.phone,
        "Program Applied": prog?.name || "Fellowship",
        "Application Status": s.status.toUpperCase(),
        "Payment Status": s.paymentId ? "SUCCESS" : "PENDING",
        "Transaction ID / Payment ID": s.paymentId || "N/A",
        "Amount Received": s.paymentId ? "₹5000.00" : "₹0.00",
        "Payment Mode": "Online (Razorpay)",
        "Submission Date": formatToDDMMYYYY(s.submittedAt),
        "Submission Time": formatTo12HrTime(s.submittedAt),
        "Approval Status": s.status === "approved" ? "APPROVED" : "PENDING REVIEW",
        "Allotted Center": unit?.name || "NOT ALLOTTED"
      };
    });
 
    // 3. Prepare Staff Activity & Evaluation Sheet
    const staffActivityData = scores.map(sc => {
      const doc = users.find(u => u.id === sc.doctorId);
      const cand = candidates.find(c => c.id === sc.candidateId);
      
      return {
        "Staff/Doctor Name": doc?.fullName || "Unknown",
        "Staff Role": doc?.role?.replace("_", " ").toUpperCase() || "N/A",
        "Candidate Evaluated": cand?.fullName || "Unknown",
        "Candidate ID": cand?.candidateCode || "N/A",
        "Score Awarded": sc.score,
        "Maximum Score": 100,
        "Staff Remarks": sc.remarks || "No remarks provided",
        "Activity Timestamp": formatToLocalDateTime(sc.submittedAt)
      };
    });
 
    // 4. Prepare Summary Sheet
    const totalPayments = submissions.filter(s => !!s.paymentId).length * 5000;
    const summaryData = [
      { "Metric": "Total Applications Received", "Value": submissions.length },
      { "Metric": "Total Payments Confirmed", "Value": submissions.filter(s => !!s.paymentId).length },
      { "Metric": "Total Revenue Collected", "Value": `₹${totalPayments.toLocaleString("en-IN")}` },
      { "Metric": "Total Candidates Approved", "Value": candidates.length },
      { "Metric": "Total Interviews Conducted", "Value": scores.length },
      { "Metric": "Total Centers (Units) Involved", "Value": units.length },
      { "Metric": "Active Staff Members", "Value": users.length },
      { "Metric": "Report Generation Date", "Value": formatToLocalDateTime(new Date()) }
    ];

    // 5. Create Workbook
    const wb = XLSX.utils.book_new();

    const addAutoFilter = (ws: XLSX.WorkSheet) => {
      if (!ws["!ref"]) return;
      try {
        const range = XLSX.utils.decode_range(ws["!ref"]);
        ws["!autofilter"] = {
          ref: XLSX.utils.encode_range({
            s: { c: 0, r: 0 },
            e: { c: range.e.c, r: range.e.r }
          })
        };
      } catch (err) {
        console.error("Failed to add autofilter:", err);
      }
    };
    
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary["!cols"] = [{ wch: 35 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Cycle Summary Overview");

    // Compute segment counts for chart sheet
    let totalRetinaCount = 0;
    let totalAnteriorCount = 0;
    let vrs = 0; let mr = 0; let cornea = 0; let cataract = 0; let glaucoma = 0; let pediatric = 0; let orbit = 0;

    for (const s of submissions) {
      const specs = parseSpecializationString(s.specialization);
      for (const spec of specs) {
        const lower = spec.toLowerCase();
        if (lower.includes("vitreo retina") || lower.includes("vitreoretinal")) {
          vrs++; totalRetinaCount++;
        } else if (lower.includes("medical retina")) {
          mr++; totalRetinaCount++;
        } else if (lower.includes("cornea")) {
          cornea++; totalAnteriorCount++;
        } else if (lower.includes("cataract") || lower.includes("refractive") || lower.includes("phaco") || lower.includes("iol")) {
          cataract++; totalAnteriorCount++;
        } else if (lower.includes("glaucoma")) {
          glaucoma++; totalAnteriorCount++;
        } else if (lower.includes("pediatric") || lower.includes("po")) {
          pediatric++; totalAnteriorCount++;
        } else if (lower.includes("orbit") || lower.includes("oculoplast") || lower.includes("op")) {
          orbit++; totalAnteriorCount++;
        } else {
          cataract++; totalAnteriorCount++;
        }
      }
    }

    const specializationStatsData = [
      { "Segment": "Retina Segment", "Speciality": "Vitreoretinal Surgery (Retina - Surgical)", "Applications Count": vrs },
      { "Segment": "Retina Segment", "Speciality": "Medical Retina (Retina - Non-Surgical)", "Applications Count": mr },
      { "Segment": "Anterior Segment", "Speciality": "Cornea & External Disease", "Applications Count": cornea },
      { "Segment": "Anterior Segment", "Speciality": "Cataract & Refractive Surgery", "Applications Count": cataract },
      { "Segment": "Anterior Segment", "Speciality": "Glaucoma", "Applications Count": glaucoma },
      { "Segment": "Anterior Segment", "Speciality": "Pediatric Ophthalmology", "Applications Count": pediatric },
      { "Segment": "Anterior Segment", "Speciality": "Orbit & Oculoplastics", "Applications Count": orbit },
    ];

    const wsSpecStats = XLSX.utils.json_to_sheet(specializationStatsData);
    wsSpecStats["!cols"] = [{ wch: 25 }, { wch: 40 }, { wch: 25 }];
    addAutoFilter(wsSpecStats);
    XLSX.utils.book_append_sheet(wb, wsSpecStats, "Speciality Stats Chart Data");

    const wsFinance = XLSX.utils.json_to_sheet(financialAdmissionsData);
    wsFinance["!cols"] = financialAdmissionsData[0] ? Object.keys(financialAdmissionsData[0]).map(() => ({ wch: 25 })) : [];
    addAutoFilter(wsFinance);
    XLSX.utils.book_append_sheet(wb, wsFinance, "Student Payments & Status");

    const wsStaff = XLSX.utils.json_to_sheet(staffActivityData);
    wsStaff["!cols"] = staffActivityData[0] ? Object.keys(staffActivityData[0]).map(() => ({ wch: 25 })) : [];
    addAutoFilter(wsStaff);
    XLSX.utils.book_append_sheet(wb, wsStaff, "Staff Usage & Appraisals");

    // 6. Write to Buffer
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // 7. Send Response
    const date = new Date().toISOString().split('T')[0];
    res.setHeader("Content-Disposition", `attachment; filename=SAV_Full_Cycle_Report_${date}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);

  } catch (error: any) {
    console.error("[cycle-report] error:", error);
    res.status(500).json({ error: "Failed to generate cycle report", details: error.message });
  }
});

router.get("/reports/daily-report", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    // 1. Fetch All Data
    const submissions = await readDb.select().from(applicationSubmissionsTable);
    const candidates = await readDb.select().from(candidatesTable);
    const users = await readDb.select().from(usersTable);
    const scores = await readDb.select().from(interviewScoresTable);
    const programs = await readDb.select().from(programsTable);
    const units = await readDb.select().from(unitsTable);

    const todayStr = new Date().toDateString();
    const isToday = (dateVal: any) => {
      if (!dateVal) return false;
      return new Date(dateVal).toDateString() === todayStr;
    };

    // Filter records for today
    const submissionsToday = submissions.filter(s => isToday(s.submittedAt));
    const candidatesToday = candidates.filter(c => isToday(c.createdAt));
    const scoresToday = scores.filter(sc => isToday(sc.submittedAt));

    // 2. Prepare Detailed Financial & Admissions Sheet
    const financialAdmissionsData = submissionsToday.map(s => {
      const cand = candidates.find(c => c.email === s.email);
      const prog = programs.find(p => p.id === s.formId);
      const unit = cand?.unitId ? units.find(u => u.id === cand.unitId) : null;
      
      const specs = s.specialization ? JSON.parse(s.specialization) : [];
      const specCount = Array.isArray(specs) ? specs.length : 1;
      const expectedAmount = 2750 * specCount;

      return {
        "Student Name": s.fullName,
        "Email ID": s.email,
        "Phone Number": s.phone,
        "Program Applied": prog?.name || "Fellowship",
        "Application Status": s.status.toUpperCase(),
        "Payment Status": s.paymentId || s.paidAmount ? "SUCCESS" : "PENDING",
        "Transaction ID / Payment ID": s.paymentId || "N/A",
        "Amount Received": s.paidAmount 
          ? `₹${(s.paidAmount > 100000 ? s.paidAmount / 100 : s.paidAmount).toLocaleString("en-IN")}`
          : `₹${expectedAmount.toLocaleString("en-IN")}`,
        "Payment Mode": s.paymentMode || "Online (Razorpay)",
        "Submission Date": formatToDDMMYYYY(s.submittedAt),
        "Submission Time": formatTo12HrTime(s.submittedAt),
        "Approval Status": s.status === "approved" ? "APPROVED" : "PENDING REVIEW",
        "Allotted Center": unit?.name || "NOT ALLOTTED"
      };
    });

    // 3. Prepare Enrolled Candidates Sheet
    const candidatesData = candidatesToday.map(c => {
      const unit = c.unitId ? units.find(u => u.id === c.unitId) : null;
      return {
        "Candidate ID": c.candidateCode,
        "Full Name": c.fullName,
        "Email": c.email,
        "Phone": c.phone || "N/A",
        "DOB": formatDOBToStandard(c.dateOfBirth),
        "Gender": c.gender || "N/A",
        "Qualification": c.qualification || "N/A",
        "College": c.collegeName || "N/A",
        "Status": c.status.toUpperCase(),
        "Allotted Unit": unit?.name || "N/A",
        "Created At": formatToLocalDateTime(c.createdAt)
      };
    });

    // 4. Prepare Staff Activity & Evaluation Sheet
    const staffActivityData = scoresToday.map(sc => {
      const doc = users.find(u => u.id === sc.doctorId);
      const cand = candidates.find(c => c.id === sc.candidateId);
      
      return {
        "Staff/Doctor Name": doc?.fullName || "Unknown",
        "Staff Role": doc?.role?.replace("_", " ").toUpperCase() || "N/A",
        "Candidate Evaluated": cand?.fullName || "Unknown",
        "Candidate ID": cand?.candidateCode || "N/A",
        "Score Awarded": sc.score,
        "Maximum Score": 100,
        "Staff Remarks": sc.remarks || "No remarks provided",
        "Activity Timestamp": formatToLocalDateTime(sc.submittedAt)
      };
    });

    // 5. Prepare Summary Sheet
    const totalPayments = submissionsToday.reduce((acc, s) => {
      if (s.paidAmount) {
        const amt = s.paidAmount > 100000 ? s.paidAmount / 100 : s.paidAmount;
        return acc + amt;
      }
      return acc;
    }, 0);

    const summaryData = [
      { "Metric": "Applications Received Today", "Value": submissionsToday.length },
      { "Metric": "Candidates Approved/Registered Today", "Value": candidatesToday.length },
      { "Metric": "Payments Recorded Today", "Value": submissionsToday.filter(s => !!s.paymentId || !!s.paidAmount).length },
      { "Metric": "Total Daily Revenue", "Value": `₹${totalPayments.toLocaleString("en-IN")}` },
      { "Metric": "Interviews Evaluated Today", "Value": scoresToday.length },
      { "Metric": "Report Generation Date", "Value": formatToLocalDateTime(new Date()) }
    ];

    // 6. Create Workbook
    const wb = XLSX.utils.book_new();

    const addAutoFilter = (ws: XLSX.WorkSheet) => {
      if (!ws["!ref"]) return;
      try {
        const range = XLSX.utils.decode_range(ws["!ref"]);
        ws["!autofilter"] = {
          ref: XLSX.utils.encode_range({
            s: { c: 0, r: 0 },
            e: { c: range.e.c, r: range.e.r }
          })
        };
      } catch (err) {
        console.error("Failed to add autofilter:", err);
      }
    };
    
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary["!cols"] = [{ wch: 40 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Daily Summary");

    const wsFinance = XLSX.utils.json_to_sheet(financialAdmissionsData);
    wsFinance["!cols"] = financialAdmissionsData[0] ? Object.keys(financialAdmissionsData[0]).map(() => ({ wch: 25 })) : [];
    addAutoFilter(wsFinance);
    XLSX.utils.book_append_sheet(wb, wsFinance, "Today's Payments & Status");

    const wsCandidates = XLSX.utils.json_to_sheet(candidatesData);
    wsCandidates["!cols"] = candidatesData[0] ? Object.keys(candidatesData[0]).map(() => ({ wch: 25 })) : [];
    addAutoFilter(wsCandidates);
    XLSX.utils.book_append_sheet(wb, wsCandidates, "Today's Enrolled Candidates");

    const wsStaff = XLSX.utils.json_to_sheet(staffActivityData);
    wsStaff["!cols"] = staffActivityData[0] ? Object.keys(staffActivityData[0]).map(() => ({ wch: 25 })) : [];
    addAutoFilter(wsStaff);
    XLSX.utils.book_append_sheet(wb, wsStaff, "Today's Appraisals");

    // 7. Write to Buffer
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // 8. Send Response
    const date = new Date().toISOString().split('T')[0];
    res.setHeader("Content-Disposition", `attachment; filename=SAV_Daily_Report_${date}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);

  } catch (error: any) {
    console.error("[daily-report] error:", error);
    res.status(500).json({ error: "Failed to generate daily report", details: error.message });
  }
});

router.get("/reports/stats", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req: any, res) => {
  try {
    const isMock = req.isMockMode || false;

    // 1. Fetch data
    const submissions = await readDb.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.isMock, isMock));
    const candidates = await readDb.select().from(candidatesTable).where(eq(candidatesTable.isMock, isMock));
    const specialities = await readDb.select().from(specialitiesTable);
    const scores = await readDb.select().from(interviewScoresTable);

    const candidateIds = new Set(candidates.map(c => c.id));

    // Filter scores to keep only relevant candidates if mock
    const activeScores = scores.filter(s => candidateIds.has(s.candidateId));

    // 2. Compute KPIs
    const nonDraftSubmissions = submissions.filter(s => !s.saveAsDraft);
    const uniqueEmails = new Set(nonDraftSubmissions.map(s => s.email.toLowerCase().trim()));
    const totalApplicants = uniqueEmails.size;

    const totalPending = nonDraftSubmissions.filter(s => s.status === "pending").length;
    const totalApproved = nonDraftSubmissions.filter(s => s.status === "approved").length;
    const totalAllocated = candidates.filter(c => c.status === "allocated").length;

    const totalRevenue = nonDraftSubmissions.reduce((acc, s) => {
      if (s.paidAmount) {
        const amt = s.paidAmount > 100000 ? s.paidAmount / 100 : s.paidAmount;
        return acc + amt;
      }
      return acc;
    }, 0);

    const conversionRate = totalApplicants > 0 ? Math.round((totalAllocated / totalApplicants) * 100) : 0;

    // 3. Specialization Chart Data
    const bySpecialization = specialities.map(spec => {
      // Count submissions with this specialization
      const specApplicants = nonDraftSubmissions.filter(s => {
        const specs = parseSpecializationString(s.specialization);
        return specs.some(sp => sp.toLowerCase() === spec.name.toLowerCase());
      }).length;

      // Count allocated candidates who chose this specialty
      const specAllocated = candidates.filter(c => {
        if (c.status !== "allocated") return false;
        const sub = nonDraftSubmissions.find(s => s.email.toLowerCase().trim() === c.email.toLowerCase().trim());
        if (!sub) return false;
        const specs = parseSpecializationString(sub.specialization);
        return specs.some(sp => sp.toLowerCase() === spec.name.toLowerCase());
      }).length;

      return {
        id: spec.id,
        name: spec.name,
        code: spec.code,
        seats: spec.seats,
        applicants: specApplicants,
        allocated: specAllocated,
        fillRate: spec.seats > 0 ? Math.round((specAllocated / spec.seats) * 100) : 0
      };
    });

    // 4. Status Breakdown
    const statusBreakdown = [
      { name: "Pending Review", value: totalPending },
      { name: "Screening Passed", value: totalApproved },
      { name: "Rejected", value: nonDraftSubmissions.filter(s => s.status === "rejected").length },
      { name: "Allocated", value: totalAllocated },
      { name: "Waitlisted", value: candidates.filter(c => c.status === "waitlisted").length }
    ];

    // 5. Timeline data (last 15 active days)
    const submissionsByDate: Record<string, number> = {};
    nonDraftSubmissions.forEach(s => {
      if (s.submittedAt) {
        const dateKey = new Date(s.submittedAt).toISOString().split('T')[0];
        submissionsByDate[dateKey] = (submissionsByDate[dateKey] ?? 0) + 1;
      }
    });

    const sortedDates = Object.keys(submissionsByDate).sort();
    const timelineData = sortedDates.map(dateKey => {
      const [year, month, day] = dateKey.split('-');
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const formattedDate = `${parseInt(day)} ${months[parseInt(month) - 1]}`;
      return {
        date: formattedDate,
        count: submissionsByDate[dateKey]
      };
    }).slice(-15);

    // 6. Score Averages by Specialization
    const scoreAverages = specialities.map(spec => {
      const specCandidates = candidates.filter(c => {
        const sub = nonDraftSubmissions.find(s => s.email.toLowerCase().trim() === c.email.toLowerCase().trim());
        if (!sub) return false;
        const specs = parseSpecializationString(sub.specialization);
        return specs.some(sp => sp.toLowerCase() === spec.name.toLowerCase());
      });

      const mcqScores = specCandidates.map(c => parseFloat(c.mcqScore || "")).filter(s => !isNaN(s));
      const psychScores = specCandidates.map(c => parseFloat(c.psychometricScore || "")).filter(s => !isNaN(s));
      
      const interviewCandIds = new Set(specCandidates.map(c => c.id));
      const candInterviewScores = activeScores.filter(s => interviewCandIds.has(s.candidateId)).map(s => s.score);

      const avgMcq = mcqScores.length > 0 ? Math.round(mcqScores.reduce((a, b) => a + b, 0) / mcqScores.length) : 0;
      const avgPsych = psychScores.length > 0 ? Math.round(psychScores.reduce((a, b) => a + b, 0) / psychScores.length) : 0;
      const avgInterview = candInterviewScores.length > 0 ? Math.round(candInterviewScores.reduce((a, b) => a + b, 0) / candInterviewScores.length) : 0;

      return {
        specialization: spec.name,
        mcq: avgMcq,
        psychometric: avgPsych,
        interview: avgInterview
      };
    });

    // 7. Dynamic smart alerts
    const alerts = [];
    const missingScores = candidates.filter(c => c.status === "approved" && (!c.mcqScore || !c.psychometricScore)).length;
    if (missingScores > 0) {
      alerts.push({
        type: "warning",
        message: `${missingScores} approved candidates are missing MCQ or Psychometric scores.`
      });
    }

    const pendingInterviews = candidates.filter(c => c.status === "approved" && !activeScores.some(s => s.candidateId === c.id)).length;
    if (pendingInterviews > 0) {
      alerts.push({
        type: "critical",
        message: `${pendingInterviews} approved candidates do not have interview scores recorded.`
      });
    }

    const unallocatedCandidates = candidates.filter(c => c.status === "interview_completed").length;
    if (unallocatedCandidates > 0) {
      alerts.push({
        type: "notice",
        message: `${unallocatedCandidates} candidates have completed interviews and are ready for seat allocation.`
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        type: "success",
        message: "All candidate evaluations and seat allocations are up to date!"
      });
    }

    res.json({
      kpis: {
        totalApplicants,
        totalApproved,
        totalAllocated,
        totalPending,
        totalRevenue,
        conversionRate
      },
      bySpecialization,
      statusBreakdown,
      timelineData,
      scoreAverages,
      recentAlerts: alerts
    });

  } catch (error: any) {
    console.error("[reports-stats] error:", error);
    res.status(500).json({ error: "Failed to load reports statistics", details: error.message });
  }
});

// Admittance Hall Ticket PDF generation endpoint
router.get("/applications/:id/hall-ticket", requireAuth, async (req, res) => {
  const appId = Number(req.params.id);
  try {
    // 1. Fetch application
    const [app] = await db.select().from(applicationsTable).where(eq(applicationsTable.id, appId));
    if (!app) return res.status(404).json({ error: "Application not found" });

    // 2. Fetch candidate & speciality & batch
    const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, app.candidateId));
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });

    const [spec] = await db.select().from(specialitiesTable).where(eq(specialitiesTable.id, app.specialityId));
    const specialityName = spec?.name ?? "Fellowship";

    let batch = null;
    if (app.batchId) {
      batch = (await db.select().from(batchesTable).where(eq(batchesTable.id, app.batchId)))[0] || null;
    } else {
      const [bc] = await db.select().from(batchCandidatesTable).where(eq(batchCandidatesTable.candidateId, candidate.id));
      if (bc) {
        batch = (await db.select().from(batchesTable).where(eq(batchesTable.id, bc.batchId)))[0] || null;
      }
    }
    const batchName = batch?.name ?? "Not Scheduled";
    const formatToDDMMYYYY = (date: Date | string) => {
      const d = new Date(date);
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${day}-${month}-${year}`;
    };
    const batchDateStr = batch?.date ? formatToDDMMYYYY(batch.date) : "TBD";
    const batchTime = batch?.timing ?? "TBD";
    const venue = batch?.venue ?? "SEH, Bangalore";

    // 3. Find Photo file
    let localPhotoPath: string | null = null;
    const [photoDoc] = await db.select().from(documentsTable).where(
      and(eq(documentsTable.candidateId, candidate.id), eq(documentsTable.docType, "PHOTO"))
    );
    if (photoDoc && photoDoc.fileUrl && photoDoc.fileUrl.startsWith("/objects/uploads/")) {
      const p = path.join(process.cwd(), "uploads", photoDoc.fileUrl.replace("/objects/uploads/", ""));
      try {
        await fs.stat(p);
        localPhotoPath = p;
      } catch {}
    }
    if (!localPhotoPath) {
      const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, candidate.email));
      if (sub && sub.photoUrl && sub.photoUrl.startsWith("/objects/uploads/")) {
        const p = path.join(process.cwd(), "uploads", sub.photoUrl.replace("/objects/uploads/", ""));
        try {
          await fs.stat(p);
          localPhotoPath = p;
        } catch {}
      }
    }

    // 4. Generate PDF Admit Card
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="HallTicket_${candidate.fullName.replace(/\s+/g, "_")}.pdf"`);
    doc.pipe(res);

    // Color Palette
    const primaryColor = "#0B4A8F"; // Deep Navy
    const accentColor = "#D32F2F"; // Notice Red
    const darkTextColor = "#333333";
    const borderLight = "#C5D3E8";

    // Outer Border
    doc.rect(20, 20, 555, 802).lineWidth(1).strokeColor(primaryColor).stroke();
    doc.rect(23, 23, 549, 796).lineWidth(0.5).strokeColor(borderLight).stroke();

    // Branded Header
    doc.fontSize(16).fillColor(primaryColor).font("Helvetica-Bold").text("SANKARA ACADEMY OF VISION", 40, 45, { align: "center" });
    doc.fontSize(10).fillColor("#555555").font("Helvetica").text("Sankara Eye Hospital Campus, Bangalore", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor(primaryColor).font("Helvetica-Bold").text("ADMIT CARD / HALL TICKET", { align: "center" });
    
    doc.moveDown(0.5);
    
    // Horizontal Line
    doc.moveTo(40, 105).lineTo(555, 105).lineWidth(1.5).strokeColor(primaryColor).stroke();

    // Photo Box & Personal Details Grid
    const detailsTop = 120;
    
    // Photo on the right (x: 420, y: 120, width: 110, height: 130)
    doc.rect(420, detailsTop, 110, 130).lineWidth(1).strokeColor(primaryColor).stroke();
    if (localPhotoPath) {
      try {
        doc.image(localPhotoPath, 422, detailsTop + 2, { fit: [106, 126], align: "center", valign: "center" });
      } catch (err) {
        doc.fontSize(8).fillColor("#888").text("Passport Photo", 420, detailsTop + 55, { width: 110, align: "center" });
      }
    } else {
      doc.fontSize(8).fillColor("#888").text("PASSPORT PHOTO\nREQUIRED", 420, detailsTop + 50, { width: 110, align: "center" });
    }

    // Candidate details on the left (x: 40 to 400)
    doc.fontSize(11).fillColor(darkTextColor).font("Helvetica-Bold").text("CANDIDATE DETAILS", 40, detailsTop);
    
    let y = detailsTop + 20;
    const drawField = (label: string, value: string) => {
      doc.fontSize(9.5).font("Helvetica-Bold").fillColor(primaryColor).text(label, 40, y, { width: 140 });
      doc.fontSize(9.5).font("Helvetica").fillColor(darkTextColor).text(`:  ${value}`, 180, y, { width: 230 });
      y += 20;
    };

    drawField("Candidate Name", candidate.fullName.toUpperCase());
    drawField("Hall Ticket ID", app.hallTicketNumber || "PENDING");
    drawField("Application / Candidate ID", candidate.candidateCode);
    drawField("Specialization", specialityName.toUpperCase());
    drawField("Segment", batch?.segment ? batch.segment.toUpperCase() : "GENERAL");
    drawField("Batch Assigned", batchName);

    // Exam Details Card Box
    y = 265;
    doc.rect(40, y, 515, 65).fillColor("#F5F8FC").fill().strokeColor(borderLight).lineWidth(1).stroke();
    
    // Details
    doc.fontSize(10).fillColor(primaryColor).font("Helvetica-Bold").text("EXAMINATION SCHEDULE & VENUE", 50, y + 8);
    
    // Grid inside Card Box
    doc.fontSize(9).font("Helvetica-Bold").fillColor(darkTextColor).text("Date of Exam", 50, y + 25);
    doc.font("Helvetica").text(batchDateStr, 50, y + 37);

    doc.fontSize(9).font("Helvetica-Bold").text("Reporting Time", 180, y + 25);
    doc.font("Helvetica").text(batchTime, 180, y + 37);

    doc.fontSize(9).font("Helvetica-Bold").text("Examination Venue", 310, y + 25);
    doc.font("Helvetica").text(venue, 310, y + 37, { width: 230 });

    // Notice Box (Warning)
    y = 345;
    doc.rect(40, y, 515, 55).fillColor("#FFF3F3").fill().strokeColor(accentColor).lineWidth(1.5).stroke();
    doc.fontSize(9.5).fillColor(accentColor).font("Helvetica-Bold").text("CRITICAL ADMISSION REQUIREMENT", 50, y + 8);
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#333").text(
      "IMPORTANT: Candidates must bring an ORIGINAL Government-issued Photo ID card (Aadhaar, Passport, Driving License, or Voter ID). Photocopies / Xerox copies will NOT be accepted under any circumstances.",
      50, y + 21, { width: 495 }
    );

    // General Instructions
    y = 415;
    doc.fontSize(10).fillColor(primaryColor).font("Helvetica-Bold").text("GENERAL INSTRUCTIONS FOR CANDIDATES", 40, y);
    
    const instructions = [
      "Candidates should report at the venue strictly as per the Reporting Time mentioned above.",
      "This Admit Card must be presented at the registration desk for verification along with valid ID proof.",
      "Electronic items, mobile phones, smartwatches, and study materials are strictly prohibited in the exam hall.",
      "Candidates are requested to sign the attendance sheet and obtain invigilator signatures on this Admit Card."
    ];
    
    y += 15;
    instructions.forEach((inst, idx) => {
      doc.fontSize(8.5).font("Helvetica").fillColor(darkTextColor).text(`${idx + 1}.`, 40, y, { width: 15 });
      doc.fontSize(8.5).font("Helvetica").fillColor(darkTextColor).text(inst, 55, y, { width: 500 });
      y += 15;
    });

    // Unified Signature Matrix Box
    y = 505;
    doc.fontSize(10).fillColor(primaryColor).font("Helvetica-Bold").text("VERIFICATION & SIGNATURE MATRIX", 40, y);
    
    // Draw table grid
    y += 15;
    // Box 1: MCQ Exam Signature
    doc.rect(40, y, 165, 75).strokeColor(borderLight).lineWidth(1).stroke();
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(darkTextColor).text("MCQ Exam Invigilator", 45, y + 8, { align: "center", width: 155 });
    doc.rect(55, y + 25, 135, 35).dash(3, { space: 3 }).stroke();
    doc.fontSize(7.5).font("Helvetica").fillColor("#888").text("Signature Box", 55, y + 37, { align: "center", width: 135 });
    doc.undash();

    // Box 2: Psychometry Exam Signature
    doc.rect(215, y, 165, 75).strokeColor(borderLight).lineWidth(1).stroke();
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(darkTextColor).text("Psychometry Invigilator", 220, y + 8, { align: "center", width: 155 });
    doc.rect(230, y + 25, 135, 35).dash(3, { space: 3 }).stroke();
    doc.fontSize(7.5).font("Helvetica").fillColor("#888").text("Signature Box", 230, y + 37, { align: "center", width: 135 });
    doc.undash();

    // Box 3: Candidate Signature
    doc.rect(390, y, 165, 75).strokeColor(borderLight).lineWidth(1).stroke();
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(darkTextColor).text("Candidate Signature", 395, y + 8, { align: "center", width: 155 });
    doc.rect(405, y + 25, 135, 35).dash(3, { space: 3 }).stroke();
    doc.fontSize(7.5).font("Helvetica").fillColor("#888").text("Sign in presence of staff", 405, y + 37, { align: "center", width: 135 });
    doc.undash();

    // Specialization panel doctor signature boxes (4 boxes as required)
    y += 90;
    doc.fontSize(10).fillColor(primaryColor).font("Helvetica-Bold").text(`PANEL INTERVIEW EVALUATORS - ${specialityName.toUpperCase()}`, 40, y);
    
    y += 15;
    const boxWidth = 115;
    const boxGap = 18;
    for (let docIdx = 1; docIdx <= 4; docIdx++) {
      const x = 40 + (docIdx - 1) * (boxWidth + boxGap);
      doc.rect(x, y, boxWidth, 75).strokeColor(borderLight).lineWidth(1).stroke();
      doc.fontSize(8.5).font("Helvetica-Bold").fillColor(darkTextColor).text(`Panel Evaluator ${docIdx}`, x + 5, y + 8, { align: "center", width: boxWidth - 10 });
      doc.rect(x + 12, y + 25, boxWidth - 24, 35).dash(3, { space: 3 }).stroke();
      doc.fontSize(7.5).font("Helvetica").fillColor("#888").text("Signature", x + 12, y + 37, { align: "center", width: boxWidth - 24 });
      doc.undash();
    }

    doc.end();
  } catch (error: any) {
    console.error("Hall ticket PDF generation failed:", error);
    res.status(500).json({ error: "Failed to generate Hall Ticket PDF", details: error.message });
  }
});

// Combined Admit Card / Hall Ticket PDF generation for a candidate
router.get("/candidates/:id/hall-ticket", requireAuth, async (req, res) => {
  const candidateId = Number(req.params.id);
  try {
    // 1. Fetch candidate
    const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });

    // 2. Fetch all active/approved applications
    let apps = await db.select().from(applicationsTable).where(
      and(
        eq(applicationsTable.candidateId, candidate.id),
        sql`${applicationsTable.status} IN ('approved', 'verified', 'scheduled', 'interviewed', 'completed')`
      )
    );

    if (apps.length === 0) {
      // Dynamic on-the-fly candidate compatibility healing migration
      try {
        const specialities = await db.select().from(specialitiesTable);
        const preferences = await db.select().from(candidatePreferencesTable);
        const allSubmissions = await db.select().from(applicationSubmissionsTable);
        
        // Resolve candidate specializations
        let candSpecs: typeof specialities = [];

        // Try from candidatePreferences
        const candPrefs = preferences.filter(p => p.candidateId === candidate.id);
        if (candPrefs.length > 0) {
          candSpecs = candPrefs
            .map(p => specialities.find(s => s.id === p.specialityId))
            .filter(Boolean) as typeof specialities;
        }

        // Try from submissions
        if (candSpecs.length === 0) {
          const sub = allSubmissions.find(s => s.email?.toLowerCase().trim() === candidate.email?.toLowerCase().trim());
          if (sub && sub.specialization) {
            const specNames = parseSpecializationString(sub.specialization);
            candSpecs = specNames
              .map(name => specialities.find(s => s.name.toLowerCase().trim() === name.toLowerCase().trim()))
              .filter(Boolean) as typeof specialities;
          }
        }

        // Fallback to first available speciality in database
        if (candSpecs.length === 0 && specialities.length > 0) {
          candSpecs = [specialities[0]];
        }

        for (const spec of candSpecs) {
          const existingApp = await db.select().from(applicationsTable).where(
            and(
              eq(applicationsTable.candidateId, candidate.id),
              eq(applicationsTable.specialityId, spec.id)
            )
          );

          if (existingApp.length === 0) {
            const prefix = spec.code ? spec.code.toUpperCase() : "GEN";
            const year = 2026;
            const countResult = await db.execute(sql`
              SELECT COUNT(*)::int as count FROM applications WHERE speciality_id = ${spec.id} AND hall_ticket_number IS NOT NULL
            `);
            const seq = Number(countResult.rows[0]?.count ?? 0) + 1;
            const hallTicketNumber = `${prefix}-${year}-${String(seq).padStart(3, "0")}`;

            await db.insert(applicationsTable).values({
              candidateId: candidate.id,
              specialityId: spec.id,
              hallTicketNumber,
              status: "approved",
            });
            console.log(`[on-the-fly-healed] Created missing application for Candidate: ${candidate.fullName}, Spec: ${spec.name}, HT: ${hallTicketNumber}`);
          }
        }

        // Re-query applications
        apps = await db.select().from(applicationsTable).where(
          and(
            eq(applicationsTable.candidateId, candidate.id),
            sql`${applicationsTable.status} IN ('approved', 'verified', 'scheduled', 'interviewed', 'completed')`
          )
        );
      } catch (err) {
        console.warn(`[on-the-fly-healed] Failed to heal candidate ${candidate.id}:`, err);
      }
    }

    if (apps.length === 0) return res.status(400).json({ error: "No active/approved applications found to print" });

    const specialities = await db.select().from(specialitiesTable);
    const batches = await db.select().from(batchesTable);

    // 3. Find Photo file
    let localPhotoPath: string | null = null;
    const [photoDoc] = await db.select().from(documentsTable).where(
      and(eq(documentsTable.candidateId, candidate.id), eq(documentsTable.docType, "PHOTO"))
    );
    if (photoDoc && photoDoc.fileUrl && photoDoc.fileUrl.startsWith("/objects/uploads/")) {
      const p = path.join(process.cwd(), "uploads", photoDoc.fileUrl.replace("/objects/uploads/", ""));
      try {
        await fs.stat(p);
        localPhotoPath = p;
      } catch {}
    }
    if (!localPhotoPath) {
      const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, candidate.email));
      if (sub && sub.photoUrl && sub.photoUrl.startsWith("/objects/uploads/")) {
        const p = path.join(process.cwd(), "uploads", sub.photoUrl.replace("/objects/uploads/", ""));
        try {
          await fs.stat(p);
          localPhotoPath = p;
        } catch {}
      }
    }

    // 4. Generate PDF Admit Card
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="HallTicket_${candidate.fullName.replace(/\s+/g, "_")}.pdf"`);
    doc.pipe(res);

    // Color Palette
    const primaryColor = "#0B4A8F"; // Deep Navy
    const accentColor = "#D32F2F"; // Notice Red
    const darkTextColor = "#333333";
    const borderLight = "#C5D3E8";

    // Outer Border
    doc.rect(20, 20, 555, 802).lineWidth(1).strokeColor(primaryColor).stroke();
    doc.rect(23, 23, 549, 796).lineWidth(0.5).strokeColor(borderLight).stroke();

    // Branded Header
    doc.fontSize(16).fillColor(primaryColor).font("Helvetica-Bold").text("SANKARA ACADEMY OF VISION", 40, 45, { align: "center" });
    doc.fontSize(10).fillColor("#555555").font("Helvetica").text("Sankara Eye Hospital Campus, Bangalore", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor(primaryColor).font("Helvetica-Bold").text("COMBINED ADMIT CARD / HALL TICKET", { align: "center" });
    doc.moveDown(0.5);
    
    // Horizontal Line
    doc.moveTo(40, 105).lineTo(555, 105).lineWidth(1.5).strokeColor(primaryColor).stroke();

    // Photo Box & Personal Details Grid
    const detailsTop = 120;
    
    // Photo on the right (x: 420, y: 120, width: 110, height: 130)
    doc.rect(420, detailsTop, 110, 130).lineWidth(1).strokeColor(primaryColor).stroke();
    if (localPhotoPath) {
      try {
        doc.image(localPhotoPath, 422, detailsTop + 2, { fit: [106, 126], align: "center", valign: "center" });
      } catch (err) {
        doc.fontSize(8).fillColor("#888").text("Passport Photo", 420, detailsTop + 55, { width: 110, align: "center" });
      }
    } else {
      doc.fontSize(8).fillColor("#888").text("PASSPORT PHOTO\nREQUIRED", 420, detailsTop + 50, { width: 110, align: "center" });
    }

    // Candidate details on the left (x: 40 to 400)
    doc.fontSize(11).fillColor(darkTextColor).font("Helvetica-Bold").text("CANDIDATE DETAILS", 40, detailsTop);
    
    let y = detailsTop + 20;
    const drawField = (label: string, value: string) => {
      doc.fontSize(9.5).font("Helvetica-Bold").fillColor(primaryColor).text(label, 40, y, { width: 140 });
      doc.fontSize(9.5).font("Helvetica").fillColor(darkTextColor).text(`:  ${value}`, 180, y, { width: 230 });
      y += 20;
    };

    drawField("Candidate Name", candidate.fullName.toUpperCase());
    drawField("Candidate Code", candidate.candidateCode);
    drawField("Email Address", candidate.email);
    const hallTicketsList = apps.map(a => a.hallTicketNumber || "PENDING").join(", ");
    drawField("Hall Ticket ID(s)", hallTicketsList);
    const specialitiesList = apps.map(a => {
      const sp = specialities.find(s => s.id === a.specialityId);
      return sp ? sp.name.toUpperCase() : "FELLOWSHIP";
    }).join(", ");
    drawField("Specialization(s)", specialitiesList);

    // Exam Details Card Box
    y = 265;
    doc.fontSize(10).fillColor(primaryColor).font("Helvetica-Bold").text("EXAMINATION SCHEDULE & VENUE", 40, y);
    y += 15;

    const rowHeight = 35;
    // Header
    doc.rect(40, y, 515, 20).fillColor("#0B4A8F").fill();
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#FFFFFF");
    doc.text("Specialization", 45, y + 5, { width: 150 });
    doc.text("Date of Exam", 200, y + 5, { width: 80 });
    doc.text("Reporting Time", 290, y + 5, { width: 80 });
    doc.text("Venue", 380, y + 5, { width: 170 });
    y += 20;

    const formatToDDMMYYYY = (date: Date | string) => {
      const d = new Date(date);
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${day}-${month}-${year}`;
    };

    for (const app of apps) {
      const spec = specialities.find(s => s.id === app.specialityId);
      const specName = spec?.name ?? "Fellowship";
      
      let batch = null;
      if (app.batchId) {
        batch = batches.find(b => b.id === app.batchId) || null;
      } else {
        const [bc] = await db.select().from(batchCandidatesTable).where(eq(batchCandidatesTable.candidateId, candidate.id));
        if (bc) {
          batch = batches.find(b => b.id === bc.batchId) || null;
        }
      }

      const batchDateStr = batch?.date ? formatToDDMMYYYY(batch.date) : "TBD";
      const batchTime = batch?.timing ?? "TBD";
      const venue = batch?.venue ?? "SEH, Bangalore";

      doc.rect(40, y, 515, rowHeight).fillColor(apps.indexOf(app) % 2 === 0 ? "#F9FBFD" : "#FFFFFF").fill();
      doc.rect(40, y, 515, rowHeight).strokeColor(borderLight).lineWidth(0.5).stroke();

      doc.fontSize(8.5).font("Helvetica-Bold").fillColor(darkTextColor).text(specName, 45, y + 8, { width: 150 });
      doc.font("Helvetica").text(batchDateStr, 200, y + 8, { width: 80 });
      doc.text(batchTime, 290, y + 8, { width: 80 });
      doc.text(venue, 380, y + 8, { width: 170 });

      y += rowHeight;
    }

    // Notice Box (Warning)
    y += 10;
    doc.rect(40, y, 515, 45).fillColor("#FFF3F3").fill().strokeColor(accentColor).lineWidth(1).stroke();
    doc.fontSize(9).fillColor(accentColor).font("Helvetica-Bold").text("CRITICAL ADMISSION REQUIREMENT", 50, y + 6);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#333").text(
      "IMPORTANT: Candidates must bring an ORIGINAL Government-issued Photo ID card (Aadhaar, Passport, Driving License, or Voter ID). Photocopies / Xerox copies will NOT be accepted under any circumstances.",
      50, y + 18, { width: 495 }
    );

    // General Instructions
    y += 55;
    doc.fontSize(10).fillColor(primaryColor).font("Helvetica-Bold").text("GENERAL INSTRUCTIONS FOR CANDIDATES", 40, y);
    
    const instructions = [
      "Candidates should report at the venue strictly as per the Reporting Time mentioned above.",
      "This Admit Card must be presented at the registration desk for verification along with valid ID proof.",
      "Electronic items, mobile phones, smartwatches, and study materials are strictly prohibited in the exam hall.",
      "Candidates are requested to sign the attendance sheet and obtain invigilator signatures on this Admit Card."
    ];
    
    y += 15;
    instructions.forEach((inst, idx) => {
      doc.fontSize(8).font("Helvetica").fillColor(darkTextColor).text(`${idx + 1}.`, 40, y, { width: 15 });
      doc.fontSize(8).font("Helvetica").fillColor(darkTextColor).text(inst, 55, y, { width: 500 });
      y += 12;
    });

    // Unified Signature Matrix Box
    y += 10;
    doc.fontSize(10).fillColor(primaryColor).font("Helvetica-Bold").text("VERIFICATION & SIGNATURE MATRIX", 40, y);
    
    y += 15;
    // Box 1: MCQ Exam Signature
    doc.rect(40, y, 165, 60).strokeColor(borderLight).lineWidth(1).stroke();
    doc.fontSize(8).font("Helvetica-Bold").fillColor(darkTextColor).text("MCQ Exam Invigilator", 45, y + 6, { align: "center", width: 155 });
    doc.rect(55, y + 18, 135, 30).dash(3, { space: 3 }).stroke();
    doc.fontSize(7).font("Helvetica").fillColor("#888").text("Signature Box", 55, y + 28, { align: "center", width: 135 });
    doc.undash();

    // Box 2: Psychometry Exam Signature
    doc.rect(215, y, 165, 60).strokeColor(borderLight).lineWidth(1).stroke();
    doc.fontSize(8).font("Helvetica-Bold").fillColor(darkTextColor).text("Psychometry Invigilator", 220, y + 6, { align: "center", width: 155 });
    doc.rect(230, y + 18, 135, 30).dash(3, { space: 3 }).stroke();
    doc.fontSize(7).font("Helvetica").fillColor("#888").text("Signature Box", 230, y + 28, { align: "center", width: 135 });
    doc.undash();

    // Box 3: Candidate Signature
    doc.rect(390, y, 165, 60).strokeColor(borderLight).lineWidth(1).stroke();
    doc.fontSize(8).font("Helvetica-Bold").fillColor(darkTextColor).text("Candidate Signature", 395, y + 6, { align: "center", width: 155 });
    doc.rect(405, y + 18, 135, 30).dash(3, { space: 3 }).stroke();
    doc.fontSize(7).font("Helvetica").fillColor("#888").text("Sign in presence of staff", 405, y + 28, { align: "center", width: 135 });
    doc.undash();

    // Specialization panel doctor signature boxes (Dynamic page breaks if overflow)
    y += 75;
    
    // For each specialization, render signature block
    for (const app of apps) {
      const spec = specialities.find(s => s.id === app.specialityId);
      const specName = spec?.name ?? "Fellowship";
      
      if (y > 700) {
        doc.addPage();
        // Outer Border for second page
        doc.rect(20, 20, 555, 802).lineWidth(1).strokeColor(primaryColor).stroke();
        doc.rect(23, 23, 549, 796).lineWidth(0.5).strokeColor(borderLight).stroke();
        y = 40;
      }

      doc.fontSize(9).fillColor(primaryColor).font("Helvetica-Bold").text(`PANEL EVALUATORS - ${specName.toUpperCase()}`, 40, y);
      y += 12;

      const boxWidth = 115;
      const boxGap = 18;
      for (let docIdx = 1; docIdx <= 4; docIdx++) {
        const x = 40 + (docIdx - 1) * (boxWidth + boxGap);
        doc.rect(x, y, boxWidth, 60).strokeColor(borderLight).lineWidth(1).stroke();
        doc.fontSize(8).font("Helvetica-Bold").fillColor(darkTextColor).text(`Panel Evaluator ${docIdx}`, x + 5, y + 6, { align: "center", width: boxWidth - 10 });
        doc.rect(x + 12, y + 18, boxWidth - 24, 30).dash(3, { space: 3 }).stroke();
        doc.fontSize(7).font("Helvetica").fillColor("#888").text("Signature", x + 12, y + 28, { align: "center", width: boxWidth - 24 });
        doc.undash();
      }
      y += 80;
    }

    doc.end();
  } catch (error: any) {
    console.error("Combined hall ticket PDF generation failed:", error);
    res.status(500).json({ error: "Failed to generate Combined Hall Ticket PDF", details: error.message });
  }
});

export default router;
