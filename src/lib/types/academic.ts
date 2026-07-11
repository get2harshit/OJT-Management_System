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
  track?: string;
  currentTier?: string;
  email?: string | null;
  fullName?: string | null;
  phoneNumber?: string | null;
  isHosteller?: boolean | null;
  activeStatus?: boolean | null;
  // Backend has been observed sending both casings for these two fields.
  progressStatus?: string;
  progress_status?: string;
  mentorId?: string | null;
  mentor_id?: string | null;
}

// Real backend mentor shape (from GET /api/v1/mentors).
export interface ApiMentor {
  id: string;
  organization?: string;
  isExternal: boolean;
  email?: string;
  fullName?: string;
  phoneNumber?: string;
  tracks?: string[];      // backend track enum values, e.g. 'product_development'
  capacity?: number;      // max concurrent students
  currentLoad?: number;   // present only when requested with ?withLoad=true
}

// The active cohort a student belongs to (GET /api/v1/teams/my-cohort).
// Every team endpoint is scoped to this id.
export interface MyCohort {
  cohortId: string;
  name: string | null;
  sessionTerm: SemesterSession;
  allowedBatches: string[];
}

export interface TeamMemberInfo {
  studentId: string;
  fullName: string | null;
}

// A formed 2-student team (GET /api/v1/teams/my-status).
export interface Team {
  id: string;
  track: string;
  isIndividual: boolean;
  members: TeamMemberInfo[];
}

export type TeamRequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

// This student's own outgoing invite, still awaiting the other person.
export interface PendingSentRequest {
  id: string;
  receiverId: string;
  receiverName: string | null;
  track: string;
  expiresAt: string;
}

// An invite this student has received and hasn't responded to yet.
export interface PendingReceivedRequest {
  id: string;
  senderId: string;
  senderName: string | null;
  track: string;
  expiresAt: string;
}

// Admin-only view of a team (GET /api/v1/teams/cohort/:cohortId) — same
// shape as the student-facing Team, plus fields only the admin panel needs.
export interface AdminTeam extends Team {
  createdAt: string;
  hasSubmittedProjectPreferences: boolean;
}

// A team's submitted project slots (POST /api/v1/teams/projects/preferences).
// preference1 is the team's own proposed project, preference2 is a catalog pick.
// Each preference carries its own mentor pick — the two must be different mentors.
export type TeamAllocationStatus = 'pending' | 'allocated' | 'needs_review';

// Gates preference1 into allocation when it's a self-proposed project — the
// chosen mentor must approve it first. Always 'approved' for a catalog (PST)
// preference1, which needs no review.
export type PreferenceReviewStatus = 'pending_review' | 'approved' | 'rejected';

export interface TeamProjectPreferences {
  id: string;
  teamId: string;
  preference1Id: string;
  preference2Id: string;
  preference1MentorId: string | null;
  preference2MentorId: string | null;
  allocatedProjectId: string | null;
  allocationStatus: TeamAllocationStatus;
  preference1ReviewStatus: PreferenceReviewStatus;
  preference1ReviewNote: string | null;
  submittedAt: string;
}

// A team's self-proposed preference-1 project awaiting the chosen mentor's
// approve/reject decision (GET /api/v1/teams/proposals/pending).
export interface PendingProposal {
  preferenceId: string;
  teamId: string;
  track: string;
  submittedAt: string;
  members: { studentId: string; fullName: string | null }[];
  project: {
    id: string;
    title: string;
    description: string | null;
    problemStatement: string | null;
    techStack: string[];
  };
}

export interface MentorTrackRatio {
  track: string;
  ratioPercent: number;
}

// A mentor's computed/effective capacity for a cohort (GET /api/v1/mentors/:id/capacity).
export interface MentorCapacitySummary {
  mentorId: string;
  computedBaseline: number;
  override: number | null;
  effectiveTotal: number;
  ratios: (MentorTrackRatio & { threshold: number })[];
}

// Full per-team preference detail for the admin allocation panel
// (GET /api/v1/teams/cohort/:cohortId/detail).
export interface TeamAllocationDetail {
  teamId: string;
  track: string;
  members: { studentId: string; fullName: string | null }[];
  tier: string;
  submittedAt: string;
  preference1: { projectId: string; projectTitle: string; mentorId: string | null; mentorName: string | null };
  preference2: { projectId: string; projectTitle: string; mentorId: string | null; mentorName: string | null };
  preference1ReviewStatus: PreferenceReviewStatus;
  preference1ReviewNote: string | null;
  allocationStatus: TeamAllocationStatus;
  allocatedProjectId: string | null;
}

// A mentor eligible to supervise a team's project (GET /api/v1/teams/mentors/available)
// — already scoped server-side to the team's cohort and track.
export interface TeamAvailableMentor {
  id: string;
  fullName: string;
  email?: string;
  organization?: string;
  isExternal: boolean;
}

// "Where is this student in the team/project flow" — drives which screen
// the Select Project page renders, and lets it resume after a reload.
export interface MyTeamStatus {
  team: Team | null;
  // False for batch-mandated individual-project students — drives whether
  // the teammate-invite screen renders at all.
  canInviteTeammate: boolean;
  pendingSentRequest: PendingSentRequest | null;
  pendingReceivedRequest: PendingReceivedRequest | null;
  projectPreferences: TeamProjectPreferences | null;
}

export interface AvailableTeammate {
  studentId: string;
  rollNumber: string;
  batch: string;
  fullName: string;
}

// A project available to a team — either an admin-listed catalog project
// (projectBy 'PST') or the team's own proposed idea (projectBy 'STUDENT').
export interface TeamProject {
  id: string;
  title: string;
  description?: string;
  track: string;
  techStack: string[];
  problemStatement?: string;
  endUsersDefined?: string;
  projectBy: 'PST' | 'STUDENT';
  createdByTeamId: string | null;
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

