import { pgTable, text, serial, timestamp, integer, customType } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const uploadedFilesTable = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  filePath: text("file_path").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  fileData: bytea("file_data").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UploadedFile = typeof uploadedFilesTable.$inferSelect;
