import { useState, useEffect, useMemo } from 'react';
import { Upload, ArrowLeft, Loader2 } from 'lucide-react';
import SplitPane from '../../components/SplitPane';
import RosterList from '../../components/RosterList';
import SubmissionDetail from '../../components/SubmissionDetail';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
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
import { statusDotClass } from '../../lib/submissionDisplay';

interface Props {
  studentId: string;
  initialSelectedSubId?: string | null;
  initialNewSubTaskId?: string | null;
  onClearInitialState?: () => void;
}

export default function StudentSubmissions({
  studentId,
  initialSelectedSubId,
  initialNewSubTaskId,
  onClearInitialState,
}: Partial<Props> & { studentId: string }) {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

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
  // every task of that type already completed?
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
    const preferred =
      (selectedType && typeStatus[selectedType]?.status === 'open' ? selectedType : undefined) ??
      DOCUMENT_TYPES.find((t) => typeStatus[t]?.status === 'open');
    if (preferred) {
      setUploadDocType(preferred);
      setActiveTaskId(typeStatus[preferred]!.taskId);
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

  // Keeps the left-side type selection in sync when a submission is opened
  // directly (e.g. from a task's "View Submission" button).
  useEffect(() => {
    if (!selectedSubId) return;
    const sub = submissions.find((s) => s.id === selectedSubId);
    if (sub) setSelectedType(sub.documentType);
  }, [selectedSubId, submissions]);

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
          setSelectedType(taskType);
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

  const typeSubmissions = submissions.filter((s) => s.documentType === selectedType);
  const activeSub = submissions.find((s) => s.id === selectedSubId);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSub?.id]);

  const handleDownload = async () => {
    if (!activeSub) return;
    setDownloadError(null);
    setDownloadingId(activeSub.id);
    try {
      const url = await apiGetPrdDownloadUrl(activeSub.id);
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

  const rosterItems = DOCUMENT_TYPES.map((type) => {
    const status = typeStatus[type]?.status;
    return {
      id: type,
      primaryLabel: DOCUMENT_TYPE_LABELS[type],
      secondaryLabel: status === 'open' ? 'Pending' : status === 'done' ? 'Done' : 'Not assigned',
      badge: submissions.filter((s) => s.documentType === type).length,
      done: status === 'done',
    };
  });

  const selectType = (type: string) => {
    setSelectedType(type as DocumentType);
    setSelectedSubId(null);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="shrink-0 flex items-center justify-between">
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
        <div className="shrink-0 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      <SplitPane
        sidebarCollapsed={!!activeSub}
        sidebar={
          <RosterList
            items={rosterItems}
            selectedId={selectedType}
            onSelect={selectType}
            searchPlaceholder="Search document types..."
          />
        }
      >
        {!allocation ? (
          <div className="h-full flex items-center justify-center text-center px-6">
            <p className="text-gray-500 text-sm">
              You don't have a project allocation yet — submissions open once you're allocated to a project.
            </p>
          </div>
        ) : !selectedType ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Select a document type to view your submissions.
          </div>
        ) : activeSub ? (
          <div className="space-y-0">
            <div className="px-6 pt-6">
              <button
                onClick={() => setSelectedSubId(null)}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-850 text-gray-300 rounded-lg hover:text-white hover:bg-zinc-750 transition-all text-sm font-semibold border border-zinc-700"
              >
                <ArrowLeft size={16} />
                Back to {DOCUMENT_TYPE_LABELS[selectedType]} submissions
              </button>
            </div>
            <SubmissionDetail
              status={activeSub.status}
              documentType={activeSub.documentType}
              versionNumber={activeSub.versionNumber}
              updatedAt={activeSub.updatedAt}
              documentLink={activeSub.documentLink}
              messageContent={activeSub.messageContent}
              mentorFeedback={activeSub.mentorFeedback}
              viewerUrl={viewerUrl}
              downloading={downloadingId === activeSub.id}
              downloadError={downloadError}
              onDownload={handleDownload}
            />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">{DOCUMENT_TYPE_LABELS[selectedType]}</h2>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-gray-500" />
              </div>
            ) : typeSubmissions.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-10">No submissions of this type yet.</p>
            ) : (
              <div className="space-y-2">
                {typeSubmissions.map((sub) => {
                  const style = statusDotClass(sub.status);
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedSubId(sub.id)}
                      className="w-full flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 hover:border-zinc-600 rounded-lg px-4 py-3 transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">Version {sub.versionNumber}</p>
                        <p className="text-xs text-gray-500">{sub.updatedAt.slice(0, 10)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium shrink-0 ${style.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {sub.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </SplitPane>

      <Modal open={uploadModalOpen} onClose={closeUploadModal} title="New Submission">
        <div className="space-y-4">
          {!allocation ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm rounded-lg px-3 py-2.5">
              You don't have a project allocation yet — submissions open once you're allocated to a project.
            </div>
          ) : !lockedDocType && openTypeOptions.length === 0 ? (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg px-3 py-2.5">
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
