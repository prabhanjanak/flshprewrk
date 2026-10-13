import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  userEmail: text("user_email"),
  userName: text("user_name"),
  action: text("action").notNull(), // 'LOGIN', 'LOGOUT', 'MARK_ENTRY', 'MARK_MODIFY', 'QUEUE_CHANGE', 'PANEL_CHANGE', 'STUDENT_REASSIGNMENT'
  details: text("details").notNull(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;
