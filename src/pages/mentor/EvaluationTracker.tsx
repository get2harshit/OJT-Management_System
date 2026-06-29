import { useState, useMemo } from 'react';
import { Pencil, Award } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Profile, Student, Attendance } from '../../lib/types';

interface Props {
  profiles: Profile[];
  students: Student[];
  attendance: Attendance[];
  updateStudent: (userId: string, patch: Partial<Student>) => void;
}

export default function MentorEvaluationTracker({ profiles, students, attendance, updateStudent }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState({ viva1: '', viva2: '', viva3: '', ojt_marks: '' });

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

      // Simple total calculation
      const v1 = s.viva1 ?? 0;
      const v2 = s.viva2 ?? 0;
      const v3 = s.viva3 ?? 0;
      const ojt = s.ojt_marks ?? 0;
      const total = Math.round((v1 + v2 + v3 + ojt) / 4);

      return {
        user_id: s.user_id,
        name: prof?.name ?? '-',
        roll_number: s.roll_number,
        viva1: s.viva1 !== null ? `${s.viva1}/100` : 'Not Set',
        viva2: s.viva2 !== null ? `${s.viva2}/100` : 'Not Set',
        viva3: s.viva3 !== null ? `${s.viva3}/100` : 'Not Set',
        attendanceRate: `${attPct}%`,
        ojt_marks: s.ojt_marks !== null ? `${s.ojt_marks}/100` : 'Not Set',
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
          <p className="text-gray-400 text-sm mt-1">Manage student marks for Viva examinations, Attendance, and OJT projects.</p>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'roll_number', header: 'Roll Number' },
          { key: 'name', header: 'Student Name' },
          { key: 'viva1', header: 'Viva 1' },
          { key: 'viva2', header: 'Viva 2' },
          { key: 'viva3', header: 'Viva 3' },
          { key: 'attendanceRate', header: 'Attendance Rate' },
          { key: 'ojt_marks', header: 'OJT Project' },
          {
            key: 'totalScore',
            header: 'Overall Score',
            render: (row) => (
              <span className="font-bold text-gold bg-gold/10 px-2 py-0.5 rounded border border-gold/25">
                {row.totalScore}
              </span>
            ),
          },
        ]}
        data={data}
        searchPlaceholder="Search students..."
        actions={(row) => (
          <button
            onClick={() => handleEdit(row)}
            className="p-1.5 text-gray-400 hover:text-gold transition-colors flex items-center gap-1 text-xs"
            title="Edit Marks"
          >
            <Pencil size={16} />
            Grade
          </button>
        )}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Update Grades & Marks">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Viva 1 (0-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.viva1}
                onChange={(e) => setForm({ ...form, viva1: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Viva 2 (0-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.viva2}
                onChange={(e) => setForm({ ...form, viva2: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Viva 3 (0-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.viva3}
                onChange={(e) => setForm({ ...form, viva3: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">OJT Project Marks (0-100)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={form.ojt_marks}
              onChange={(e) => setForm({ ...form, ojt_marks: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <button
            onClick={handleSave}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            Update Grades
          </button>
        </div>
      </Modal>
    </div>
  );
}
