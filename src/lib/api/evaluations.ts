import type {
  EvaluationTypeTemplate,
  EvaluationMode,
  RubricTemplate,
  RubricCriterion,
  CriterionScorer,
  CohortEvaluationConfig,
  EvaluationMentorPairing,
  StudentEvaluationSummary,
  StudentVisibleEvaluation,
  EvaluatorRole,
  EvaluatorQueueItem,
  EvaluationPanelistScore,
  EvaluationDetail,
} from '../types';
import { apiFetch, invalidateCached } from './client';

function invalidateEvaluationCaches(): void {
  invalidateCached('evaluations:');
}

// ── Raw backend wire shapes (snake_case) ────────────────────────────────────

interface RawEvaluationTypeTemplate {
  id: string;
  name: string;
  mode: EvaluationMode;
}

interface RawRubricCriterion {
  id: string;
  name: string;
  max_marks: string | number;
  display_order: number;
  scored_by: CriterionScorer;
}

interface RawRubricTemplate {
  id: string;
  evaluation_type_template_id: string;
  name: string;
  criteria: RawRubricCriterion[];
}

interface RawCohortEvaluationConfig {
  id: string;
  cohort_id: string;
  evaluation_type_template_id: string;
  rubric_template_id: string;
  sequence_no: number | null;
  start_date: string;
  end_date: string;
  max_marks_snapshot: string | number;
  is_active: boolean;
  batches: string[];
  secondary_evaluator_count: number;
  tracks: { track: { id: string; name: string } }[];
  evaluation_type_template: RawEvaluationTypeTemplate;
  rubric_template: RawRubricTemplate;
}

interface RawEvaluationMentorPairing {
  id: string;
  primary_mentor_id: string;
  secondary_mentor_id: string;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapTypeTemplate(raw: RawEvaluationTypeTemplate): EvaluationTypeTemplate {
  return { id: raw.id, name: raw.name, mode: raw.mode };
}

function mapCriterion(raw: RawRubricCriterion): RubricCriterion {
  return {
    id: raw.id,
    name: raw.name,
    maxMarks: Number(raw.max_marks),
    displayOrder: raw.display_order,
    scoredBy: raw.scored_by,
  };
}

function mapRubricTemplate(raw: RawRubricTemplate): RubricTemplate {
  return {
    id: raw.id,
    evaluationTypeTemplateId: raw.evaluation_type_template_id,
    name: raw.name,
    criteria: (raw.criteria || []).map(mapCriterion),
  };
}

function mapCohortEvaluationConfig(raw: RawCohortEvaluationConfig): CohortEvaluationConfig {
  return {
    id: raw.id,
    cohortId: raw.cohort_id,
    evaluationTypeTemplateId: raw.evaluation_type_template_id,
    rubricTemplateId: raw.rubric_template_id,
    sequenceNo: raw.sequence_no,
    startDate: raw.start_date,
    endDate: raw.end_date,
    maxMarksSnapshot: Number(raw.max_marks_snapshot),
    isActive: raw.is_active,
    secondaryEvaluatorCount: raw.secondary_evaluator_count,
    scope: {
      trackIds: (raw.tracks || []).map((t) => t.track.id),
      trackNames: (raw.tracks || []).map((t) => t.track.name),
      batches: raw.batches || [],
    },
    evaluationTypeTemplate: mapTypeTemplate(raw.evaluation_type_template),
    rubricTemplate: mapRubricTemplate(raw.rubric_template),
  };
}

function mapMentorPairing(raw: RawEvaluationMentorPairing): EvaluationMentorPairing {
  return { id: raw.id, primaryMentorId: raw.primary_mentor_id, secondaryMentorId: raw.secondary_mentor_id };
}

// ── Evaluation type templates ───────────────────────────────────────────────

export async function apiListEvaluationTypes(): Promise<EvaluationTypeTemplate[]> {
  const res = await apiFetch<{ data: RawEvaluationTypeTemplate[] }>('/api/v1/evaluations/types');
  return res.data.map(mapTypeTemplate);
}

export async function apiCreateEvaluationType(name: string, mode: EvaluationMode): Promise<EvaluationTypeTemplate> {
  const res = await apiFetch<{ data: RawEvaluationTypeTemplate }>('/api/v1/evaluations/types', {
    method: 'POST',
    body: JSON.stringify({ name, mode }),
  });
  invalidateEvaluationCaches();
  return mapTypeTemplate(res.data);
}

// ── Rubric templates ─────────────────────────────────────────────────────────

export async function apiListRubricTemplates(typeId: string): Promise<RubricTemplate[]> {
  const res = await apiFetch<{ data: RawRubricTemplate[] }>(`/api/v1/evaluations/types/${typeId}/rubrics`);
  return res.data.map(mapRubricTemplate);
}

export async function apiCreateRubricTemplate(
  typeId: string,
  name: string,
  criteria: { name: string; maxMarks: number; scoredBy?: CriterionScorer }[],
): Promise<RubricTemplate> {
  const res = await apiFetch<{ data: RawRubricTemplate }>(`/api/v1/evaluations/types/${typeId}/rubrics`, {
    method: 'POST',
    body: JSON.stringify({ name, criteria }),
  });
  invalidateEvaluationCaches();
  return mapRubricTemplate(res.data);
}

// ── Cohort evaluation configs ────────────────────────────────────────────────

export async function apiListCohortEvaluationConfigs(cohortId: string): Promise<CohortEvaluationConfig[]> {
  const res = await apiFetch<{ data: RawCohortEvaluationConfig[] }>(
    `/api/v1/evaluations/cohort-configs?cohort_id=${encodeURIComponent(cohortId)}`,
  );
  return res.data.map(mapCohortEvaluationConfig);
}

export async function apiCreateCohortEvaluationConfig(data: {
  cohortId: string;
  evaluationTypeTemplateId: string;
  rubricTemplateId: string;
  sequenceNo?: number | null;
  startDate: string;
  endDate: string;
  trackIds?: string[];
  batches?: string[];
  secondaryEvaluatorCount?: number;
}): Promise<CohortEvaluationConfig> {
  const res = await apiFetch<{ data: RawCohortEvaluationConfig }>('/api/v1/evaluations/cohort-configs', {
    method: 'POST',
    body: JSON.stringify({
      cohort_id: data.cohortId,
      evaluation_type_template_id: data.evaluationTypeTemplateId,
      rubric_template_id: data.rubricTemplateId,
      sequence_no: data.sequenceNo ?? null,
      start_date: data.startDate,
      end_date: data.endDate,
      track_ids: data.trackIds,
      batches: data.batches,
      secondary_evaluator_count: data.secondaryEvaluatorCount,
    }),
  });
  invalidateEvaluationCaches();
  return mapCohortEvaluationConfig(res.data);
}

/**
 * Partial update. Every field optional; which ones the server actually
 * accepts depends on whether students are already assigned under this
 * config — once any are, type/rubric/sequence/scope lock and only dates and
 * panel size stay editable. A rejected field comes back as a normal error
 * with a message naming what's locked and why.
 */
export async function apiUpdateCohortEvaluationConfig(
  configId: string,
  data: {
    sequenceNo?: number | null;
    startDate?: string;
    endDate?: string;
    trackIds?: string[];
    batches?: string[];
    secondaryEvaluatorCount?: number;
    evaluationTypeTemplateId?: string;
    rubricTemplateId?: string;
  },
): Promise<CohortEvaluationConfig> {
  const body: Record<string, unknown> = {};
  if (data.sequenceNo !== undefined) body.sequence_no = data.sequenceNo;
  if (data.startDate !== undefined) body.start_date = data.startDate;
  if (data.endDate !== undefined) body.end_date = data.endDate;
  if (data.trackIds !== undefined) body.track_ids = data.trackIds;
  if (data.batches !== undefined) body.batches = data.batches;
  if (data.secondaryEvaluatorCount !== undefined) body.secondary_evaluator_count = data.secondaryEvaluatorCount;
  if (data.evaluationTypeTemplateId !== undefined) body.evaluation_type_template_id = data.evaluationTypeTemplateId;
  if (data.rubricTemplateId !== undefined) body.rubric_template_id = data.rubricTemplateId;

  const res = await apiFetch<{ data: RawCohortEvaluationConfig }>(`/api/v1/evaluations/cohort-configs/${configId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  invalidateEvaluationCaches();
  return mapCohortEvaluationConfig(res.data);
}

/** Only when nothing under this config has been scored yet — the server
 * rejects the request otherwise, with a message saying so. */
export async function apiDeleteCohortEvaluationConfig(configId: string): Promise<void> {
  await apiFetch(`/api/v1/evaluations/cohort-configs/${configId}`, { method: 'DELETE' });
  invalidateEvaluationCaches();
}

// ── Mentor pairings (per primary mentor, per config) ────────────────────────

export async function apiGetMentorPairings(configId: string): Promise<EvaluationMentorPairing[]> {
  const res = await apiFetch<{ data: RawEvaluationMentorPairing[] }>(
    `/api/v1/evaluations/cohort-configs/${configId}/mentor-pairings`,
  );
  return res.data.map(mapMentorPairing);
}

export async function apiSetMentorPairings(
  configId: string,
  pairings: { primaryMentorId: string; secondaryMentorId: string }[],
): Promise<void> {
  await apiFetch(`/api/v1/evaluations/cohort-configs/${configId}/mentor-pairings`, {
    method: 'POST',
    body: JSON.stringify({ pairings }),
  });
  invalidateEvaluationCaches();
}

export interface ReassignSecondaryMentorResult {
  reassignedCount: number;
  keptScoredCount: number;
  skippedConflictCount: number;
}

// Editing a pairing on a config that's already been activated — distinct
// from apiSetMentorPairings above, which only ever adds fresh rows. A
// student whose old secondary already scored keeps that exact panelist and
// mark; only students still waiting move onto the new secondary, right
// away, not just from the next activation on. See the backend's own
// EvaluationService.reassignSecondaryMentor for the full rule.
export async function apiReassignSecondaryMentor(
  configId: string,
  data: { primaryMentorId: string; oldSecondaryMentorId: string; newSecondaryMentorId: string },
): Promise<ReassignSecondaryMentorResult> {
  const res = await apiFetch<{ data: ReassignSecondaryMentorResult }>(
    `/api/v1/evaluations/cohort-configs/${configId}/mentor-pairings/reassign`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        primary_mentor_id: data.primaryMentorId,
        old_secondary_mentor_id: data.oldSecondaryMentorId,
        new_secondary_mentor_id: data.newSecondaryMentorId,
      }),
    },
  );
  invalidateEvaluationCaches();
  return res.data;
}

// ── Activation (bulk-assigns evaluations + panelists for the cohort) ───────

export interface ActivationResult {
  newlyAssignedCount: number;
  repairedCount: number;
  // Students the config's own scope (or, if given, the narrowing below)
  // covered but didn't get assigned, broken down by why — was always
  // happening silently before; now visible.
  skipped: { alreadyAssigned: number; noMentor: number; noPublishedTeam: number; outOfScope: number };
}

/**
 * Every field optional. Omit everything to assign exactly what the config's
 * own scope covers — the ordinary case. Narrowing (explicit studentIds/
 * teamIds, or trackIds/batches) picks a SUBSET of that scope for just this
 * run, never a way around it; explicit studentIds/teamIds always win over
 * trackIds/batches if both are given. Safe to call again later — already-
 * assigned students are skipped, not re-assigned.
 */
export async function apiActivateCohortEvaluation(
  configId: string,
  narrow?: { studentIds?: string[]; teamIds?: string[]; trackIds?: string[]; batches?: string[] },
): Promise<ActivationResult> {
  const res = await apiFetch<{ data: ActivationResult }>(`/api/v1/evaluations/cohort-configs/${configId}/activate`, {
    method: 'POST',
    body: JSON.stringify({
      student_ids: narrow?.studentIds,
      team_ids: narrow?.teamIds,
      track_ids: narrow?.trackIds,
      batches: narrow?.batches,
    }),
  });
  invalidateEvaluationCaches();
  return res.data;
}

// ── Admin/mentor view of a specific student's evaluation status ────────────

interface RawStudentEvaluation {
  id: string;
  final_marks_obtained: string | number | null;
  evaluated_at: string | null;
  cohort_evaluation_config: {
    cohort_id: string;
    sequence_no: number | null;
    max_marks_snapshot: string | number;
    evaluation_type_template: { name: string };
  };
  panelists: unknown[];
}

function mapStudentEvaluationSummary(raw: RawStudentEvaluation): StudentEvaluationSummary {
  return {
    id: raw.id,
    cohortId: raw.cohort_evaluation_config.cohort_id,
    evaluationTypeName: raw.cohort_evaluation_config.evaluation_type_template.name,
    sequenceNo: raw.cohort_evaluation_config.sequence_no,
    maxMarksSnapshot: Number(raw.cohort_evaluation_config.max_marks_snapshot),
    finalMarksObtained: raw.final_marks_obtained !== null ? Number(raw.final_marks_obtained) : null,
    evaluatedAt: raw.evaluated_at,
    panelistCount: raw.panelists.length,
  };
}

export async function apiGetEvaluationsForStudent(studentId: string): Promise<StudentEvaluationSummary[]> {
  const res = await apiFetch<{ data: RawStudentEvaluation[] }>(`/api/v1/evaluations/students/${studentId}`);
  return res.data.map(mapStudentEvaluationSummary);
}

// ── Evaluator's own scoring queue + scoring ─────────────────────────────────

interface RawEvaluatorQueuePanelist {
  role: EvaluatorRole;
  total_marks: string | number | null;
}

interface RawEvaluatorQueueItem {
  id: string;
  final_marks_obtained: string | number | null;
  cohort_evaluation_config: {
    sequence_no: number | null;
    max_marks_snapshot: string | number;
    evaluation_type_template: { name: string };
  };
  // Server-filtered to just the caller's own panelist row (see
  // getEvaluationsForEvaluator) — always exactly one entry.
  panelists: RawEvaluatorQueuePanelist[];
  student: { id: string; full_name: string; email: string };
}

function mapEvaluatorQueueItem(raw: RawEvaluatorQueueItem): EvaluatorQueueItem {
  const myPanelist = raw.panelists[0];
  return {
    id: raw.id,
    studentId: raw.student.id,
    studentName: raw.student.full_name || raw.student.email || null,
    evaluationTypeName: raw.cohort_evaluation_config.evaluation_type_template.name,
    sequenceNo: raw.cohort_evaluation_config.sequence_no,
    maxMarksSnapshot: Number(raw.cohort_evaluation_config.max_marks_snapshot),
    myRole: myPanelist?.role ?? 'primary',
    myTotalMarks:
      myPanelist?.total_marks !== null && myPanelist?.total_marks !== undefined
        ? Number(myPanelist.total_marks)
        : null,
    finalMarksObtained: raw.final_marks_obtained !== null ? Number(raw.final_marks_obtained) : null,
  };
}

export interface EvaluatorQueuePage {
  data: EvaluatorQueueItem[];
  pagination: { page: number; limit: number; total: number };
}

// Mentor/external mentor — every evaluation they're a panelist on, paginated.
// cohortId names the OJT whose queue to return; without it the backend scopes
// to the currently active OJT, which is what a cohort-less caller wants.
export async function apiGetMyEvaluationQueue(
  params: { page?: number; limit?: number; cohortId?: string } = {}
): Promise<EvaluatorQueuePage> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cohortId) query.set('cohortId', params.cohortId);
  const qs = query.toString();
  const res = await apiFetch<{ data: RawEvaluatorQueueItem[]; pagination: { page: number; limit: number; total: number } }>(
    `/api/v1/evaluations/my-queue${qs ? `?${qs}` : ''}`,
  );
  return { data: res.data.map(mapEvaluatorQueueItem), pagination: res.pagination };
}

interface RawEvaluationPanelistScore {
  evaluator_id: string;
  evaluator: { id: string; full_name: string } | null;
  role: EvaluatorRole;
  score_breakdown: Record<string, number> | null;
  total_marks: string | number | null;
  feedback: string | null;
}

interface RawEvaluationDetail {
  id: string;
  evaluated_at: string | null;
  final_marks_obtained: string | number | null;
  average_marks_obtained: string | number | null;
  student: { id: string; full_name: string; email: string };
  cohort_evaluation_config: {
    sequence_no: number | null;
    max_marks_snapshot: string | number;
    evaluation_type_template: { name: string };
    rubric_template: { criteria: RawRubricCriterion[] };
  };
  panelists: RawEvaluationPanelistScore[];
}

function mapEvaluationDetail(raw: RawEvaluationDetail): EvaluationDetail {
  return {
    id: raw.id,
    studentId: raw.student.id,
    studentName: raw.student.full_name || raw.student.email || null,
    evaluationTypeName: raw.cohort_evaluation_config.evaluation_type_template.name,
    sequenceNo: raw.cohort_evaluation_config.sequence_no,
    maxMarksSnapshot: Number(raw.cohort_evaluation_config.max_marks_snapshot),
    criteria: raw.cohort_evaluation_config.rubric_template.criteria.map(mapCriterion),
    panelists: raw.panelists.map(
      (p): EvaluationPanelistScore => ({
        evaluatorId: p.evaluator_id,
        evaluatorName: p.evaluator?.full_name || null,
        role: p.role,
        scoreBreakdown: p.score_breakdown,
        totalMarks: p.total_marks !== null && p.total_marks !== undefined ? Number(p.total_marks) : null,
        feedback: p.feedback,
      }),
    ),
    finalMarksObtained: raw.final_marks_obtained !== null ? Number(raw.final_marks_obtained) : null,
    averageMarksObtained: raw.average_marks_obtained !== null ? Number(raw.average_marks_obtained) : null,
    evaluatedAt: raw.evaluated_at,
  };
}

// Any authenticated caller who's admin, the student themselves, or an
// assigned panelist — the backend enforces this, a rejected request throws.
// A student caller gets a redacted response with no marks in it at all —
// use apiGetMyEvaluationsRedacted for the student's own view instead of
// relying on that redaction here.
export async function apiGetEvaluationDetail(evaluationId: string): Promise<EvaluationDetail> {
  const res = await apiFetch<{ data: RawEvaluationDetail }>(`/api/v1/evaluations/${evaluationId}`);
  return mapEvaluationDetail(res.data);
}

export interface ScoreResult {
  totalMarks: number;
  finalMarksObtained: number | null;
  averageMarksObtained: number | null;
}

// Submits (or re-submits) the caller's own panelist score — one entry per
// rubric criterion name. Which criteria to send depends on the caller's own
// role on this evaluation: primary sends every criterion, secondary sends
// only the ones whose scoredBy is 'panel' (never a 'primary'-only one —
// the server rejects it, since a secondary never saw the artifact).
export async function apiScoreEvaluation(
  evaluationId: string,
  scoreBreakdown: Record<string, number>,
  feedback?: string,
): Promise<ScoreResult> {
  const res = await apiFetch<{ data: ScoreResult }>(`/api/v1/evaluations/${evaluationId}/score`, {
    method: 'PATCH',
    body: JSON.stringify({ score_breakdown: scoreBreakdown, feedback }),
  });
  invalidateEvaluationCaches();
  return res.data;
}

// Admin correcting a specific panelist's score — distinct from
// apiScoreEvaluation above, which only ever submits the CALLER's own row.
// evaluatorId names whose row is being corrected.
export async function apiAdminScoreEvaluation(
  evaluationId: string,
  evaluatorId: string,
  scoreBreakdown: Record<string, number>,
  feedback?: string,
): Promise<ScoreResult> {
  const res = await apiFetch<{ data: ScoreResult }>(
    `/api/v1/evaluations/${evaluationId}/panelists/${evaluatorId}/score`,
    { method: 'PATCH', body: JSON.stringify({ score_breakdown: scoreBreakdown, feedback }) },
  );
  invalidateEvaluationCaches();
  return res.data;
}

// ── Evaluation Blueprint (one config's full student roster) ──────────────────

export type EvaluationBlueprintStatus = 'not_assigned' | 'pending' | 'evaluated';

/** One secondary panelist's own total and breakdown — a list now, not a
 * single value, since a config can declare more than one secondary. */
export interface EvaluationBlueprintSecondaryPanelist {
  evaluatorId: string;
  evaluatorName: string | null;
  totalMarks: number | null;
  scoreBreakdown: Record<string, number> | null;
}

// One student's row for a single evaluation. primaryScores is keyed by
// criterion NAME — the same names as meta.criteria — so the page can build
// one column per criterion dynamically; each secondary panelist carries its
// own breakdown the same way.
export interface EvaluationBlueprintStudent {
  studentId: string;
  /** Null for a 'not_assigned' row — nothing to correct yet. */
  evaluationId: string | null;
  fullName: string | null;
  rollNumber: string | null;
  batch: string | null;
  track: string | null;
  status: EvaluationBlueprintStatus;
  finalMarks: number | null;
  averageMarks: number | null;
  finalPercentage: number | null;
  averagePercentage: number | null;
  primaryMentorName: string | null;
  primaryTotal: number | null;
  primaryScores: Record<string, number> | null;
  secondaryPanelists: EvaluationBlueprintSecondaryPanelist[];
}

export interface EvaluationBlueprintMeta {
  cohortId: string;
  evaluationName: string;
  mode: EvaluationMode;
  maxMarks: number;
  criteria: { name: string; maxMarks: number; scoredBy: CriterionScorer }[];
  scope: { trackIds: string[]; trackNames: string[]; batches: string[] };
}

export interface EvaluationBlueprintPageResult {
  data: EvaluationBlueprintStudent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  meta: EvaluationBlueprintMeta;
}

export async function apiGetEvaluationBlueprint(
  configId: string,
  params: { page?: number; limit?: number; search?: string; batch?: string; status?: EvaluationBlueprintStatus } = {},
): Promise<EvaluationBlueprintPageResult> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  if (params.batch) q.set('batch', params.batch);
  if (params.status) q.set('status', params.status);
  const qs = q.toString();
  const res = await apiFetch<{ success: boolean } & EvaluationBlueprintPageResult>(
    `/api/v1/evaluations/cohort-configs/${configId}/students${qs ? `?${qs}` : ''}`,
  );
  return { data: res.data, pagination: res.pagination, meta: res.meta };
}

// ── Cohort-wide Evaluation Summary (all evaluations at once) ─────────────────

export interface CohortEvaluationSummarySecondaryPanelist {
  evaluatorId: string;
  totalMarks: number | null;
}

export interface CohortEvaluationSummaryMarks {
  total: number | null;    // best of the panel's totals, plus the primary's own artifact-only marks
  average: number | null;  // same composition, panel part averaged instead of best-of
  primary: number | null;  // primary mentor's own total
  secondaryPanelists: CohortEvaluationSummarySecondaryPanelist[];
  totalPercentage: number | null;
  averagePercentage: number | null;
}

export interface CohortEvaluationSummaryStudent {
  studentId: string;
  fullName: string | null;
  rollNumber: string | null;
  batch: string | null;
  track: string | null;
  // marks[configId] -> that evaluation's marks for this student. Every
  // config the cohort has gets an entry, defaulted to nulls/[] rather than
  // omitted when the student hasn't been evaluated on it.
  marks: Record<string, CohortEvaluationSummaryMarks>;
  // Total marks over total available across every SCORED evaluation, not
  // the mean of each one's own percentage — see overallPercentage in the
  // backend's evaluationScoring.ts for why those disagree. Null until at
  // least one evaluation is scored.
  overallPercentage: number | null;
}

export interface CohortEvaluationSummaryEvaluation {
  configId: string;
  name: string;
  maxMarks: number;
}

export interface CohortEvaluationSummaryResult {
  data: CohortEvaluationSummaryStudent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  meta: { cohortId: string; evaluations: CohortEvaluationSummaryEvaluation[] };
}

export async function apiGetCohortEvaluationSummary(
  cohortId: string,
  params: { page?: number; limit?: number; search?: string; batch?: string } = {},
): Promise<CohortEvaluationSummaryResult> {
  const q = new URLSearchParams({ cohort_id: cohortId });
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  if (params.batch) q.set('batch', params.batch);
  const res = await apiFetch<{ success: boolean } & CohortEvaluationSummaryResult>(
    `/api/v1/evaluations/summary?${q.toString()}`,
  );
  return { data: res.data, pagination: res.pagination, meta: res.meta };
}

// ── Mentor panel load (base facts for a load meter) ─────────────────────────

export interface MentorPanelLoad {
  mentorId: string;
  mentorName: string;
  primaryStudentCount: number;
  primaryTeamCount: number;
  secondaryStudentCount: number;
  secondaryTeamCount: number;
}

interface RawMentorPanelLoad {
  mentorId: string;
  mentorName: string;
  primaryStudentCount: number;
  primaryTeamCount: number;
  secondaryStudentCount: number;
  secondaryTeamCount: number;
}

// Existing committed load only — a config still being set up (not yet
// activated) contributes nothing here, since its panelist rows don't exist
// yet. Sparse: only mentors already holding at least one panelist row in
// this cohort appear; a caller with the cohort's full mentor list treats
// anyone absent as zero.
export async function apiGetMentorPanelLoad(cohortId: string): Promise<MentorPanelLoad[]> {
  const res = await apiFetch<{ data: RawMentorPanelLoad[] }>(`/api/v1/evaluations/cohorts/${cohortId}/mentor-panel-load`);
  return res.data;
}

export interface MentorsByTrack {
  trackId: string;
  mentorIds: string[];
}

// Live-allocation based, not the track-config staffing roster — a mentor
// staffed for a track with nobody assigned yet won't appear here. See the
// backend's own doc comment on why that distinction matters for this list.
export async function apiGetMentorsByTrack(cohortId: string): Promise<MentorsByTrack[]> {
  const res = await apiFetch<{ data: MentorsByTrack[] }>(`/api/v1/evaluations/cohorts/${cohortId}/mentors-by-track`);
  return res.data;
}

export interface MentorWorkload {
  mentorId: string;
  trackIds: string[];
  teamCount: number;
  studentCount: number;
}

// Each mentor's actual current team/student load in this cohort — not a
// panel-load concept, just "who they're really mentoring right now."
export async function apiGetMentorWorkload(cohortId: string): Promise<MentorWorkload[]> {
  const res = await apiFetch<{ data: MentorWorkload[] }>(`/api/v1/evaluations/cohorts/${cohortId}/mentor-workload`);
  return res.data;
}

// ── Student's own view (redacted — no marks, ever) ──────────────────────────

interface RawStudentVisibleEvaluation {
  id: string;
  evaluationName: string;
  startDate: string;
  endDate: string;
  primaryMentorName: string | null;
  secondaryMentorNames: string[];
}

export async function apiGetMyEvaluationsRedacted(): Promise<StudentVisibleEvaluation[]> {
  const res = await apiFetch<{ data: RawStudentVisibleEvaluation[] }>('/api/v1/evaluations/mine');
  return res.data;
}
