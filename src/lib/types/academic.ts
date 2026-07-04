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
