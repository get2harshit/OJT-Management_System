import { useState, useEffect, useCallback } from 'react';
import { Megaphone, Pencil, Trash2, Users } from 'lucide-react';
import SpinnerSquare from './SpinnerSquare';
import Modal from './Modal';
import Select from './Select';
import {
  apiListAnnouncements,
  apiUpdateAnnouncement,
  apiDeleteAnnouncement,
  type PastAnnouncement,
  type NotificationPriority,
} from '../lib/api/notifications';
import { useToast } from '../toast';

const PAGE_SIZE = 10;

const PRIORITY_STYLES: Record<NotificationPriority, string> = {
  normal: 'bg-zinc-750 text-gray-400 border-zinc-700',
  important: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  urgent: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Important' },
  { value: 'urgent', label: 'Urgent' },
];

/**
 * What has been announced on this OJT, and the two things you can do about it
 * afterwards: fix it, or take it back.
 *
 * Publishing used to be the end of the story — an announcement existed only as
 * one copy per student, with nothing tying the copies together, so a typo was
 * permanent and a mistake could not be withdrawn.
 *
 * Both actions reach the delivered copies too, and both say so: an edit
 * rewrites what students see, and a withdrawal removes it from their feeds.
 * Neither is presented as a purely local change, because neither is.
 */
export default function PastAnnouncements({ cohortId, refreshKey }: { cohortId: string; refreshKey?: number }) {
  const { showSuccess, showError } = useToast();
  const [announcements, setAnnouncements] = useState<PastAnnouncement[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<PastAnnouncement | null>(null);
  const [form, setForm] = useState({ title: '', message: '', priority: 'normal' as NotificationPriority });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PastAnnouncement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const res = await apiListAnnouncements(cohortId, { page, limit: PAGE_SIZE });
      setAnnouncements(res.data);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, [cohortId, page, showError]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const openEdit = (announcement: PastAnnouncement) => {
    setEditing(announcement);
    setForm({ title: announcement.title, message: announcement.message, priority: announcement.priority });
  };

  const submitEdit = async () => {
    if (!editing) return;
    if (!form.title.trim() || !form.message.trim()) {
      showError('Title and message are both required');
      return;
    }
    setSaving(true);
    try {
      await apiUpdateAnnouncement(editing.id, {
        title: form.title.trim(),
        message: form.message.trim(),
        priority: form.priority,
      });
      showSuccess('Announcement updated — students see the corrected version.');
      setEditing(null);
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update announcement');
    } finally {
      setSaving(false);
    }
  };

  const submitDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await apiDeleteAnnouncement(confirmDelete.id);
      showSuccess('Announcement withdrawn — removed from students’ notifications too.');
      setConfirmDelete(null);
      // Back a page if that was the last row on this one, so a withdrawal
      // never leaves an empty page sitting there.
      if (announcements.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to withdraw announcement');
    } finally {
      setDeleting(false);
    }
  };

  const describeAudience = (announcement: PastAnnouncement): string => {
    const parts = [announcement.target_batch, announcement.track?.name].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Everyone on this OJT';
  };

  const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone size={16} className="text-gold" />
        <h2 className="text-sm font-semibold text-white">Past Announcements</h2>
        {pagination.total > 0 && (
          <span className="text-xs text-gray-500">{pagination.total} published</span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <SpinnerSquare />
        </div>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">
          Nothing announced on this OJT yet. Anything published from here will be listed, and can be corrected or
          withdrawn afterwards.
        </p>
      ) : (
        <ul className="space-y-2">
          {announcements.map((announcement) => (
            <li key={announcement.id} className="rounded-lg border border-zinc-800 bg-zinc-850 p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{announcement.title}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${PRIORITY_STYLES[announcement.priority]}`}>
                      {announcement.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1 whitespace-pre-wrap break-words">{announcement.message}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(announcement)}
                    title="Edit — students see the correction too"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(announcement)}
                    title="Withdraw — removes it from students’ notifications"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-zinc-750 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Users size={11} />
                  {/* The count as it was when this went out, not a live number:
                      it is a fact about a delivery that already happened. */}
                  {announcement.recipient_count} student{announcement.recipient_count === 1 ? '' : 's'}
                </span>
                <span>{describeAudience(announcement)}</span>
                <span>{formatWhen(announcement.created_at)}</span>
                {announcement.creator?.full_name && <span>by {announcement.creator.full_name}</span>}
                {announcement.updated_at !== announcement.created_at && (
                  <span className="text-amber-500/70">edited {formatWhen(announcement.updated_at)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded-lg bg-zinc-750 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="px-2.5 py-1 rounded-lg bg-zinc-750 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Announcement">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            This rewrites the copy every student already received. The audience can’t be changed — it records who this
            was sent to; to reach anyone else, publish a new announcement.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Message</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={5}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold resize-y"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Priority</label>
            <Select
              value={form.priority}
              onChange={(value) => setForm({ ...form, priority: value as NotificationPriority })}
              options={PRIORITY_OPTIONS}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setEditing(null)}
              className="text-xs px-3 py-2 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submitEdit}
              disabled={saving}
              className="text-xs px-3 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Withdraw Announcement">
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            Withdraw <span className="font-semibold text-white">{confirmDelete?.title}</span>?
          </p>
          <p className="text-xs text-gray-500">
            It disappears from the {confirmDelete?.recipient_count} student
            {confirmDelete?.recipient_count === 1 ? '' : 's'} who received it, not just from this list. There is no undo.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="text-xs px-3 py-2 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submitDelete}
              disabled={deleting}
              className="text-xs px-3 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
