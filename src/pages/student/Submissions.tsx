import { useState, useEffect, useMemo } from 'react';
import { Upload, Eye, ArrowLeft, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react';
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
import { apiGetTask, apiListTasks } from '../../lib/api/tasks';
import type { ApiTask, ApiTaskType } from '../../lib/api/tasks';

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
  initialNewSubTaskId,
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
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Set when the upload modal was opened from a specific task's "Submit"
  // button — locks the document type to what that task requires.
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [lockedDocType, setLockedDocType] = useState<DocumentType | null>(null);

  const [myTasks, setMyTasks] = useState<ApiTask[]>([]);

  useEffect(() => {
    if (!studentId) return;
    apiListTasks().then((res) => setMyTasks(res.data || [])).catch(console.error);
  }, [studentId]);

  // Per document type: is there a task of that type still needing a
  // submission (never submitted, or the mentor requested changes), or is
  // every task of that type already completed? Drives which types the
  // standalone "New Submission" picker allows, and the green-tick tiles.
  const typeStatus = useMemo(() => {
    const map: Partial<Record<DocumentType, { status: 'open' | 'done'; taskId: string }>> = {};
    for (const task of myTasks) {
      const type = task.task_type as ApiTaskType | null | undefined;
      if (!type) continue;
      const myAssignment = task.assignments?.find((a) => a.assignee_id === studentId);
      const isOpen = myAssignment?.status !== 'completed';
      const existing = map[type];
      if (!existing || (isOpen && existing.status === 'done')) {
        map[type] = { status: isOpen ? 'open' : 'done', taskId: task.id };
      }
    }
    return map;
  }, [myTasks, studentId]);

  const openTypeOptions = DOCUMENT_TYPES
    .filter((t) => typeStatus[t]?.status === 'open')
    .map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] }));

  const openManualUpload = () => {
    const firstOpen = DOCUMENT_TYPES.find((t) => typeStatus[t]?.status === 'open');
    if (firstOpen) {
      setUploadDocType(firstOpen);
      setActiveTaskId(typeStatus[firstOpen]!.taskId);
    }
    setUploadModalOpen(true);
  };

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

  useEffect(() => {
    if (!initialNewSubTaskId) return;
    let cancelled = false;

    (async () => {
      setActiveTaskId(initialNewSubTaskId);
      try {
        const res = await apiGetTask(initialNewSubTaskId);
        if (cancelled) return;
        const taskType = res.data.task_type as DocumentType | null | undefined;
        if (taskType) {
          setLockedDocType(taskType);
          setUploadDocType(taskType);
        } else {
          setLockedDocType(null);
        }
      } catch {
        if (!cancelled) setLockedDocType(null);
      } finally {
        if (!cancelled) {
          setUploadModalOpen(true);
          onClearInitialState?.();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialNewSubTaskId, onClearInitialState]);

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

  const isMessageType = uploadDocType === 'others';
  const canUpload = !!allocation && (isMessageType ? !!uploadMessage.trim() : !!selectedFile);

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setSelectedFile(null);
    setUploadMessage('');
    setActiveTaskId(null);
    setLockedDocType(null);
    setUploadDocType('prd');
  };

  const handleUpload = async () => {
    if (!allocation || !canUpload) return;
    setUploading(true);
    setError(null);
    try {
      await apiUploadPrd({
        allocationId: allocation.id,
        docType: uploadDocType,
        file: isMessageType ? undefined : selectedFile ?? undefined,
        message: isMessageType ? uploadMessage.trim() : undefined,
        taskId: activeTaskId ?? undefined,
      });
      await loadSubmissions(allocation.id);
      closeUploadModal();
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

              {activeSub.documentLink ? (
                <>
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
                </>
              ) : (
                <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4">
                  <span className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Message</span>
                  <p className="text-sm text-gray-300">{activeSub.messageContent}</p>
                </div>
              )}
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
          onClick={openManualUpload}
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
          const isDone = typeStatus[type]?.status === 'done';
          return (
            <button
              key={type}
              onClick={() => setSelectedType(isSelected ? 'ALL' : type)}
              className={`bg-zinc-850 border rounded-xl p-5 text-left transition-all hover:scale-[1.02] ${isSelected ? 'border-gold shadow-lg shadow-gold/5' : 'border-zinc-750 hover:border-zinc-600'
                }`}
            >
              <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                {DOCUMENT_TYPE_LABELS[type]}
                {isDone && <CheckCircle2 size={13} className="text-green-400" />}
              </h4>
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
          {
            key: 'documentLink',
            header: 'File',
            render: (row) => {
              const link = row.documentLink as string | undefined;
              return link ? fileNameFromGcsUri(link) : <span className="italic text-gray-500">Text message</span>;
            },
          },
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

      <Modal open={uploadModalOpen} onClose={closeUploadModal} title="New Submission">
        <div className="space-y-4">
          {!allocation ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm rounded-lg px-3 py-2.5">
              You don't have a project allocation yet — submissions open once you're allocated to a project.
            </div>
          ) : !lockedDocType && openTypeOptions.length === 0 ? (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg px-3 py-2.5 flex items-center gap-2">
              <CheckCircle2 size={16} />
              Nothing needs your submission right now — every assigned document is already submitted.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Document Type</label>
                <Select
                  value={uploadDocType}
                  onChange={(v) => {
                    setUploadDocType(v as DocumentType);
                    setActiveTaskId(typeStatus[v as DocumentType]?.taskId ?? null);
                  }}
                  className="w-full"
                  disabled={!!lockedDocType}
                  options={lockedDocType ? DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] })) : openTypeOptions}
                />
                {lockedDocType && (
                  <p className="text-xs text-gray-500 mt-1">This task requires a {DOCUMENT_TYPE_LABELS[lockedDocType]} submission.</p>
                )}
              </div>
              {isMessageType ? (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Message</label>
                  <textarea
                    value={uploadMessage}
                    onChange={(e) => setUploadMessage(e.target.value)}
                    placeholder="Describe what you've done..."
                    rows={4}
                    className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors resize-none"
                  />
                </div>
              ) : (
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
              )}
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {(lockedDocType || openTypeOptions.length > 0) && (
            <button
              onClick={handleUpload}
              disabled={!canUpload || uploading}
              className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:hover:bg-gold flex items-center justify-center gap-2"
            >
              {uploading && <Loader2 size={16} className="animate-spin" />}
              {uploading ? 'Uploading…' : 'Submit'}
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
