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
