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
    <div className="flex flex-col xl:flex-row gap-6 p-6 items-start">
      {/* Left: PRD Viewer */}
      <div className="flex-1 min-w-0 w-full">
        {documentLink ? (
          viewerUrl ? (
            <PdfViewer url={viewerUrl} />
          ) : (
            <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-10 flex items-center justify-center text-gray-500">
              Loading preview...
            </div>
          )
        ) : (
          <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4">
            <span className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Message</span>
            <p className="text-sm text-gray-300">{messageContent}</p>
          </div>
        )}
      </div>

      {/* Right: Metadata & Feedback Box */}
      <div className="w-full xl:w-[400px] shrink-0 space-y-6 xl:sticky xl:top-6">
        
        {/* Metadata */}
        <div>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium shrink-0 ${statusStyle.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
              {status.replace(/_/g, ' ').toUpperCase()}
            </span>
            {documentLink && (
              <div className="flex items-center gap-2">
                {downloadError && <span className="text-xs text-red-400">{downloadError}</span>}
                <button
                  onClick={onDownload}
                  disabled={downloading}
                  className="p-1.5 text-gray-400 hover:text-white transition-colors disabled:opacity-50 bg-zinc-800 hover:bg-zinc-700 rounded-md border border-zinc-700 flex items-center justify-center"
                  title="Download file"
                >
                  {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                </button>
              </div>
            )}
          </div>
          <h2 className="text-xl font-bold text-white mb-1">
            {DOCUMENT_TYPE_LABELS[documentType]} Document v{versionNumber}
          </h2>
          {headerExtra}
          <p className="text-xs text-gray-500 mt-2">Submitted {updatedAt.slice(0, 10)}</p>
        </div>

        {/* Feedback Section */}
        <div className="bg-zinc-900 border border-zinc-750 rounded-xl p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white mb-2 uppercase tracking-wider">Review & Feedback</h3>
            {mentorFeedback ? (
              <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-gray-300 text-sm whitespace-pre-wrap">{mentorFeedback}</div>
            ) : (
              <p className="text-gray-500 text-sm">
                {reviewControls
                  ? 'Provide feedback to the student regarding their submission.'
                  : `No feedback yet — your submission is currently ${status.replace(/_/g, ' ')}.`}
              </p>
            )}
          </div>
          {reviewControls}
        </div>
      </div>
    </div>
  );
}
