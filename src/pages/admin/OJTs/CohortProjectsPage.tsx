import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, Trash2, BarChart3 } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import ProjectCsvImportModal from './ProjectCsvImportModal';
// Shared with the manual-allocation project picker, which shows the same
// exhaustive view over its drawer.
import ProjectDetail from '../../../components/ProjectDetail';
import type { Project } from '../../../lib/types';
import { getTrackColor } from '../../../lib/constants';
import { apiGetCohort, apiGetProjectsForCohortPage, apiDeleteProject, apiGetProjectInsights } from '../../../lib/api';
import type { ProjectInsights } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';
import { usePageRefresh } from '../../../context/RefreshContext';
import { useTracks } from '../../../hooks/useTracks';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

// A catalog this size is routinely reviewed in bulk — an admin checking what a
// CSV actually imported wants the whole track on one screen, not nine pages of
// it. The server caps `limit` at the largest value here.

// The projects already uploaded/linked to this cohort — CSV import is the
// only way projects get here now (see ProjectCsvImportModal's cohortId
// prop), so this page is purely a view + delete surface, not a picker.
// apiCreateProjectsBulk/apiDeleteProject already invalidate the global
// projects cache, so no parent-level refresh callback is needed here.
export default function CohortProjectsPage() {
  // trackSlug is only present on the track-scoped route
  // (ojts/:cohortId/track-config/:trackSlug/projects) — when set, the list is
  // filtered to that track and CSV import forces every project onto it.
  const { cohortId, trackSlug } = useParams<{ cohortId: string; trackSlug?: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { showError } = useToast();
  const { tracks } = useTracks();
  const trackNameBySlug = new Map(tracks.map(t => [t.slug, t.name]));
  const trackName = trackSlug ? (trackNameBySlug.get(trackSlug) ?? trackSlug) : null;

  const [cohortLabel, setCohortLabel] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  // On the track-scoped route the track is fixed by the URL and this filter is
  // hidden, so it stays empty there and trackSlug wins below.
  const [trackFilter, setTrackFilter] = useState('');
  // Two states for one field: what the box shows (updated on every keystroke,
  // so typing stays responsive) and what the request uses (debounced). Without
  // the first, "Clear filters" would reset the query but leave the old text
  // sitting in the box.
  const [projectIdInput, setProjectIdInput] = useState('');
  const [projectIdFilter, setProjectIdFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [projectCsvModalOpen, setProjectCsvModalOpen] = useState(false);
  const [insights, setInsights] = useState<ProjectInsights | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const fetchPage = useCallback(async (
    targetPage: number,
    targetLimit: number,
    searchTerm: string,
    track: string,
    projectId: string,
  ) => {
    if (!cohortId) return;
    try {
      const res = await apiGetProjectsForCohortPage(cohortId, {
        page: targetPage,
        limit: targetLimit,
        search: searchTerm || undefined,
        // The route's track is not a default the user can override — it scopes
        // the whole page — so it takes precedence over the dropdown.
        track: trackSlug || track || undefined,
        projectId: projectId || undefined,
      });
      setProjects(res.data);
      setPagination(res.pagination);
    } catch (err: unknown) {
      console.error(err);
      showError('Failed to load projects for this cohort.');
    }
  }, [cohortId, trackSlug, showError]);

  const loadCohortLabel = useCallback(() => {
    if (!cohortId) return Promise.resolve();
    return apiGetCohort(cohortId)
      .then(c => setCohortLabel(getCohortLabel(c)))
      .catch(() => navigate(-1));
  }, [cohortId, navigate]);

  useEffect(() => {
    loadCohortLabel();
  }, [loadCohortLabel]);

  useEffect(() => {
    fetchPage(page, limit, search, trackFilter, projectIdFilter).catch(() => {});
  }, [page, limit, search, trackFilter, projectIdFilter, fetchPage]);

  // Deliberately not tied to the filters. These describe the whole catalog,
  // not the current view — the filtered figure is already under the table.
  const loadInsights = useCallback(async () => {
    if (!cohortId) return;
    try {
      setInsights(await apiGetProjectInsights(cohortId));
    } catch {
      // A failed count must not take the table down with it; the numbers
      // simply don't render.
      setInsights(null);
    }
  }, [cohortId]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  usePageRefresh(useCallback(
    () => Promise.all([loadCohortLabel(), loadInsights(), fetchPage(page, limit, search, trackFilter, projectIdFilter)]),
    [loadCohortLabel, loadInsights, fetchPage, page, limit, search, trackFilter, projectIdFilter]
  ));

  // Debounce the free-text inputs so every keystroke doesn't fire a request.
  // Both reset to page 1: staying on page 7 of a list that just shrank to two
  // pages would show an empty table and read as "no results".
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const projectIdDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleProjectIdChange = (value: string) => {
    setProjectIdInput(value);
    if (projectIdDebounceRef.current) clearTimeout(projectIdDebounceRef.current);
    projectIdDebounceRef.current = setTimeout(() => {
      setPage(1);
      setProjectIdFilter(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleClearFilters = () => {
    // The pending debounce would otherwise fire after this and put the old
    // text straight back into the query.
    if (projectIdDebounceRef.current) clearTimeout(projectIdDebounceRef.current);
    setPage(1);
    setTrackFilter('');
    setProjectIdInput('');
    setProjectIdFilter('');
  };

  const handleTrackChange = (value: string) => {
    setPage(1);
    setTrackFilter(value);
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

  const handleImportSuccess = () => {
    setPage(1);
    fetchPage(1, limit, search, trackFilter, projectIdFilter);
  };

  const handleDeleteProject = async (id: string) => {
    const confirmDelete = await confirm({
      title: 'Delete project',
      message: 'Are you sure you want to permanently delete this project from the catalog?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmDelete) return;
    await apiDeleteProject(id);
    await fetchPage(page, limit, search, trackFilter, projectIdFilter);
  };

  return (
    <PageLayout className="space-y-6">
      <CohortPageHeader
        title={trackName ? `${trackName} Projects` : 'Projects'}
        subtitle={trackName ? `${cohortLabel} · ${trackName} track only` : cohortLabel}
      />

      <div className="space-y-4 flex-1 min-h-0 flex flex-col">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-lg font-bold text-white">Uploaded project templates</h2>
            {/* Only the three headline numbers here — the rest of the picture
                lives on its own page rather than pushing the table, which is
                what people open this screen for, below the fold. */}
            {insights && (
              <div className="flex items-center gap-3 text-xs">
                {[
                  { value: insights.totals.projects, label: 'projects' },
                  { value: insights.totals.tracks, label: 'tracks' },
                  { value: insights.totals.batches, label: 'batches' },
                ].map(item => (
                  <span key={item.label} className="flex items-baseline gap-1">
                    <span className="text-white font-semibold text-sm tabular-nums">{item.value}</span>
                    <span className="text-gray-500">{item.label}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/projects/insights`)}
              title="Catalog analytics"
              className="flex items-center gap-2 px-3 py-2 bg-zinc-850 border border-zinc-750 rounded-lg text-gray-300 hover:text-gold hover:border-gold/40 transition-colors text-sm"
            >
              <BarChart3 size={16} />
              Analytics
            </button>
            <button
              onClick={() => setProjectCsvModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200 text-sm"
            >
              <Upload size={16} />
              Upload Projects CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Hidden on the track-scoped route, where the URL already fixes the
              track and a second control would only contradict it. */}
          {!trackSlug && (
            <div className="w-full sm:w-56">
              <Select
                value={trackFilter}
                onChange={handleTrackChange}
                variant="filter"
                options={[
                  { value: '', label: 'All tracks' },
                  ...tracks.map(t => ({ value: t.slug, label: t.name })),
                ]}
                placeholder="All tracks"
              />
            </div>
          )}

          <input
            type="text"
            value={projectIdInput}
            onChange={(e) => handleProjectIdChange(e.target.value)}
            placeholder="Filter by Project ID…"
            aria-label="Filter by Project ID"
            className="w-full sm:w-56 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold placeholder-gray-600 font-mono"
          />

          {(trackFilter || projectIdInput) && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-gray-400 hover:text-gold transition-colors"
            >
              Clear filters
            </button>
          )}

          <span className="text-xs text-gray-500 ml-auto">
            {pagination.total} project{pagination.total === 1 ? '' : 's'}
          </span>
        </div>

        <DataTable
          columns={[
            { key: 'title', header: 'Project Title' },
            { key: 'track', header: 'Related Track', render: (row) => {
              const style = getTrackColor(row.track);
              return (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {trackNameBySlug.get(row.track) ?? row.track}
                </span>
              );
            }},
            { key: 'problemStatement', header: 'Problem Statement', render: (row) => (
              <p className="text-xs text-gray-400 line-clamp-2 max-w-sm">{row.problemStatement || row.description || '-'}</p>
            )},
            { key: 'related_field', header: 'Tech / Stack', render: (row) => (
              <span className="text-xs text-gray-300 font-mono">{row.related_field || '-'}</span>
            )},
          ]}
          data={projects as (Project & Record<string, unknown>)[]}
          searchPlaceholder="Search projects..."
          serverPagination={{
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: pagination.totalPages,
            onPageChange: setPage,
            onLimitChange: handleLimitChange,
          }}
          onSearchChange={handleSearchChange}
          onRowClick={(row) => setSelectedProject(row)}
          actions={(row) => (
            <button
              onClick={() => handleDeleteProject(row.id)}
              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
              title="Delete Project"
            >
              <Trash2 size={16} />
            </button>
          )}
        />
      </div>

      <ProjectCsvImportModal
        open={projectCsvModalOpen}
        onClose={() => setProjectCsvModalOpen(false)}
        onImportSuccess={handleImportSuccess}
        cohortId={cohortId}
        forcedTrackSlug={trackSlug}
      />

      {selectedProject && (
        <Modal open onClose={() => setSelectedProject(null)} title={selectedProject.title} size="xl">
          <ProjectDetail project={selectedProject} />
        </Modal>
      )}
    </PageLayout>
  );
}

