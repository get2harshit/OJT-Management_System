export type UserRole = 'ADMIN' | 'MENTOR' | 'STUDENT';

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
  track?: string; // Associated track e.g., 'Product Development', 'Application Development', 'Data Scientist', 'Open Source', 'Gen AI'
  tracks?: string[]; // Associated tracks
  capacity?: number; // Mentor allocation capacity (max students)
  is_available?: boolean; // Mentor availability status
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

export interface StudentChangeRequest {
  type: 'MENTOR' | 'PROJECT';
  requestedId: string; // mentor_id or project_id
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  count: number;
}

export interface Student {
  user_id: string;
  roll_number: string;
  batch_id: string | null;
  semester_id: string | null;
  track: string | null;
  ojt_id: string | null;
  project_id: string | null;
  mentor_id: string | null; // Associated mentor
  viva1: number | null;
  viva2: number | null;
  viva3: number | null;
  ojt_marks: number | null;
  internal_marks?: number | null;
  presentation_marks?: number | null;
  logbook_checked?: boolean;
  project_video_url?: string | null;
  deployment_url?: string | null;
  progress_status?: 'ON_TRACK' | 'DELAYING' | 'IN_PROCESS';
  change_request?: StudentChangeRequest | null;
  preferred_mentors?: string[]; // IDs of preferred mentors in order
  contact_no?: string | null;
  tech_stack?: string | null;
}

export interface OJT {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  track: string;
  created_at: string;
  end_goals?: string;
  related_field?: string;
  source?: 'Own' | 'Listed';
}

export type TaskType = 'STUDENT_SPECIFIC' | 'MENTOR_SPECIFIC';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  assigned_to: string | null;
  mentor_id: string | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  week_number?: number | null; // Mapped to Week 1-12
  sub_tasks?: string[]; // Sub-tasks list
  is_viva?: boolean; // Viva tasks indicator
  track?: string | null; // Filtered by tech stack
}

export type SubmissionStatus = 'PENDING' | 'ACCEPTED' | 'RETURNED';
export type SubmissionCategory = 'PRD' | 'VIDEO' | 'COMMON_TASK' | 'SPECIFIC_TASK';

export interface Submission {
  id: string;
  task_id: string;
  student_id: string;
  version: number;
  file_url: string;
  file_name: string;
  status: SubmissionStatus;
  category: SubmissionCategory;
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

export interface CreditRequest {
  id: string;
  student_id: string;
  provider: CloudProvider;
  amount: number;
  reason: string;
  mentor_status: 'PENDING' | 'VOUCHED' | 'REJECTED';
  admin_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  code?: string;
  created_at: string;
}

export interface Attendance {
  id: string;
  student_id: string;
  date: string;
  marked_at: string;
}

export type PanelType = 'admin' | 'mentor' | 'student';

// ── API Types (from backend OpenAPI schema) ─────────────────────────────────

export type ApiUserRole = 'student' | 'mentor' | 'external_mentor' | 'batch_manager' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: ApiUserRole;
  fullName?: string;
}

export interface AuthResult {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}

export type TermSession = 'Term 1' | 'Term 2' | 'Semester 1' | 'Semester 2' | 'Summer Fast-Track';

export interface Cohort {
  id: string;
  academicYear: string;
  sessionTerm: TermSession;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface CreateCohortBody {
  academicYear: string;
  sessionTerm: TermSession;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}

export interface UpdateCohortBody {
  academicYear?: string;
  sessionTerm?: TermSession;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}
