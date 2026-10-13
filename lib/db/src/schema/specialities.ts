import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const specialitiesTable = pgTable("specialities", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  seats: integer("seats").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSpecialitySchema = createInsertSchema(specialitiesTable).omit({ id: true, createdAt: true });
export type InsertSpeciality = z.infer<typeof insertSpecialitySchema>;
export type Speciality = typeof specialitiesTable.$inferSelect;
