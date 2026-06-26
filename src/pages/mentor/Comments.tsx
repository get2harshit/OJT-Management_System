import { useState } from 'react';
import { Send } from 'lucide-react';
import type { Comment, Profile, Submission, Task } from '../../lib/types';

interface Props {
  comments: Comment[];
  profiles: Profile[];
  submissions: Submission[];
  tasks: Task[];
}

export default function MentorComments({ comments, profiles, submissions, tasks }: Props) {
  const [reply, setReply] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);

  const submissionComments = selectedSubmission
    ? comments.filter((c) => c.submission_id === selectedSubmission)
    : comments;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Comments</h1>
        <p className="text-gray-400 text-sm mt-1">Review and reply to submission comments</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-zinc-850 border border-zinc-750 rounded-xl p-4 max-h-[600px] overflow-auto">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Submissions</h3>
          <div className="space-y-2">
            {submissions.map((sub) => {
              const task = tasks.find((t) => t.id === sub.task_id);
              const student = profiles.find((p) => p.id === sub.student_id);
              const isSelected = selectedSubmission === sub.id;
              return (
                <button
                  key={sub.id}
                  onClick={() => setSelectedSubmission(sub.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isSelected ? 'bg-gold/10 border border-gold/30 text-gold' : 'text-gray-300 hover:bg-zinc-750'
                  }`}
                >
                  <div className="font-medium">{task?.title ?? 'Task'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{student?.name ?? '-'} - {sub.file_name}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-zinc-850 border border-zinc-750 rounded-xl p-5 flex flex-col max-h-[600px]">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Discussion</h3>
          <div className="flex-1 overflow-auto space-y-4 mb-4">
            {submissionComments.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-8">No comments yet. Select a submission to view.</p>
            )}
            {submissionComments.map((c) => {
              const author = profiles.find((p) => p.id === c.author_id);
              const isMentor = author?.role === 'MENTOR';
              return (
                <div key={c.id} className={`flex gap-3 ${isMentor ? 'flex-row' : 'flex-row-reverse'}`}>
                  <div className={`max-w-[80%] px-4 py-3 rounded-xl text-sm ${
                    isMentor ? 'bg-zinc-750 text-gray-200' : 'bg-gold/10 text-gold border border-gold/20'
                  }`}>
                    <div className="text-xs font-medium mb-1 opacity-70">{author?.name ?? 'Unknown'}</div>
                    <div>{c.content}</div>
                    <div className="text-xs opacity-50 mt-1">{c.created_at}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 pt-3 border-t border-zinc-750">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1 bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
            <button
              onClick={() => setReply('')}
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
