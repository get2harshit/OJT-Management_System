import { useState, useEffect, useCallback } from 'react';
import { Link2, FileText, Trash2, ExternalLink, Download, Plus, Share2 } from 'lucide-react';
import Modal from '../components/Modal';
import Select from '../components/Select';
import SpinnerSquare from '../components/SpinnerSquare';
import {
  apiShareResource,
  apiGetMySharedResources,
  apiGetResourcesSharedWithMe,
  apiGetResourceDownloadUrl,
  apiDeleteResource,
  type ApiSharedResource,
} from '../lib/api';
import { formatInIST } from '../lib/utils';
import { useToast } from '../toast';

interface Props {
  cohortId: string;
  /**
   * 'mentor' can share and remove; 'student' is read-only. The backend
   * enforces this too — this only decides what to render.
   */
  mode: 'mentor' | 'student';
  /** Mentor mode only: teams the resource can be narrowed to. */
  teams?: { id: string; name: string | null }[];
}

interface ShareForm {
  title: string;
  description: string;
  teamId: string;
  url: string;
  file: File | null;
}

const EMPTY_FORM: ShareForm = { title: '', description: '', teamId: '', url: '', file: null };

/**
 * Links and files a mentor hands their own students in one OJT.
 *
 * One component for both sides: what a mentor shares is exactly what their
 * students read, and keeping the two in one place stops the reading view from
 * drifting away from the writing one.
 */
export default function SharedResourcesPanel({ cohortId, mode, teams = [] }: Props) {
  const { showSuccess, showError } = useToast();

  const [resources, setResources] = useState<ApiSharedResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ShareForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      setResources(mode === 'mentor' ? await apiGetMySharedResources(cohortId) : await apiGetResourcesSharedWithMe(cohortId));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load resources');
    } finally {
      setLoading(false);
    }
  }, [cohortId, mode, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!form || !form.title.trim()) return;
    if (!form.url.trim() && !form.file) {
      showError('Add a link or pick a file');
      return;
    }
    setSaving(true);
    try {
      await apiShareResource(cohortId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        teamId: form.teamId || undefined,
        url: form.url.trim() || undefined,
        file: form.file ?? undefined,
      });
      showSuccess('Shared with your students');
      setForm(null);
      load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not share that');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (resource: ApiSharedResource) => {
    try {
      await apiDeleteResource(resource.id);
      setResources((prev) => prev.filter((r) => r.id !== resource.id));
      showSuccess('Removed');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not remove that');
    }
  };

  const open = async (resource: ApiSharedResource) => {
    if (resource.kind === 'link' && resource.url) {
      window.open(resource.url, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const { url } = await apiGetResourceDownloadUrl(resource.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not open that file');
    }
  };

  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Share2 size={17} className="text-gold" />
            {mode === 'mentor' ? 'Shared resources' : 'Resources from your mentor'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {mode === 'mentor'
              ? 'Links and files for your students in this OJT.'
              : 'Reading and material your mentor has shared with you.'}
          </p>
        </div>
        {mode === 'mentor' && (
          <button
            onClick={() => setForm({ ...EMPTY_FORM })}
            className="flex items-center gap-1.5 text-xs px-3 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            <Plus size={14} />
            Share a resource
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center">
          <SpinnerSquare size={32} />
        </div>
      ) : resources.length === 0 ? (
        <p className="text-sm text-gray-500 bg-zinc-900 border border-zinc-750 border-dashed rounded-lg p-5 text-center">
          {mode === 'mentor'
            ? 'Nothing shared yet — an article, a repo, a slide deck all work.'
            : 'Your mentor hasn’t shared anything yet.'}
        </p>
      ) : (
        <div className="space-y-2">
          {resources.map((resource) => (
            <div
              key={resource.id}
              className="flex items-start gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3.5 py-3"
            >
              {resource.kind === 'link' ? (
                <Link2 size={16} className="text-gold shrink-0 mt-0.5" />
              ) : (
                <FileText size={16} className="text-gold shrink-0 mt-0.5" />
              )}

              <button onClick={() => open(resource)} className="min-w-0 flex-1 text-left group">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm text-white font-medium group-hover:text-gold transition-colors">
                    {resource.title}
                  </span>
                  {resource.team && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-gray-400 border border-zinc-700">
                      {resource.team.name} only
                    </span>
                  )}
                </span>
                {resource.description && <span className="block text-xs text-gray-400 mt-0.5">{resource.description}</span>}
                <span className="block text-[11px] text-gray-500 mt-1">
                  {mode === 'student' ? `${resource.sharedBy.full_name} · ` : ''}
                  {formatInIST(resource.created_at, { day: '2-digit', month: 'short' })}
                  {resource.kind === 'file' && resource.file_name ? ` · ${resource.file_name}` : ''}
                </span>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => open(resource)}
                  title={resource.kind === 'link' ? 'Open link' : 'Download'}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  {resource.kind === 'link' ? <ExternalLink size={14} /> : <Download size={14} />}
                </button>
                {mode === 'mentor' && (
                  <button
                    onClick={() => remove(resource)}
                    title="Remove"
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title="Share a resource" size="lg">
        {form && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                Title <span className="text-gold">*</span>
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={200}
                placeholder="e.g. Postgres indexing, explained"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Why they should read it</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Optional — a line of context goes a long way."
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60 resize-none"
              />
            </div>

            {/* A link or a file, never both — the backend refuses both, so the
                form disables whichever one isn't in play. */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Link</label>
              <input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                disabled={!!form.file}
                placeholder="https://…"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60 disabled:opacity-40"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">…or a file (up to 10MB)</label>
              <input
                type="file"
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })}
                disabled={!!form.url.trim()}
                className="w-full text-xs text-gray-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-gray-200 file:text-xs disabled:opacity-40"
              />
            </div>

            {teams.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Who sees it</label>
                <Select
                  value={form.teamId}
                  onChange={(v) => setForm({ ...form, teamId: v as string })}
                  placeholder="All my students in this OJT"
                  className="w-full"
                  options={teams.map((t) => ({ value: t.id, label: `${t.name ?? 'Team'} only` }))}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setForm(null)}
                className="text-xs px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving || !form.title.trim()}
                className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Sharing…' : 'Share'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
