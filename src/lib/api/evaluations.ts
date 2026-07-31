import type {
  EvaluationTypeTemplate,
  EvaluationMode,
  RubricTemplate,
  RubricCriterion,
  CohortEvaluationConfig,
  EvaluationMentorPairing,
  StudentEvaluationSummary,
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
  evaluation_type_template: RawEvaluationTypeTemplate;
  rubric_template: RawRubricTemplate;
}

interface RawEvaluationMentorPairing {
  id: string;
  internal_mentor_id: string;
  external_mentor_id: string;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapTypeTemplate(raw: RawEvaluationTypeTemplate): EvaluationTypeTemplate {
  return { id: raw.id, name: raw.name, mode: raw.mode };
}

function mapCriterion(raw: RawRubricCriterion): RubricCriterion {
  return { id: raw.id, name: raw.name, maxMarks: Number(raw.max_marks), displayOrder: raw.display_order };
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
    evaluationTypeTemplate: mapTypeTemplate(raw.evaluation_type_template),
    rubricTemplate: mapRubricTemplate(raw.rubric_template),
  };
}

function mapMentorPairing(raw: RawEvaluationMentorPairing): EvaluationMentorPairing {
  return { id: raw.id, internalMentorId: raw.internal_mentor_id, externalMentorId: raw.external_mentor_id };
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
  criteria: { name: string; maxMarks: number }[],
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
    }),
  });
  invalidateEvaluationCaches();
  return mapCohortEvaluationConfig(res.data);
}

// ── Mentor pairings (per internal mentor, per config) ───────────────────────

export async function apiGetMentorPairings(configId: string): Promise<EvaluationMentorPairing[]> {
  const res = await apiFetch<{ data: RawEvaluationMentorPairing[] }>(
    `/api/v1/evaluations/cohort-configs/${configId}/mentor-pairings`,
  );
  return res.data.map(mapMentorPairing);
}

export async function apiSetMentorPairings(
  configId: string,
  pairings: { internalMentorId: string; externalMentorId: string }[],
): Promise<void> {
  await apiFetch(`/api/v1/evaluations/cohort-configs/${configId}/mentor-pairings`, {
    method: 'POST',
    body: JSON.stringify({ pairings }),
  });
  invalidateEvaluationCaches();
}

// ── Activation (bulk-assigns evaluations + panelists for the cohort) ───────

export async function apiActivateCohortEvaluation(configId: string): Promise<{ newlyAssignedCount: number }> {
  const res = await apiFetch<{ data: { newlyAssignedCount: number } }>(
    `/api/v1/evaluations/cohort-configs/${configId}/activate`,
    { method: 'POST' },
  );
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
    myRole: myPanelist?.role ?? 'internal',
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
export async function apiGetMyEvaluationQueue(params: { page?: number; limit?: number } = {}): Promise<EvaluatorQueuePage> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
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
    evaluatedAt: raw.evaluated_at,
  };
}

// Any authenticated caller who's admin, the student themselves, or an
// assigned panelist — the backend enforces this, a rejected request throws.
export async function apiGetEvaluationDetail(evaluationId: string): Promise<EvaluationDetail> {
  const res = await apiFetch<{ data: RawEvaluationDetail }>(`/api/v1/evaluations/${evaluationId}`);
  return mapEvaluationDetail(res.data);
}

// Submits (or re-submits) the caller's own panelist score — one entry per
// rubric criterion name, keys must match exactly what the evaluation's
// rubric_template.criteria declare.
export async function apiScoreEvaluation(
  evaluationId: string,
  scoreBreakdown: Record<string, number>,
  feedback?: string,
): Promise<{ totalMarks: number; finalMarksObtained: number | null }> {
  const res = await apiFetch<{ data: { totalMarks: number; finalMarksObtained: number | null } }>(
    `/api/v1/evaluations/${evaluationId}/score`,
    {
      method: 'PATCH',
      body: JSON.stringify({ score_breakdown: scoreBreakdown, feedback }),
    },
  );
  invalidateEvaluationCaches();
  return res.data;
}

// ── Evaluation Blueprint (one config's full student roster) ──────────────────

export type EvaluationBlueprintStatus = 'not_assigned' | 'pending' | 'evaluated';

// One student's row for a single evaluation. The score maps (internalScores/
// externalScores) are keyed by criterion NAME — the same names as
// meta.criteria — so the page can build one column per (criterion × evaluator)
// dynamically.
export interface EvaluationBlueprintStudent {
  studentId: string;
  fullName: string | null;
  rollNumber: string | null;
  batch: string | null;
  track: string | null;
  status: EvaluationBlueprintStatus;
  finalMarks: number | null;
  internalMentorName: string | null;
  externalMentorName: string | null;
  internalTotal: number | null;
  externalTotal: number | null;
  internalScores: Record<string, number> | null;
  externalScores: Record<string, number> | null;
}

export interface EvaluationBlueprintMeta {
  cohortId: string;
  evaluationName: string;
  mode: EvaluationMode;
  maxMarks: number;
  criteria: { name: string; maxMarks: number }[];
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

export interface CohortEvaluationSummaryMarks {
  total: number | null;    // final = MAX(internal, external)
  internal: number | null; // internal mentor's total
  external: number | null; // external mentor's total
}

export interface CohortEvaluationSummaryStudent {
  studentId: string;
  fullName: string | null;
  rollNumber: string | null;
  batch: string | null;
  track: string | null;
  // marks[configId] -> that evaluation's total/internal/external for this
  // student; absent for evaluations the student hasn't been evaluated on.
  marks: Record<string, CohortEvaluationSummaryMarks>;
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
