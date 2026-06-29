import { useState } from 'react';
import { Eye, CheckCircle2, RotateCcw, ArrowLeft, Send, MessageSquare } from 'lucide-react';
import DataTable from '../../components/DataTable';
import type { Submission, Task, Profile, Student, Comment, SubmissionCategory, SubmissionStatus } from '../../lib/types';

interface Props {
  submissions: Submission[];
  tasks: Task[];
  profiles: Profile[];
  students: Student[];
  comments: Comment[];
  addComment: (comment: Omit<Comment, 'id' | 'created_at'>) => void;
  updateSubmissionStatus: (id: string, status: SubmissionStatus) => void;
}

export default function AdminSubmissions({
  submissions,
  tasks,
  profiles,
  students,
  comments,
  addComment,
  updateSubmissionStatus,
}: Props) {
  const [filterType, setFilterType] = useState<'ALL' | 'STUDENT' | 'MENTOR'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<SubmissionCategory | 'ALL'>('ALL');
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');

  // 1. Map submissions with names and task info
  const mappedSubmissions = submissions.map((sub) => {
    const task = tasks.find((t) => t.id === sub.task_id);
    const studentProf = profiles.find((p) => p.id === sub.student_id);
    const studentInfo = students.find((s) => s.user_id === sub.student_id);
    return {
      ...sub,
      task_title: task?.title ?? '-',
      task_type: task?.type ?? 'STUDENT_SPECIFIC',
      student_name: studentProf?.name ?? '-',
      roll_number: studentInfo?.roll_number ?? '-',
      track: studentInfo?.track ?? '-',
      task_desc: task?.description ?? '',
    };
  });

  // 2. Filter based on toggles
  const filteredSubmissions = mappedSubmissions.filter((sub) => {
    if (filterType === 'STUDENT' && sub.task_type !== 'STUDENT_SPECIFIC') return false;
    if (filterType === 'MENTOR' && sub.task_type !== 'MENTOR_SPECIFIC') return false;
    if (selectedCategory !== 'ALL' && sub.category !== selectedCategory) return false;
    return true;
  });

  // 3. Count categories
  const prdCount = mappedSubmissions.filter(s => s.category === 'PRD').length;
  const videoCount = mappedSubmissions.filter(s => s.category === 'VIDEO').length;
  const commonCount = mappedSubmissions.filter(s => s.category === 'COMMON_TASK').length;
  const specificCount = mappedSubmissions.filter(s => s.category === 'SPECIFIC_TASK').length;

  const activeSub = mappedSubmissions.find(s => s.id === selectedSubId);
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
                <span className={`text-xs px-2.5 py-0.5 rounded-full ${
                  activeSub.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                  activeSub.status === 'ACCEPTED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                  'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {activeSub.status}
                </span>
                <h2 className="text-xl font-bold text-white mt-2">{activeSub.task_title}</h2>
                <p className="text-gray-400 text-sm mt-1">{activeSub.task_desc}</p>
              </div>

              <hr className="border-zinc-750" />

              <div className="grid grid-cols-2 gap-4 text-sm">
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
                <a
                  href={activeSub.file_url}
                  className="px-3.5 py-1.5 bg-gold text-black font-semibold rounded-lg text-xs hover:bg-gold-hover hover:scale-105 transition-all duration-200"
                >
                  Download File
                </a>
              </div>

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
            </div>
          </div>

          {/* Comments Section */}
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

      {/* Segmented Filter Toggle */}
      <div className="flex gap-1.5 p-1 bg-zinc-850 border border-zinc-750 rounded-xl w-fit">
        {(['ALL', 'STUDENT', 'MENTOR'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
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
              className={`bg-zinc-850 border rounded-xl p-5 text-left transition-all hover:scale-[1.02] ${
                isSelected ? 'border-gold shadow-lg shadow-gold/5' : 'border-zinc-750 hover:border-zinc-600'
              }`}
            >
              <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</h4>
              <p className="text-3xl font-bold text-white mt-2">{count}</p>
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
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                row.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                row.status === 'ACCEPTED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
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
          </div>
        )}
      />
    </div>
  );
}
