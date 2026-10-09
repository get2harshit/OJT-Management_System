import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, ShieldOff } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import PageLayout from '../../components/PageLayout';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';
import {
  apiAdminUnpublishShowcase,
  apiListShowcasesForAdmin,
  type AdminShowcaseRow,
} from '../../lib/api/studentShowcase';

/**
 * Every student project page, and the one control an administrator has over
 * them.
 *
 * This exists because the pages are public and student-authored: content on an
 * institution-linked URL needs somebody other than its author able to take it
 * down in one action. The control only un-publishes — the student's work is
 * kept, so a decision can be reviewed and the student told what was wrong
 * rather than finding their page gone.
 */
export default function AdminStudentShowcases() {
  const { showSuccess, showError } = useToast();
  const [rows, setRows] = useState<AdminShowcaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<AdminShowcaseRow | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return apiListShowcasesForAdmin()
      .then(setRows)
      .catch((err: unknown) => showError(err instanceof Error ? err.message : 'Could not load pages'))
      .finally(() => setLoading(false));
  }, [showError]);

  useEffect(() => {
    load();
  }, [load]);

  usePageRefresh(load);

  const takeDown = async () => {
    if (!target) return;
    if (!reason.trim()) {
      showError('A reason is required — the student is shown it on their page');
      return;
    }
    setSubmitting(true);
    try {
      await apiAdminUnpublishShowcase(target.id, reason.trim());
      showSuccess('Page taken down');
      setTarget(null);
      setReason('');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not take that page down');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Student Project Pages</h1>
        <p className="text-gray-400 text-sm mt-1">
          Public, student-authored pages shared with recruiters. Taking one down removes it from its link;
          the student keeps their work.
        </p>
      </div>

      <DataTable
        columns={[
          {
            key: 'studentName',
            header: 'Student',
            render: (row) => (
              <div className="min-w-0">
                <p className="text-gray-200 truncate">{row.studentName ?? '—'}</p>
                <p className="text-xs text-gray-500 truncate">{row.studentEmail ?? ''}</p>
              </div>
            ),
            exportValue: (row) => row.studentName ?? '',
          },
          {
            key: 'projectTitle',
            header: 'Project',
            render: (row) => row.projectTitle ?? <span className="text-gray-600">not allocated</span>,
            exportValue: (row) => row.projectTitle ?? '',
          },
          {
            key: 'isPublished',
            header: 'Status',
            render: (row) =>
              row.isPublished ? (
                <span className="text-green-400">Live</span>
              ) : row.takenDownAt ? (
                <span className="text-red-400" title={row.takenDownReason ?? undefined}>
                  Taken down
                </span>
              ) : (
                <span className="text-gray-500">Draft</span>
              ),
            exportValue: (row) => (row.isPublished ? 'live' : row.takenDownAt ? 'taken down' : 'draft'),
          },
          {
            key: 'publishedAt',
            header: 'Published',
            render: (row) => (row.publishedAt ? new Date(row.publishedAt).toLocaleDateString() : '—'),
            exportValue: (row) => (row.publishedAt ? new Date(row.publishedAt).toLocaleDateString() : ''),
          },
          {
            key: 'actions',
            header: '',
            render: (row) => (
              <div className="flex items-center gap-2">
                {row.isPublished && (
                  <a
                    href={`${window.location.origin}/p/${row.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <ExternalLink size={12} />
                    View
                  </a>
                )}
                {/* Only offered on a live page: there is nothing to take down
                    on a draft, and offering it anyway would suggest otherwise. */}
                {row.isPublished && (
                  <button
                    onClick={() => {
                      setTarget(row);
                      setReason('');
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <ShieldOff size={12} />
                    Take down
                  </button>
                )}
              </div>
            ),
            exportValue: () => '',
          },
        ]}
        data={rows}
        loading={loading}
        searchKeys={['studentName', 'studentEmail', 'projectTitle']}
        exportFilename="student_project_pages"
      />

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={`Take down ${target?.studentName ?? 'this page'}'s page`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            The page stops being reachable at its link immediately. The student keeps everything they wrote
            and is shown the reason below, so they can fix it and publish again.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Reason</label>
            <textarea
              value={reason}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What needs to change before this can be public"
              className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-y"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setTarget(null)}
              className="px-3 py-2 text-sm rounded-lg border border-zinc-700 text-gray-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={takeDown}
              disabled={submitting}
              className="px-3 py-2 text-sm font-semibold rounded-lg bg-red-500/90 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Taking down...' : 'Take down'}
            </button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
}
