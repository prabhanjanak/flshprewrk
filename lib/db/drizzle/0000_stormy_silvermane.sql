CREATE TYPE "public"."candidate_status" AS ENUM('pending', 'approved', 'rejected', 'interview_completed', 'waitlisted', 'allocated');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'program_admin', 'exam_coordinator', 'central_exam_coordinator', 'unit_coordinator', 'doctor', 'student');--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"program_id" integer NOT NULL,
	"speciality_id" integer,
	"unit_id" integer,
	"status" text DEFAULT 'SELECTED' NOT NULL,
	"rank" integer,
	"total_score" real,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"program_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"deadline" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"custom_fields" jsonb DEFAULT '[]'::jsonb,
	"sections_config" jsonb DEFAULT '[]'::jsonb,
	"google_forms_config" jsonb DEFAULT 'null'::jsonb,
	"google_sheets_config" jsonb DEFAULT 'null'::jsonb,
	CONSTRAINT "application_forms_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "application_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer,
	"application_id" uuid DEFAULT gen_random_uuid(),
	"form_id" integer NOT NULL,
	"save_as_draft" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"specialization" text,
	"center_preference" text,
	"referral_source" text,
	"referred_by_name" text,
	"media_source" text,
	"full_name" text NOT NULL,
	"permanent_address" text,
	"mailing_address" text,
	"phone" text,
	"email" text NOT NULL,
	"gender" text,
	"date_of_birth" text,
	"marital_status" text,
	"spouse_details" text,
	"health_declaration" text,
	"health_details" text,
	"medical_conditions" text,
	"previous_application_month_year" text,
	"degree" text,
	"medical_college" text,
	"university" text,
	"pg_qualifications" text,
	"do_qualification" boolean,
	"do_details" text,
	"ms_md_qualification" boolean,
	"ms_md_details" text,
	"dnb_qualification" boolean,
	"dnb_details" text,
	"other_training" text,
	"medical_council_number" text,
	"diagnostic_skills" text,
	"surgical_experience" text,
	"total_surgeries" text,
	"publications" text,
	"presentations" text,
	"lor1_url" text,
	"lor1_ref_name" text,
	"lor1_ref_contact" text,
	"lor1_ref_email" text,
	"lor2_url" text,
	"lor2_ref_name" text,
	"lor2_ref_contact" text,
	"lor2_ref_email" text,
	"other_information" text,
	"declaration_accepted" boolean,
	"payment_url" text,
	"photo_url" text,
	"paid_amount" integer,
	"payment_id" text,
	"payment_mode" text,
	"custom_answers" jsonb DEFAULT '{}'::jsonb,
	"source" text DEFAULT 'internal' NOT NULL,
	"ready_for_review" boolean DEFAULT false NOT NULL,
	"google_forms_response_id" text,
	"google_sheets_row_id" text,
	"review_notes" text,
	"form_data" jsonb DEFAULT '{}'::jsonb,
	"is_mock" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "application_submissions_application_id_unique" UNIQUE("application_id")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"candidate_code" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"date_of_birth" text,
	"gender" text,
	"qualification" text,
	"college_name" text,
	"address" text,
	"unit_id" integer,
	"status" "candidate_status" DEFAULT 'pending' NOT NULL,
	"mcq_score" text,
	"psychometric_score" text,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_candidate_code_unique" UNIQUE("candidate_code"),
	CONSTRAINT "candidates_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer,
	"name" text NOT NULL,
	"google_doc_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"doc_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"host" text DEFAULT '' NOT NULL,
	"port" text DEFAULT '587' NOT NULL,
	"user" text DEFAULT '' NOT NULL,
	"pass" text DEFAULT '' NOT NULL,
	"use_ssl" boolean DEFAULT false NOT NULL,
	"from_name" text DEFAULT 'Sankara Academy of Vision' NOT NULL,
	"from_email" text DEFAULT '' NOT NULL,
	"google_docs_template_id" text,
	"google_service_account_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"mcq_score" real,
	"psychometric_score" real,
	"interview_score" real,
	"status" text DEFAULT 'assigned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"segment" text,
	"date" timestamp with time zone NOT NULL,
	"timing" text NOT NULL,
	"venue" text DEFAULT 'SEH, Bangalore' NOT NULL,
	"program_id" integer NOT NULL,
	"mcq_total_marks" real DEFAULT 50 NOT NULL,
	"psychometric_total_marks" real DEFAULT 50 NOT NULL,
	"interview_total_marks" real DEFAULT 100 NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_exam_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"exam_id" integer NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"attempt_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"selected_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"exam_id" integer NOT NULL,
	"score" real,
	"max_score" real,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"program_id" integer,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"total_questions" integer DEFAULT 20 NOT NULL,
	"passing_score" real,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"exam_id" integer NOT NULL,
	"text" text NOT NULL,
	"choices" text[] NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"salutation" text,
	"full_name" text NOT NULL,
	"employee_id" text,
	"designation" text,
	"gender" text,
	"avatar_seed" text,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"unit_id" integer,
	"program_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"force_password_reset" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"location" text,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"academic_year" text NOT NULL,
	"offer_letter_template_id" integer,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "specialities" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"seats" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"speciality_id" integer NOT NULL,
	"preference_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"doctor_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"doctor_id" integer NOT NULL,
	"score" real NOT NULL,
	"remarks" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_matrix_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer,
	"speciality" text NOT NULL,
	"unit_name" text NOT NULL,
	"total_seats" integer DEFAULT 0 NOT NULL,
	"allocated_seats" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer,
	"razorpay_key_id" text,
	"razorpay_key_secret" text,
	"amount" integer DEFAULT 275000 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"description" text DEFAULT 'Fellowship Application Fee' NOT NULL,
	"mode" text DEFAULT 'test' NOT NULL,
	"upi_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctor_panel_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"doctor_id" integer NOT NULL,
	"is_engaged" boolean DEFAULT false NOT NULL,
	"engaged_since" timestamp with time zone,
	"current_candidate_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_panel_status_doctor_id_unique" UNIQUE("doctor_id")
);
--> statement-breakpoint
CREATE TABLE "interview_panel_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"panel_id" integer NOT NULL,
	"doctor_id" integer NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	CONSTRAINT "interview_panel_members_panel_id_doctor_id_unique" UNIQUE("panel_id","doctor_id")
);
--> statement-breakpoint
CREATE TABLE "interview_panels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"room_number" text NOT NULL,
	"program_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"panel_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"queue_position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"called_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "panel_queue_panel_id_candidate_id_unique" UNIQUE("panel_id","candidate_id")
);
--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_matrix_entries" ADD CONSTRAINT "seat_matrix_entries_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_panel_status" ADD CONSTRAINT "doctor_panel_status_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_panel_status" ADD CONSTRAINT "doctor_panel_status_current_candidate_id_candidates_id_fk" FOREIGN KEY ("current_candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_panel_members" ADD CONSTRAINT "interview_panel_members_panel_id_interview_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."interview_panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_panel_members" ADD CONSTRAINT "interview_panel_members_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_panels" ADD CONSTRAINT "interview_panels_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_queue" ADD CONSTRAINT "panel_queue_panel_id_interview_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."interview_panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_queue" ADD CONSTRAINT "panel_queue_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;