import { apiFetch } from './client';

/**
 * The Student Feedback Framework, mirrored from
 * src/domain/skillAssessmentFramework.ts on the backend.
 *
 * Hardcoded on both sides by design: there is no admin config for the rubric,
 * so the two simply agree on the same list rather than one fetching it from
 * the other. What is NOT duplicated here is any arithmetic — the dimensions,
 * the final rating and the execution-vs-understanding comparison all arrive
 * computed, so a threshold or a wording can only ever be changed in one place.
 */
export interface FrameworkParameter {
  key: string;
  label: string;
  guidingQuestion: string;
}

export const FRAMEWORK_PARAMETERS: FrameworkParameter[] = [
  { key: 'techStackUnderstanding', label: 'Technical / Tech Stack Understanding', guidingQuestion: 'Can the student explain what they are using, how it works, and why it is appropriate?' },
  { key: 'architectureSystemUnderstanding', label: 'Architecture & System Understanding', guidingQuestion: 'Can the student explain how their work fits into and interacts with the overall system?' },
  { key: 'problemSolvingDs', label: 'Problem Solving & DS', guidingQuestion: 'Can the student reason through a technical problem and arrive at a sound solution?' },
  { key: 'problemDecomposition', label: 'Problem Decomposition', guidingQuestion: 'Can the student break a requirement or problem into clear, manageable engineering tasks?' },
  { key: 'codeQuality', label: 'Code Quality', guidingQuestion: 'Can the student produce code that another engineer can understand, maintain, and safely modify?' },
  { key: 'debugging', label: 'Debugging', guidingQuestion: 'Can the student systematically identify the root cause rather than rely on trial and error?' },
  { key: 'testingValidation', label: 'Testing & Validation', guidingQuestion: 'Can the student independently verify correctness and consider relevant edge cases?' },
  { key: 'engineeringWorkflow', label: 'Engineering Workflow', guidingQuestion: 'Can the student follow a professional workflow from issue to implementation, review, and completion?' },
  { key: 'ownershipIndependence', label: 'Ownership & Independence', guidingQuestion: 'Can the student make meaningful progress without continuous mentor intervention and seek help appropriately?' },
  { key: 'communication', label: 'Communication', guidingQuestion: 'Can the student clearly communicate progress, problems, decisions, and technical reasoning?' },
];

export type DimensionKey = 'technicalUnderstanding' | 'engineeringExecution' | 'professionalCapability';

export interface FrameworkDimension {
  key: DimensionKey;
  label: string;
  guidingQuestion: string;
  parameters: string[];
}

/** Groups are deliberately uneven (3, 5, 2) — each dimension averages its own parameters. */
export const FRAMEWORK_DIMENSIONS: FrameworkDimension[] = [
  {
    key: 'technicalUnderstanding',
    label: 'Technical Understanding',
    guidingQuestion: 'Does the student understand what they are doing and why it works?',
    parameters: ['techStackUnderstanding', 'architectureSystemUnderstanding', 'problemSolvingDs'],
  },
  {
    key: 'engineeringExecution',
    label: 'Engineering Execution',
    guidingQuestion: 'Can the student turn a requirement or problem into a working, tested, and maintainable solution?',
    parameters: ['problemDecomposition', 'codeQuality', 'debugging', 'testingValidation', 'engineeringWorkflow'],
  },
  {
    key: 'professionalCapability',
    label: 'Professional Capability',
    guidingQuestion: 'Can the student operate effectively as a junior engineer within a professional team?',
    parameters: ['ownershipIndependence', 'communication'],
  },
];

/**
 * 1 is a floor, not a judgement — where a student sits when they have taken
 * part but there is nothing yet to assess. The framework's own four levels
 * sit above it, at 2 through 5.
 */
export const RATING_LEVELS = [
  { value: 1, label: 'Not Demonstrated', description: 'Has taken part, but has not yet shown this capability' },
  { value: 2, label: 'Not Ready', description: 'Cannot demonstrate the capability independently' },
  { value: 3, label: 'Developing', description: 'Can demonstrate the capability with significant guidance' },
  { value: 4, label: 'Independent', description: 'Can demonstrate the capability independently at a junior-engineer level' },
  { value: 5, label: 'Strong', description: 'Demonstrates depth, sound judgment, and handles unfamiliar situations effectively' },
];

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const COMMUNICATION_KEY = 'communication';
export const CURRENT_FRAMEWORK_VERSION = 2;

/**
 * The nine-parameter rubric that predates the framework, kept only so history
 * written under it still renders. Nothing new is ever recorded against it.
 *
 * It also runs 1-5, so its numbers look interchangeable with the framework's
 * and are not: they rate nine different things. Only frameworkVersion says
 * which rubric a row came from, and nothing should average across the two.
 */
export const LEGACY_PARAMETERS: { key: string; label: string }[] = [
  { key: 'techStack', label: 'Tech Stack' },
  { key: 'dsa', label: 'DSA' },
  { key: 'conceptualUnderstanding', label: 'Conceptual Understanding' },
  { key: 'problemSolving', label: 'Problem Solving' },
  { key: 'debugging', label: 'Debugging' },
  { key: 'systemDesign', label: 'System Design Basics' },
  { key: 'codeQuality', label: 'Code Quality' },
  { key: 'communication', label: 'Communication' },
  { key: 'ownership', label: 'Ownership & Collaboration' },
];
export const LEGACY_MAX_SCORE = 5;

/** The flat average a legacy row was summarised by — for rendering old history only. */
export function legacyAverage(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

export interface AssessmentComparison {
  relation: 'better_than' | 'as_good_as' | 'weaker_than';
  label: string;
}

export interface ApiSkillAssessment {
  id: string;
  studentId: string;
  mentorId: string;
  mentorName: string | null;
  cohortId: string;
  /** 1 = the legacy nine-parameter rubric, 2 = the framework. */
  frameworkVersion: number;
  scores: Record<string, number>;
  technicalUnderstanding: number | null;
  engineeringExecution: number | null;
  professionalCapability: number | null;
  finalRating: number | null;
  comparison: AssessmentComparison | null;
  note: string | null;
  assessedAt: string;
}

/**
 * A student's own assessment, as the backend gives it to them.
 *
 * Deliberately not ApiSkillAssessment: the server withholds the parameter
 * scores, the three dimension values and the comparison from a student's own
 * read, so those fields genuinely are not on the wire. Typing this response as
 * the full record would invite a page to reach for a field that is always
 * undefined and render "—" as if the student had never been rated on it.
 */
export interface ApiMyAssessment {
  id: string;
  cohortId: string;
  mentorName: string | null;
  /** 1 = the earlier nine-parameter rubric, 2 = the framework. */
  frameworkVersion: number;
  /** Already the right number for either rubric — the backend resolves which. */
  finalRating: number | null;
  note: string | null;
  assessedAt: string;
}

export interface ApiCohortStudentAssessment {
  studentId: string;
  fullName: string | null;
  rollNumber: string | null;
  teamId: string | null;
  teamName: string | null;
  trackId: string | null;
  mentorId: string | null;
  mentorName: string | null;
  /** Null when this student has never been assessed under the current framework. */
  assessmentId: string | null;
  technicalUnderstanding: number | null;
  engineeringExecution: number | null;
  professionalCapability: number | null;
  finalRating: number | null;
  communication: number | null;
  comparison: AssessmentComparison | null;
  note: string | null;
  assessedAt: string | null;
}

export type CohortAssessmentSort =
  | 'name'
  | 'technicalUnderstanding'
  | 'engineeringExecution'
  | 'professionalCapability'
  | 'finalRating'
  | 'communication'
  | 'assessedAt';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface RawPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const toPageMeta = (p: RawPagination): PageMeta => ({ ...p, totalPages: p.pages });

/**
 * A new assessment snapshot. Mentor-only, and only that student's own mentor
 * in this OJT — the backend is the actual authority on both. Append-only: this
 * never overwrites a previous read.
 */
export async function apiCreateSkillAssessment(
  studentId: string,
  payload: { cohortId: string; scores: Record<string, number>; note?: string }
): Promise<ApiSkillAssessment> {
  const res = await apiFetch<{ data: ApiSkillAssessment }>(`/api/v1/students/${studentId}/skill-assessments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

/** One student's history in one OJT, newest first. Admin, or that student's own mentor. */
export async function apiListSkillAssessments(
  studentId: string,
  cohortId: string,
  params: { page?: number; limit?: number } = {}
): Promise<{ data: ApiSkillAssessment[]; pagination: PageMeta }> {
  const query = new URLSearchParams({ cohortId });
  query.set('page', String(params.page ?? 1));
  query.set('limit', String(params.limit ?? 20));
  const body = await apiFetch<{ data: ApiSkillAssessment[]; pagination: RawPagination }>(
    `/api/v1/students/${studentId}/skill-assessments?${query.toString()}`
  );
  return { data: body.data, pagination: toPageMeta(body.pagination) };
}

/**
 * The signed-in student's own history — final ratings and mentor feedback
 * only, see ApiMyAssessment. Omit cohortId to get their current OJT.
 */
export async function apiGetMySkillAssessments(
  params: { cohortId?: string; page?: number; limit?: number } = {}
): Promise<{ data: ApiMyAssessment[]; pagination: PageMeta }> {
  const query = new URLSearchParams();
  if (params.cohortId) query.set('cohortId', params.cohortId);
  query.set('page', String(params.page ?? 1));
  query.set('limit', String(params.limit ?? 20));
  const body = await apiFetch<{ data: ApiMyAssessment[]; pagination: RawPagination }>(
    `/api/v1/students/me/skill-assessments?${query.toString()}`
  );
  return { data: body.data, pagination: toPageMeta(body.pagination) };
}

/** Every student in an OJT with their latest assessment, including those with none. Admin-only. */
export async function apiListCohortAssessments(
  cohortId: string,
  params: {
    search?: string;
    trackId?: string;
    teamId?: string;
    mentorId?: string;
    assessed?: 'yes' | 'no';
    sort?: CohortAssessmentSort;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  } = {}
): Promise<{ data: ApiCohortStudentAssessment[]; pagination: PageMeta }> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.trackId) query.set('trackId', params.trackId);
  if (params.teamId) query.set('teamId', params.teamId);
  if (params.mentorId) query.set('mentorId', params.mentorId);
  if (params.assessed) query.set('assessed', params.assessed);
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);
  query.set('page', String(params.page ?? 1));
  query.set('limit', String(params.limit ?? 20));
  const body = await apiFetch<{ data: ApiCohortStudentAssessment[]; pagination: RawPagination }>(
    `/api/v1/cohorts/${cohortId}/skill-assessments?${query.toString()}`
  );
  return { data: body.data, pagination: toPageMeta(body.pagination) };
}
