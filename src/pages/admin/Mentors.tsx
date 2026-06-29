import { useState, useRef } from 'react';
import { Plus, Pencil, Trash2, Upload, FileText } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Profile } from '../../lib/types';

interface Props {
  profiles: Profile[];
  addMentor: (name: string, email: string) => void;
  addMentors: (records: { name: string; email: string }[]) => void;
  deleteProfile: (id: string) => void;
}

export default function AdminMentors({ profiles, addMentor, addMentors, deleteProfile }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [csvText, setCsvText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const mentors = profiles.filter((p) => p.role === 'MENTOR');

  const handleSave = () => {
    if (!form.name || !form.email) return;
    addMentor(form.name, form.email);
    setForm({ name: '', email: '' });
    setModalOpen(false);
  };

  const parseCSV = (text: string) => {
    if (text.startsWith('PK\x03\x04') || text.includes('xl/worksheets') || text.includes('[Content_Types].xml')) {
      alert("Error: Invalid file format. It looks like you uploaded an Excel (.xlsx) file instead of a plain CSV. Please save/export your spreadsheet as Comma Separated Values (.csv) and try again.");
      return [];
    }
    const lines = text.trim().split('\n');
    const parsed: { name: string; email: string }[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 2) {
        parsed.push({ name: cols[0], email: cols[1] });
      }
    }
    return parsed;
  };

  const handleCSVUpload = () => {
    const parsed = parseCSV(csvText);
    if (parsed.length > 0) {
      addMentors(parsed);
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
          <h1 className="text-2xl font-bold text-white">Mentors</h1>
          <p className="text-gray-400 text-sm mt-1">Manage mentor accounts</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCsvModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-white font-semibold rounded-lg border border-zinc-700 hover:scale-105 transition-all duration-200"
          >
            <Upload size={18} />
            Upload CSV
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200"
          >
            <Plus size={18} />
            Add Mentor
          </button>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'email', header: 'Email' },
          { key: 'created_at', header: 'Joined' },
        ]}
        data={mentors as unknown as Record<string, unknown>[]}
        searchPlaceholder="Search mentors..."
        actions={(row) => (
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray-400 hover:text-gold transition-colors">
              <Pencil size={16} />
            </button>
            <button
              onClick={() => deleteProfile(row.id as string)}
              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      />

      {/* Manual Add Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Mentor">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Dr. Sarah Chen"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="e.g. mentor@ojt.edu"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <button
            onClick={handleSave}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            Save Mentor
          </button>
        </div>
      </Modal>

      {/* CSV Bulk Upload Modal */}
      <Modal open={csvModalOpen} onClose={() => setCsvModalOpen(false)} title="Upload Mentors via CSV">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Upload a CSV file or paste CSV text. Format: <code className="text-gold">name,email</code> (with header row).
          </p>
          <div className="bg-zinc-800/40 p-3 rounded-lg text-xs font-mono text-gray-400 space-y-1">
            <span className="text-gold">Example Format:</span>
            <div>name,email</div>
            <div>Dr. Sarah Chen,sarah.chen@ojt.edu</div>
          </div>
          <div>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gold/10 file:text-gold hover:file:bg-gold/20" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Or paste CSV below</label>
            <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={6} placeholder={"name,email\nDr. Sarah Chen,sarah.chen@ojt.edu"} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono" />
          </div>
          <button onClick={handleCSVUpload} className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center justify-center gap-2">
            <FileText size={18} />
            Import Mentors
          </button>
        </div>
      </Modal>
    </div>
  );
}
