import { useState, useEffect } from 'react';
import { Eye, CheckCircle2, RotateCcw, ArrowLeft, History, Loader2, Clock, Download } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import PdfViewer from '../../components/PdfViewer';
import type { PrdSubmission, StudentAllocation, DocumentType } from '../../lib/types';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from '../../lib/types';
import {
  apiGetAllPrdSubmissions,
  apiGetAllocation,
  apiListStudents,
  apiReviewPrdSubmission,
  apiGetPrdDownloadUrl,
} from '../../lib/api';

interface Props {
  mentorId: string;
}

type Row = PrdSubmission & {
  studentName: string;
  rollNumber: string;
  track: string;
};

// Strips the GCS upload timestamp prefix (e.g. "1783945358386_report.pdf")
// so the UI shows the original filename the student uploaded.
function fileNameFromGcsUri(uri: string): string {
  const parts = uri.split('/');
  const name = parts[parts.length - 1] || uri;
  return name.replace(/^\d{10,}_/, '');
}

function statusBadgeClass(status: string): string {
  if (status === 'approved') return 'bg-green-500/10 text-green-400 border border-green-500/20';
  if (status === 'changes_requested') return 'bg-red-500/10 text-red-400 border border-red-500/20';
  return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
}

export default function MentorSubmissions({ mentorId }: Partial<Props> & { mentorId: string }) {
  const [selectedType, setSelectedType] = useState<DocumentType | 'ALL'>('ALL');
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const loadSubmissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allSubs, allStudents] = await Promise.all([apiGetAllPrdSubmissions(), apiListStudents()]);
      const studentsById = new Map(allStudents.map(s => [s.id, s]));

      const uniqueAllocationIds = Array.from(new Set(allSubs.map(s => s.allocationId)));
      const allocations = await Promise.all(uniqueAllocationIds.map(id => apiGetAllocation(id).catch(() => null)));
      const allocationsById = new Map<string, StudentAllocation>();
      allocations.forEach((alloc, idx) => {
        if (alloc) allocationsById.set(uniqueAllocationIds[idx], alloc);
      });

      const mapped: Row[] = allSubs
        .filter(s => {
          const alloc = allocationsById.get(s.allocationId);
          return alloc?.primaryMentorId === mentorId || alloc?.secondaryMentorId === mentorId;
        })
        .map(s => {
          const alloc = allocationsById.get(s.allocationId);
          const student = alloc ? studentsById.get(alloc.studentId) : undefined;
          return {
            ...s,
            studentName: student?.fullName ?? '-',
            rollNumber: student?.rollNumber ?? '-',
            track: student?.track ?? '-',
          };
        });
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  const filteredRows = rows.filter(r => selectedType === 'ALL' || r.documentType === selectedType);
  const activeSub = rows.find(r => r.id === selectedSubId);

  // Load the embedded preview automatically when a submission opens.
  useEffect(() => {
    if (!activeSub) {
      setViewerUrl(null);
      return;
    }
    let cancelled = false;
    apiGetPrdDownloadUrl(activeSub.id)
      .then((url) => { if (!cancelled) setViewerUrl(url); })
      .catch(() => { if (!cancelled) setViewerUrl(null); });
    return () => { cancelled = true; };
  }, [activeSub?.id]);

  const handleDownload = async (sub: Row) => {
    setDownloadError(null);
    setDownloadingId(sub.id);
    try {
      const url = await apiGetPrdDownloadUrl(sub.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to generate download link');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleReview = async (sub: Row, status: 'under_review' | 'changes_requested' | 'approved') => {
    setReviewing(true);
    setError(null);
    try {
      await apiReviewPrdSubmission(sub.id, status, reviewFeedback.trim() || undefined);
      setReviewFeedback('');
      await loadSubmissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update review');
    } finally {
      setReviewing(false);
    }
  };

  // Shared between the normal panel position and the PdfViewer's fullscreen
  // mode, so a mentor can review from inside the expanded reader without
  // switching back to the compact view first.
  const reviewControls = activeSub && (
    <div className="space-y-3 pt-2">
      <textarea
        value={reviewFeedback}
        onChange={e => setReviewFeedback(e.target.value)}
        placeholder="Feedback for the student (optional)..."
        rows={3}
        className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => handleReview(activeSub, 'under_review')}
          disabled={reviewing}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-700 text-white font-semibold rounded-lg hover:bg-zinc-600 transition-colors text-sm disabled:opacity-50"
        >
          <Clock size={16} />
          Mark Under Review
        </button>
        <button
          onClick={() => handleReview(activeSub, 'approved')}
          disabled={reviewing}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
        >
          <CheckCircle2 size={16} />
          Approve
        </button>
        <button
          onClick={() => handleReview(activeSub, 'changes_requested')}
          disabled={reviewing}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-650 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
        >
          <RotateCcw size={16} />
          Request Changes
        </button>
      </div>
    </div>
  );

  if (activeSub) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedSubId(null)}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-850 text-gray-300 rounded-lg hover:text-white hover:bg-zinc-750 transition-all text-sm font-semibold border border-zinc-700"
        >
          <ArrowLeft size={16} />
          Back to Submissions
        </button>

        <div className="max-w-4xl mx-auto">
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusBadgeClass(activeSub.status)}`}>
                    {activeSub.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  <h2 className="text-base font-bold text-white">
                    {DOCUMENT_TYPE_LABELS[activeSub.documentType]} Document v{activeSub.versionNumber}
                  </h2>
                </div>
                <p className="text-xs text-gray-500 mt-1.5 truncate">
                  {activeSub.studentName} ({activeSub.rollNumber}) · {activeSub.track} · Submitted {activeSub.updatedAt.slice(0, 10)}
                </p>
              </div>

              <button
                onClick={() => setHistoryModalOpen(true)}
                className="relative flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-750 text-gray-300 hover:text-white hover:border-zinc-600 rounded-lg text-xs font-medium transition-colors shrink-0"
              >
                <History size={14} />
                Review History
                {activeSub.mentorFeedback && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-gold rounded-full" />
                )}
              </button>
            </div>

            <hr className="border-zinc-750" />

            <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-3 flex items-center justify-between gap-3">
              <span className="text-sm text-gray-300 font-medium truncate">{fileNameFromGcsUri(activeSub.documentLink)}</span>
              <button
                onClick={() => handleDownload(activeSub)}
                disabled={downloadingId === activeSub.id}
                className="p-1.5 text-gray-400 hover:text-gold transition-colors disabled:opacity-50 shrink-0"
                title="Download file"
                aria-label="Download file"
              >
                {downloadingId === activeSub.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            </div>
            {downloadError && <p className="text-xs text-red-400">{downloadError}</p>}

            {viewerUrl && <PdfViewer url={viewerUrl} fullscreenExtra={reviewControls} />}

            {reviewControls}
          </div>
        </div>

        <Modal open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} title="Review History">
          {activeSub.mentorFeedback ? (
            <div className="p-3 rounded-lg bg-zinc-750 text-gray-200 text-sm">
              {activeSub.mentorFeedback}
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-6">No feedback submitted yet for this version.</p>
          )}
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Submissions</h1>
        <p className="text-gray-400 text-sm mt-1">Review and manage student submissions</p>
      </div>

      {error && !activeSub && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Document Type Filter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {DOCUMENT_TYPES.map((type) => {
          const isSelected = selectedType === type;
          const count = rows.filter(r => r.documentType === type).length;
          return (
            <button
              key={type}
              onClick={() => setSelectedType(isSelected ? 'ALL' : type)}
              className={`bg-zinc-850 border rounded-xl p-5 text-left transition-all hover:scale-[1.02] ${isSelected ? 'border-gold shadow-lg shadow-gold/5' : 'border-zinc-750 hover:border-zinc-600'
                }`}
            >
              <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{DOCUMENT_TYPE_LABELS[type]}</h4>
              <p className="text-3xl font-bold text-white mt-2 flex items-center gap-2">
                {loading ? <Loader2 size={22} className="animate-spin text-gray-500" /> : count}
              </p>
              <p className="text-xs text-gray-500 mt-1">{isSelected ? 'Click to show all' : 'Click to filter'}</p>
            </button>
          );
        })}
      </div>

      <DataTable
        columns={[
          { key: 'studentName', header: 'Student' },
          { key: 'rollNumber', header: 'Roll Number' },
          { key: 'documentType', header: 'Type', render: (row) => DOCUMENT_TYPE_LABELS[row.documentType] },
          { key: 'documentLink', header: 'File', render: (row) => fileNameFromGcsUri(row.documentLink) },
          { key: 'versionNumber', header: 'Version' },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeClass(row.status)}`}>
                {row.status.replace(/_/g, ' ').toUpperCase()}
              </span>
            ),
          },
          { key: 'updatedAt', header: 'Submitted', render: (row) => row.updatedAt.slice(0, 10) },
        ]}
        data={filteredRows}
        searchPlaceholder="Search submissions..."
        actions={(row) => (
          <button
            onClick={() => setSelectedSubId(row.id)}
            className="p-1.5 text-gray-400 hover:text-gold transition-colors"
            title="View Submission & Review"
          >
            <Eye size={16} />
          </button>
        )}
      />
    </div>
  );
}
