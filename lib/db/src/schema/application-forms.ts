import { pgTable, text, serial, timestamp, integer, boolean, jsonb, uuid } from "drizzle-orm/pg-core";

export interface CustomField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox";
  options?: string[];
  required: boolean;
  placeholder?: string;
}

export const applicationFormsTable = pgTable("application_forms", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  programId: integer("program_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  deadline: timestamp("deadline", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  customFields: jsonb("custom_fields").$type<CustomField[]>().default([]),
  sectionsConfig: jsonb("sections_config").$type<any[]>().default([]),
  googleFormsConfig: jsonb("google_forms_config").$type<{ formId: string; serviceAccountJson: Record<string, unknown> } | null>().default(null),
  googleSheetsConfig: jsonb("google_sheets_config").$type<{ spreadsheetId: string; sheetName: string; serviceAccountJson: Record<string, unknown> } | null>().default(null),
});

export const applicationSubmissionsTable = pgTable("application_submissions", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id"),
  applicationId: uuid("application_id").defaultRandom().unique(),
  formId: integer("form_id").notNull(),
  saveAsDraft: boolean("save_as_draft").notNull().default(false),
  status: text("status").notNull().default("pending"),

  specialization: text("specialization"),
  centerPreference: text("center_preference"),

  referralSource: text("referral_source"),
  referredByName: text("referred_by_name"),
  mediaSource: text("media_source"),

  fullName: text("full_name").notNull(),
  permanentAddress: text("permanent_address"),
  mailingAddress: text("mailing_address"),
  phone: text("phone"),
  email: text("email").notNull(),
  gender: text("gender"),
  dateOfBirth: text("date_of_birth"),
  maritalStatus: text("marital_status"),
  spouseDetails: text("spouse_details"),
  healthDeclaration: text("health_declaration"),
  healthDetails: text("health_details"),
  medicalConditions: text("medical_conditions"),
  previousApplicationMonthYear: text("previous_application_month_year"),

  degree: text("degree"),
  medicalCollege: text("medical_college"),
  university: text("university"),
  pgQualifications: text("pg_qualifications"),
  doQualification: boolean("do_qualification"),
  doDetails: text("do_details"),
  msMdQualification: boolean("ms_md_qualification"),
  msMdDetails: text("ms_md_details"),
  dnbQualification: boolean("dnb_qualification"),
  dnbDetails: text("dnb_details"),
  otherTraining: text("other_training"),

  medicalCouncilNumber: text("medical_council_number"),

  diagnosticSkills: text("diagnostic_skills"),
  surgicalExperience: text("surgical_experience"),
  totalSurgeries: text("total_surgeries"),

  publications: text("publications"),
  presentations: text("presentations"),

  lor1Url: text("lor1_url"),
  lor1RefName: text("lor1_ref_name"),
  lor1RefContact: text("lor1_ref_contact"),
  lor1RefEmail: text("lor1_ref_email"),
  lor2Url: text("lor2_url"),
  lor2RefName: text("lor2_ref_name"),
  lor2RefContact: text("lor2_ref_contact"),
  lor2RefEmail: text("lor2_ref_email"),

  otherInformation: text("other_information"),
  declarationAccepted: boolean("declaration_accepted"),
  paymentUrl: text("payment_url"),
  photoUrl: text("photo_url"),
  
  paidAmount: integer("paid_amount"),
  paymentId: text("payment_id"),
  paymentMode: text("payment_mode"),

  customAnswers: jsonb("custom_answers").$type<Record<string, string>>().default({}),

  source: text("source").notNull().default("internal"),
  readyForReview: boolean("ready_for_review").notNull().default(false),
  googleFormsResponseId: text("google_forms_response_id"),
  googleSheetsRowId: text("google_sheets_row_id"),

  reviewNotes: text("review_notes"),
  formData: jsonb("form_data").$type<any>().default({}),
  isMock: boolean("is_mock").notNull().default(false),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export type ApplicationForm = typeof applicationFormsTable.$inferSelect;
export type ApplicationSubmission = typeof applicationSubmissionsTable.$inferSelect;
