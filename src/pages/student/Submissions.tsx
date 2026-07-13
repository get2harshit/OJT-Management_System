import { useState, useEffect } from 'react';
import { Upload, Eye, ArrowLeft, MessageSquare, Loader2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import PdfViewer from '../../components/PdfViewer';
import type { PrdSubmission, StudentAllocation, DocumentType } from '../../lib/types';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from '../../lib/types';
import {
  apiGetMyAllocation,
  apiGetPrdSubmissionsByAllocation,
  apiUploadPrd,
  apiGetPrdDownloadUrl,
} from '../../lib/api';

interface Props {
  studentId: string;
  initialSelectedSubId?: string | null;
  initialNewSubTaskId?: string | null;
  onClearInitialState?: () => void;
}

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

export default function StudentSubmissions({
  studentId,
  initialSelectedSubId,
  onClearInitialState,
}: Partial<Props> & { studentId: string }) {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<DocumentType | 'ALL'>('ALL');

  const [allocation, setAllocation] = useState<StudentAllocation | null>(null);
  const [submissions, setSubmissions] = useState<PrdSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadDocType, setUploadDocType] = useState<DocumentType>('prd');
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const loadSubmissions = async (allocationId: string) => {
    const subs = await apiGetPrdSubmissionsByAllocation(allocationId);
    setSubmissions(subs);
  };

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const myAllocation = await apiGetMyAllocation();
        if (cancelled) return;
        setAllocation(myAllocation);
        await loadSubmissions(myAllocation.id);
      } catch (err) {
        if (!cancelled) {
          setAllocation(null);
          // A 404 here just means "not allocated yet" — not a real error.
          const message = err instanceof Error ? err.message : 'Failed to load submissions';
          setError(message.toLowerCase().includes('no project allocation') ? null : message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    if (initialSelectedSubId) {
      setSelectedSubId(initialSelectedSubId);
      onClearInitialState?.();
    }
  }, [initialSelectedSubId, onClearInitialState]);

  const filteredSubmissions = submissions.filter((s) => selectedType === 'ALL' || s.documentType === selectedType);
  const activeSub = submissions.find((s) => s.id === selectedSubId);

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

  const handleDownload = async (sub: PrdSubmission) => {
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

  const handleUpload = async () => {
    if (!allocation || !selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      await apiUploadPrd(selectedFile, allocation.id, uploadDocType);
      await loadSubmissions(allocation.id);
      setSelectedFile(null);
      setUploadModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-4">
              <div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full ${statusBadgeClass(activeSub.status)}`}>
                  {activeSub.status.replace(/_/g, ' ').toUpperCase()}
                </span>
                <h2 className="text-xl font-bold text-white mt-2">
                  {DOCUMENT_TYPE_LABELS[activeSub.documentType]} Document v{activeSub.versionNumber}
                </h2>
              </div>

              <hr className="border-zinc-750" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block">Version</span>
                  <span className="text-gray-300 font-semibold">v{activeSub.versionNumber}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Submitted Date</span>
                  <span className="text-gray-300 font-semibold">{activeSub.updatedAt.slice(0, 10)}</span>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wider block">Attachment</span>
                  <span className="text-sm text-gray-300 font-medium">{fileNameFromGcsUri(activeSub.documentLink)}</span>
                </div>
                <button
                  onClick={() => handleDownload(activeSub)}
                  disabled={downloadingId === activeSub.id}
                  className="px-3.5 py-1.5 bg-gold text-black font-semibold rounded-lg text-xs hover:bg-gold-hover hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
                >
                  {downloadingId === activeSub.id ? 'Generating link…' : 'Download File'}
                </button>
              </div>
              {downloadError && <p className="text-xs text-red-400">{downloadError}</p>}

              {viewerUrl && <PdfViewer url={viewerUrl} />}
            </div>
          </div>

          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 flex flex-col h-[400px]">
            <div className="flex items-center gap-2 border-b border-zinc-750 pb-3 mb-4">
              <MessageSquare size={18} className="text-gold" />
              <h3 className="text-lg font-semibold text-white">Mentor Feedback</h3>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {activeSub.mentorFeedback ? (
                <div className="p-3 rounded-lg bg-zinc-750 text-gray-200 text-sm">
                  {activeSub.mentorFeedback}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center px-4">
                  No feedback yet — your submission is currently {activeSub.status.replace(/_/g, ' ')}.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Submissions</h1>
          <p className="text-gray-400 text-sm mt-1">Upload and track your project documents</p>
        </div>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
        >
          <Upload size={18} />
          New Submission
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Document Type Filter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {DOCUMENT_TYPES.map((type) => {
          const isSelected = selectedType === type;
          const count = submissions.filter((s) => s.documentType === type).length;
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
        data={filteredSubmissions}
        searchPlaceholder="Search submissions..."
        actions={(row) => (
          <button
            onClick={() => setSelectedSubId(row.id)}
            className="p-1.5 text-gray-400 hover:text-gold transition-colors"
            title="View Submission Details"
          >
            <Eye size={16} />
          </button>
        )}
      />

      <Modal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} title="New Submission">
        <div className="space-y-4">
          {!allocation ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm rounded-lg px-3 py-2.5">
              You don't have a project allocation yet — submissions open once you're allocated to a project.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Document Type</label>
                <Select
                  value={uploadDocType}
                  onChange={(v) => setUploadDocType(v as DocumentType)}
                  className="w-full"
                  options={DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Document (PDF)</label>
                <label className="border-2 border-dashed border-zinc-750 rounded-lg p-6 text-center hover:border-gold/40 transition-colors block cursor-pointer">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  />
                  <Upload size={24} className="mx-auto text-gray-500 mb-2" />
                  <p className="text-sm text-gray-500">
                    {selectedFile ? selectedFile.name : 'Click to select a PDF'}
                  </p>
                </label>
              </div>
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={handleUpload}
            disabled={!allocation || !selectedFile || uploading}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:hover:bg-gold flex items-center justify-center gap-2"
          >
            {uploading && <Loader2 size={16} className="animate-spin" />}
            {uploading ? 'Uploading…' : 'Submit'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
