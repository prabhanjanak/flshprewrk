# Fellowship Exam System - Database Schema

This document outlines the table structures for the Fellowship Exam System.

## Tables Overview

### 1. `users`
Management of administrative and coordinator accounts.
- `id`: UUID (Primary Key)
- `email`: Text (Unique)
- `name`: Text
- `role`: Text (admin, coordinator)
- `created_at`: Timestamp

### 2. `candidates`
Applicant profile and contact information.
- `id`: UUID (Primary Key)
- `email`: Text (Unique)
- `phone`: Text
- `name`: Text
- `date_of_birth`: Date
- `gender`: Text

### 3. `application_forms`
Detailed fellowship application submissions.
- `id`: UUID (Primary Key)
- `candidate_id`: UUID (Foreign Key -> candidates.id)
- `program_id`: UUID (Foreign Key -> programs.id)
- `speciality_id`: UUID (Foreign Key -> specialities.id)
- `status`: Text (draft, submitted, under_review, accepted, rejected)
- `data`: JSONB (Complete form data)
- `submitted_at`: Timestamp

### 4. `programs`
Available fellowship programs.
- `id`: UUID (Primary Key)
- `name`: Text
- `description`: Text

### 5. `specialities`
Medical specialities offered.
- `id`: UUID (Primary Key)
- `name`: Text
- `program_id`: UUID (Foreign Key -> programs.id)

### 6. `exams`
Exam scheduling and results.
- `id`: UUID (Primary Key)
- `name`: Text
- `date`: Timestamp
- `location`: Text

### 7. `payment_settings`
Razorpay integration configuration.
- `id`: UUID (Primary Key)
- `key_id`: Text
- `key_secret`: Text
- `is_active`: Boolean

---

## Technical Details
- **ORM:** Drizzle ORM
- **Migration Tool:** `drizzle-kit`
- **Driver:** `pg` (node-postgres)
