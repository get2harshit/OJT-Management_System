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

export interface OJT {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

// GET /api/v1/projects (list) only returns this trimmed shape — description,
// endUsersDefined, batch and createdAt are only present on the single-project
// detail response (GET /api/v1/projects/:id). description is therefore
// optional here, not missing-by-bug.
export interface Project {
  id: string;
  title: string;
  description?: string;
  problemStatement?: string;
  track: string;
  techStack?: string[];
  endUsersDefined?: string;
  batch?: string;
  created_at: string;
  end_goals?: string;
  related_field?: string;
  source?: 'Own' | 'Listed';
}

export type SemesterSession = 'ODD' | 'EVEN';

export interface Cohort {
  id: string;
  name?: string;
  allowedBatches: string[];
  sessionTerm: SemesterSession;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface CreateCohortBody {
  name: string;
  allowedBatches: string[];
  sessionTerm: SemesterSession;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}

export interface UpdateCohortBody {
  name?: string;
  allowedBatches?: string[];
  sessionTerm?: SemesterSession;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}

// Real backend student shape (from GET /api/v1/students), distinct from the
// mock-domain `Student` type in student.ts which the rest of the app still
// runs on.
export interface ApiStudent {
  id: string;
  rollNumber?: string;
  batch?: string;
  currentTier?: string;
  email?: string | null;
  fullName?: string | null;
  phoneNumber?: string | null;
  isHosteller?: boolean | null;
  activeStatus?: boolean | null;
}

// Real backend mentor shape (from GET /api/v1/mentors).
export interface ApiMentor {
  id: string;
  organization?: string;
  isExternal: boolean;
  email?: string;
  fullName?: string;
  phoneNumber?: string;
}

export interface CohortDetails extends Cohort {
  students: ApiStudent[];
  mentors: ApiMentor[];
  batchManagers: unknown[];
}

export interface DashboardMetrics {
  studentsCount: number;
  mentorsCount: number;
  batchManagersCount: number;
  projectsCount: number;
  totalCreditsAvailable: number;
}

