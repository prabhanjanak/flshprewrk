import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { programsTable } from "./programs";

export const seatMatrixEntriesTable = pgTable("seat_matrix_entries", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => programsTable.id),
  speciality: text("speciality").notNull(),
  unitName: text("unit_name").notNull(),
  totalSeats: integer("total_seats").notNull().default(0),
  allocatedSeats: integer("allocated_seats").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SeatMatrixEntry = typeof seatMatrixEntriesTable.$inferSelect;
