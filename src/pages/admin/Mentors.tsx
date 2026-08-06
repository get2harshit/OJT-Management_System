import { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from '../../components/DataTable';
import PageLayout from '../../components/PageLayout';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { ApiMentor } from '../../lib/types';
import { getTrackColor, MENTOR_TYPE_DOT_COLORS } from '../../lib/constants';
import { apiListMentorsPage } from '../../lib/api';
import { usePageRefresh } from '../../context/RefreshContext';
import { useTracks } from '../../hooks/useTracks';

interface MentorRow extends ApiMentor {
  assignedTracks: string[];
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

export default function AdminMentors() {
  const { tracks } = useTracks();
  const trackNameBySlug = new Map(tracks.map(t => [t.slug, t.name]));
  const [mentors, setMentors] = useState<MentorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  const fetchMentors = useCallback(async () => {
    try {
      const res = await apiListMentorsPage({ page, limit, search: search || undefined });
      setMentors(res.data.map(m => ({
        ...m,
        assignedTracks: m.tracks ?? [],
      })));
      setPagination(res.pagination);
    } catch {
      setMentors([]);
    }
  }, [page, limit, search]);

  useEffect(() => {
    setTableLoading(true);
    fetchMentors().finally(() => {
      setTableLoading(false);
      setLoading(false);
    });
  }, [fetchMentors]);

  usePageRefresh(fetchMentors);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
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
    <PageLayout className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white">Mentors</h1>
        <p className="text-sm text-gray-400">
          Expertise is what a mentor can teach in general. To put a mentor on an OJT&apos;s track — which is
          what decides who teams can pick — use that OJT&apos;s Track Config.
        </p>
      </div>

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <DataTable
          loading={tableLoading}
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            {
              key: 'type',
              header: 'Type',
              render: (row) => {
                const style = MENTOR_TYPE_DOT_COLORS[row.type] ?? MENTOR_TYPE_DOT_COLORS.Internal;
                return (
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {row.type}
                  </span>
                );
              },
            },
            {
              // What this mentor can teach in general, identical across every
              // OJT — not who is staffing a given OJT's track. That is set per
              // OJT in Track Config, and it is the only thing that decides
              // which mentors a team can actually pick.
              key: 'assignedTracks',
              header: 'Expertise',
              render: (row) => (
                <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-xs">
                  {row.assignedTracks && row.assignedTracks.length > 0
                    ? row.assignedTracks.map((slug) => {
                      const style = getTrackColor(slug);
                      return (
                        <span key={slug} className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {trackNameBySlug.get(slug) ?? slug}
                        </span>
                      );
                    })
                    : <span className="text-gray-500 text-xs">Not assigned</span>
                  }
                </div>
              ),
            },
          ]}
          data={tableData}
          searchPlaceholder="Search mentors..."
          onSearchChange={handleSearchChange}
          serverPagination={{
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: pagination.totalPages,
            onPageChange: setPage,
            onLimitChange: handleLimitChange,
          }}
        />
      )}
    </PageLayout>
  );
}
