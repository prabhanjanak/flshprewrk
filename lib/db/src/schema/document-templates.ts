import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { programsTable } from "./programs";

export const documentTemplatesTable = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => programsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g. "Offer Letter", "Induction Guide"
  googleDocId: text("google_doc_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentTemplate = typeof documentTemplatesTable.$inferSelect;
export type InsertDocumentTemplate = typeof documentTemplatesTable.$inferInsert;
