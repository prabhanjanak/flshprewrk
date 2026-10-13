import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { candidatesTable } from "./candidates";
import { specialitiesTable } from "./specialities";
import { batchesTable } from "./exams";

export const applicationsTable = pgTable("applications", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull().references(() => candidatesTable.id, { onDelete: "cascade" }),
  specialityId: integer("speciality_id").notNull().references(() => specialitiesTable.id),
  hallTicketNumber: text("hall_ticket_number").unique(), // Unique Hall Ticket (e.g. VRS-2026-021)
  status: text("status").notNull().default("pending"), // pending, verified, scheduled, interviewed, completed
  batchId: integer("batch_id").references(() => batchesTable.id),
  interviewSlot: text("interview_slot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertApplicationSchema = createInsertSchema(applicationsTable).omit({ id: true, createdAt: true });
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
