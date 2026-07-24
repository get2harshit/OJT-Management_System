import type {
  EvaluationTypeTemplate,
  EvaluationMode,
  RubricTemplate,
  RubricCriterion,
  CohortEvaluationConfig,
  EvaluationMentorPairing,
  StudentEvaluationSummary,
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
