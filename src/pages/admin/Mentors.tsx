import { useState, useRef } from 'react';
import { Plus, Trash2, Upload, FileText, Edit2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Profile } from '../../lib/types';

interface Props {
  profiles: Profile[];
  addMentor: (name: string, email: string, tracks: string[], capacity?: number, isAvailable?: boolean) => void;
  addMentors: (records: { name: string; email: string; tracks?: string[] }[]) => void;
  deleteProfile: (id: string) => void;
  updateProfile: (id: string, patch: Partial<Profile>) => void;
}

const TRACKS = ['Product Development', 'Application Development', 'Data Scientist', 'Open Source', 'Gen AI'];

export default function AdminMentors({ profiles, addMentor, addMentors, deleteProfile, updateProfile }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [editingMentorId, setEditingMentorId] = useState<string | null>(null);
  
  const [form, setForm] = useState({
    name: '',
    email: '',
    tracks: [TRACKS[0]] as string[],
    capacity: 5,
    is_available: true
  });
  
  const [csvText, setCsvText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const mentors = profiles.filter((p) => p.role === 'MENTOR');

  const handleSave = () => {
    if (!form.name || !form.email || form.tracks.length === 0) return;
    
    if (editingMentorId) {
      updateProfile(editingMentorId, {
        name: form.name,
        email: form.email,
        track: form.tracks[0], // for backward compatibility
        tracks: form.tracks,
        capacity: Number(form.capacity),
        is_available: form.is_available
      });
    } else {
      addMentor(form.name, form.email, form.tracks, Number(form.capacity), form.is_available);
    }
    
    handleCloseModal();
  };

  const handleOpenEdit = (mentor: Profile) => {
    setEditingMentorId(mentor.id);
    setForm({
      name: mentor.name,
      email: mentor.email,
      tracks: mentor.tracks || (mentor.track ? [mentor.track] : []),
      capacity: mentor.capacity ?? 5,
      is_available: mentor.is_available ?? true
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setForm({ name: '', email: '', tracks: [TRACKS[0]], capacity: 5, is_available: true });
    setEditingMentorId(null);
    setModalOpen(false);
  };

  const parseCSV = (text: string) => {
    if (text.startsWith('PK\x03\x04') || text.includes('xl/worksheets') || text.includes('[Content_Types].xml')) {
      alert("Error: Invalid file format. It looks like you uploaded an Excel (.xlsx) file instead of a plain CSV. Please save/export your spreadsheet as Comma Separated Values (.csv) and try again.");
      return [];
    }
    const lines = text.trim().split('\n');
    const parsed: { name: string; email: string; tracks?: string[] }[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 2) {
        const trackField = cols[2] || '';
        const tracks = trackField
          ? trackField.split(';').map(t => t.trim()).filter(Boolean)
          : [];
        parsed.push({
          name: cols[0],
          email: cols[1],
          tracks: tracks.length > 0 ? tracks : [TRACKS[0]]
        });
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
          <p className="text-gray-400 text-sm mt-1">Manage mentor profiles, track specialties, capacity, and availability</p>
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
          { key: 'tracks', header: 'Specialized Tracks', render: (row: any) => (
            <div className="flex flex-wrap gap-1 max-w-xs">
              {(row.tracks || (row.track ? [row.track] : [])).map((t: string) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold font-medium">
                  {t}
                </span>
              ))}
              {(!row.tracks && !row.track) && (
                <span className="text-gray-500 text-xs">Unassigned</span>
              )}
            </div>
          )},
          { key: 'capacity', header: 'Capacity', render: (row: any) => (
            <span className="text-sm font-mono text-gray-300 font-medium">
              {row.capacity ?? 5} students
            </span>
          )},
          { key: 'is_available', header: 'Availability', render: (row: any) => {
            const isAvail = row.is_available !== false;
            return (
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${isAvail ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {isAvail ? 'Available' : 'Unavailable'}
              </span>
            );
          }},
          { key: 'created_at', header: 'Joined' },
        ]}
        data={mentors as unknown as Record<string, unknown>[]}
        searchPlaceholder="Search mentors..."
        actions={(row: any) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenEdit(row as unknown as Profile)}
              className="p-1.5 text-gray-400 hover:text-gold transition-colors"
              title="Edit Mentor Profile"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => deleteProfile(row.id as string)}
              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
              title="Delete Mentor"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      />

      {/* Add / Edit Mentor Modal */}
      <Modal open={modalOpen} onClose={handleCloseModal} title={editingMentorId ? 'Edit Mentor Profile' : 'Add Mentor'}>
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
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">Specialized Tracks (Select one or more)</label>
            <div className="grid grid-cols-2 gap-2 bg-zinc-800/50 p-3 rounded-lg border border-zinc-700">
              {TRACKS.map(t => {
                const checked = form.tracks.includes(t);
                return (
                  <label key={t} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const newTracks = checked
                          ? form.tracks.filter(track => track !== t)
                          : [...form.tracks, t];
                        setForm({ ...form, tracks: newTracks });
                      }}
                      className="rounded bg-zinc-750 border-zinc-650 text-gold focus:ring-gold"
                    />
                    {t}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Capacity (Students)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white select-none">
                <input
                  type="checkbox"
                  checked={form.is_available}
                  onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
                  className="rounded bg-zinc-750 border-zinc-650 text-gold focus:ring-gold"
                />
                Available for Allocation
              </label>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={!form.name || !form.email || form.tracks.length === 0}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {editingMentorId ? 'Update Mentor Profile' : 'Save Mentor'}
          </button>
        </div>
      </Modal>

      {/* CSV Bulk Upload Modal */}
      <Modal open={csvModalOpen} onClose={() => setCsvModalOpen(false)} title="Upload Mentors via CSV">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Upload a CSV file or paste CSV text. Format: <code className="text-gold">name,email,track</code> (with header row). Separate multiple tracks with a semicolon (<code>;</code>).
          </p>
          <div className="bg-zinc-800/40 p-3 rounded-lg text-xs font-mono text-gray-400 space-y-1">
            <span className="text-gold">Example Format:</span>
            <div>name,email,track</div>
            <div>Dr. Sarah Chen,sarah.chen@ojt.edu,Product Development; Gen AI</div>
          </div>
          <div>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gold/10 file:text-gold hover:file:bg-gold/20" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Or paste CSV below</label>
            <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={6} placeholder={"name,email,track\nDr. Sarah Chen,sarah.chen@ojt.edu,Product Development; Gen AI"} className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono" />
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
