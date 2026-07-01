import { useState, useMemo } from 'react';
import { Award, CheckSquare, Square, Video, ExternalLink } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Profile, Student, Attendance } from '../../lib/types';

interface Props {
  profiles: Profile[];
  students: Student[];
  attendance: Attendance[];
  updateStudent: (userId: string, patch: Partial<Student>) => void;
}

export default function AdminEvaluationTracker({ profiles, students, attendance, updateStudent }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    viva1: '', viva2: '', viva3: '', ojt_marks: '',
    internal_marks: '', presentation_marks: '',
    project_video_url: '', deployment_url: ''
  });

  const studentProfiles = profiles.filter((p) => p.role === 'STUDENT');

  const totalUniqueDates = useMemo(() => {
    return new Set(attendance.map((a) => a.date)).size;
  }, [attendance]);

  const targetDenominator = Math.max(totalUniqueDates, 5);

  const data = useMemo(() => {
    return students.map((s) => {
      const prof = studentProfiles.find((p) => p.id === s.user_id);
      const studentPresents = attendance.filter((a) => a.student_id === s.user_id).length;
      const attPct = Math.round((studentPresents / targetDenominator) * 100);

      // Total average calculation
      const v1 = s.viva1 ?? 0;
      const v2 = s.viva2 ?? 0;
      const v3 = s.viva3 ?? 0;
      const ojt = s.ojt_marks ?? 0;
      const internal = s.internal_marks ?? 0;
      const pres = s.presentation_marks ?? 0;

      const scoresCount = [s.viva1, s.viva2, s.viva3, s.ojt_marks, s.internal_marks, s.presentation_marks]
        .filter(x => x !== null && x !== undefined).length || 1;

      const total = Math.round((v1 + v2 + v3 + ojt + internal + pres) / scoresCount);

      return {
        user_id: s.user_id,
        name: prof?.name ?? '-',
        roll_number: s.roll_number,
        viva1: s.viva1 !== null ? `${s.viva1}/100` : 'Not Set',
        viva2: s.viva2 !== null ? `${s.viva2}/100` : 'Not Set',
        viva3: s.viva3 !== null ? `${s.viva3}/100` : 'Not Set',
        internal_marks: s.internal_marks !== null ? `${s.internal_marks}/100` : 'Not Set',
        presentation_marks: s.presentation_marks !== null ? `${s.presentation_marks}/100` : 'Not Set',
        attendanceRate: `${attPct}%`,
        ojt_marks: s.ojt_marks !== null ? `${s.ojt_marks}/100` : 'Not Set',
        logbook_checked: !!s.logbook_checked,
        project_video_url: s.project_video_url,
        deployment_url: s.deployment_url,
        totalScore: `${total}/100`,
      };
    });
  }, [students, studentProfiles, attendance, targetDenominator]);

  const handleEdit = (row: any) => {
    const s = students.find((stud) => stud.user_id === row.user_id);
    if (!s) return;
    setEditingUserId(row.user_id);
    setForm({
      viva1: s.viva1 !== null ? String(s.viva1) : '',
      viva2: s.viva2 !== null ? String(s.viva2) : '',
      viva3: s.viva3 !== null ? String(s.viva3) : '',
      ojt_marks: s.ojt_marks !== null ? String(s.ojt_marks) : '',
      internal_marks: s.internal_marks !== null ? String(s.internal_marks) : '',
      presentation_marks: s.presentation_marks !== null ? String(s.presentation_marks) : '',
      project_video_url: s.project_video_url || '',
      deployment_url: s.deployment_url || ''
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!editingUserId) return;
    updateStudent(editingUserId, {
      viva1: form.viva1 !== '' ? Number(form.viva1) : null,
      viva2: form.viva2 !== '' ? Number(form.viva2) : null,
      viva3: form.viva3 !== '' ? Number(form.viva3) : null,
      ojt_marks: form.ojt_marks !== '' ? Number(form.ojt_marks) : null,
      internal_marks: form.internal_marks !== '' ? Number(form.internal_marks) : null,
      presentation_marks: form.presentation_marks !== '' ? Number(form.presentation_marks) : null,
      project_video_url: form.project_video_url || null,
      deployment_url: form.deployment_url || null,
    });
    setEditingUserId(null);
    setModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Award className="text-gold" size={26} />
            Evaluation Tracker
          </h1>
          <p className="text-gray-400 text-sm mt-1">Manage Viva, Internal, Presentation grades, check Logbooks and review student links.</p>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'roll_number', header: 'Roll Number' },
          { key: 'name', header: 'Student Name' },
          { key: 'viva1', header: 'Viva 1' },
          { key: 'viva2', header: 'Viva 2' },
          { key: 'viva3', header: 'Viva 3' },
          { key: 'internal_marks', header: 'Internal' },
          { key: 'presentation_marks', header: 'Presentation' },
          { key: 'ojt_marks', header: 'OJT Marks' },
          { key: 'logbook_checked', header: 'Log Book', render: (row) => (
            <button
              onClick={() => updateStudent(row.user_id, { logbook_checked: !row.logbook_checked })}
              className="text-gray-400 hover:text-gold transition-colors flex items-center justify-center w-full"
            >
              {row.logbook_checked ? (
                <CheckSquare size={18} className="text-gold" />
              ) : (
                <Square size={18} />
              )}
            </button>
          )},
          { key: 'project_video_url', header: 'Video', render: (row) => (
            row.project_video_url ? (
              <a href={row.project_video_url} target="_blank" rel="noreferrer" className="text-gold hover:text-gold-hover flex items-center gap-0.5 text-xs font-semibold">
                <Video size={14} />
                Video
              </a>
            ) : <span className="text-gray-600 text-xs">-</span>
          )},
          { key: 'deployment_url', header: 'Deploy', render: (row) => (
            row.deployment_url ? (
              <a href={row.deployment_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5 text-xs font-semibold">
                <ExternalLink size={14} />
                Deploy
              </a>
            ) : <span className="text-gray-600 text-xs">-</span>
          )},
          { key: 'attendanceRate', header: 'Attendance' },
          {
            key: 'totalScore',
            header: 'Overall',
            render: (row) => (
              <span className="font-bold text-gold bg-gold/10 px-2 py-0.5 rounded border border-gold/25">
                {row.totalScore}
              </span>
            ),
          },
        ]}
        data={data}
        searchPlaceholder="Search evaluation sheet..."
        actions={(row) => (
          <button
            onClick={() => handleEdit(row)}
            className="p-1 px-2.5 bg-gold/15 hover:bg-gold/20 text-gold text-xs font-semibold rounded border border-gold/20 transition-colors"
          >
            Grade
          </button>
        )}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Update Grades & Project Deliverables">
        <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Viva 1 (0-100)</label>
              <input
                type="number" min="0" max="100" value={form.viva1}
                onChange={(e) => setForm({ ...form, viva1: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Viva 2 (0-100)</label>
              <input
                type="number" min="0" max="100" value={form.viva2}
                onChange={(e) => setForm({ ...form, viva2: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Viva 3 (0-100)</label>
              <input
                type="number" min="0" max="100" value={form.viva3}
                onChange={(e) => setForm({ ...form, viva3: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Internal Marks (0-100)</label>
              <input
                type="number" min="0" max="100" value={form.internal_marks}
                onChange={(e) => setForm({ ...form, internal_marks: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Presentation Marks (0-100)</label>
              <input
                type="number" min="0" max="100" value={form.presentation_marks}
                onChange={(e) => setForm({ ...form, presentation_marks: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">OJT Project Marks (0-100)</label>
              <input
                type="number" min="0" max="100" value={form.ojt_marks}
                onChange={(e) => setForm({ ...form, ojt_marks: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Project Video Link</label>
            <input
              type="url" value={form.project_video_url}
              onChange={(e) => setForm({ ...form, project_video_url: e.target.value })}
              placeholder="e.g., https://youtube.com/watch?v=..."
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Deployment Link</label>
            <input
              type="url" value={form.deployment_url}
              onChange={(e) => setForm({ ...form, deployment_url: e.target.value })}
              placeholder="e.g., https://project-prod.vercel.app"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono text-xs"
            />
          </div>

          <button
            onClick={handleSave}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            Save Grades and Deliverables
          </button>
        </div>
      </Modal>
    </div>
  );
}
