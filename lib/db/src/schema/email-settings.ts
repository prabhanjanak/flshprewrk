import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";

export const emailSettingsTable = pgTable("email_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  host: text("host").notNull().default(""),
  port: text("port").notNull().default("587"),
  user: text("user").notNull().default(""),
  pass: text("pass").notNull().default(""),
  useSsl: boolean("use_ssl").notNull().default(false),
  fromName: text("from_name").notNull().default("Sankara Academy of Vision"),
  fromEmail: text("from_email").notNull().default(""),
  googleDocsTemplateId: text("google_docs_template_id"),
  googleServiceAccountJson: text("google_service_account_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailSettings = typeof emailSettingsTable.$inferSelect;
