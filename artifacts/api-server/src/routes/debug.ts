import { Router } from "express";
import { 
  db, usersTable, candidatesTable, applicationFormsTable, programsTable, 
  applicationSubmissionsTable, batchesTable, batchCandidatesTable, 
  seatMatrixEntriesTable, globalSettingsTable, examsTable, questionsTable,
  interviewPanelsTable, interviewPanelMembersTable, unitsTable,
  applicationsTable, candidatePreferencesTable, interviewScoresTable, 
  doctorAssignmentsTable, doctorPanelStatusTable, panelQueueTable, 
  examAttemptsTable, candidateExamAssignmentsTable, specialitiesTable
} from "@workspace/db";
import { eq, sql, ilike } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireAuth, requireRole } from "../middleware/auth";
import { comparePassword, hashPassword } from "../lib/auth";
import { DEFAULT_SECTIONS } from "../lib/default-sections";

const router = Router();

async function runSeed() {
  const hp = await hashPassword("admin123");

  // 1. Create Units
  const unitNames = ["Bengaluru", "Coimbatore", "Chennai", "Ludhiana", "Jaipur"];
  const units = [];
  for (const name of unitNames) {
    const [u] = await db.insert(unitsTable).values({
      name, city: name, location: `${name} Main Road`, isMock: true
    }).returning();
    units.push(u);
  }

  // 2. Create Staff Users (10 Doctors + others)
  const doctors = [
    { name: "Dr. Arun Kumar", email: "arun@sankara.com", unitId: units[0].id },
    { name: "Dr. Meena Iyer", email: "meena@sankara.com", unitId: units[1].id },
    { name: "Dr. Rajesh Shah", email: "rajesh@sankara.com", unitId: units[2].id },
    { name: "Dr. Sneha Pillai", email: "sneha_p@sankara.com", unitId: units[0].id },
    { name: "Dr. Vikram Seth", email: "vikram_s@sankara.com", unitId: units[3].id },
    { name: "Dr. Anjali Menon", email: "anjali_m@sankara.com", unitId: units[1].id },
    { name: "Dr. Karthik S", email: "karthik@sankara.com", unitId: units[2].id },
    { name: "Dr. Pooja Hegde", email: "pooja@sankara.com", unitId: units[0].id },
    { name: "Dr. Sunil Gavaskar", email: "sunil@sankara.com", unitId: units[3].id },
    { name: "Dr. Mary Kom", email: "mary@sankara.com", unitId: units[4].id },
  ];

  const doctorUsers = [];
  for (const d of doctors) {
    const [u] = await db.insert(usersTable).values({
      fullName: d.name,
      email: d.email,
      passwordHash: hp,
      role: "doctor",
      unitId: d.unitId ?? null,
      isMock: true,
    }).returning();
    doctorUsers.push(u);
  }

  const otherStaff = [
    { name: "Suresh ExamCoord", email: "suresh@sankara.com", role: "central_exam_coordinator" },
    { name: "Latha ProgramAdmin", email: "latha@sankara.com", role: "program_admin" },
    { name: "Unit Admin BLR", email: "blr@sankara.com", role: "unit_coordinator", unitId: units[0].id },
  ];

  for (const s of otherStaff) {
    await db.insert(usersTable).values({
      fullName: s.name,
      email: s.email,
      passwordHash: hp,
      role: s.role as any,
      unitId: s.unitId ?? null,
      isMock: true,
    });
  }

  // 3. Create Programs & Forms
  const [program] = await db.insert(programsTable).values({
    name: "Fellowship Program July 2026 (Mock)",
    code: `MOCK-${Date.now()}`,
    academicYear: "2026",
    description: "MOCK: Advanced surgical fellowship in various ophthalmology specialities.",
    isMock: true,
  }).returning();

  const [form] = await db.insert(applicationFormsTable).values({
    programId: program.id,
    title: "July 2026 Admissions Form (Mock)",
    token: `MOCK-FORM-${Date.now()}`,
    deadline: new Date("2026-06-30"),
    isActive: true,
  }).returning();

  // 4. Create Seat Matrix
  const specs = ["Vitreo Retina", "Medical Retina", "Cornea", "Glaucoma", "Oculoplasty", "Paediatric"];
  for (const spec of specs) {
    for (const unit of units) {
      await db.insert(seatMatrixEntriesTable).values({
        programId: program.id,
        speciality: spec,
        unitName: unit.name,
        totalSeats: Math.floor(Math.random() * 3) + 1,
      });
    }
  }

  // 5. Create Exams & Questions
  const [exam] = await db.insert(examsTable).values({
    title: "July 2026 Entrance MCQ (Mock)",
    kind: "mcq",
    programId: program.id,
    durationMinutes: 60,
    totalQuestions: 5,
    active: true,
    isMock: true,
  }).returning();

  for (let i = 1; i <= 5; i++) {
    await db.insert(questionsTable).values({
      examId: exam.id,
      text: `Question ${i}: Which of the following is related to eye anatomy?`,
      choices: ["Retina", "Liver", "Heart", "Lungs"],
      correctIndex: 0,
    });
  }

  // 6. Create Interview Panels
  const panelNames = ["Panel A (Retina)", "Panel B (Cornea)", "Panel C (General)"];
  const rooms = ["Room 101", "Room 102", "Conference Room 1"];
  const panels = [];
  for (let i = 0; i < 3; i++) {
    const [p] = await db.insert(interviewPanelsTable).values({
      name: panelNames[i],
      roomNumber: rooms[i],
      programId: program.id,
      isActive: true,
      isMock: true,
    }).returning();
    panels.push(p);

    for (let j = 0; j < 2; j++) {
      await db.insert(interviewPanelMembersTable).values({
        panelId: p.id,
        doctorId: doctorUsers[(i * 2 + j) % doctorUsers.length].id,
        isMain: j === 0
      });
    }
  }

  // 7. Create Candidates & Submissions
  const candidates = [
    "Rahul Sharma", "Priya Patel", "Amit Singh", "Sneha Reddy", "Vikram Malhotra",
    "Anjali Gupta", "Siddharth Jain", "Kavita Rao", "Vikash Verma", "Deepika P",
    "Ranveer Singh", "Alia Bhatt", "Varun Dhawan", "Kriti Sanon", "Ayushmann K"
  ];

  const [batch] = await db.insert(batchesTable).values({
    programId: program.id,
    name: "Main Entrance Batch (Mock)",
    date: new Date("2026-07-01"),
    timing: "10:00 AM",
    isMock: true,
  }).returning();

  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i];
    const email = `${name.toLowerCase().replace(/\s/g, '.')}@test.com`;
    const [cand] = await db.insert(candidatesTable).values({
      fullName: name,
      email,
      candidateCode: `C-26-${100 + i}`,
      status: "approved",
      isMock: true,
    }).returning();

    await db.insert(applicationSubmissionsTable).values({
      formId: form.id,
      status: "approved",
      fullName: name,
      email,
      specialization: specs[i % specs.length],
      centerPreference: JSON.stringify({ [specs[i % specs.length]]: units[i % units.length].name }),
      submittedAt: new Date(),
      isMock: true,
    });

    await db.insert(batchCandidatesTable).values({
      batchId: batch.id,
      candidateId: cand.id,
      status: "assigned",
    });

    if (i < 9) {
      const panelIdx = i % panels.length;
      await db.execute(sql`
        INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status)
        VALUES (${panels[panelIdx].id}, ${cand.id}, ${Math.floor(i/3) + 1}, 'waiting')
      `);
    }
  }
}


async function runSeedDemo() {
  const hp = await hashPassword("admin123");

  // 1. Wipe database (selective, keep super_admins to preserve active session)
  await db.execute(sql`
    TRUNCATE TABLE 
      viva_score_overrides,
      interview_scores,
      panel_queue,
      doctor_panel_status,
      interview_panel_members,
      interview_panels,
      doctor_assignments,
      exam_answers,
      exam_attempts,
      candidate_exam_assignments,
      questions,
      batch_candidates,
      batches,
      exams,
      applications,
      documents,
      candidate_preferences,
      application_submissions,
      candidates,
      seat_matrix_entries,
      specialities,
      application_forms,
      document_templates,
      programs,
      audit_logs
    CASCADE
  `);
  await db.delete(usersTable).where(sql`role != 'super_admin'`);

  // 2. Create the 13 Units
  const UNITS = [
    "Anand", "Bangalore", "Coimbatore", "Guntur", "Hyderabad",
    "Indore", "Jaipur", "Kanpur", "Krishnankoil", "Ludhiana",
    "Panvel", "Shimoga", "Varanasi",
  ];
  const unitList = [];
  for (const name of UNITS) {
    const [u] = await db.insert(unitsTable).values({
      name, city: name, location: `${name} Main Campus`, isMock: false
    }).returning();
    unitList.push(u);
  }

  // 3. Create 15 Panel Doctors sequentially
  const doctorList = [];
  for (let d = 1; d <= 15; d++) {
    const unitIdx = (d - 1) % unitList.length;
    const [doc] = await db.insert(usersTable).values({
      fullName: `Dr. Doctor ${d}`,
      email: `doctor${d}@sankara.com`,
      passwordHash: hp,
      role: "doctor",
      unitId: unitList[unitIdx].id,
      isMock: false
    }).returning();
    doctorList.push(doc);
  }

  // 4. Create Program & Application Form
  const [program] = await db.insert(programsTable).values({
    name: "Ophthalmology Fellowship Program July 2026",
    code: "FP-JULY-2026",
    academicYear: "2026",
    description: "Advanced surgical fellowship in various ophthalmology subspecialities.",
    isMock: false,
  }).returning();

  const [form] = await db.insert(applicationFormsTable).values({
    programId: program.id,
    title: "July 2026 Admissions Application Form",
    token: "JULY2026",
    deadline: new Date("2026-06-30T23:59:59.000Z"),
    isActive: true,
    sectionsConfig: DEFAULT_SECTIONS as any
  }).returning();

  // 5. Populate specialties and seat matrix exactly matching the 67-seat user matrix
  const MATRIX: Record<string, Record<string, number>> = {
    "Cornea":                  { Bangalore:1, Coimbatore:1, Guntur:3, Jaipur:1, Shimoga:1 },
    "Glaucoma":                { Bangalore:1, Guntur:2, Shimoga:1 },
    "IOL Fellowship":          { Anand:2, Bangalore:1, Coimbatore:1, Guntur:2, Hyderabad:3, Indore:4, Jaipur:2, Kanpur:2, Krishnankoil:4, Ludhiana:4, Panvel:2, Shimoga:1, Varanasi:4 },
    "Medical Retina":          { Bangalore:1, Coimbatore:1, Guntur:3, Jaipur:1, Shimoga:1 },
    "Oculoplasty":             { Bangalore:1, Coimbatore:1, Guntur:1 },
    "Pediatric Ophthalmology": { Bangalore:1, Coimbatore:1, Guntur:1, Shimoga:1 },
    "Phaco Refractive":        { Bangalore:1, Coimbatore:1 },
    "Vitreo Retina":           { Bangalore:3, Coimbatore:1, Guntur:3, Shimoga:1 }
  };

  const specList = [];
  for (const [specialityName, unitSeats] of Object.entries(MATRIX)) {
    const total = Object.values(unitSeats).reduce((a, b) => a + b, 0);
    const code = specialityName.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 4);
    const [spec] = await db.insert(specialitiesTable).values({
      programId: program.id,
      name: specialityName,
      code,
      seats: total
    }).returning();
    specList.push(spec);

    for (const unit of UNITS) {
      const seats = unitSeats[unit] ?? 0;
      await db.insert(seatMatrixEntriesTable).values({
        programId: program.id,
        speciality: specialityName,
        unitName: unit,
        totalSeats: seats,
        allocatedSeats: 0
      });
    }
  }

  // 6. Create MCQ Entrance Exam
  const [exam] = await db.insert(examsTable).values({
    title: "July 2026 Entrance MCQ",
    kind: "mcq",
    programId: program.id,
    durationMinutes: 60,
    totalQuestions: 5,
    active: true,
    isMock: false,
  }).returning();

  for (let i = 1; i <= 5; i++) {
    await db.insert(questionsTable).values({
      examId: exam.id,
      text: `Question ${i}: Which of the following is related to eye anatomy?`,
      choices: ["Retina", "Liver", "Heart", "Lungs"],
      correctIndex: 0,
    });
  }

  // 7. Create Interview Panels and map Doctors
  const panelList = [];
  const specsOrder = ["Cornea", "Glaucoma", "IOL Fellowship", "Medical Retina", "Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive", "Vitreo Retina"];
  for (let pIdx = 0; pIdx < specsOrder.length; pIdx++) {
    const specName = specsOrder[pIdx];
    const specObj = specList.find(s => s.name === specName);
    if (!specObj) continue;

    const [ip] = await db.insert(interviewPanelsTable).values({
      name: `${specName} Panel`,
      roomNumber: `Room 10${pIdx + 1}`,
      programId: program.id,
      specialityId: specObj.id,
      isActive: true,
      isMock: false
    }).returning();
    panelList.push(ip);

    const doc1 = doctorList[(pIdx * 2) % doctorList.length];
    const doc2 = doctorList[(pIdx * 2 + 1) % doctorList.length];

    await db.insert(interviewPanelMembersTable).values({ panelId: ip.id, doctorId: doc1.id, isMain: true });
    await db.insert(interviewPanelMembersTable).values({ panelId: ip.id, doctorId: doc2.id, isMain: false });
  }

  // 8. Create 30 highly realistic candidates
  const candidateNames = [
    "Aditya Vardhan", "Bhavana Rao", "Chaitanya Krishna", "Divya Teja", "Eshwar Prasad",
    "Gautami Nair", "Hari Prasad", "Indira Priyadarshini", "Jayadeep Singh", "Kalyani Sen",
    "Lokesh Rahul", "Meenakshi Iyer", "Naveen Chandra", "Ojaswi Sharma", "Pranati Gosh",
    "Rahul Dravid", "Srinivas Raju", "Tejaswini Reddy", "Uday Kiran", "Venkatesh Prasad",
    "Waman Prabhu", "Yashwanth Gowda", "Zoya Akhtar", "Amitav Ghosh", "Balaji Naidu",
    "Charu Lata", "Deepak Chopra", "Elisa George", "Faisal Khan", "Ganesh Hegde"
  ];

  const [batch] = await db.insert(batchesTable).values({
    programId: program.id,
    name: "July 2026 Main Interview Batch",
    date: new Date("2026-07-01T09:00:00.000Z"),
    timing: "09:00 AM",
    venue: "Bengaluru Main Campus",
    isMock: false,
  }).returning();

  for (let i = 0; i < candidateNames.length; i++) {
    const name = candidateNames[i];
    const email = `cand${i+1}@test.com`;
    const candCode = `SAV-2026-${1000 + i + 1}`;
    
    const isCompleted = i < 22;
    const candStatus = isCompleted ? "interview_completed" : "approved";

    const mcqScoreVal = 65 + (i * 3 + 7) % 31; 
    const psyScoreVal = 70 + (i * 2 + 3) % 26; 

    const [cand] = await db.insert(candidatesTable).values({
      fullName: name,
      email,
      candidateCode: candCode,
      phone: `98765432${(10 + i).toString().slice(-2)}`,
      dateOfBirth: `1998-05-${(10 + (i % 20)).toString().padStart(2, "0")}`,
      gender: i % 2 === 0 ? "Male" : "Female",
      qualification: "MS Ophthalmology",
      collegeName: "All India Institute of Medical Sciences",
      status: candStatus,
      mcqScore: mcqScoreVal.toString(),
      psychometricScore: psyScoreVal.toString(),
      isMock: false
    }).returning();

    let prefSpecs = [];
    if (i % 3 === 0) {
      prefSpecs = ["Vitreo Retina", "Medical Retina"];
    } else if (i % 3 === 1) {
      prefSpecs = ["IOL Fellowship", "Cornea", "Glaucoma"];
    } else {
      prefSpecs = ["Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive"];
    }

    const prefSpecIds = [];
    const centerPrefsMap: Record<string, string[]> = {};

    for (let pOrder = 0; pOrder < prefSpecs.length; pOrder++) {
      const specName = prefSpecs[pOrder];
      const specObj = specList.find(s => s.name === specName);
      if (!specObj) continue;
      prefSpecIds.push(specObj.id);

      await db.insert(candidatePreferencesTable).values({
        candidateId: cand.id,
        specialityId: specObj.id,
        preferenceOrder: pOrder + 1
      });

      await db.insert(applicationsTable).values({
        candidateId: cand.id,
        specialityId: specObj.id,
        hallTicketNumber: `HT-${specObj.code}-${1000 + cand.id}`,
        status: candStatus,
        batchId: batch.id,
        interviewSlot: "10:00 AM - 12:00 PM"
      });

      const availableUnits = Object.keys(MATRIX[specName]).filter(unit => MATRIX[specName][unit] > 0);
      centerPrefsMap[specName] = availableUnits.slice(0, 3);
    }

    await db.insert(applicationSubmissionsTable).values({
      formId: form.id,
      candidateId: cand.id,
      status: "approved",
      fullName: name,
      email,
      phone: cand.phone,
      dateOfBirth: cand.dateOfBirth,
      gender: cand.gender,
      degree: cand.qualification,
      medicalCollege: cand.collegeName,
      specialization: prefSpecs[0],
      centerPreference: JSON.stringify(centerPrefsMap),
      declarationAccepted: true,
      readyForReview: true,
      paymentId: `pay_mock_${cand.id}`,
      paidAmount: 1500,
      photoUrl: `/objects/demo-photo.jpg`,
      lor1Url: `/objects/demo-lor.jpg`,
      lor2Url: `/objects/demo-lor.jpg`,
      isMock: false,
      submittedAt: new Date(Date.now() - (30 - i) * 24 * 3600 * 1000)
    });

    await db.insert(examAttemptsTable).values({
      candidateId: cand.id,
      examId: exam.id,
      score: mcqScoreVal,
      maxScore: 100,
      startedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      submittedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000 + 3600 * 1000)
    });

    await db.insert(batchCandidatesTable).values({
      batchId: batch.id,
      candidateId: cand.id,
      status: "assigned"
    });

    if (isCompleted) {
      for (const specId of prefSpecIds) {
        const panelObj = panelList.find(p => p.specialityId === specId);
        if (!panelObj) continue;

        const members = await db.select().from(interviewPanelMembersTable).where(eq(interviewPanelMembersTable.panelId, panelObj.id));
        
        let scoreIndex = 0;
        for (const member of members) {
          const docScore = 70 + ((i + scoreIndex) * 7 + 13) % 26;
          await db.insert(interviewScoresTable).values({
            candidateId: cand.id,
            doctorId: member.doctorId,
            specialityId: specId,
            score: docScore,
            remarks: "Highly passionate and possesses excellent clinical aptitude."
          });
          scoreIndex++;
        }
      }
    } else {
      for (const specId of prefSpecIds) {
        const panelObj = panelList.find(p => p.specialityId === specId);
        if (!panelObj) continue;
        await db.insert(panelQueueTable).values({
          panelId: panelObj.id,
          candidateId: cand.id,
          queuePosition: i - 21,
          status: "waiting"
        }).onConflictDoNothing();
      }
    }
  }
}

// Get mock mode status
router.get("/debug/mock-mode", requireAuth, async (req, res) => {
  const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, "mock_mode"));
  res.json({ enabled: setting?.value === "true" });
});

router.post("/debug/toggle-mock", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, "mock_mode"));
    const currentlyEnabled = setting?.value === "true";
    const newState = !currentlyEnabled;

    if (newState) {
      // If enabling, check if we need to seed
      const [existingMock] = await db.select().from(programsTable).where(eq(programsTable.isMock, true)).limit(1);
      if (!existingMock) {
        await runSeed();
      }
    }

    await db.update(globalSettingsTable).set({ value: newState.toString(), updatedAt: new Date() }).where(eq(globalSettingsTable.key, "mock_mode"));
    res.json({ enabled: newState, message: `Mock Mode ${newState ? 'Enabled (Live data hidden)' : 'Disabled (Live data restored)'}.` });
  } catch (error) {
    logger.error({ error }, "Toggle mock failed");
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/debug/seed", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    logger.info("Manual seed requested");
    await runSeed();
    await db.update(globalSettingsTable).set({ value: "true", updatedAt: new Date() }).where(eq(globalSettingsTable.key, "mock_mode"));
    res.json({ message: "Successfully seeded mock data." });
  } catch (error) {
    logger.error({ error }, "Seed failed");
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/debug/init-july-2026", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    // 1. Create Program
    const [program] = await db.insert(programsTable).values({
      name: "Fellowship Program July 2026",
      code: "FP-JULY-2026",
      academicYear: "2026",
      description: "Advanced surgical fellowship in various ophthalmology sub-specialities for the July 2026 cycle.",
      isMock: false
    }).returning();

    // 2. Create Application Form
    const [form] = await db.insert(applicationFormsTable).values({
      programId: program.id,
      title: "July 2026 Admissions Application Form",
      token: "JULY2026",
      deadline: new Date("2026-06-15"),
      isActive: true,
      sectionsConfig: DEFAULT_SECTIONS as any
    }).returning();

    // 3. Populate Seat Matrix (Live)
    const liveUnits = await db.select().from(unitsTable).where(eq(unitsTable.isMock, false));
    const subspecialties = ["Cornea", "Glaucoma", "IOL", "Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive", "Medical Retina", "Vitreo Retina"];

    if (liveUnits.length === 0) {
       const defaultUnits = ["Bangalore", "Coimbatore", "Guntur", "Jaipur", "Shimoga", "Ludhiana", "Panvel", "Chennai"];
       for (const name of defaultUnits) {
         await db.insert(unitsTable).values({ name, city: name, isMock: false });
       }
    }

    const updatedLiveUnits = await db.select().from(unitsTable).where(eq(unitsTable.isMock, false));
    for (const spec of subspecialties) {
      for (const unit of updatedLiveUnits) {
        await db.insert(seatMatrixEntriesTable).values({
          programId: program.id,
          speciality: spec,
          unitName: unit.name,
          totalSeats: 2 
        });
      }
    }

    res.json({ message: "July 2026 Live Environment Initialized Successfully." });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post("/debug/reset-database", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const { password } = req.body as { password?: string };
    if (!password) return res.status(400).json({ error: "Password required" });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Safely wipe all application, candidate, interview, exam and batch data using cascading truncate
    await db.execute(sql`
      TRUNCATE TABLE 
        viva_score_overrides,
        interview_scores,
        panel_queue,
        doctor_panel_status,
        interview_panel_members,
        interview_panels,
        doctor_assignments,
        exam_answers,
        exam_attempts,
        candidate_exam_assignments,
        questions,
        batch_candidates,
        batches,
        exams,
        applications,
        documents,
        candidate_preferences,
        application_submissions,
        candidates,
        seat_matrix_entries,
        specialities,
        application_forms,
        document_templates,
        programs,
        audit_logs
      CASCADE
    `);

    // Clean up non-super-admin users
    await db.delete(usersTable).where(sql`role != 'super_admin'`);

    // Reset mock mode to false
    await db.update(globalSettingsTable).set({ value: "false", updatedAt: new Date() }).where(eq(globalSettingsTable.key, "mock_mode"));

    res.json({ message: "Database completely reset. All candidate and examination data has been wiped." });
  } catch (error) {
    console.error("[reset-database] Error:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
