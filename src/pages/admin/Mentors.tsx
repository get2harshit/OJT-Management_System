import { useEffect, useState } from 'react';
import { Edit2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { ApiMentor } from '../../lib/types';
import { TRACKS } from '../../lib/constants';
import { apiListMentors, apiUpdateMentor } from '../../lib/api';
import { mapBackendTrackToFrontend, mapFrontendTrackToBackend } from '../../lib/api/trackMapping';
import { useToast } from '../../toast';

interface MentorRow extends ApiMentor {
  assignedTracks: string[];
}

export default function AdminMentors() {
  const { showSuccess, showError } = useToast();
  const [mentors, setMentors] = useState<MentorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMentor, setEditingMentor] = useState<MentorRow | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiListMentors()
      .then(res => setMentors(res.map(m => ({
        ...m,
        assignedTracks: (m.tracks ?? []).map(mapBackendTrackToFrontend),
      }))))
      .catch(() => setMentors([]))
      .finally(() => setLoading(false));
  }, []);

  const handleOpenEdit = (mentor: MentorRow) => {
    setEditingMentor(mentor);
    setSelectedTracks([...mentor.assignedTracks]);
  };

  const handleSaveTracks = async () => {
    if (!editingMentor) return;
    setSaving(true);
    try {
      await apiUpdateMentor(editingMentor.id, {
        track: selectedTracks.map(mapFrontendTrackToBackend),
      });
      setMentors(prev =>
        prev.map(m => m.id === editingMentor.id ? { ...m, assignedTracks: selectedTracks } : m)
      );
      showSuccess('Tracks assigned successfully');
      setEditingMentor(null);
      setSelectedTracks([]);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to assign tracks');
    } finally {
      setSaving(false);
    }
  };

  const toggleTrack = (track: string) => {
    setSelectedTracks(prev =>
      prev.includes(track) ? prev.filter(t => t !== track) : [...prev, track]
    );
  };

  const tableData = mentors.map(m => ({
    id: m.id,
    name: m.fullName || '—',
    email: m.email || '—',
    type: m.isExternal ? 'External' : 'Internal',
    assignedTracks: m.assignedTracks,
    _raw: m,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Mentors</h1>
      </div>

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <DataTable
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            {
              key: 'type',
              header: 'Type',
              render: (row) => (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${row.type === 'External'
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'bg-gold/10 text-gold'
                  }`}>
                  {row.type}
                </span>
              ),
            },
            {
              key: 'assignedTracks',
              header: 'Specialized Tracks',
              render: (row) => (
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {row.assignedTracks && row.assignedTracks.length > 0
                    ? row.assignedTracks.map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold font-medium">
                        {t}
                      </span>
                    ))
                    : <span className="text-gray-500 text-xs">Not assigned</span>
                  }
                </div>
              ),
            },
          ]}
          data={tableData}
          searchPlaceholder="Search mentors..."
          actions={(row) => (
            <button
              onClick={() => handleOpenEdit(row._raw)}
              className="p-1.5 text-gray-400 hover:text-gold transition-colors"
              title="Assign Tracks"
            >
              <Edit2 size={16} />
            </button>
          )}
        />
      )}

      {/* Assign Tracks Modal */}
      <Modal
        open={!!editingMentor}
        onClose={() => { setEditingMentor(null); setSelectedTracks([]); }}
        title="Assign Tracks to Mentor"
      >
        <div className="space-y-4">
          {/* Mentor info — read-only */}
          <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3 space-y-1">
            <p className="text-white text-sm font-semibold">{editingMentor?.fullName || '—'}</p>
            <p className="text-gray-400 text-xs">{editingMentor?.email || '—'}</p>
          </div>

          {/* Track selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Specialized Tracks <span className="text-gray-600">(Select one or more)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-zinc-800/50 p-3 rounded-lg border border-zinc-700">
              {TRACKS.map(t => {
                const checked = selectedTracks.includes(t);
                return (
                  <label key={t} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTrack(t)}
                      className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
                    />
                    {t}
                  </label>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleSaveTracks}
            disabled={selectedTracks.length === 0 || saving}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Track Assignment'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
