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
  /** Admission years, e.g. ['2024', '2025'] — every section of a listed year. */
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
  recommendedMentors?: RecommendedMentor[];
  // Which mentor this project originated from — provenance only, stored as
  // the plain name the sheet supplied. Distinct from recommendedMentors,
  // which names the mentors suggested *for* the project and resolves to real
  // accounts.
  recommendedByMentor?: string | null;
  creditMapping?: string[];
  partners?: ProjectPartner[];
}


// Hydrated by the backend from the mentor ids stored on the project — a
// recommended mentor is always a real mentor in the system.
export interface RecommendedMentor {
  mentorId: string;
  fullName: string | null;
  organization: string | null;
}

// Partner name plus its logo. logoUrl is null when the stored name doesn't
// match any known partner (a sheet typo) — the name still shows.
export interface ProjectPartner {
  name: string;
  logoUrl: string | null;
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
  /** Only present on the create/update response — count of students auto-enrolled by batch match. */
  studentsAutoAdded?: number;
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
  /**
   * Teams reporting to this mentor in one cohort — present only when the
   * request named that cohort via teamCountsCohortId. Undefined means the
   * question wasn't asked, which is not the same as zero.
   */
  teamsReporting?: number;
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
  // Only present when the caller asked for it (submissions review roster) —
  // this mentee's count of pending-review submissions, for the badge.
  pendingReviewCount?: number;
}

export interface TeamProjectSummary {
  id: string;
  title: string;
  description: string | null;
  track: string;
}

export interface TeamWithProject {
  teamId: string;
  /** The team's number/name, e.g. "G1". */
  name: string | null;
  /** Cohort this team belongs to — lets the mentor OJTs page filter by cohort. */
  cohortId: string;
  track: string;
  isIndividual: boolean;
  members: TeamMemberDetail[];
  project: TeamProjectSummary | null;
}

// Only meaningful when a preference1 has been rejected — which resubmission
// path the mentor's decision left open for the student.
export type PreferenceResubmissionMode = 'own_only' | 'catalog_only';

// A self-proposed pref1 project in the cohort still awaiting mentor approval —
// the admin allocation "projects under review by mentor" warning list.
export interface CohortPendingProposal {
  teamId: string;
  teamName: string | null;
  members: { studentId: string; fullName: string | null }[];
  projectTitle: string | null;
  mentorId: string | null;
  mentorName: string | null;
  reviewStatus: 'pending_review' | 'rejected';
  resubmissionMode: PreferenceResubmissionMode | null;
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
  // Null when the team's track allowed a single-preference submission.
  preference2Id: string | null;
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
  preference1ResubmissionMode: PreferenceResubmissionMode | null;
  submittedAt: string;
}

// A team's self-proposed preference-1 project awaiting the chosen mentor's
// approve/resubmit/return decision (GET /api/v1/teams/proposals/pending).
// Deliberately just id/title for the row — the full write-up is a separate
// fetch (apiGetProposalDetail) once the mentor opens it.
export interface PendingProposal {
  preferenceId: string;
  teamId: string;
  track: string;
  submittedAt: string;
  members: { studentId: string; fullName: string | null }[];
  project: {
    id: string;
    title: string;
  };
}

// A mentor's computed/effective capacity for a cohort (GET /api/v1/mentors/:id/capacity).
// A single flat number shared across every track the mentor covers.
export interface MentorCapacitySummary {
  mentorId: string;
  /** Applies until an admin sets a capacity — the same number for everyone. */
  defaultCapacity: number;
  override: number | null;
  effectiveTotal: number;
}

// One row per mentor for the admin's bulk capacity table (GET /api/v1/mentors/capacity)
// — cohort-agnostic, since capacityOverride is one flat number per mentor.
export interface MentorCapacityListRow {
  mentorId: string;
  fullName: string | null;
  email: string | null;
  organization: string | null;
  isExternal: boolean;
  capacityOverride: number | null;
  effectiveCapacity: number;
}

// One row per mentor with their load vs. their flat capacity
// (GET /api/v1/teams/cohort/:cohortId/mentor-load-summary).
export interface MentorLoadSummaryRow {
  mentorId: string;
  mentorName: string | null;
  tracks: string[];
  /** Teams the allocation run has already placed with this mentor. */
  allocatedCount: number;
  /**
   * Teams holding this mentor in a submitted-but-unallocated preference.
   * allocatedCount is zero for everybody until a run has happened, so it says
   * nothing about whether students can still pick this mentor — this is the
   * number that does.
   */
  pendingCount: number;
  threshold: number;
  /** At the soft cap — the student picker will not let a team select them. */
  isFull: boolean;
  /** At nominal capacity but still selectable. */
  isNearingCapacity: boolean;
}

// Full per-team preference detail for the admin allocation panel
// (GET /api/v1/teams/cohort/:cohortId/detail).
export interface TeamAllocationDetail {
  teamId: string;
  teamName: string | null;
  // Whether this is a solo team of one — set once at formation.
  isIndividual: boolean;
  // Which of the mentor's own named groups/batches this team is filed
  // under. Null if ungrouped.
  groupId: string | null;
  groupName: string | null;
  track: string;
  members: { studentId: string; fullName: string | null; batch: string | null; email: string | null; rollNumber: string | null; pendingReviewCount?: number }[];
  tier: string;
  submittedAt: string;
  preference1: { projectId: string; projectTitle: string; mentorId: string | null; mentorName: string | null };
  preference2: { projectId: string; projectTitle: string; mentorId: string | null; mentorName: string | null };
  preference1ReviewStatus: PreferenceReviewStatus;
  preference1ReviewNote: string | null;
  allocationStatus: TeamAllocationStatus;
  allocatedProjectId: string | null;
  allocatedProjectTitle: string | null;
  // The team's real mentor for allocatedProjectId — an admin's mentor
  // override wins if set, else whichever preference matches. Null until allocated.
  allocatedMentorId: string | null;
  allocatedMentorName: string | null;
  // Set the moment an admin manually overrides this team (project or mentor).
  overriddenAt: string | null;
  // True once this team's own result was drafted/overridden/resolved at or
  // before the cohort's last publish — i.e. the student can currently see it.
  visibleToStudent: boolean;
}

// One row of a Run Allocation preview — computed server-side, nothing
// persisted yet. `mentorId`/`projectId` are mutable client-side until Draft:
// the admin can reassign either before committing.
export interface AllocationPreviewEntry {
  teamId: string;
  teamName: string | null;
  members: { studentId: string; fullName: string | null }[];
  track: string;
  tier: string;
  submittedAt: string;
  status: 'allocated' | 'needs_review';
  projectId: string | null;
  projectTitle: string | null;
  mentorId: string | null;
  mentorName: string | null;
  // The team's own 2 submitted preferences — lets Reallocate offer "assign
  // from student preference" alongside a fully freeform pick.
  preference1: { projectId: string; projectTitle: string | null; mentorId: string | null; mentorName: string | null };
  preference2: { projectId: string; projectTitle: string | null; mentorId: string | null; mentorName: string | null };
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
  /**
   * At their soft capacity — still shown (they may still be who a project
   * recommends), but not selectable. The server re-checks this at submit
   * time regardless of what the picker shows.
   */
  isFull: boolean;
  /**
   * At their nominal capacity but not yet the soft cap — still selectable
   * (the soft cap is deliberately looser, so the allocation algorithm has a
   * real pool to rank instead of pure first-come-first-served). Mutually
   * exclusive with isFull; only meant to make an at-capacity mentor look
   * different from one nobody has picked yet.
   */
  isNearingCapacity: boolean;
}

// What a team on a track may submit. 'own' is the team's self-proposed
// project, 'recommended' is one from the OJT's catalog. A track can offer
// several; the team picks one at submission time.
export type TrackSubmissionMode = '1_own' | '1_recommended' | '2_recommended' | '1_own_1_recommended';

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
  // The submission shapes this team's track offers — the picker renders
  // exactly these options. Empty once preferences are already submitted, or
  // before a team exists at all.
  allowedSubmissionModes: TrackSubmissionMode[];
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
  recommendedMentors?: RecommendedMentor[];
  creditMapping?: string[];
  partners?: ProjectPartner[];
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
  recommendedMentors?: RecommendedMentor[];
  creditMapping?: string[];
  partners?: ProjectPartner[];
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
  tasksCount: number;
  /** Submissions still awaiting a mentor decision (status 'submitted' or 'under_review'). */
  pendingSubmissionsCount: number;
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

// One row in an evaluator's (mentor/external mentor) own scoring queue —
// an evaluation they're a panelist on, myTotalMarks is null until they
// submit their own score.
export interface EvaluatorQueueItem {
  id: string;
  studentId: string;
  studentName: string | null;
  evaluationTypeName: string;
  sequenceNo: number | null;
  maxMarksSnapshot: number;
  myRole: EvaluatorRole;
  myTotalMarks: number | null;
  finalMarksObtained: number | null;
}

// One panelist's own breakdown on an evaluation — null fields mean that
// panelist hasn't submitted a score yet.
export interface EvaluationPanelistScore {
  evaluatorId: string;
  evaluatorName: string | null;
  role: EvaluatorRole;
  scoreBreakdown: Record<string, number> | null;
  totalMarks: number | null;
  feedback: string | null;
}

// Full detail for one evaluation — the rubric criteria to score against,
// plus every panelist's own breakdown (a panelist fetching this sees the
// other evaluator's score too, matching the backend's own access rule).
export interface EvaluationDetail {
  id: string;
  studentId: string;
  studentName: string | null;
  evaluationTypeName: string;
  sequenceNo: number | null;
  maxMarksSnapshot: number;
  criteria: RubricCriterion[];
  panelists: EvaluationPanelistScore[];
  finalMarksObtained: number | null;
  evaluatedAt: string | null;
}

// ── Eligibility status (platform-access gate) ───────────────────────────────
// Admin-maintained, keyed by email/registration number rather than a student
// id — a row can exist before, or outlive, the matching OJT account. Only
// feePending is enforced today: a student whose row has feePending = true is
// refused at sign-in (see AuthService.signIn/signInWithGoogle on the
// backend). isOpenSource/isIntern are stored but not enforced anywhere yet.
export interface EligibilityStatus {
  id: string;
  msuEmail: string;
  msuRegistrationNumber: string | null;
  isOpenSource: boolean;
  /** true = fee not yet paid = sign-in refused. */
  feePending: boolean;
  isIntern: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EligibilityStatusInput {
  msuEmail: string;
  msuRegistrationNumber?: string | null;
  isOpenSource?: boolean;
  feePending?: boolean;
  isIntern?: boolean;
}

