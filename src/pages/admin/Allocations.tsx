import { useState } from 'react';
import { RefreshCw, Check, X, ShieldAlert } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import type { Student, Profile, Project, Cohort } from '../../lib/types';
import { useMentors } from '../../hooks/useMentors';
import { useStudentProfiles } from '../../hooks/useStudentProfiles';
import { TRACKS } from '../../lib/constants';
import { getCohortLabel } from '../../lib/cohortLabel';

interface Props {
  students: Student[];
  profiles: Profile[];
  projects: Project[];
  cohorts: Cohort[];
  updateStudent: (userId: string, patch: Partial<Student>) => void;
  resolveStudentChangeRequest: (studentId: string, status: 'APPROVED' | 'REJECTED') => void;
}

export default function AdminAllocations({ students, profiles, projects, cohorts, updateStudent, resolveStudentChangeRequest }: Props) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [form, setForm] = useState({ mentor_id: '', project_id: '', ojt_id: '', track: '' });

  const mentors = useMentors(profiles);
  const studentProfiles = useStudentProfiles(profiles);

  const studentData = students.map(s => {
    const p = studentProfiles.find(pr => pr.id === s.user_id);
    const mentor = mentors.find(m => m.id === s.mentor_id);
    const proj = projects.find(pr => pr.id === s.project_id);
    const cohort = cohorts.find(c => c.id === s.ojt_id);

    return {
      ...s,
      student_name: p?.name ?? '-',
      roll_number: s.roll_number,
      mentor_name: mentor?.name ?? 'Not Assigned',
      project_title: proj?.title ?? 'Not Assigned',
      cohort_label: cohort ? getCohortLabel(cohort) : 'Not Assigned',
    };
  });

  const changeRequests = students
    .filter(s => s.change_request && s.change_request.status === 'PENDING')
    .map(s => {
      const p = studentProfiles.find(pr => pr.id === s.user_id);
      const req = s.change_request!;
      let requestedLabel = '';
      if (req.type === 'MENTOR') {
        requestedLabel = mentors.find(m => m.id === req.requestedId)?.name ?? req.requestedId;
      } else {
        requestedLabel = projects.find(pr => pr.id === req.requestedId)?.title ?? req.requestedId;
      }

      return {
        student_id: s.user_id,
        student_name: p?.name ?? '-',
        roll_number: s.roll_number,
        type: req.type,
        requested_id: req.requestedId,
        requested_label: requestedLabel,
        reason: req.reason,
        count: req.count,
        status: req.status,
      };
    });

  const handleOpenEdit = (studentId: string) => {
    const s = students.find(x => x.user_id === studentId);
    if (!s) return;
    setSelectedStudentId(studentId);
    setForm({
      mentor_id: s.mentor_id || '',
      project_id: s.project_id || '',
      ojt_id: s.ojt_id || '',
      track: s.track || '',
    });
    setEditModalOpen(true);
  };

  const selectedStudent = students.find(s => s.user_id === selectedStudentId);

  const handleSave = () => {
    if (!selectedStudentId) return;

    const selectedMentor = mentors.find(m => m.id === form.mentor_id);
    if (selectedMentor) {
      const load = students.filter(s => s.mentor_id === selectedMentor.id && s.user_id !== selectedStudentId).length;
      const maxCap = selectedMentor.capacity ?? 5;
      const isFull = load >= maxCap;
      const isAvail = selectedMentor.is_available !== false;

      if (!isAvail || isFull) {
        const reason = !isAvail ? 'unavailable' : 'over capacity';
        const confirmSave = window.confirm(
          `Warning: Selected mentor ${selectedMentor.name} is currently ${reason}.\n\nDo you want to override and proceed with this assignment?`
        );
        if (!confirmSave) return;
      }
    }

    updateStudent(selectedStudentId, {
      mentor_id: form.mentor_id || null,
      project_id: form.project_id || null,
      ojt_id: form.ojt_id || null,
      track: form.track || null,
    });
    setEditModalOpen(false);
    setSelectedStudentId(null);
  };

  // Auto assign based on tracks
  const handleAutoAllocate = () => {
    const currentLoads: Record<string, number> = {};
    mentors.forEach(m => {
      currentLoads[m.id] = students.filter(s => s.mentor_id === m.id).length;
    });

    students.forEach(s => {
      // Find a mentor matching the student's track if not assigned
      if (!s.mentor_id && s.track) {
        const matchingMentor = mentors.find(m => {
          const specializes = m.tracks?.includes(s.track || '') || m.track === s.track;
          const isAvail = m.is_available !== false;
          const hasCapacity = (currentLoads[m.id] || 0) < (m.capacity ?? 5);
          return specializes && isAvail && hasCapacity;
        });
        if (matchingMentor) {
          updateStudent(s.user_id, { mentor_id: matchingMentor.id });
          currentLoads[matchingMentor.id] = (currentLoads[matchingMentor.id] || 0) + 1;
        }
      }
      // Find a project matching the student's track if not assigned
      if (!s.project_id && s.track) {
        const matchingProj = projects.find(p => p.track === s.track);
        if (matchingProj) {
          updateStudent(s.user_id, { project_id: matchingProj.id });
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Mentor & Project Allocations</h1>
          <p className="text-gray-400 text-sm mt-1">Finalize students OJT runs, mentors, and projects. Review allocation swap requests.</p>
        </div>
        <button
          onClick={handleAutoAllocate}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-all duration-200 border border-zinc-600"
        >
          <RefreshCw size={16} />
          Auto Allocate by Track
        </button>
      </div>

      {/* Change Requests Section */}
      {changeRequests.length > 0 && (
        <div className="space-y-3 p-5 bg-red-950/20 border border-red-500/20 rounded-xl">
          <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
            <ShieldAlert size={20} />
            Student Change Requests ({changeRequests.length})
          </h2>
          <p className="text-gray-400 text-xs">Students requesting to swap Mentor or Project. Tracked by count and backed by custom reason statements.</p>
          <DataTable
            columns={[
              { key: 'student_name', header: 'Student' },
              { key: 'roll_number', header: 'Roll Number' },
              { key: 'type', header: 'Change Type', render: (row) => (
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${row.type === 'MENTOR' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>{row.type}</span>
              )},
              { key: 'requested_label', header: 'Requested Target' },
              { key: 'reason', header: 'Reason Statement' },
              { key: 'count', header: 'Attempts Count', render: (row) => (
                <span className="text-xs font-semibold text-gray-200">Count: {row.count}</span>
              )},
            ]}
            data={changeRequests}
            searchPlaceholder="Search change requests..."
            actions={(row) => (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => resolveStudentChangeRequest(row.student_id, 'APPROVED')}
                  className="p-1 px-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 text-xs font-semibold rounded flex items-center gap-1"
                >
                  <Check size={14} />
                  Approve
                </button>
                <button
                  onClick={() => resolveStudentChangeRequest(row.student_id, 'REJECTED')}
                  className="p-1 px-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold rounded flex items-center gap-1"
                >
                  <X size={14} />
                  Deny
                </button>
              </div>
            )}
          />
        </div>
      )}

      {/* Main Allocations Table */}
      <DataTable
        columns={[
          { key: 'student_name', header: 'Student' },
          { key: 'roll_number', header: 'Roll Number' },
          { key: 'track', header: 'Track', render: (row) => (
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-gray-300 font-medium">{row.track || 'Unassigned'}</span>
          )},
          { key: 'cohort_label', header: 'OJT Cohort' },
          { key: 'preferences', header: 'Mentor Prefs', render: (row: any) => {
            if (!row.preferred_mentors || row.preferred_mentors.length === 0) {
              return <span className="text-gray-500 text-xs">None Set</span>;
            }
            const names = row.preferred_mentors.map((id: string) => {
              const m = mentors.find(x => x.id === id);
              return m ? m.name : id;
            });
            return (
              <span className="text-xs text-gold font-medium" title={names.join(' → ')}>
                {names.join(' → ')}
              </span>
            );
          }},
          { key: 'mentor_name', header: 'Allocated Mentor', render: (row) => (
            <span className={`text-xs px-2 py-0.5 rounded-full ${row.mentor_name === 'Not Assigned' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>{row.mentor_name}</span>
          )},
          { key: 'project_title', header: 'Allocated Project', render: (row) => (
            <span className={`text-xs px-2 py-0.5 rounded-full ${row.project_title === 'Not Assigned' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>{row.project_title}</span>
          )},
        ]}
        data={studentData}
        searchPlaceholder="Search allocations..."
        actions={(row) => (
          <button
            onClick={() => handleOpenEdit(row.user_id)}
            className="p-1 px-3 bg-gold/10 hover:bg-gold/20 text-gold text-xs font-semibold rounded border border-gold/20 transition-colors"
          >
            Edit Allocation
          </button>
        )}
      />

      {/* Allocation Edit Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Modify Student Allocation">
        <div className="space-y-4">
          {/* Display Student Preferences */}
          {selectedStudent?.preferred_mentors && selectedStudent.preferred_mentors.length > 0 && (
            <div className="bg-zinc-800/40 p-3 rounded-lg border border-zinc-700/50 text-xs space-y-1">
              <span className="text-gold font-semibold uppercase tracking-wider text-[10px]">Student Preferences:</span>
              <ol className="list-decimal pl-4 text-gray-300 space-y-0.5">
                {selectedStudent.preferred_mentors.map((prefId: string) => {
                  const m = mentors.find(x => x.id === prefId);
                  return (
                    <li key={prefId}>
                      {m?.name || 'Unknown Mentor'} <span className="text-gray-500">({m?.tracks?.join(', ') || m?.track || 'General'})</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Track</label>
            <Select
              value={form.track}
              onChange={v => setForm({ ...form, track: v })}
              className="w-full"
              placeholder="Select Track"
              options={TRACKS.map(t => ({ value: t, label: t }))}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">OJT Cohort</label>
            <Select
              value={form.ojt_id}
              onChange={v => setForm({ ...form, ojt_id: v })}
              className="w-full"
              placeholder="Unassigned"
              options={cohorts.map(c => ({ value: c.id, label: getCohortLabel(c) }))}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Mentor</label>
            <Select
              value={form.mentor_id}
              onChange={v => setForm({ ...form, mentor_id: v })}
              className="w-full"
              placeholder="Unassigned"
              options={mentors.map(m => {
                const load = students.filter(s => s.mentor_id === m.id).length;
                const maxCap = m.capacity ?? 5;
                const isFull = load >= maxCap;
                const isAvail = m.is_available !== false;

                let statusLabel = '';
                if (!isAvail) statusLabel = ' [Unavailable]';
                else if (isFull) statusLabel = ` (${load}/${maxCap}) [Full]`;
                else statusLabel = ` (${load}/${maxCap})`;

                return { value: m.id, label: `${m.name} - ${m.tracks?.join(', ') || m.track || 'General'}${statusLabel}` };
              })}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Project</label>
            <Select
              value={form.project_id}
              onChange={v => setForm({ ...form, project_id: v })}
              className="w-full"
              placeholder="Unassigned"
              options={projects.map(p => ({ value: p.id, label: `${p.title} (${p.track})` }))}
            />
          </div>
          <button
            onClick={handleSave}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            Save Allocation Settings
          </button>
        </div>
      </Modal>
    </div>
  );
}
