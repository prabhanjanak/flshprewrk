import { pgTable, text, serial, timestamp, integer, pgEnum, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const candidateStatusEnum = pgEnum("candidate_status", [
  "pending",
  "approved",
  "rejected",
  "interview_completed",
  "waitlisted",
  "allocated",
]);

export const candidatesTable = pgTable("candidates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  candidateCode: text("candidate_code").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  qualification: text("qualification"),
  collegeName: text("college_name"),
  address: text("address"),
  unitId: integer("unit_id"),
  status: candidateStatusEnum("status").notNull().default("pending"),
  mcqScore: text("mcq_score"),
  psychometricScore: text("psychometric_score"),
  isMock: boolean("is_mock").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("candidates_unit_id_idx").on(table.unitId),
  index("candidates_status_idx").on(table.status),
]);

export const insertCandidateSchema = createInsertSchema(candidatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Candidate = typeof candidatesTable.$inferSelect;
