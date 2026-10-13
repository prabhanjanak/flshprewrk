import { pgTable, text, serial, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "program_admin",
  "exam_coordinator",
  "central_exam_coordinator",
  "unit_coordinator",
  "doctor",
  "student",
]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  salutation: text("salutation"),
  fullName: text("full_name").notNull(),
  employeeId: text("employee_id"),
  designation: text("designation"),
  gender: text("gender"),
  avatarSeed: text("avatar_seed"),
  role: userRoleEnum("role").notNull().default("student"),
  unitId: integer("unit_id"),
  programId: integer("program_id"),
  active: boolean("active").notNull().default(true),
  isMock: boolean("is_mock").notNull().default(false),
  forcePasswordReset: boolean("force_password_reset").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
