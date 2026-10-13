import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const programsTable = pgTable("programs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  academicYear: text("academic_year").notNull(),
  category: text("category").notNull().default("fellowship"), // fellowship, vct, optometry, nursing, paramedical, general_exam
  
  // Modular Workflow Configuration Toggles
  requiresApplicationForm: boolean("requires_application_form").notNull().default(true),
  requiresPayment: boolean("requires_payment").notNull().default(false),
  feeAmount: integer("fee_amount").notNull().default(0),
  feePricingModel: text("fee_pricing_model").notNull().default("per_specialty"), // per_specialty, flat, free
  requiresPsychometry: boolean("requires_psychometry").notNull().default(false),
  requiresTheoryExam: boolean("requires_theory_exam").notNull().default(true),
  requiresInterviewViva: boolean("requires_interview_viva").notNull().default(true),
  requiredUploads: jsonb("required_uploads").$type<string[]>().default(["photo"]),

  // Hall Ticket Generation & Release Configuration
  hallTicketEnabled: boolean("hall_ticket_enabled").notNull().default(true),
  hallTicketReleased: boolean("hall_ticket_released").notNull().default(false),
  hallTicketPrefix: text("hall_ticket_prefix").default("SAV-2026"),
  examDate: text("exam_date"),
  examVenue: text("exam_venue"),
  examInstructions: text("exam_instructions"),

  offerLetterTemplateId: integer("offer_letter_template_id"),
  isMock: boolean("is_mock").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProgramSchema = createInsertSchema(programsTable).omit({ id: true, createdAt: true });
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programsTable.$inferSelect;
