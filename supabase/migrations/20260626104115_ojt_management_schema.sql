
/*
# OJT Management System - Full Schema

1. New Tables
- `profiles` - User profiles with role (ADMIN, MENTOR, STUDENT), linked to auth.users
- `semesters` - Academic semesters with start/end dates and active flag
- `batches` - Groups of students within a semester
- `students` - Student-specific data (roll number, batch assignment)
- `student_mentors` - Many-to-many mapping of students to mentors (max 2)
- `tasks` - Common curriculum tasks or mentor-assigned tasks
- `submissions` - Versioned deliverable submissions per student per task
- `comments` - Nested comments on submissions (Google Classroom style)
- `credits` - Cloud provider vouchers assigned to students
- `attendance` - Daily attendance records

2. Security
- RLS enabled on all tables
- anon + authenticated access (this is a managed dashboard, no per-user isolation needed at this stage)
*/

-- Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'MENTOR', 'STUDENT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'submission_status') THEN
    CREATE TYPE submission_status AS ENUM ('PENDING', 'ACCEPTED', 'RETURNED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cloud_provider') THEN
    CREATE TYPE cloud_provider AS ENUM ('AWS', 'GCP', 'VULTR', 'AZURE', 'OTHER');
  END IF;
END $$;

-- Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role user_role NOT NULL DEFAULT 'STUDENT',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_profiles" ON profiles;
CREATE POLICY "insert_profiles" ON profiles FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_profiles" ON profiles;
CREATE POLICY "update_profiles" ON profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_profiles" ON profiles;
CREATE POLICY "delete_profiles" ON profiles FOR DELETE TO anon, authenticated USING (true);

-- Semesters
CREATE TABLE IF NOT EXISTS semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_semesters" ON semesters;
CREATE POLICY "select_semesters" ON semesters FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_semesters" ON semesters;
CREATE POLICY "insert_semesters" ON semesters FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_semesters" ON semesters;
CREATE POLICY "update_semesters" ON semesters FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_semesters" ON semesters;
CREATE POLICY "delete_semesters" ON semesters FOR DELETE TO anon, authenticated USING (true);

-- Batches
CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  semester_id uuid REFERENCES semesters(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_batches" ON batches;
CREATE POLICY "select_batches" ON batches FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_batches" ON batches;
CREATE POLICY "insert_batches" ON batches FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_batches" ON batches;
CREATE POLICY "update_batches" ON batches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_batches" ON batches;
CREATE POLICY "delete_batches" ON batches FOR DELETE TO anon, authenticated USING (true);

-- Students
CREATE TABLE IF NOT EXISTS students (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  roll_number text UNIQUE NOT NULL,
  batch_id uuid REFERENCES batches(id) ON DELETE SET NULL
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_students" ON students;
CREATE POLICY "select_students" ON students FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_students" ON students;
CREATE POLICY "insert_students" ON students FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_students" ON students;
CREATE POLICY "update_students" ON students FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_students" ON students;
CREATE POLICY "delete_students" ON students FOR DELETE TO anon, authenticated USING (true);

-- Student-Mentor mapping
CREATE TABLE IF NOT EXISTS student_mentors (
  student_id uuid REFERENCES students(user_id) ON DELETE CASCADE,
  mentor_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, mentor_id)
);

ALTER TABLE student_mentors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_student_mentors" ON student_mentors;
CREATE POLICY "select_student_mentors" ON student_mentors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_student_mentors" ON student_mentors;
CREATE POLICY "insert_student_mentors" ON student_mentors FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_student_mentors" ON student_mentors;
CREATE POLICY "update_student_mentors" ON student_mentors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_student_mentors" ON student_mentors;
CREATE POLICY "delete_student_mentors" ON student_mentors FOR DELETE TO anon, authenticated USING (true);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  is_common boolean DEFAULT false,
  mentor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  due_date timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_tasks" ON tasks;
CREATE POLICY "select_tasks" ON tasks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_tasks" ON tasks;
CREATE POLICY "insert_tasks" ON tasks FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_tasks" ON tasks;
CREATE POLICY "update_tasks" ON tasks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_tasks" ON tasks;
CREATE POLICY "delete_tasks" ON tasks FOR DELETE TO anon, authenticated USING (true);

-- Submissions
CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(user_id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  file_url text NOT NULL,
  file_name text NOT NULL,
  status submission_status NOT NULL DEFAULT 'PENDING',
  submitted_at timestamptz DEFAULT now()
);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_submissions" ON submissions;
CREATE POLICY "select_submissions" ON submissions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_submissions" ON submissions;
CREATE POLICY "insert_submissions" ON submissions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_submissions" ON submissions;
CREATE POLICY "update_submissions" ON submissions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_submissions" ON submissions;
CREATE POLICY "delete_submissions" ON submissions FOR DELETE TO anon, authenticated USING (true);

-- Comments
CREATE TABLE IF NOT EXISTS submission_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES submissions(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE submission_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_comments" ON submission_comments;
CREATE POLICY "select_comments" ON submission_comments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_comments" ON submission_comments;
CREATE POLICY "insert_comments" ON submission_comments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_comments" ON submission_comments;
CREATE POLICY "update_comments" ON submission_comments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_comments" ON submission_comments;
CREATE POLICY "delete_comments" ON submission_comments FOR DELETE TO anon, authenticated USING (true);

-- Credits
CREATE TABLE IF NOT EXISTS credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(user_id) ON DELETE CASCADE,
  provider cloud_provider NOT NULL,
  amount decimal(10,2) NOT NULL,
  code text NOT NULL,
  expiry_date date,
  assigned_at timestamptz DEFAULT now()
);

ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_credits" ON credits;
CREATE POLICY "select_credits" ON credits FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_credits" ON credits;
CREATE POLICY "insert_credits" ON credits FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_credits" ON credits;
CREATE POLICY "update_credits" ON credits FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_credits" ON credits;
CREATE POLICY "delete_credits" ON credits FOR DELETE TO anon, authenticated USING (true);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(user_id) ON DELETE CASCADE,
  date date NOT NULL,
  marked_at timestamptz DEFAULT now(),
  UNIQUE(student_id, date)
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_attendance" ON attendance;
CREATE POLICY "select_attendance" ON attendance FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_attendance" ON attendance;
CREATE POLICY "insert_attendance" ON attendance FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_attendance" ON attendance;
CREATE POLICY "update_attendance" ON attendance FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_attendance" ON attendance;
CREATE POLICY "delete_attendance" ON attendance FOR DELETE TO anon, authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_batches_semester ON batches(semester_id);
CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch_id);
CREATE INDEX IF NOT EXISTS idx_submissions_task ON submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_comments_submission ON submission_comments(submission_id);
CREATE INDEX IF NOT EXISTS idx_credits_student ON credits(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
