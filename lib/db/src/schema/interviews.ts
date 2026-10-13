import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { specialitiesTable } from "./specialities";
import { usersTable } from "./users";

export const interviewScoresTable = pgTable("interview_scores", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  doctorId: integer("doctor_id").notNull(),
  specialityId: integer("speciality_id").references(() => specialitiesTable.id),
  score: real("score").notNull(),
  remarks: text("remarks"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  enteredBy: integer("entered_by").references(() => usersTable.id),
  enteredAt: timestamp("entered_at", { withTimezone: true }),
  lastModifiedBy: integer("last_modified_by").references(() => usersTable.id),
  lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }),
}, (table) => [
  index("interview_scores_candidate_id_idx").on(table.candidateId),
  index("interview_scores_doctor_id_idx").on(table.doctorId),
  index("interview_scores_speciality_id_idx").on(table.specialityId),
]);

export const doctorAssignmentsTable = pgTable("doctor_assignments", {
  id: serial("id").primaryKey(),
  doctorId: integer("doctor_id").notNull(),
  candidateId: integer("candidate_id").notNull(),
  specialityId: integer("speciality_id").references(() => specialitiesTable.id),
  status: text("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("doctor_assignments_candidate_id_idx").on(table.candidateId),
  index("doctor_assignments_doctor_id_idx").on(table.doctorId),
  index("doctor_assignments_speciality_id_idx").on(table.specialityId),
]);

export const vivaScoreOverridesTable = pgTable("viva_score_overrides", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  specialityId: integer("speciality_id").references(() => specialitiesTable.id),
  overrideScore: real("override_score").notNull(),
  overrideReason: text("override_reason"),
  overriddenBy: integer("overridden_by").notNull().references(() => usersTable.id),
  overriddenAt: timestamp("overridden_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("viva_overrides_candidate_idx").on(table.candidateId),
  index("viva_overrides_candidate_speciality_idx").on(table.candidateId, table.specialityId),
]);

export const insertInterviewScoreSchema = createInsertSchema(interviewScoresTable).omit({ id: true, submittedAt: true });
export type InsertInterviewScore = z.infer<typeof insertInterviewScoreSchema>;
export type InterviewScore = typeof interviewScoresTable.$inferSelect;

export const insertVivaScoreOverrideSchema = createInsertSchema(vivaScoreOverridesTable).omit({ id: true, overriddenAt: true });
export type InsertVivaScoreOverride = z.infer<typeof insertVivaScoreOverrideSchema>;
export type VivaScoreOverride = typeof vivaScoreOverridesTable.$inferSelect;
