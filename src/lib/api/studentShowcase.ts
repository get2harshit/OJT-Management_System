import { API_BASE, apiFetch } from './client';

/**
 * A student's shareable project page.
 *
 * Two audiences, two shapes. The public shape is what a recruiter gets and is
 * deliberately narrower than the editing shape — the backend builds it field
 * by field rather than returning the row, so this type is the whole contract,
 * not a convenient subset of a larger one.
 */

export interface PublicShowcaseQuote {
  authorName: string | null;
  authorRole: string | null;
  body: string;
}

export interface PublicShowcaseScreenshot {
  url: string | null;
  caption: string | null;
}

export interface PublicShowcase {
  slug: string;
  headline: string | null;
  studentName: string | null;
  myContribution: string | null;
  productLink: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  project: {
    title: string;
    description: string | null;
    problemStatement: string | null;
    techStack: string[];
    industry: string | null;
  } | null;
  /** Display names only — the project is team work and the page says so. */
  teammates: string[];
  screenshots: PublicShowcaseScreenshot[];
  reviews: PublicShowcaseQuote[];
  testimonials: PublicShowcaseQuote[];
  publishedAt: string | null;
}

export interface MyShowcaseScreenshot {
  id: string;
  url: string | null;
  caption: string | null;
  position: number;
}

export interface MyShowcaseQuote {
  id: string;
  kind: 'review' | 'testimonial';
  authorName: string | null;
  authorRole: string | null;
  body: string;
  position: number;
}

export interface MyShowcase {
  id: string;
  slug: string;
  isPublished: boolean;
  publishedAt: string | null;
  headline: string | null;
  myContribution: string | null;
  productLink: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  project: { id: string; title: string } | null;
  screenshots: MyShowcaseScreenshot[];
  quotes: MyShowcaseQuote[];
  /** Set when an admin took the page down, so the student is told rather than left guessing. */
  unpublishedByAdmin: { at: string; reason: string | null } | null;
}

/**
 * The public read — a plain fetch, deliberately not apiFetch.
 *
 * apiFetch attaches whatever token is in localStorage and, on a 401, clears it
 * and fires the app's unauthorized event. Neither belongs on a page whose
 * whole point is that it needs no account: a visitor's credentials have no
 * business being sent to it, and a page sitting in a recruiter's inbox must
 * never be able to log somebody out of their own session.
 *
 * Returns null for 404 rather than throwing, because "no page here" is an
 * ordinary outcome — a link that was unpublished — which the caller renders
 * instead of treating as a failure.
 */
export async function apiGetPublicShowcase(slug: string): Promise<PublicShowcase | null> {
  const res = await fetch(`${API_BASE}/api/v1/public/showcases/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (res.status === 429) throw new Error('This page is getting a lot of traffic — try again in a moment.');
  if (!res.ok) throw new Error('Could not load this page');
  const body = (await res.json()) as { data: PublicShowcase };
  return body.data;
}

/** The caller's own page, created on first request. */
export async function apiGetMyShowcase(): Promise<MyShowcase> {
  const res = await apiFetch<{ data: MyShowcase }>('/api/v1/student-showcases/mine');
  return res.data;
}

export async function apiUpdateMyShowcase(
  id: string,
  patch: { headline?: string | null; myContribution?: string | null; productLink?: string | null }
): Promise<MyShowcase> {
  const res = await apiFetch<{ data: MyShowcase }>(`/api/v1/student-showcases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return res.data;
}

/** Separate from saving, so a live page is never caught mid-edit. */
export async function apiPublishMyShowcase(id: string, publish: boolean): Promise<MyShowcase> {
  const res = await apiFetch<{ data: MyShowcase }>(
    `/api/v1/student-showcases/${id}/${publish ? 'publish' : 'unpublish'}`,
    { method: 'POST' }
  );
  return res.data;
}

export async function apiUploadShowcaseAsset(
  id: string,
  kind: 'logo' | 'banner' | 'screenshot',
  file: File
): Promise<MyShowcase> {
  const form = new FormData();
  form.append('image', file);
  const res = await apiFetch<{ data: MyShowcase }>(`/api/v1/student-showcases/${id}/assets/${kind}`, {
    method: 'POST',
    body: form,
  });
  return res.data;
}

export async function apiRemoveShowcaseScreenshot(id: string, assetId: string): Promise<MyShowcase> {
  const res = await apiFetch<{ data: MyShowcase }>(
    `/api/v1/student-showcases/${id}/screenshots/${assetId}`,
    { method: 'DELETE' }
  );
  return res.data;
}

export async function apiAddShowcaseQuote(
  id: string,
  quote: { kind: 'review' | 'testimonial'; authorName?: string; authorRole?: string; body: string }
): Promise<MyShowcase> {
  const res = await apiFetch<{ data: MyShowcase }>(`/api/v1/student-showcases/${id}/quotes`, {
    method: 'POST',
    body: JSON.stringify(quote),
  });
  return res.data;
}

export async function apiRemoveShowcaseQuote(id: string, quoteId: string): Promise<MyShowcase> {
  const res = await apiFetch<{ data: MyShowcase }>(`/api/v1/student-showcases/${id}/quotes/${quoteId}`, {
    method: 'DELETE',
  });
  return res.data;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AdminShowcaseRow {
  id: string;
  slug: string;
  isPublished: boolean;
  publishedAt: string | null;
  headline: string | null;
  studentId: string | null;
  studentName: string | null;
  studentEmail: string | null;
  projectTitle: string | null;
  takenDownAt: string | null;
  takenDownReason: string | null;
}

export async function apiListShowcasesForAdmin(params?: {
  cohortId?: string;
  publishedOnly?: boolean;
}): Promise<AdminShowcaseRow[]> {
  const query = new URLSearchParams();
  if (params?.cohortId) query.set('cohortId', params.cohortId);
  if (params?.publishedOnly) query.set('publishedOnly', 'true');
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const res = await apiFetch<{ data: AdminShowcaseRow[] }>(`/api/v1/admin/student-showcases${suffix}`);
  return res.data;
}

/** The kill switch. Un-publishes only — the student's content is kept. */
export async function apiAdminUnpublishShowcase(id: string, reason: string): Promise<void> {
  await apiFetch(`/api/v1/admin/student-showcases/${id}/unpublish`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
