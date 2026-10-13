import { pgTable, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const candidatePreferencesTable = pgTable("candidate_preferences", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  specialityId: integer("speciality_id").notNull(),
  preferenceOrder: integer("preference_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("candidate_preferences_candidate_id_idx").on(table.candidateId),
  index("candidate_preferences_speciality_id_idx").on(table.specialityId),
]);

export const insertCandidatePreferenceSchema = createInsertSchema(candidatePreferencesTable).omit({ id: true, createdAt: true });
export type InsertCandidatePreference = z.infer<typeof insertCandidatePreferenceSchema>;
export type CandidatePreference = typeof candidatePreferencesTable.$inferSelect;
