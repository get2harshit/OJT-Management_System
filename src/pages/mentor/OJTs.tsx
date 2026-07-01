import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, UserPlus, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal';
import DataTable from '../../components/DataTable';
import type { Project, Student, Profile, Cohort } from '../../lib/types';
import { getDurationString } from '../../lib/utils';
import { apiListCohorts } from '../../lib/api';

interface Props {
  projects: Project[];
  students: Student[];
  profiles: Profile[];
  addProject: (proj: Omit<Project, 'id' | 'created_at'>) => void;
  addProjects: (projs: Omit<Project, 'id' | 'created_at'>[]) => void;
  updateStudent: (userId: string, patch: Partial<Student>) => void;
  deleteProject: (id: string) => void;
}

export default function MentorOJTs({ projects, students, profiles, addProjects, updateStudent, deleteProject }: Props) {
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [assignForm, setAssignForm] = useState({ student_id: '', ojt_id: '', project_id: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch cohorts from API for the OJT dropdown
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  useEffect(() => {
    apiListCohorts()
      .then(data => setCohorts(Array.isArray(data) ? data : []))
      .catch(() => setCohorts([]));
  }, []);

  const studentProfiles = profiles.filter(p => p.role === 'STUDENT');

  const parseCSV = (text: string) => {
    if (text.startsWith('PK\x03\x04') || text.includes('xl/worksheets') || text.includes('[Content_Types].xml')) {
      alert("Error: Invalid file format. It looks like you uploaded an Excel (.xlsx) file instead of a plain CSV. Please save/export your spreadsheet as Comma Separated Values (.csv) and try again.");
      return [];
    }
    const lines = text.trim().split('\n');
    const parsed: Omit<Project, 'id' | 'created_at'>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 3) {
        parsed.push({ title: cols[0], description: cols[1], track: cols[2] });
      }
    }
    return parsed;
  };

  const handleCSVUpload = () => {
    const parsed = parseCSV(csvText);
    if (parsed.length > 0) addProjects(parsed);
    setCsvText('');
    setCsvModalOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleAssign = () => {
    if (!assignForm.student_id) return;
    updateStudent(assignForm.student_id, {
      ojt_id: assignForm.ojt_id || null,
      project_id: assignForm.project_id || null,
    });
    setAssignForm({ student_id: '', ojt_id: '', project_id: '' });
    setAssignModalOpen(false);
  };

  const selectedCohort = cohorts.find(c => c.id === assignForm.ojt_id);

  const projectData = projects.map(p => ({
    ...p,
    track_badge: p.track,
  }));

  const studentData = students.map(s => {
    const prof = studentProfiles.find(p => p.id === s.user_id);
    const ojt = cohorts.find(c => c.id === s.ojt_id);
    const proj = projects.find(p => p.id === s.project_id);
      const termLabel = ojt ? (ojt.sessionTerm === 'Term 1' ? 'Semester 1' : ojt.sessionTerm === 'Term 2' ? 'Semester 2' : ojt.sessionTerm) : '';
      return {
        user_id: s.user_id,
        name: prof?.name ?? '-',
        roll_number: s.roll_number,
        ojt_name: ojt ? `${ojt.academicYear} — ${termLabel}` : 'Not Assigned',
        project_title: proj?.title ?? 'Not Assigned',
      };
  });

  return (
    <div className="space-y-8">
      {/* ── Projects Section ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">OJTs & Projects</h1>
            <p className="text-gray-400 text-sm mt-1">Upload projects via CSV and assign OJTs/projects to students</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCsvModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200">
              <Upload size={18} />
              Upload CSV
            </button>
            <button onClick={() => setAssignModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 hover:scale-105 transition-all duration-200 border border-zinc-600">
              <UserPlus size={18} />
              Assign OJT/Project
            </button>
          </div>
        </div>

        <DataTable
          columns={[
            { key: 'title', header: 'Project Title' },
            { key: 'description', header: 'Description' },
            {
              key: 'track_badge',
              header: 'Track',
              render: (row) => (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold">{row.track_badge}</span>
              ),
            },
          ]}
          data={projectData}
          searchPlaceholder="Search projects..."
          actions={(row) => (
            <button
              onClick={() => deleteProject(row.id as string)}
              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
              title="Delete Project"
            >
              <Trash2 size={16} />
            </button>
          )}
        />
      </div>

      {/* ── Student Assignments ── */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Student Assignments</h2>
        <DataTable
          columns={[
            { key: 'roll_number', header: 'Roll Number' },
            { key: 'name', header: 'Student' },
            {
              key: 'ojt_name',
              header: 'OJT',
              render: (row) => (
                <span className={`text-xs px-2 py-0.5 rounded-full ${row.ojt_name === 'Not Assigned' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                  {row.ojt_name}
                </span>
              ),
            },
            {
              key: 'project_title',
              header: 'Project',
              render: (row) => (
                <span className={`text-xs px-2 py-0.5 rounded-full ${row.project_title === 'Not Assigned' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                  {row.project_title}
                </span>
              ),
            },
          ]}
          data={studentData}
          searchPlaceholder="Search students..."
        />
      </div>

      {/* ── CSV Upload Modal ── */}
      <Modal open={csvModalOpen} onClose={() => setCsvModalOpen(false)} title="Upload Projects via CSV">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Upload a CSV file or paste CSV text. Format: <code className="text-gold">title,description,track</code> (with header row).
          </p>
          <div>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gold/10 file:text-gold hover:file:bg-gold/20" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Or paste CSV below</label>
            <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={6} placeholder={'title,description,track\nAWS Lambda Functions,Build serverless functions,Product Development'} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono" />
          </div>
          <button onClick={handleCSVUpload} className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center justify-center gap-2">
            <FileText size={18} />
            Import Projects
          </button>
        </div>
      </Modal>

      {/* ── Assign OJT/Project Modal ── */}
      <Modal open={assignModalOpen} onClose={() => setAssignModalOpen(false)} title="Assign OJT & Project to Student">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Student</label>
            <select value={assignForm.student_id} onChange={e => setAssignForm({ ...assignForm, student_id: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold">
              <option value="">Select student</option>
              {students.map(s => {
                const prof = studentProfiles.find(p => p.id === s.user_id);
                return <option key={s.user_id} value={s.user_id}>{prof?.name ?? s.user_id} ({s.roll_number})</option>;
              })}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">OJT Program</label>
            <select value={assignForm.ojt_id} onChange={e => setAssignForm({ ...assignForm, ojt_id: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold">
              <option value="">Select OJT</option>
              {cohorts.map(c => {
                const termLabel = c.sessionTerm === 'Term 1' ? 'Semester 1' :
                                  c.sessionTerm === 'Term 2' ? 'Semester 2' :
                                  c.sessionTerm;
                return (
                  <option key={c.id} value={c.id}>{c.academicYear} — {termLabel}</option>
                );
              })}
            </select>
            {selectedCohort && (
              <p className="text-xs text-gray-500 mt-1">
                Duration: {getDurationString(selectedCohort.startDate, selectedCohort.endDate)} ({selectedCohort.startDate} → {selectedCohort.endDate})
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Project</label>
            <select value={assignForm.project_id} onChange={e => setAssignForm({ ...assignForm, project_id: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold">
              <option value="">Select project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title} ({p.track})</option>)}
            </select>
          </div>
          <button onClick={handleAssign} className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors">
            Assign
          </button>
        </div>
      </Modal>
    </div>
  );
}
