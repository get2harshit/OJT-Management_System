import { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X as XIcon } from 'lucide-react';
import Modal from '../../../components/Modal';
import type { ApiTrack } from '../../../lib/api/tracks';
import { apiCreateTrack, apiRenameTrack, apiDeactivateTrack } from '../../../lib/api/tracks';
import { useConfirm } from '../../../confirm';
import { useToast } from '../../../toast';

interface ManageTracksModalProps {
  open: boolean;
  onClose: () => void;
  tracks: ApiTrack[];
  onChanged: () => void | Promise<void>;
}

// Master track list CRUD (create/rename/soft-delete) — tracks created here
// become available for every OJT's Track Configuration to pick from. Kept as
// a standalone modal so it can be opened from anywhere a track picker lives.
export default function ManageTracksModal({ open, onClose, tracks, onChanged }: ManageTracksModalProps) {
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const [newTrackName, setNewTrackName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const name = newTrackName.trim();
    if (name.length < 2) {
      showError('Track name must be at least 2 characters');
      return;
    }
    setCreating(true);
    try {
      await apiCreateTrack(name);
      showSuccess(`Track "${name}" created`);
      setNewTrackName('');
      await onChanged();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create track');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (track: ApiTrack) => {
    setEditingId(track.id);
    setEditingName(track.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleRename = async (track: ApiTrack) => {
    const name = editingName.trim();
    if (name.length < 2) {
      showError('Track name must be at least 2 characters');
      return;
    }
    if (name === track.name) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      await apiRenameTrack(track.id, name);
      showSuccess('Track renamed');
      cancelEdit();
      await onChanged();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to rename track');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (track: ApiTrack) => {
    const confirmed = await confirm({
      title: 'Deactivate track',
      message: `Deactivate "${track.name}"? It'll stop showing up as an option for new OJTs, but existing data referencing it is kept.`,
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await apiDeactivateTrack(track.id);
      showSuccess('Track deactivated');
      await onChanged();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to deactivate track');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Tracks">
      <div className="space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Add a new track</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTrackName}
              onChange={e => setNewTrackName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="e.g. Blockchain Development"
              className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
            />
            <button
              onClick={handleCreate}
              disabled={creating || newTrackName.trim().length < 2}
              className="flex items-center gap-1.5 px-3 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors text-sm disabled:opacity-50"
            >
              <Plus size={15} />
              Add
            </button>
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-2">Existing tracks ({tracks.length})</p>
          <div className="max-h-72 overflow-y-auto border border-zinc-700 rounded-lg divide-y divide-zinc-800">
            {tracks.length === 0 ? (
              <p className="text-xs text-gray-500 p-3">No tracks yet.</p>
            ) : (
              tracks.map(track => (
                <div key={track.id} className="flex items-center gap-2 px-3 py-2">
                  {editingId === track.id ? (
                    <>
                      <input
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(track); if (e.key === 'Escape') cancelEdit(); }}
                        autoFocus
                        className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-gold/40"
                      />
                      <button
                        onClick={() => handleRename(track)}
                        disabled={saving}
                        className="p-1.5 rounded text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1.5 rounded text-gray-400 hover:bg-zinc-750 transition-colors"
                        title="Cancel"
                      >
                        <XIcon size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-200">{track.name}</span>
                      <button
                        onClick={() => startEdit(track)}
                        className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
                        title="Rename"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeactivate(track)}
                        className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Deactivate"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
