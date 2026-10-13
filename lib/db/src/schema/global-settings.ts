import { pgTable, text, boolean, timestamp, serial } from "drizzle-orm/pg-core";

export const globalSettingsTable = pgTable("global_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
