import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const paymentSettingsTable = pgTable("payment_settings", {
  id: serial("id").primaryKey(),
  programId: integer("program_id"),
  razorpayKeyId: text("razorpay_key_id"),
  razorpayKeySecret: text("razorpay_key_secret"),
  amount: integer("amount").notNull().default(275000),
  currency: text("currency").notNull().default("INR"),
  description: text("description").notNull().default("Fellowship Application Fee"),
  mode: text("mode").notNull().default("test"),
  upiId: text("upi_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PaymentSetting = typeof paymentSettingsTable.$inferSelect;
