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
}

export interface StudentReportTaskColumn {
  id: string;
  title: string;
  deadline: string;
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
  mentorId?: string;
  /** Task columns, in display order. */
  taskIds?: string[];
}

export interface StudentReport {
  rows: StudentReportRow[];
  taskColumns: StudentReportTaskColumn[];
  evaluationColumns: StudentReportEvaluationColumn[];
  batches: string[];
}

export interface StudentReportPage extends StudentReport {
  /** total and totalPages count teams. */
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface StudentReportBody {
  data: { rows: StudentReportRow[]; taskColumns: StudentReportTaskColumn[]; evaluationColumns: StudentReportEvaluationColumn[] };
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
  if (params.mentorId) query.set('mentorId', params.mentorId);
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

/** The whole filtered sheet, unpaged, with signed file links, for the CSV export. */
export async function apiExportStudentReport(cohortId: string, params: StudentReportParams): Promise<StudentReport> {
  const query = studentReportQuery(params);
  query.set('all', 'true');
  const body = await apiFetch<StudentReportBody>(`/api/v1/cohorts/${cohortId}/student-report?${query.toString()}`);
  return { ...body.data, batches: body.batches };
}
