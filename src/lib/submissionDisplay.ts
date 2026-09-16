import type { SubmissionKind } from './types';

// How a submission's content should be rendered. Rows written before the
// column existed carry no submissionType, and those are always documents.
export function submissionKindOf(
  submission?: { submissionType?: SubmissionKind } | null
): SubmissionKind {
  return submission?.submissionType ?? 'document';
}

// Whether this kind keeps its content as a file in GCS — so viewing or
// downloading it needs a signed URL — rather than inline on the row itself,
// the way text and link submissions carry theirs in messageContent.
//
// One function on purpose. This predicate used to be spelled out at each
// call site, and when video submissions landed only the student page's copy
// was updated: mentor and admin reviewers got a preview pane that sat on
// "Loading preview..." forever, because their effect decided there was no
// file to fetch a URL for before ever asking. Any future kind with a stored
// file (audio, an archive) is now one edit here rather than four.
export function submissionKindHasStoredFile(kind: SubmissionKind): boolean {
  return kind === 'document' || kind === 'video';
}

// Strips the GCS upload timestamp prefix (e.g. "1783945358386_report.pdf")
// so the UI shows the original filename the student uploaded.
export function fileNameFromGcsUri(uri: string): string {
  const parts = uri.split('/');
  const name = parts[parts.length - 1] || uri;
  return name.replace(/^\d{10,}_/, '');
}

export function statusDotClass(status: string): { dot: string; text: string } {
  if (status === 'approved') return { dot: 'bg-green-500', text: 'text-green-500' };
  if (status === 'changes_requested') return { dot: 'bg-red-400', text: 'text-red-400' };
  return { dot: 'bg-gold', text: 'text-gold' };
}

// Maps a submission's raw status to what the UI shows. Kept in one place so
// every screen that renders one (badges, CSV export, toasts) uses the same
// word — `changes_requested` (the raw enum value; the review endpoint is
// literally POST .../review with this status) is deliberately shown as
// "Resubmit", never "Reject" or "Changes Requested": the mentor is asking
// for a resubmission, not rejecting the work. Same rule already applied to
// the task-assignment status enum (pending/review/resubmit/approved) — see
// feedback_task_ui_naming — this is its submission-status counterpart.
const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'In Review',
  changes_requested: 'Resubmit',
  approved: 'Approved',
};

export function submissionStatusLabel(status: string): string {
  return SUBMISSION_STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}
