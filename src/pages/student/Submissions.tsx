import { useState, useEffect } from 'react';
import { Upload, Eye, ArrowLeft, Send, MessageSquare, Loader2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import type { Submission, Task, Comment, Profile, SubmissionCategory, PrdSubmission, StudentAllocation } from '../../lib/types';
import {
  apiGetMyAllocation,
  apiGetPrdSubmissionsByAllocation,
  apiUploadPrd,
  apiGetPrdDownloadUrl,
} from '../../lib/api';

import { useSubmissions } from '../../hooks/useSubmissions';
import { useTasks } from '../../hooks/useTasks';
import { useData } from '../../context/DataContext';

interface Props {
  studentId: string;
  submissions: Submission[];
  tasks: Task[];
  comments: Comment[];
  profiles: Profile[];
  addComment: (comment: Omit<Comment, 'id' | 'created_at'>) => void;
  addSubmission: (sub: Omit<Submission, 'id'>) => void;
  initialSelectedSubId?: string | null;
  initialNewSubTaskId?: string | null;
  onClearInitialState?: () => void;
}

// Unified row shape rendered by the table/detail view — mock task submissions
// (COMMON_TASK/SPECIFIC_TASK/VIDEO, still local-only) and real PRD submissions
// (backed by /api/v1/submissions) are normalized into this so the existing
// table/detail UI doesn't need two code paths.
type DisplayRow = {
  id: string;
  task_title: string;
  task_desc: string;
  file_name: string;
  file_url?: string;
  version: number;
  status: string;
  category: SubmissionCategory;
  submitted_at: string;
  isPrd: boolean;
  prd?: PrdSubmission;
};

function fileNameFromGcsUri(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1] || uri;
}

function statusBadgeClass(row: DisplayRow): string {
  if (row.isPrd) {
    const raw = row.prd!.status;
    if (raw === 'approved') return 'bg-green-500/10 text-green-400 border border-green-500/20';
    if (raw === 'changes_requested') return 'bg-red-500/10 text-red-400 border border-red-500/20';
    return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
  }
  if (row.status === 'PENDING') return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
  if (row.status === 'ACCEPTED') return 'bg-green-500/10 text-green-400 border border-green-500/20';
  return 'bg-red-500/10 text-red-400 border border-red-500/20';
}

export default function StudentSubmissions({
  studentId,
  submissions: propSubmissions,
  tasks: propTasks,
  comments: propComments,
  profiles: propProfiles,
  addComment: propAddComment,
  addSubmission: propAddSubmission,
  initialSelectedSubId,
  initialNewSubTaskId,
  onClearInitialState,
}: Partial<Props> & { studentId: string }) {
  const { submissions: hookSubmissions, comments: hookComments, addSubmission: hookAddSubmission, addComment: hookAddComment } = useSubmissions();
  const { tasks: hookTasks } = useTasks();
  const { profiles: hookProfiles } = useData();

  const submissions = propSubmissions ?? hookSubmissions;
  const tasks = propTasks ?? hookTasks;
  const comments = propComments ?? hookComments;
  const profiles = propProfiles ?? hookProfiles;
  const addComment = propAddComment ?? hookAddComment;
  const addSubmission = propAddSubmission ?? hookAddSubmission;
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SubmissionCategory | 'ALL'>('ALL');
  const [form, setForm] = useState({ task_id: '', file_name: '', category: 'COMMON_TASK' as SubmissionCategory });
  const [newComment, setNewComment] = useState('');

  // ── Real PRD submission state (backend-backed) ─────────────────────────────
  const [allocation, setAllocation] = useState<StudentAllocation | null>(null);
  const [prdSubmissions, setPrdSubmissions] = useState<PrdSubmission[]>([]);
  const [prdLoading, setPrdLoading] = useState(true);
  const [prdError, setPrdError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;

    (async () => {
      setPrdLoading(true);
      setPrdError(null);
      try {
        const myAllocation = await apiGetMyAllocation();
        if (cancelled) return;
        setAllocation(myAllocation);
        const prds = await apiGetPrdSubmissionsByAllocation(myAllocation.id);
        if (!cancelled) setPrdSubmissions(prds);
      } catch (err) {
        if (!cancelled) {
          setAllocation(null);
          // A 404 here just means "not allocated yet" — not a real error.
          const message = err instanceof Error ? err.message : 'Failed to load PRD submissions';
          setPrdError(message.toLowerCase().includes('no project allocation') ? null : message);
        }
      } finally {
        if (!cancelled) setPrdLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    if (initialSelectedSubId) {
      setSelectedSubId(initialSelectedSubId);
      if (onClearInitialState) onClearInitialState();
    }
  }, [initialSelectedSubId, onClearInitialState]);

  useEffect(() => {
    if (initialNewSubTaskId) {
      setForm(f => ({ ...f, task_id: initialNewSubTaskId }));
      setUploadModalOpen(true);
      if (onClearInitialState) onClearInitialState();
    }
  }, [initialNewSubTaskId, onClearInitialState]);

  // 1. Gather student's mock (task-based) submissions — PRD now comes from the backend.
  const mySubmissions = submissions.filter((s) => s.student_id === studentId && s.category !== 'PRD');

  const mockRows: DisplayRow[] = mySubmissions.map((sub) => {
    const task = tasks.find((t) => t.id === sub.task_id);
    return {
      id: sub.id,
      task_title: task?.title ?? '-',
      task_desc: task?.description ?? '',
      file_name: sub.file_name,
      file_url: sub.file_url,
      version: sub.version,
      status: sub.status,
      category: sub.category,
      submitted_at: sub.submitted_at,
      isPrd: false,
    };
  });

  const prdRows: DisplayRow[] = prdSubmissions.map((p) => ({
    id: p.id,
    task_title: `PRD Document v${p.versionNumber}`,
    task_desc: 'Product Requirements Document for your allocated project.',
    file_name: fileNameFromGcsUri(p.documentLink),
    version: p.versionNumber,
    status: p.status.replace(/_/g, ' ').toUpperCase(),
    category: 'PRD',
    submitted_at: p.updatedAt.slice(0, 10),
    isPrd: true,
    prd: p,
  }));

  const allRows: DisplayRow[] = [...mockRows, ...prdRows];

  // 2. Filter by Category card
  const filteredSubmissions = allRows.filter((row) => selectedCategory === 'ALL' || row.category === selectedCategory);

  // 3. Count categories
  const prdCount = prdRows.length;
  const videoCount = mockRows.filter(r => r.category === 'VIDEO').length;
  const commonCount = mockRows.filter(r => r.category === 'COMMON_TASK').length;
  const specificCount = mockRows.filter(r => r.category === 'SPECIFIC_TASK').length;

  const activeSub = allRows.find(r => r.id === selectedSubId);
  const activeComments = comments.filter(c => c.submission_id === selectedSubId);

  const handleSendComment = () => {
    if (!newComment.trim() || !selectedSubId) return;
    addComment({
      submission_id: selectedSubId,
      author_id: studentId,
      content: newComment.trim(),
    });
    setNewComment('');
  };

  const handleDownloadPrd = async (prd: PrdSubmission) => {
    setDownloadError(null);
    setDownloadingId(prd.id);
    try {
      const url = await apiGetPrdDownloadUrl(prd.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to generate download link');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCreateSubmission = async () => {
    if (form.category === 'PRD') {
      if (!allocation || !selectedFile) return;
      setUploading(true);
      setPrdError(null);
      try {
        await apiUploadPrd(selectedFile, allocation.id);
        const refreshed = await apiGetPrdSubmissionsByAllocation(allocation.id);
        setPrdSubmissions(refreshed);
        setForm({ task_id: '', file_name: '', category: 'COMMON_TASK' });
        setSelectedFile(null);
        setUploadModalOpen(false);
      } catch (err) {
        setPrdError(err instanceof Error ? err.message : 'Failed to upload PRD');
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!form.task_id || !form.file_name) return;
    addSubmission({
      task_id: form.task_id,
      student_id: studentId,
      version: 1,
      file_url: '#',
      file_name: form.file_name,
      status: 'PENDING',
      category: form.category,
      submitted_at: new Date().toISOString().slice(0, 10),
    });
    setForm({ task_id: '', file_name: '', category: 'COMMON_TASK' });
    setUploadModalOpen(false);
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
                <span className={`text-xs px-2.5 py-0.5 rounded-full ${statusBadgeClass(activeSub)}`}>
                  {activeSub.status}
                </span>
                <h2 className="text-xl font-bold text-white mt-2">{activeSub.task_title}</h2>
                <p className="text-gray-400 text-sm mt-1">{activeSub.task_desc}</p>
              </div>

              <hr className="border-zinc-750" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block">Version</span>
                  <span className="text-gray-300 font-semibold">v{activeSub.version}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Submitted Date</span>
                  <span className="text-gray-300 font-semibold">{activeSub.submitted_at}</span>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wider block">Attachment</span>
                  <span className="text-sm text-gray-300 font-medium">{activeSub.file_name}</span>
                </div>
                {activeSub.isPrd ? (
                  <button
                    onClick={() => handleDownloadPrd(activeSub.prd!)}
                    disabled={downloadingId === activeSub.prd!.id}
                    className="px-3.5 py-1.5 bg-gold text-black font-semibold rounded-lg text-xs hover:bg-gold-hover hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {downloadingId === activeSub.prd!.id ? 'Generating link…' : 'Download File'}
                  </button>
                ) : (
                  <a
                    href={activeSub.file_url ?? '#'}
                    className="px-3.5 py-1.5 bg-gold text-black font-semibold rounded-lg text-xs hover:bg-gold-hover hover:scale-105 transition-all duration-200"
                  >
                    Download File
                  </a>
                )}
              </div>
              {activeSub.isPrd && downloadError && (
                <p className="text-xs text-red-400">{downloadError}</p>
              )}
            </div>
          </div>

          {/* Comments Panel (mock submissions) / Mentor Feedback (real PRD submissions) */}
          {activeSub.isPrd ? (
            <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 flex flex-col h-[400px]">
              <div className="flex items-center gap-2 border-b border-zinc-750 pb-3 mb-4">
                <MessageSquare size={18} className="text-gold" />
                <h3 className="text-lg font-semibold text-white">Mentor Feedback</h3>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {activeSub.prd?.mentorFeedback ? (
                  <div className="p-3 rounded-lg bg-zinc-750 text-gray-200 text-sm">
                    {activeSub.prd.mentorFeedback}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center px-4">
                    No feedback yet — your PRD is currently {activeSub.status.toLowerCase()}.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 flex flex-col h-[400px]">
              <div className="flex items-center gap-2 border-b border-zinc-750 pb-3 mb-4">
                <MessageSquare size={18} className="text-gold" />
                <h3 className="text-lg font-semibold text-white">Comments & Discussion</h3>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {activeComments.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                    No comments yet.
                  </div>
                ) : (
                  activeComments.map((c) => {
                    const author = profiles.find((p) => p.id === c.author_id);
                    const isMe = c.author_id === studentId;
                    return (
                      <div key={c.id} className={`flex flex-col max-w-[85%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                        <span className="text-[10px] text-gray-500 mb-1">{author?.name ?? c.author_id}</span>
                        <div className={`p-3 rounded-2xl text-sm ${isMe ? 'bg-gold text-black rounded-tr-none' : 'bg-zinc-750 text-gray-200 rounded-tl-none'}`}>
                          {c.content}
                        </div>
                        <span className="text-[9px] text-gray-600 mt-1">{c.created_at}</span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-zinc-750 pt-3 mt-4">
                <input
                  type="text"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendComment()}
                  placeholder="Write a message..."
                  className="flex-1 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                />
                <button
                  onClick={handleSendComment}
                  className="p-2 bg-gold text-black rounded-lg hover:bg-gold-hover transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Submissions</h1>
          <p className="text-gray-400 text-sm mt-1">Upload and track your deliverables</p>
        </div>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
        >
          <Upload size={18} />
          New Submission
        </button>
      </div>

      {prdError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">
          {prdError}
        </div>
      )}

      {/* Categorized Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(['PRD', 'VIDEO', 'COMMON_TASK', 'SPECIFIC_TASK'] as const).map((cat) => {
          const isSelected = selectedCategory === cat;
          const count = cat === 'PRD' ? prdCount : cat === 'VIDEO' ? videoCount : cat === 'COMMON_TASK' ? commonCount : specificCount;
          const label = cat === 'PRD' ? 'PRD Submissions' : cat === 'VIDEO' ? 'Video Submissions' : cat === 'COMMON_TASK' ? 'Common Tasks' : 'Specific Tasks';
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat)}
              className={`bg-zinc-850 border rounded-xl p-5 text-left transition-all hover:scale-[1.02] ${isSelected ? 'border-gold shadow-lg shadow-gold/5' : 'border-zinc-750 hover:border-zinc-600'
                }`}
            >
              <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</h4>
              <p className="text-3xl font-bold text-white mt-2 flex items-center gap-2">
                {cat === 'PRD' && prdLoading ? <Loader2 size={22} className="animate-spin text-gray-500" /> : count}
              </p>
              <p className="text-xs text-gray-500 mt-1">{isSelected ? 'Click to show all' : 'Click to filter'}</p>
            </button>
          );
        })}
      </div>

      <DataTable
        columns={[
          { key: 'task_title', header: 'Task' },
          { key: 'file_name', header: 'File' },
          { key: 'version', header: 'Version' },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeClass(row)}`}>
                {row.status}
              </span>
            ),
          },
          { key: 'submitted_at', header: 'Submitted' },
        ]}
        data={filteredSubmissions}
        searchPlaceholder="Search submissions..."
        actions={(row) => (
          <button
            onClick={() => setSelectedSubId(row.id)}
            className="p-1.5 text-gray-400 hover:text-gold transition-colors"
            title="View Submission Details & Discussion"
          >
            <Eye size={16} />
          </button>
        )}
      />

      <Modal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} title="New Submission">
        <div className="space-y-4">
          {form.category !== 'PRD' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Task</label>
              <Select
                value={form.task_id}
                onChange={v => setForm({ ...form, task_id: v })}
                className="w-full"
                placeholder="Select task"
                options={tasks.map(t => ({ value: t.id, label: t.title }))}
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Submission Category</label>
            <Select
              value={form.category}
              onChange={v => setForm({ ...form, category: v as SubmissionCategory })}
              className="w-full"
              options={[
                { value: 'COMMON_TASK', label: 'Common Task' },
                { value: 'SPECIFIC_TASK', label: 'Specific Task' },
                { value: 'PRD', label: 'PRD Submission' },
                { value: 'VIDEO', label: 'Video Submission' },
              ]}
            />
          </div>

          {form.category === 'PRD' ? (
            <>
              {!allocation ? (
                <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm rounded-lg px-3 py-2.5">
                  You don't have a project allocation yet — PRD submissions open once you're allocated to a project.
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">PRD Document (PDF)</label>
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
              {prdError && <p className="text-xs text-red-400">{prdError}</p>}
              <button
                onClick={handleCreateSubmission}
                disabled={!allocation || !selectedFile || uploading}
                className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50 disabled:hover:bg-gold flex items-center justify-center gap-2"
              >
                {uploading && <Loader2 size={16} className="animate-spin" />}
                {uploading ? 'Uploading…' : 'Submit'}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">File Name</label>
                <input
                  type="text"
                  value={form.file_name}
                  onChange={(e) => setForm({ ...form, file_name: e.target.value })}
                  placeholder="e.g. cloud_basics_v1.pdf"
                  className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">File Upload</label>
                <div className="border-2 border-dashed border-zinc-750 rounded-lg p-6 text-center hover:border-gold/40 transition-colors">
                  <Upload size={24} className="mx-auto text-gray-500 mb-2" />
                  <p className="text-sm text-gray-500">Drag & drop or click to upload</p>
                </div>
              </div>
              <button
                onClick={handleCreateSubmission}
                className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
              >
                Submit
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
