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
