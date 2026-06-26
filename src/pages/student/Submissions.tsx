import { useState } from 'react';
import { Upload, Eye, MessageSquare } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Submission, Task, Comment, Profile } from '../../lib/types';

interface Props {
  studentId: string;
  submissions: Submission[];
  tasks: Task[];
  comments: Comment[];
  profiles: Profile[];
}

export default function StudentSubmissions({ studentId, submissions, tasks, comments, profiles }: Props) {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);
  const [form, setForm] = useState({ task_id: '', file_name: '' });

  const mySubmissions = submissions.filter((s) => s.student_id === studentId);

  const data = mySubmissions.map((sub) => {
    const task = tasks.find((t) => t.id === sub.task_id);
    return {
      ...sub,
      task_title: task?.title ?? '-',
    };
  });

  const selectedComments = selectedSubmission
    ? comments.filter((c) => c.submission_id === selectedSubmission)
    : [];

  return (
    <div className="space-y-4">
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

      <DataTable
        columns={[
          { key: 'task_title', header: 'Task' },
          { key: 'file_name', header: 'File' },
          { key: 'version', header: 'Version' },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                row.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400' :
                row.status === 'ACCEPTED' ? 'bg-green-500/10 text-green-400' :
                'bg-red-500/10 text-red-400'
              }`}>
                {row.status}
              </span>
            ),
          },
          { key: 'submitted_at', header: 'Submitted' },
        ]}
        data={data}
        searchPlaceholder="Search submissions..."
        actions={(row) => (
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray-400 hover:text-gold transition-colors" title="View">
              <Eye size={16} />
            </button>
            <button
              onClick={() => { setSelectedSubmission(row.id); setCommentsModalOpen(true); }}
              className="p-1.5 text-gray-400 hover:text-blue-400 transition-colors"
              title="Comments"
            >
              <MessageSquare size={16} />
            </button>
          </div>
        )}
      />

      <Modal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} title="New Submission">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Task</label>
            <select
              value={form.task_id}
              onChange={(e) => setForm({ ...form, task_id: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            >
              <option value="">Select task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
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
            onClick={() => setUploadModalOpen(false)}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            Submit
          </button>
        </div>
      </Modal>

      <Modal open={commentsModalOpen} onClose={() => setCommentsModalOpen(false)} title="Comments">
        <div className="space-y-4 max-h-[400px] overflow-auto">
          {selectedComments.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">No comments yet</p>
          )}
          {selectedComments.map((c) => {
            const author = profiles.find((p) => p.id === c.author_id);
            const isMentor = author?.role === 'MENTOR';
            return (
              <div key={c.id} className={`p-3 rounded-xl text-sm ${isMentor ? 'bg-zinc-750 text-gray-200' : 'bg-gold/10 text-gold border border-gold/20'}`}>
                <div className="text-xs font-medium mb-1 opacity-70">{author?.name ?? 'Unknown'} - {author?.role ?? ''}</div>
                <div>{c.content}</div>
                <div className="text-xs opacity-50 mt-1">{c.created_at}</div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
