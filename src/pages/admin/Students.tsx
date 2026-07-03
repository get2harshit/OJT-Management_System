import { useState, useRef } from 'react';
import { Plus, Pencil, Trash2, FileText } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Profile, Student, Batch, Semester } from '../../lib/types';

interface Props {
  profiles: Profile[];
  students: Student[];
  batches: Batch[];
  semesters: Semester[];
  updateStudent: (userId: string, patch: Partial<Student>) => void;
  addStudentRecord: (name: string, email: string, roll_number: string, batch_id: string, semester_id: string, track: string) => void;
  addStudentRecords: (records: { name: string; email: string; roll_number: string; batch_id: string | null; semester_id: string | null; track: string | null }[]) => void;
  deleteProfile: (id: string) => void;
}

export default function AdminStudents({
  profiles,
  students,
  batches,
  semesters,
  updateStudent,
  addStudentRecord,
  addStudentRecords,
  deleteProfile,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', roll_number: '', batch_id: '', semester_id: '', track: '' });
  const [csvText, setCsvText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const tracks = ['Product Development', 'Application Development', 'Data Scientist', 'Open Source', 'Gen AI'];
  const studentProfiles = profiles.filter(p => p.role === 'STUDENT');

  const data = students.map(s => {
    const prof = studentProfiles.find(p => p.id === s.user_id);
    const batch = batches.find(b => b.id === s.batch_id);
    const semester = semesters.find(sem => sem.id === s.semester_id);
    return {
      user_id: s.user_id,
      name: prof?.name ?? '-',
      email: prof?.email ?? '-',
      roll_number: s.roll_number,
      batch: batch?.name ?? '-',
      semester: semester?.name ?? '-',
      track: s.track ?? '-',
    };
  });

  const handleEdit = (row: any) => {
    const student = students.find(s => s.user_id === row.user_id);
    if (!student) return;
    setEditingId(row.user_id);
    setForm({
      name: row.name,
      email: row.email,
      roll_number: student.roll_number,
      batch_id: student.batch_id ?? '',
      semester_id: student.semester_id ?? '',
      track: student.track ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (editingId) {
      // Editing existing student
      updateStudent(editingId, {
        batch_id: form.batch_id || null,
        semester_id: form.semester_id || null,
        track: form.track || null,
      });
    } else {
      // Adding new student
      if (!form.name || !form.email || !form.roll_number) return;
      addStudentRecord(form.name, form.email, form.roll_number, form.batch_id, form.semester_id, form.track);
    }
    setModalOpen(false);
    setEditingId(null);
    setForm({ name: '', email: '', roll_number: '', batch_id: '', semester_id: '', track: '' });
  };

  const parseCSV = (text: string) => {
    if (text.startsWith('PK\x03\x04') || text.includes('xl/worksheets') || text.includes('[Content_Types].xml')) {
      alert("Error: Invalid file format. It looks like you uploaded an Excel (.xlsx) file instead of a plain CSV. Please save/export your spreadsheet as Comma Separated Values (.csv) and try again.");
      return [];
    }
    const lines = text.trim().split('\n');
    const parsed: { name: string; email: string; roll_number: string; batch_id: string | null; semester_id: string | null; track: string | null }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 3) {
        const name = cols[0];
        const email = cols[1];
        const roll_number = cols[2];

        // Find semester by name
        const semName = cols[3] || '';
        const semester = semesters.find(sem => sem.name.toLowerCase() === semName.toLowerCase());
        const semester_id = semester ? semester.id : null;

        // Find batch by name
        const batName = cols[4] || '';
        const batch = batches.find(b => b.name.toLowerCase() === batName.toLowerCase());
        const batch_id = batch ? batch.id : null;

        const track = cols[5] || null;

        parsed.push({ name, email, roll_number, semester_id, batch_id, track });
      }
    }
    return parsed;
  };

  const handleCSVUpload = () => {
    const parsed = parseCSV(csvText);
    if (parsed.length > 0) {
      addStudentRecords(parsed);
    }
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Students</h1>
          <p className="text-gray-400 text-sm mt-1">Manage enrolled students</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setEditingId(null); setForm({ name: '', email: '', roll_number: '', batch_id: '', semester_id: '', track: '' }); setModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
          >
            <Plus size={18} />
            Add Student
          </button>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'roll_number', header: 'Roll Number' },
          { key: 'name', header: 'Name' },
          { key: 'email', header: 'Email' },
          { key: 'semester', header: 'Semester' },
          { key: 'batch', header: 'Batch' },
          { key: 'track', header: 'Track' },
        ]}
        data={data}
        searchPlaceholder="Search students..."
        actions={(row) => (
          <div className="flex items-center gap-2">
            <button onClick={() => handleEdit(row)} className="p-1.5 text-gray-400 hover:text-gold transition-colors">
              <Pencil size={16} />
            </button>
            <button
              onClick={() => deleteProfile(row.user_id as string)}
              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      />

      {/* Manual Add / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Student' : 'Add Student'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              disabled={!!editingId}
              placeholder="e.g. Alice Johnson"
              className={`w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              disabled={!!editingId}
              placeholder="e.g. student@ojt.edu"
              className={`w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Roll Number</label>
            <input
              type="text"
              value={form.roll_number}
              onChange={e => setForm({ ...form, roll_number: e.target.value })}
              disabled={!!editingId}
              placeholder="e.g. OJT-2024-007"
              className={`w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Semester</label>
            <select value={form.semester_id} onChange={e => setForm({ ...form, semester_id: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold">
              <option value="">Select semester</option>
              {semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Batch</label>
            <select value={form.batch_id} onChange={e => setForm({ ...form, batch_id: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold">
              <option value="">Select batch</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Track</label>
            <select value={form.track} onChange={e => setForm({ ...form, track: e.target.value })} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold">
              <option value="">Select track</option>
              {tracks.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={handleSave} className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors">
            {editingId ? 'Update Student' : 'Save Student'}
          </button>
        </div>
      </Modal>

      {/* CSV Bulk Upload Modal */}
      <Modal open={csvModalOpen} onClose={() => setCsvModalOpen(false)} title="Upload Students via CSV">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Upload a CSV file or paste CSV text. Format: <code className="text-gold">name,email,roll_number,semester,batch,track</code> (with header row).
          </p>
          <div className="bg-zinc-800/40 p-3 rounded-lg text-xs font-mono text-gray-400 space-y-1">
            <span className="text-gold">Example Format:</span>
            <div>name,email,roll_number,semester,batch,track</div>
            <div>John Doe,john@ojt.edu,OJT-2024-007,Fall 2024,Batch A,Product Development</div>
          </div>
          <div>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gold/10 file:text-gold hover:file:bg-gold/20" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Or paste CSV below</label>
            <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={6} placeholder={"name,email,roll_number,semester,batch,track\nJohn Doe,john@ojt.edu,OJT-2024-007,Fall 2024,Batch A,Product Development"} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono" />
          </div>
          <button onClick={handleCSVUpload} className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center justify-center gap-2">
            <FileText size={18} />
            Import Students
          </button>
        </div>
      </Modal>
    </div>
  );
}
