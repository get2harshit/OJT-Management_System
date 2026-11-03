// Admin "Student Reports" sheet: one row per student, grouped by team so a
// team's shared project shows once. Paged by team on the server; see
// GET /cohorts/:cohortId/student-report.
import { apiFetch } from './client';

/** submitted: there is a submission. pending: none yet, deadline ahead.
 * not_submitted: none, deadline passed. not_assigned: never given the task. */
export type StudentReportTaskState = 'submitted' | 'pending' | 'not_submitted' | 'not_assigned';

export interface StudentReportTaskCell {
  state: StudentReportTaskState;
  submissionId: string | null;
  submissionType: string | null;
  /** Link-type submissions only. */
  links: string[];
  /** Text-type submissions only. */
  text: string | null;
  /** A document or video, opened through apiGetPrdDownloadUrl(submissionId). */
  hasFile: boolean;
  /** Export only: a week-long signed link to the file. */
  downloadUrl?: string;
  reviewStatus: string | null;
  submittedAt: string | null;
  /** How late the work first came in after the due date; null when on time or not submitted. */
  lateByMs: number | null;
}

export interface StudentReportRow {
  /** Rows sharing this are one team. A student on no team is a group of one. */
  groupKey: string;
  studentId: string;
  fullName: string;
  email: string;
  batch: string | null;
  teamName: string | null;
  trackName: string | null;
  mentorName: string | null;
  projectId: string | null;
  projectTitle: string | null;
  projectDescription: string | null;
  attendance: {
    present: number;
    absent: number;
    excused: number;
    notMarked: number;
    totalSessions: number;
    percentage: number | null;
  };
  feedback: { note: string; assessedAt: string; mentorName: string | null } | null;
  evaluations: Record<string, { marks: number | null; attendance: 'present' | 'absent' | 'excused' | null }>;
  tasks: Record<string, StudentReportTaskCell>;
  /** The chosen rating columns from the latest assessment; null when never assessed. */
  ratings: { assessedAt: string; values: Record<string, number | null> } | null;
}

/** An assessment rating the sheet can show: finalRating, a dimension or a parameter. */
export interface StudentReportRatingColumn {
  key: string;
  label: string;
}

export interface StudentReportTaskColumn {
  id: string;
  title: string;
  deadline: string;
}

/** An admin task the sheet can add as a column. */
export interface StudentReportTaskOption {
  id: string;
  title: string;
  week: string;
  deadline: string;
  /** How many of the students matching the filters it is assigned to. */
  assignedCount: number;
}

export interface StudentReportEvaluationColumn {
  configId: string;
  label: string;
  maxMarks: number;
}

export interface StudentReportParams {
  page?: number;
  /** Teams per page, not students. */
  limit?: number;
  search?: string;
  batches?: string[];
  /** Track slugs. */
  tracks?: string[];
  /** Any of these mentors. */
  mentorIds?: string[];
  /** Task columns, in display order. */
  taskIds?: string[];
  /** Rating columns (StudentReportRatingColumn keys). */
  ratingKeys?: string[];
}

export interface StudentReport {
  rows: StudentReportRow[];
  taskColumns: StudentReportTaskColumn[];
  ratingColumns: StudentReportRatingColumn[];
  /** Every rating an admin can add, for the column picker. */
  ratingOptions: StudentReportRatingColumn[];
  evaluationColumns: StudentReportEvaluationColumn[];
  batches: string[];
}

export interface StudentReportPage extends StudentReport {
  /** total and totalPages count teams. */
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface StudentReportBody {
  data: {
    rows: StudentReportRow[];
    taskColumns: StudentReportTaskColumn[];
    ratingColumns: StudentReportRatingColumn[];
    ratingOptions: StudentReportRatingColumn[];
    evaluationColumns: StudentReportEvaluationColumn[];
  };
  pagination: { page: number; limit: number; total: number; pages: number } | null;
  batches: string[];
}

function studentReportQuery(params: StudentReportParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  // Repeated keys: the server reads them as a list.
  params.batches?.forEach((batch) => query.append('batch', batch));
  params.tracks?.forEach((track) => query.append('track', track));
  params.taskIds?.forEach((taskId) => query.append('task', taskId));
  params.ratingKeys?.forEach((ratingKey) => query.append('rating', ratingKey));
  params.mentorIds?.forEach((mentorId) => query.append('mentor', mentorId));
  return query;
}

export async function apiGetStudentReport(cohortId: string, params: StudentReportParams): Promise<StudentReportPage> {
  const query = studentReportQuery(params);
  query.set('page', String(params.page ?? 1));
  query.set('limit', String(params.limit ?? 25));
  const body = await apiFetch<StudentReportBody>(`/api/v1/cohorts/${cohortId}/student-report?${query.toString()}`);
  const pagination = body.pagination ?? { page: 1, limit: body.data.rows.length, total: 0, pages: 1 };
  return { ...body.data, batches: body.batches, pagination: { ...pagination, totalPages: pagination.pages } };
}

/**
 * The task column picker's options: admin-assigned student tasks, narrowed to
 * those given to at least one student matching the batch / track / mentor filters.
 */
export async function apiGetStudentReportTaskOptions(
  cohortId: string,
  params: Pick<StudentReportParams, 'batches' | 'tracks' | 'mentorIds'>
): Promise<StudentReportTaskOption[]> {
  const query = new URLSearchParams();
  params.batches?.forEach((batch) => query.append('batch', batch));
  params.tracks?.forEach((track) => query.append('track', track));
  params.mentorIds?.forEach((mentorId) => query.append('mentor', mentorId));
  const body = await apiFetch<{ data: StudentReportTaskOption[] }>(
    `/api/v1/cohorts/${cohortId}/student-report/task-options?${query.toString()}`
  );
  return body.data;
}

/** The whole filtered sheet, unpaged, with signed file links, for the CSV export. */
export async function apiExportStudentReport(cohortId: string, params: StudentReportParams): Promise<StudentReport> {
  const query = studentReportQuery(params);
  query.set('all', 'true');
  const body = await apiFetch<StudentReportBody>(`/api/v1/cohorts/${cohortId}/student-report?${query.toString()}`);
  return { ...body.data, batches: body.batches };
}
