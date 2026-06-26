export type UserRole = 'ADMIN' | 'MENTOR' | 'STUDENT';

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Semester {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface Batch {
  id: string;
  name: string;
  semester_id: string;
  created_at: string;
}

export interface Student {
  user_id: string;
  roll_number: string;
  batch_id: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  is_common: boolean;
  mentor_id: string | null;
  due_date: string | null;
  created_at: string;
}

export type SubmissionStatus = 'PENDING' | 'ACCEPTED' | 'RETURNED';

export interface Submission {
  id: string;
  task_id: string;
  student_id: string;
  version: number;
  file_url: string;
  file_name: string;
  status: SubmissionStatus;
  submitted_at: string;
}

export interface Comment {
  id: string;
  submission_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export type CloudProvider = 'AWS' | 'GCP' | 'VULTR' | 'AZURE' | 'OTHER';

export interface Credit {
  id: string;
  student_id: string;
  provider: CloudProvider;
  amount: number;
  code: string;
  expiry_date: string | null;
  assigned_at: string;
}

export interface Attendance {
  id: string;
  student_id: string;
  date: string;
  marked_at: string;
}

export type PanelType = 'admin' | 'mentor' | 'student';
