import { 
  readDb, 
  candidatesTable, 
  candidatePreferencesTable, 
  examAttemptsTable, 
  examsTable, 
  interviewScoresTable, 
  specialitiesTable, 
  globalSettingsTable,
  applicationSubmissionsTable,
  vivaScoreOverridesTable,
} from "@workspace/db";
import { eq, inArray, or, sql } from "drizzle-orm";

export type CandidateScore = {
  candidateId: number;
  candidateCode: string;
  fullName: string;
  mcqScore: number;
  psychometricScore: number;
  interviewScore: number; // Candidate's highest average interview score
  totalScore: number;     // Candidate's highest aggregate merit score
  preferenceSpecIds: number[];
  overallRank: number;
  specialityRanks: Record<number, number>; // specialityId -> rank
  specialityScores: Record<number, number>; // specialityId -> score
  specialityInterviewScores: Record<number, number>; // specialityId -> average interview score
  specialityVivaStatus: Record<number, "complete" | "pending" | "override">; // specialityId -> status
  specialityEnabledDoctorCount: Record<number, number>; // specialityId -> count
  segmentRanks: Record<string, number>; // segmentName -> rank
  preferredLocations: Record<number, string[]>; // specialityId -> ordered locations
  appliedAt: string;
};

// Map speciality to segment
export function getSpecialitySegment(specName: string): "Retina" | "Anterior" {
  const lower = specName.toLowerCase();
  if (lower.includes("retina") || lower.includes("vitreo")) {
    return "Retina";
  }
  return "Anterior";
}


export async function computeScoresForProgram(programId: number): Promise<CandidateScore[]> {
  const specs = await readDb.select().from(specialitiesTable).where(eq(specialitiesTable.programId, programId));
  const programSpecIds = specs.map((s) => s.id);
  const programSpecSet = new Set(programSpecIds);

  if (programSpecIds.length === 0) return [];

  const prefs = await readDb.select().from(candidatePreferencesTable).where(inArray(candidatePreferencesTable.specialityId, programSpecIds));
  const candidateIds = [...new Set(prefs.map((p) => p.candidateId))];

  if (candidateIds.length === 0) return [];

  const candidates = await readDb.select().from(candidatesTable).where(inArray(candidatesTable.id, candidateIds));
  const exams = await readDb.select().from(examsTable);
  const attempts = await readDb.select().from(examAttemptsTable).where(inArray(examAttemptsTable.candidateId, candidateIds));
  const interviews = await readDb.select().from(interviewScoresTable).where(inArray(interviewScoresTable.candidateId, candidateIds));
  const overrides = await readDb.select().from(vivaScoreOverridesTable).where(inArray(vivaScoreOverridesTable.candidateId, candidateIds));
  
  const emails = candidates.map(c => c.email.toLowerCase().trim()).filter(Boolean);
  const submissions = emails.length > 0 
    ? await readDb.select().from(applicationSubmissionsTable).where(
      or(
        inArray(applicationSubmissionsTable.candidateId, candidateIds),
        inArray(sql`LOWER(email)`, emails)
      )
    )
    : await readDb.select().from(applicationSubmissionsTable).where(inArray(applicationSubmissionsTable.candidateId, candidateIds));

  const result: CandidateScore[] = [];

  const panelQuery = await readDb.execute(sql`
    SELECT ip.id, ip.name, ip.room_number, ip.speciality_id, ip.is_mind_matter, ipm.doctor_id
    FROM interview_panels ip
    LEFT JOIN interview_panel_members ipm ON ip.id = ipm.panel_id
  `);
  const allPanels = panelQuery.rows as Array<Record<string, any>>;

  const isMindMatterScore = (s: { doctorId: number; specialityId: number | null }) => {
    if (s.specialityId === null || s.specialityId === undefined) return true;
    return allPanels.some(panel => panel.doctor_id === s.doctorId && panel.is_mind_matter === true);
  };

  // ── Multi-doctor averaging: load marks_entry_enabled doctors once ─────────
  // Build a set of enabled doctor IDs per speciality so the averaging step
  // only counts scores from enabled doctors (not all panel members).
  const enabledDoctorsRaw = (await readDb.execute(sql`
    SELECT ipm.doctor_id, ip.speciality_id
    FROM interview_panel_members ipm
    JOIN interview_panels ip ON ip.id = ipm.panel_id
    WHERE ipm.marks_entry_enabled = TRUE AND ip.is_mind_matter = FALSE
  `)).rows as Array<{ doctor_id: number; speciality_id: number | null }>;

  // enabledDoctorsPerSpec: specialityId → Set<doctorId>
  const enabledDoctorsPerSpec = new Map<number | null, Set<number>>();
  for (const row of enabledDoctorsRaw) {
    const key = row.speciality_id;
    if (!enabledDoctorsPerSpec.has(key)) enabledDoctorsPerSpec.set(key, new Set());
    enabledDoctorsPerSpec.get(key)!.add(row.doctor_id);
  }

  const isEnabledForSpec = (doctorId: number, specId: number | null): boolean => {
    const set = enabledDoctorsPerSpec.get(specId);
    return set ? set.has(doctorId) : false;
  };
  // ─────────────────────────────────────────────────────────────────────────

  // Build high performance indexing maps to replace linear search operations
  const prefsByCandidate = new Map<number, typeof prefs>();
  for (const p of prefs) {
    if (!prefsByCandidate.has(p.candidateId)) {
      prefsByCandidate.set(p.candidateId, []);
    }
    prefsByCandidate.get(p.candidateId)!.push(p);
  }

  const attemptsByCandidate = new Map<number, typeof attempts>();
  for (const a of attempts) {
    if (!attemptsByCandidate.has(a.candidateId)) {
      attemptsByCandidate.set(a.candidateId, []);
    }
    attemptsByCandidate.get(a.candidateId)!.push(a);
  }

  const interviewsByCandidate = new Map<number, typeof interviews>();
  for (const i of interviews) {
    if (!interviewsByCandidate.has(i.candidateId)) {
      interviewsByCandidate.set(i.candidateId, []);
    }
    interviewsByCandidate.get(i.candidateId)!.push(i);
  }

  const submissionsByCandidate = new Map<number, typeof submissions[0]>();
  const submissionsByEmail = new Map<string, typeof submissions[0]>();
  for (const s of submissions) {
    if (s.candidateId) submissionsByCandidate.set(s.candidateId, s);
    if (s.email) submissionsByEmail.set(s.email.toLowerCase().trim(), s);
  }

  const examsMap = new Map(exams.map((e) => [e.id, e]));

  // Compute Candidate Scores & specialty-specific values
  for (const c of candidates) {
    const candPrefs = (prefsByCandidate.get(c.id) || [])
      .filter((p) => programSpecSet.has(p.specialityId))
      .sort((a, b) => a.preferenceOrder - b.preferenceOrder);
    if (candPrefs.length === 0) continue;

    // MCQ & Psychometric Exam Averages
    const candAttempts = (attemptsByCandidate.get(c.id) || []).filter((a) => a.submittedAt != null);
    const mcqs = candAttempts.filter((a) => examsMap.get(a.examId)?.kind === "mcq");
    const psychos = candAttempts.filter((a) => examsMap.get(a.examId)?.kind?.startsWith("psychometric"));

    const mcqScore = mcqs.length > 0 ? mcqs.reduce((sum, a) => sum + (a.score ?? 0), 0) / mcqs.length : (Number(c.mcqScore) || 0);

    // Compute candidate-wide Mind Matter score based on direct psychometric score or doctor Mind Matter panel entries
    const candInterviews = interviewsByCandidate.get(c.id) || [];
    const mmInterviews = candInterviews.filter((i) => isMindMatterScore(i));
    const avgMindMatter = mmInterviews.length > 0
      ? mmInterviews.reduce((sum, i) => sum + i.score, 0) / mmInterviews.length
      : null;

    const psychoScore = avgMindMatter !== null
      ? avgMindMatter
      : (psychos.length > 0 ? psychos.reduce((sum, a) => sum + (a.score ?? 0), 0) / psychos.length : (Number(c.psychometricScore) || 0));

    // Handle multiple submissions by selecting the LATEST submission by submittedAt
    const sub = submissionsByCandidate.get(c.id) || (c.email ? submissionsByEmail.get(c.email.toLowerCase().trim()) : null);

    const appliedAt = sub?.submittedAt ? sub.submittedAt.toISOString() : (c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString());

    // Parse location preferences from submission centerPreference
    const preferredLocations: Record<number, string[]> = {};
    let parsedCp: Record<string, any> = {};
    if (sub?.centerPreference) {
      try {
        parsedCp = JSON.parse(sub.centerPreference);
      } catch {}
    }

    const specialityScores: Record<number, number> = {};
    const specialityInterviewScores: Record<number, number> = {};
    const specialityVivaStatus: Record<number, "complete" | "pending" | "override"> = {};
    const specialityEnabledDoctorCount: Record<number, number> = {};

    let maxTotalScore = 0;
    let maxInterviewScore = 0;

    for (const p of candPrefs) {
      const spec = specs.find(s => s.id === p.specialityId);
      if (!spec) continue;

      let locations: string[] = [];
      let rawLocVal: any = null;

      if (parsedCp && parsedCp[spec.name]) {
        rawLocVal = parsedCp[spec.name];
      } else if (sub?.centerPreference) {
        try {
          const directParsed = JSON.parse(sub.centerPreference);
          if (directParsed && typeof directParsed === "object" && !Array.isArray(directParsed)) {
            rawLocVal = directParsed[spec.name];
          } else {
            rawLocVal = sub.centerPreference;
          }
        } catch {
          rawLocVal = sub.centerPreference;
        }
      }

      if (!rawLocVal) {
        const customUnitKey = `unit_${spec.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
        rawLocVal = sub?.customAnswers?.[customUnitKey];
      }

      if (rawLocVal) {
        if (Array.isArray(rawLocVal)) {
          locations = rawLocVal;
        } else if (typeof rawLocVal === "string") {
          locations = rawLocVal.split(",").map(l => l.trim()).filter(Boolean);
        } else {
          locations = [String(rawLocVal)];
        }
      }
      
      preferredLocations[p.specialityId] = locations
        .map(l => l.trim())
        .filter(l => l && l.toLowerCase() !== "not applicable" && l.toLowerCase() !== "none");

      // Check coordinator override score
      const overrideEntry = overrides.find(o => o.candidateId === c.id && o.specialityId === p.specialityId);
      let avgInterview = 0;
      let vivaStatus: "complete" | "pending" | "override" = "complete";
      
      const enabledDocIds = enabledDoctorsPerSpec.get(p.specialityId) || new Set<number>();
      const expectedCount = enabledDocIds.size;

      if (overrideEntry) {
        avgInterview = overrideEntry.overrideScore;
        vivaStatus = "override";
      } else {
        // Average VIVA scores — only from marks_entry_enabled doctors (multi-doctor averaging).
        const specInterviews = candInterviews.filter(
          (i) => i.specialityId === p.specialityId && !isMindMatterScore(i) && enabledDocIds.has(i.doctorId)
        );
        const submittedCount = specInterviews.length;

        if (expectedCount > 0 && submittedCount < expectedCount) {
          // Some enabled doctors haven't submitted yet
          vivaStatus = "pending";
          avgInterview = 0;
        } else {
          // All enabled doctors submitted (or no enabled doctors configured, fallback to all VIVA scores)
          const effectiveInterviews = expectedCount > 0
            ? specInterviews
            : candInterviews.filter((i) => i.specialityId === p.specialityId && !isMindMatterScore(i));
          avgInterview = effectiveInterviews.length > 0
            ? effectiveInterviews.reduce((sum, i) => sum + i.score, 0) / effectiveInterviews.length
            : 0;
          vivaStatus = "complete";
        }
      }

      // Sum raw scores directly to get final total score (out of 110)
      const specTotalScore = mcqScore + psychoScore + avgInterview;

      specialityScores[p.specialityId] = specTotalScore;
      specialityInterviewScores[p.specialityId] = avgInterview;
      specialityVivaStatus[p.specialityId] = vivaStatus;
      specialityEnabledDoctorCount[p.specialityId] = expectedCount;

      if (vivaStatus !== "pending") {
        if (specTotalScore > maxTotalScore) maxTotalScore = specTotalScore;
        if (avgInterview > maxInterviewScore) maxInterviewScore = avgInterview;
      }
    }

    result.push({
      candidateId: c.id,
      candidateCode: c.candidateCode,
      fullName: c.fullName,
      mcqScore,
      psychometricScore: psychoScore,
      interviewScore: maxInterviewScore,
      totalScore: maxTotalScore,
      preferenceSpecIds: candPrefs.map((p) => p.specialityId),
      overallRank: 0,
      specialityRanks: {},
      specialityScores,
      specialityInterviewScores,
      specialityVivaStatus,
      specialityEnabledDoctorCount,
      segmentRanks: {},
      preferredLocations,
      appliedAt,
    });
  }

  // Specialty-wise Dense Rank
  for (const spec of specs) {
    const specCandidates = result.filter(c => c.specialityScores[spec.id] !== undefined);
    
    // Split into graded and pending candidates
    const gradedCandidates = specCandidates.filter(c => c.specialityVivaStatus[spec.id] !== "pending");
    const pendingCandidates = specCandidates.filter(c => c.specialityVivaStatus[spec.id] === "pending");

    // Sort graded candidates by specialty score descending
    gradedCandidates.sort((a, b) => {
      const scoreA = a.specialityScores[spec.id]!;
      const scoreB = b.specialityScores[spec.id]!;
      return scoreB - scoreA;
    });

    // Dense Rank assignment: candidates with same score get same rank
    let rank = 0;
    let lastScore = -1;
    gradedCandidates.forEach((c) => {
      const score = c.specialityScores[spec.id]!;
      if (score !== lastScore) {
        rank++;
        lastScore = score;
      }
      c.specialityRanks[spec.id] = rank;
    });

    // Pending candidates get rank = null
    pendingCandidates.forEach((c) => {
      c.specialityRanks[spec.id] = null as any;
    });
  }

  return result;
}

