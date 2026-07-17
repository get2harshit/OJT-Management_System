import type { ReactNode } from 'react';
import { Download, Loader2 } from 'lucide-react';
import PdfViewer from './PdfViewer';
import { fileNameFromGcsUri, statusDotClass } from '../lib/submissionDisplay';
import { DOCUMENT_TYPE_LABELS } from '../lib/types';
import type { DocumentType } from '../lib/types';

interface SubmissionDetailProps {
  status: string;
  documentType: DocumentType;
  versionNumber: number;
  updatedAt: string;
  documentLink?: string;
  messageContent?: string;
  mentorFeedback?: string;
  viewerUrl: string | null;
  downloading: boolean;
  downloadError?: string | null;
  onDownload: () => void;
  // Extra identifying info shown above the submitted date — e.g. the
  // student's name/roll/track on the admin & mentor review screens. Omitted
  // on the student's own view of their own submission.
  headerExtra?: ReactNode;
  // A <ReviewActions/> element, passed only by admin/mentor. Omitted for the
  // student's read-only view, in which case the panel is feedback-only.
  reviewControls?: ReactNode;
}

// The "doc view": document on the left, a feedback/comment panel that's
// always visible on the right — not hidden behind a button+Drawer like the
// previous per-role implementations. Shared by admin/mentor/student
// Submissions pages so the doc-plus-feedback layout only exists once.
export default function SubmissionDetail({
  status,
  documentType,
  versionNumber,
  updatedAt,
  documentLink,
  messageContent,
  mentorFeedback,
  viewerUrl,
  downloading,
  downloadError,
  onDownload,
  headerExtra,
  reviewControls,
}: SubmissionDetailProps) {
  const statusStyle = statusDotClass(status);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
      <div className="lg:col-span-2 space-y-4 min-w-0">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium shrink-0 ${statusStyle.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
              {status.replace(/_/g, ' ').toUpperCase()}
            </span>
            <h2 className="text-lg font-bold text-white">
              {DOCUMENT_TYPE_LABELS[documentType]} Document v{versionNumber}
            </h2>
          </div>
          {headerExtra}
          <p className="text-xs text-gray-500 mt-1">Submitted {updatedAt.slice(0, 10)}</p>
        </div>

        {documentLink ? (
          <>
            <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-3 flex items-center justify-between gap-3">
              <span className="text-sm text-gray-300 font-medium truncate">{fileNameFromGcsUri(documentLink)}</span>
              <button
                onClick={onDownload}
                disabled={downloading}
                className="p-1.5 text-gray-400 hover:text-gold transition-colors disabled:opacity-50 shrink-0"
                title="Download file"
                aria-label="Download file"
              >
                {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            </div>
            {downloadError && <p className="text-xs text-red-400">{downloadError}</p>}
            {viewerUrl && <PdfViewer url={viewerUrl} />}
          </>
        ) : (
          <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4">
            <span className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Message</span>
            <p className="text-sm text-gray-300">{messageContent}</p>
          </div>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-750 rounded-xl p-4 flex flex-col gap-4 h-fit lg:sticky lg:top-6">
        <div>
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-2">Feedback</h3>
          {mentorFeedback ? (
            <div className="p-3 rounded-lg bg-zinc-800 text-gray-200 text-sm">{mentorFeedback}</div>
          ) : (
            <p className="text-gray-500 text-sm">
              {reviewControls
                ? 'No feedback given yet.'
                : `No feedback yet — your submission is currently ${status.replace(/_/g, ' ')}.`}
            </p>
          )}
        </div>
        {reviewControls}
      </div>
    </div>
  );
}
