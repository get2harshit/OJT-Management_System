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
