import { apiFetch } from './client';

// Putting new people on the platform: admins and mentors one at a time,
// students from a CSV. Each creates the person's sign-in account when they
// have none — they then sign in with Google.

export interface AddedMember {
  id: string;
  email: string;
  fullName: string;
  /** A new sign-in account was created, rather than an existing one reused. */
  newAccount: boolean;
}

export async function apiAddAdmin(input: { fullName: string; email: string }): Promise<AddedMember> {
  const { data } = await apiFetch<{ data: AddedMember }>('/api/v1/members/admins', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

export async function apiAddMentor(input: { fullName: string; email: string; isExternal: boolean }): Promise<AddedMember> {
  const { data } = await apiFetch<{ data: AddedMember }>('/api/v1/members/mentors', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data;
}

/** One CSV row as read from the file — every cell a string, any of them blank. */
export interface StudentImportRow {
  fullName: string;
  email: string;
  batch: string;
  registrationNumber: string;
  rollNumber: string;
  semester: string;
  tier: string;
  phoneNumber: string;
}

/** new/exists/invalid come from a preview; created/failed only from an import. */
export type StudentImportStatus = 'new' | 'exists' | 'invalid' | 'created' | 'failed';

export interface StudentImportRowResult {
  /** Position in the submitted rows, 0-based. */
  index: number;
  status: StudentImportStatus;
  email: string;
  fullName: string;
  batch: string;
  reason?: string;
  /** The OJTs the student's batch puts them in. */
  ojts?: string[];
}

export interface StudentImportResult {
  rows: StudentImportRowResult[];
  summary: Record<StudentImportStatus, number>;
}

/** Checks every row against the platform without writing anything. */
export async function apiPreviewStudentImport(rows: StudentImportRow[]): Promise<StudentImportResult> {
  const { data } = await apiFetch<{ data: StudentImportResult }>('/api/v1/members/students/import/preview', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
  return data;
}

/** Creates the new students. The server re-checks every row first. */
export async function apiImportStudents(rows: StudentImportRow[]): Promise<StudentImportResult> {
  const { data } = await apiFetch<{ data: StudentImportResult }>('/api/v1/members/students/import', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
  return data;
}
