import { pgTable, text, serial, timestamp, integer, boolean, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { programsTable } from "./programs";
import { usersTable } from "./users";
import { candidatesTable } from "./candidates";
import { specialitiesTable } from "./specialities";

export const interviewPanelsTable = pgTable("interview_panels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  roomNumber: text("room_number").notNull(),
  programId: integer("program_id").references(() => programsTable.id),
  specialityId: integer("speciality_id").references(() => specialitiesTable.id),
  isActive: boolean("is_active").notNull().default(true),
  isMock: boolean("is_mock").notNull().default(false),
  isMindMatter: boolean("is_mind_matter").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const interviewPanelMembersTable = pgTable("interview_panel_members", {
  id: serial("id").primaryKey(),
  panelId: integer("panel_id").notNull().references(() => interviewPanelsTable.id, { onDelete: "cascade" }),
  doctorId: integer("doctor_id").notNull().references(() => usersTable.id),
  isMain: boolean("is_main").notNull().default(false),
  marksEntryEnabled: boolean("marks_entry_enabled").notNull().default(false),
}, (t) => ({
  unq: unique().on(t.panelId, t.doctorId),
}));

export const panelQueueTable = pgTable("panel_queue", {
  id: serial("id").primaryKey(),
  panelId: integer("panel_id").notNull().references(() => interviewPanelsTable.id, { onDelete: "cascade" }),
  candidateId: integer("candidate_id").notNull().references(() => candidatesTable.id, { onDelete: "cascade" }),
  queuePosition: integer("queue_position").notNull().default(0),
  status: text("status").notNull().default("waiting"), // 'waiting', 'interviewing', 'completed', 'skipped'
  calledAt: timestamp("called_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.panelId, t.candidateId),
}));

export const doctorPanelStatusTable = pgTable("doctor_panel_status", {
  id: serial("id").primaryKey(),
  doctorId: integer("doctor_id").notNull().unique().references(() => usersTable.id),
  isEngaged: boolean("is_engaged").notNull().default(false),
  engagedSince: timestamp("engaged_since", { withTimezone: true }),
  currentCandidateId: integer("current_candidate_id").references(() => candidatesTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InterviewPanel = typeof interviewPanelsTable.$inferSelect;
export type InterviewPanelMember = typeof interviewPanelMembersTable.$inferSelect;
export type PanelQueueEntry = typeof panelQueueTable.$inferSelect;
export type DoctorPanelStatus = typeof doctorPanelStatusTable.$inferSelect;