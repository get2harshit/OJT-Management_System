import { useState, useEffect } from 'react';
import { Eye, CheckCircle2, RotateCcw, ArrowLeft, Send, MessageSquare, Loader2, Clock } from 'lucide-react';
import DataTable from '../../components/DataTable';
import type { Submission, Task, Profile, Student, Comment, SubmissionCategory, SubmissionStatus, PrdSubmission, StudentAllocation } from '../../lib/types';
import {
  apiGetAllPrdSubmissions,
  apiGetAllocation,
  apiListStudents,
  apiReviewPrdSubmission,
  apiGetPrdDownloadUrl,
} from '../../lib/api';

import { useSubmissions } from '../../hooks/useSubmissions';
import { useTasks } from '../../hooks/useTasks';
import { useData } from '../../context/DataContext';

interface Props {
  submissions: Submission[];
  tasks: Task[];
  profiles: Profile[];
  students: Student[];
  comments: Comment[];
  addComment: (comment: Omit<Comment, 'id' | 'created_at'>) => void;
  updateSubmissionStatus: (id: string, status: SubmissionStatus) => void;
}

// Unified row shape rendered by the table/detail view — mock task submissions
// (still local-only) and real PRD submissions (backed by /api/v1/submissions)
// are normalized into this so the existing table/detail UI doesn't need two
// code paths.
type DisplayRow = {
  id: string;
  task_title: string;
  task_desc: string;
  student_name: string;
  roll_number: string;
  track: string;
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

export default function AdminSubmissions({
  submissions: propSubmissions,
  tasks: propTasks,
  profiles: propProfiles,
  students: propStudents,
  comments: propComments,
  addComment: propAddComment,
  updateSubmissionStatus: propUpdateSubmissionStatus,
}: Partial<Props> = {}) {
  const { submissions: hookSubmissions, comments: hookComments, addComment: hookAddComment, updateSubmissionStatus: hookUpdateSubmissionStatus } = useSubmissions();
  const { tasks: hookTasks } = useTasks();
  const { profiles: hookProfiles, students: hookStudents } = useData();

  const submissions = propSubmissions ?? hookSubmissions;
  const tasks = propTasks ?? hookTasks;
  const profiles = propProfiles ?? hookProfiles;
  const students = propStudents ?? hookStudents;
  const comments = propComments ?? hookComments;
  const addComment = propAddComment ?? hookAddComment;
  const updateSubmissionStatus = propUpdateSubmissionStatus ?? hookUpdateSubmissionStatus;
  const [filterType, setFilterType] = useState<'ALL' | 'STUDENT' | 'MENTOR'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<SubmissionCategory | 'ALL'>('ALL');
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');

  // ── Real PRD submission state (backend-backed) ─────────────────────────────
  const [prdRows, setPrdRows] = useState<DisplayRow[]>([]);
  const [prdLoading, setPrdLoading] = useState(true);
  const [prdError, setPrdError] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const loadPrdSubmissions = async () => {
    setPrdLoading(true);
    setPrdError(null);
    try {
      const [allPrds, allStudents] = await Promise.all([apiGetAllPrdSubmissions(), apiListStudents()]);
      const studentsById = new Map(allStudents.map(s => [s.id, s]));

      const uniqueAllocationIds = Array.from(new Set(allPrds.map(p => p.allocationId)));
      const allocations = await Promise.all(uniqueAllocationIds.map(id => apiGetAllocation(id).catch(() => null)));
      const allocationsById = new Map<string, StudentAllocation>();
      allocations.forEach((alloc, idx) => {
        if (alloc) allocationsById.set(uniqueAllocationIds[idx], alloc);
      });

      const rows: DisplayRow[] = allPrds.map(p => {
        const alloc = allocationsById.get(p.allocationId);
        const student = alloc ? studentsById.get(alloc.studentId) : undefined;
        return {
          id: p.id,
          task_title: `PRD Document v${p.versionNumber}`,
          task_desc: 'Product Requirements Document for the allocated project.',
          student_name: student?.fullName ?? '-',
          roll_number: student?.rollNumber ?? '-',
          track: student?.track ?? '-',
          file_name: fileNameFromGcsUri(p.documentLink),
          version: p.versionNumber,
          status: p.status.replace(/_/g, ' ').toUpperCase(),
          category: 'PRD',
          submitted_at: p.updatedAt.slice(0, 10),
          isPrd: true,
          prd: p,
        };
      });
      setPrdRows(rows);
    } catch (err) {
      setPrdError(err instanceof Error ? err.message : 'Failed to load PRD submissions');
    } finally {
      setPrdLoading(false);
    }
  };

  useEffect(() => {
    loadPrdSubmissions();
  }, []);

  // 1. Map mock (task-based) submissions with names and task info — PRD now comes from the backend.
  const mappedSubmissions: DisplayRow[] = submissions
    .filter(sub => sub.category !== 'PRD')
    .map((sub) => {
      const task = tasks.find((t) => t.id === sub.task_id);
      const studentProf = profiles.find((p) => p.id === sub.student_id);
      const studentInfo = students.find((s) => s.user_id === sub.student_id);
      return {
        id: sub.id,
        task_title: task?.title ?? '-',
        task_desc: task?.description ?? '',
        student_name: studentProf?.name ?? '-',
        roll_number: studentInfo?.roll_number ?? '-',
        track: studentInfo?.track ?? '-',
        file_name: sub.file_name,
        file_url: sub.file_url,
        version: sub.version,
        status: sub.status,
        category: sub.category,
        submitted_at: sub.submitted_at,
        isPrd: false,
      };
    });

  const allRows: DisplayRow[] = [...mappedSubmissions, ...prdRows];

  // 2. Filter based on toggles
  const filteredSubmissions = allRows.filter((row) => {
    if (filterType === 'STUDENT' && row.isPrd) return false;
    if (filterType === 'MENTOR' && !row.isPrd) return false;
    if (selectedCategory !== 'ALL' && row.category !== selectedCategory) return false;
    return true;
  });

  // 3. Count categories
  const prdCount = prdRows.length;
  const videoCount = mappedSubmissions.filter(s => s.category === 'VIDEO').length;
  const commonCount = mappedSubmissions.filter(s => s.category === 'COMMON_TASK').length;
  const specificCount = mappedSubmissions.filter(s => s.category === 'SPECIFIC_TASK').length;

  const activeSub = allRows.find(s => s.id === selectedSubId);
  const activeComments = comments.filter(c => c.submission_id === selectedSubId);

  const handleSendComment = () => {
    if (!newComment.trim() || !selectedSubId) return;
    addComment({
      submission_id: selectedSubId,
      author_id: 'a1', // demo admin id
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

  const handleReviewPrd = async (prd: PrdSubmission, status: 'under_review' | 'changes_requested' | 'approved') => {
    setReviewing(true);
    setPrdError(null);
    try {
      await apiReviewPrdSubmission(prd.id, status, reviewFeedback.trim() || undefined);
      setReviewFeedback('');
      await loadPrdSubmissions();
    } catch (err) {
      setPrdError(err instanceof Error ? err.message : 'Failed to update review');
    } finally {
      setReviewing(false);
    }
  };

  if (activeSub) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedSubId(null)}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-gray-300 rounded-lg hover:text-white hover:bg-zinc-700 transition-all text-sm font-semibold border border-zinc-700"
        >
          <ArrowLeft size={16} />
          Back to Submissions
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Submission Details */}
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
                  <span className="text-gray-500 block">Submitted By</span>
                  <span className="text-gray-300 font-semibold">{activeSub.student_name} ({activeSub.roll_number})</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Technology Track</span>
                  <span className="text-gray-300 font-semibold">{activeSub.track}</span>
                </div>
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
              {activeSub.isPrd && downloadError && <p className="text-xs text-red-400">{downloadError}</p>}

              {activeSub.isPrd ? (
                <div className="space-y-3 pt-2">
                  <textarea
                    value={reviewFeedback}
                    onChange={e => setReviewFeedback(e.target.value)}
                    placeholder="Feedback for the student (optional)..."
                    rows={3}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
                  />
                  {prdError && <p className="text-xs text-red-400">{prdError}</p>}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleReviewPrd(activeSub.prd!, 'under_review')}
                      disabled={reviewing}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-700 text-white font-semibold rounded-lg hover:bg-zinc-600 transition-colors text-sm disabled:opacity-50"
                    >
                      <Clock size={16} />
                      Mark Under Review
                    </button>
                    <button
                      onClick={() => handleReviewPrd(activeSub.prd!, 'approved')}
                      disabled={reviewing}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                    >
                      <CheckCircle2 size={16} />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReviewPrd(activeSub.prd!, 'changes_requested')}
                      disabled={reviewing}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-650 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                    >
                      <RotateCcw size={16} />
                      Request Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => updateSubmissionStatus(activeSub.id, 'ACCEPTED')}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    <CheckCircle2 size={16} />
                    Accept Submission
                  </button>
                  <button
                    onClick={() => updateSubmissionStatus(activeSub.id, 'RETURNED')}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-650 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm"
                  >
                    <RotateCcw size={16} />
                    Return for Changes
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Comments Section (mock) / Review History (real PRD) */}
          {activeSub.isPrd ? (
            <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 flex flex-col h-[500px]">
              <div className="flex items-center gap-2 border-b border-zinc-750 pb-3 mb-4">
                <MessageSquare size={18} className="text-gold" />
                <h3 className="text-lg font-semibold text-white">Review History</h3>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {activeSub.prd?.mentorFeedback ? (
                  <div className="p-3 rounded-lg bg-zinc-750 text-gray-200 text-sm">
                    {activeSub.prd.mentorFeedback}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center px-4">
                    No feedback submitted yet for this version.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 flex flex-col h-[500px]">
              <div className="flex items-center gap-2 border-b border-zinc-750 pb-3 mb-4">
                <MessageSquare size={18} className="text-gold" />
                <h3 className="text-lg font-semibold text-white">Comments & Discussion</h3>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {activeComments.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                    No comments yet. Start the conversation.
                  </div>
                ) : (
                  activeComments.map((c) => {
                    const author = profiles.find((p) => p.id === c.author_id);
                    const isMe = c.author_id === 'a1';
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
      <div>
        <h1 className="text-2xl font-bold text-white">Submissions</h1>
        <p className="text-gray-400 text-sm mt-1">Review and manage student submissions</p>
      </div>

      {prdError && !activeSub && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">
          {prdError}
        </div>
      )}

      {/* Segmented Filter Toggle */}
      <div className="flex gap-1.5 p-1 bg-zinc-850 border border-zinc-750 rounded-xl w-full sm:w-fit overflow-x-auto">
        {(['ALL', 'STUDENT', 'MENTOR'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`shrink-0 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filterType === type ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            {type === 'ALL' ? 'All Submissions' : type === 'STUDENT' ? 'Student Submissions' : 'Mentor Submissions'}
          </button>
        ))}
      </div>

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
          { key: 'student_name', header: 'Student' },
          { key: 'roll_number', header: 'Roll Number' },
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedSubId(row.id)}
              className="p-1.5 text-gray-400 hover:text-gold transition-colors"
              title="View Submission & Comments"
            >
              <Eye size={16} />
            </button>
            {!row.isPrd && (
              <>
                <button
                  onClick={() => updateSubmissionStatus(row.id, 'ACCEPTED')}
                  className="p-1.5 text-gray-400 hover:text-green-400 transition-colors"
                  title="Accept"
                >
                  <CheckCircle2 size={16} />
                </button>
                <button
                  onClick={() => updateSubmissionStatus(row.id, 'RETURNED')}
                  className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                  title="Return"
                >
                  <RotateCcw size={16} />
                </button>
              </>
            )}
          </div>
        )}
      />
    </div>
  );
}
