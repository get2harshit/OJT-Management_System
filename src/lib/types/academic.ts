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

export type ProjectLevel = 'beginner' | 'intermediate' | 'advanced';

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
  batch?: string[];
  created_at: string;
  end_goals?: string;
  related_field?: string;
  // Whether this is an admin-listed catalog project ('PST') or a team's own
  // proposed idea ('STUDENT') — only present on the single-project GET.
  projectBy?: 'PST' | 'STUDENT';

  // Catalog identifier — "PST0001" (admin CSV) or "STU0001" (student-proposed,
  // backend-generated). Renamed from the sheet's "OJTID" — see api/projects.ts.
  projectId?: string | null;
  courseCovered?: string[];
  projectDescription?: string;   // short summary, distinct from the detailed `description`
  framework?: string[];
  suggestedLibrariesTools?: string[];
  coreLearningGoals?: string[];
  stretchGoal?: string[];
  evaluationMetrics?: string[];
  expectedOutput?: string[];
  firstMonthMilestones?: string[];
  secondMonthMilestones?: string[];
  thirdMonthMilestones?: string[];
  industry?: string;
  mustHaveFeatures?: string[];
  goodToHaveFeatures?: string[];
  level?: ProjectLevel;
  theme?: string;
  referenceDocs?: string;
  estimatedDuration?: number;   // weeks
  sourceStartupSchool?: string;
}

export type SemesterSession = 'ODD' | 'EVEN';

/**
 * Cohort-wide allocation run lifecycle (distinct from a team's per-team
 * `TeamAllocationStatus`). 'review' is derived server-side, not settable
 * directly: it means the last run left at least one team in needs_review,
 * blocking Publish until an admin resolves them (which flips it back to
 * 'draft' automatically).
 */
export type CohortAllocationRunStatus = 'pending' | 'draft' | 'review' | 'published';

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
  allocationRunStatus: CohortAllocationRunStatus;
  allocationPublishedAt: string | null;
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
  // The student's current active-cohort membership, if any — drives whether
  // the "Allow Individual Project" action is available and its current state.
  activeCohortId?: string;
  allowedAsIndividual?: boolean;
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
  name: string | null;
  track: string;
  isIndividual: boolean;
  members: TeamMemberInfo[];
  // Present on endpoints that serialize the backend's domain Team object
  // directly (e.g. GET /teams/my-teams) — used to check whether this team's
  // cohort has been published, since a task can't be assigned to a student
  // before that.
  cohortId?: string;
}

// A mentor's own team with its allocated project attached (GET
// /api/v1/teams/my-teams/detailed) — project is null until allocated.
export interface TeamMemberDetail {
  studentId: string;
  fullName: string | null;
  rollNumber: string | null;
}

export interface TeamProjectSummary {
  id: string;
  title: string;
  description: string | null;
  track: string;
}

export interface TeamWithProject {
  teamId: string;
  track: string;
  isIndividual: boolean;
  members: TeamMemberDetail[];
  project: TeamProjectSummary | null;
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
  // Both null until the cohort admin publishes the allocation AND this team
  // was actually allocated — see GET /teams/my-status.
  allocatedMentorId: string | null;
  allocatedMentorName: string | null;
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

// A mentor's computed/effective capacity for a cohort (GET /api/v1/mentors/:id/capacity).
// A single flat number shared across every track the mentor covers.
export interface MentorCapacitySummary {
  mentorId: string;
  computedBaseline: number;
  override: number | null;
  effectiveTotal: number;
}

// One row per mentor with allocated count vs. their flat capacity
// (GET /api/v1/teams/cohort/:cohortId/mentor-load-summary).
export interface MentorLoadSummaryRow {
  mentorId: string;
  mentorName: string | null;
  tracks: string[];
  allocatedCount: number;
  threshold: number;
}

// Full per-team preference detail for the admin allocation panel
// (GET /api/v1/teams/cohort/:cohortId/detail).
export interface TeamAllocationDetail {
  teamId: string;
  teamName: string | null;
  track: string;
  members: { studentId: string; fullName: string | null; batch: string | null; email: string | null; rollNumber: string | null }[];
  tier: string;
  submittedAt: string;
  preference1: { projectId: string; projectTitle: string; mentorId: string | null; mentorName: string | null };
  preference2: { projectId: string; projectTitle: string; mentorId: string | null; mentorName: string | null };
  preference1ReviewStatus: PreferenceReviewStatus;
  preference1ReviewNote: string | null;
  allocationStatus: TeamAllocationStatus;
  allocatedProjectId: string | null;
  // The team's real mentor for allocatedProjectId — an admin's mentor
  // override wins if set, else whichever preference matches. Null until allocated.
  allocatedMentorId: string | null;
  allocatedMentorName: string | null;
  // Set the moment an admin manually overrides this team (project or mentor).
  overriddenAt: string | null;
}

// Cohort student not yet in any team (GET /api/v1/teams/cohort/:cohortId/students-without-team)
// — for the admin's manual-team-creation modal.
export interface StudentWithoutTeam {
  id: string;
  fullName: string | null;
  rollNumber: string | null;
  batch: string | null;
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
  pendingSentRequests: PendingSentRequest[];
  pendingReceivedRequests: PendingReceivedRequest[];
  pendingReceivedRequest?: PendingReceivedRequest | null;
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
  projectId?: string | null;
  courseCovered?: string[];
  projectDescription?: string;
  framework?: string[];
  suggestedLibrariesTools?: string[];
  coreLearningGoals?: string[];
  stretchGoal?: string[];
  evaluationMetrics?: string[];
  expectedOutput?: string[];
  firstMonthMilestones?: string[];
  secondMonthMilestones?: string[];
  thirdMonthMilestones?: string[];
  industry?: string;
  mustHaveFeatures?: string[];
  goodToHaveFeatures?: string[];
  level?: ProjectLevel;
  theme?: string;
  referenceDocs?: string;
  estimatedDuration?: number;   // weeks
  sourceStartupSchool?: string;
  // True when this project's level matches the browsing team's best member
  // tier (A -> advanced, B -> intermediate, C -> beginner) — a nudge, not a
  // filter; every project still shows regardless of this flag.
  isRecommended?: boolean;
}

// Payload for POST /api/v1/teams/projects/propose — the fields the sheet
// marks Required for the student self-propose path (a subset of the full
// admin CSV required set — see domain/projectFields.ts on the backend).
// track is never included: it always follows the team's own track.
export interface ProposeProjectInput {
  title: string;
  description: string;
  problemStatement: string;
  techStack: string[];
  courseCovered: string[];
  coreLearningGoals: string[];
  expectedOutput: string[];
  industry: string;
  mustHaveFeatures: string[];
  goodToHaveFeatures: string[];
  evaluationMetrics: string[];
  endUsersDefined?: string;
  projectDescription?: string;
  framework?: string[];
  suggestedLibrariesTools?: string[];
  stretchGoal?: string[];
  firstMonthMilestones?: string[];
  secondMonthMilestones?: string[];
  thirdMonthMilestones?: string[];
  level?: ProjectLevel;
  theme?: string;
  referenceDocs?: string;
  estimatedDuration?: number;   // weeks
  sourceStartupSchool?: string;
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

// ── Evaluation module ────────────────────────────────────────────────────────
// Viva / Final Presentation / OJL Logbook Upload / PRD Upload / Attendance,
// plus any custom type an admin defines. Only ever surfaced for a cohort
// once its teams are published and the cohort itself is running — see
// `isEvaluationEligible` in EvaluationPanel.tsx.

export type EvaluationMode = 'upload' | 'rubric';
export type EvaluatorRole = 'internal' | 'external';

export interface EvaluationTypeTemplate {
  id: string;
  name: string;
  mode: EvaluationMode;
}

export interface RubricCriterion {
  id: string;
  name: string;
  maxMarks: number;
  displayOrder: number;
}

export interface RubricTemplate {
  id: string;
  evaluationTypeTemplateId: string;
  name: string;
  criteria: RubricCriterion[];
}

export interface CohortEvaluationConfig {
  id: string;
  cohortId: string;
  evaluationTypeTemplateId: string;
  rubricTemplateId: string;
  sequenceNo: number | null;
  startDate: string;
  endDate: string;
  maxMarksSnapshot: number;
  isActive: boolean;
  evaluationTypeTemplate: EvaluationTypeTemplate;
  rubricTemplate: RubricTemplate;
}

export interface EvaluationMentorPairing {
  id: string;
  internalMentorId: string;
  externalMentorId: string;
}

// One student's status for one evaluation event — the Evaluation Tracker's
// per-student detail pane shows one row of these per configured evaluation.
export interface StudentEvaluationSummary {
  id: string;
  cohortId: string;
  evaluationTypeName: string;
  sequenceNo: number | null;
  maxMarksSnapshot: number;
  finalMarksObtained: number | null;
  evaluatedAt: string | null;
  panelistCount: number;
}

