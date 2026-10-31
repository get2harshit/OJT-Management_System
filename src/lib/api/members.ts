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

// ── Listing, editing and removing admins and mentors ─────────────────────────
//
// Removing takes one role away, not the person: an admin who also mentors
// keeps mentoring. The email is never edited — it is their Google sign-in.

export type StaffRole = 'admin' | 'mentor';

export interface StaffMember {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  createdAt: string;
  /** Also a live admin (shown on the mentor list). */
  isAdmin: boolean;
  /** Also a live mentor (shown on the admin list). */
  isMentor: boolean;
  /** Mentors only. */
  isExternal: boolean | null;
}

export interface StaffMemberPage {
  data: StaffMember[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const STAFF_PATH: Record<StaffRole, string> = {
  admin: '/api/v1/members/admins',
  mentor: '/api/v1/members/mentors',
};

export async function apiListStaff(role: StaffRole, params: { page: number; limit: number; search?: string }): Promise<StaffMemberPage> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search) query.set('search', params.search);
  const body = await apiFetch<{ data: StaffMember[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
    `${STAFF_PATH[role]}?${query.toString()}`
  );
  return { data: body.data, pagination: { ...body.pagination, totalPages: body.pagination.pages } };
}

export interface StaffEdit {
  fullName?: string;
  /** Empty clears it. */
  phoneNumber?: string | null;
  /** Mentors only. */
  isExternal?: boolean;
}

export async function apiUpdateStaff(role: StaffRole, id: string, edit: StaffEdit): Promise<StaffMember> {
  const { data } = await apiFetch<{ data: StaffMember }>(`${STAFF_PATH[role]}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(edit),
  });
  return data;
}

/** Refused (with the reason as the message) for yourself, the last admin, or a mentor who still has teams. */
export async function apiRemoveStaff(role: StaffRole, id: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`${STAFF_PATH[role]}/${id}`, { method: 'DELETE' });
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
