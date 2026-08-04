import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, Trash2, BarChart3 } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import ProjectCsvImportModal from './ProjectCsvImportModal';
import type { Project, ProjectPartner, RecommendedMentor } from '../../../lib/types';
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
const PAGE_SIZE_OPTIONS = [20, 40, 80, 100, 500, 1000];

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
    <div className="space-y-6 flex-1 min-h-0 flex flex-col">
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
            limitOptions: PAGE_SIZE_OPTIONS,
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
    </div>
  );
}

// Every ojt_projects field the catalog stores, laid out in one scrollable
// detail view — this is deliberately exhaustive (not a curated subset) since
// admins use this to sanity-check exactly what a CSV row actually saved.
function ProjectDetail({ project }: { project: Project }) {
  const { tracks } = useTracks();
  const trackName = tracks.find(t => t.slug === project.track)?.name ?? project.track;
  const style = getTrackColor(project.track);
  const techStack = project.techStack?.length ? project.techStack : (project.related_field ? project.related_field.split(',').map(s => s.trim()).filter(Boolean) : []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {trackName}
        </span>
        {project.projectId && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold font-mono">{project.projectId}</span>
        )}
        {project.level && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-750 text-gray-300 capitalize">{project.level}</span>
        )}
        {project.projectBy && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-750 text-gray-300">{project.projectBy === 'PST' ? 'Admin Catalog' : 'Student Proposed'}</span>
        )}
      </div>

      <ProjectDetailSection label="Description">
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.description || '-'}</p>
      </ProjectDetailSection>

      <ProjectDetailSection label="Problem Statement">
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.problemStatement || '-'}</p>
      </ProjectDetailSection>

      <ProjectDetailSection label="Project Description (short)">
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.projectDescription || '-'}</p>
      </ProjectDetailSection>

      <ProjectDetailSection label="End Users Defined">
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.endUsersDefined || '-'}</p>
      </ProjectDetailSection>

      <ProjectDetailSection label="Reference Docs">
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.referenceDocs || '-'}</p>
      </ProjectDetailSection>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProjectDetailSection label="Recommended Mentors">
          <TagList items={project.recommendedMentors?.map(formatRecommendedMentor)} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Credit Mapping">
          <TagList items={project.creditMapping} />
        </ProjectDetailSection>
      </div>

      <ProjectDetailSection label="Partners">
        <PartnerList partners={project.partners} />
      </ProjectDetailSection>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProjectDetailSection label="Tech Stack">
          <TagList items={techStack} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Framework">
          <TagList items={project.framework} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Suggested Libraries / Tools">
          <TagList items={project.suggestedLibrariesTools} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Course Covered">
          <TagList items={project.courseCovered} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Industry">
          <p className="text-sm text-gray-300">{project.industry || '-'}</p>
        </ProjectDetailSection>
        <ProjectDetailSection label="Theme">
          <p className="text-sm text-gray-300">{project.theme || '-'}</p>
        </ProjectDetailSection>
        <ProjectDetailSection label="Source / Startup School">
          <p className="text-sm text-gray-300">{project.sourceStartupSchool || '-'}</p>
        </ProjectDetailSection>
        <ProjectDetailSection label="Estimated Duration">
          <p className="text-sm text-gray-300">{project.estimatedDuration ? `${project.estimatedDuration} week${project.estimatedDuration === 1 ? '' : 's'}` : '-'}</p>
        </ProjectDetailSection>
        <ProjectDetailSection label="Batch">
          <TagList items={project.batch} />
        </ProjectDetailSection>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProjectDetailSection label="Must Have Features">
          <TagList items={project.mustHaveFeatures} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Good To Have Features">
          <TagList items={project.goodToHaveFeatures} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Core Learning Goals">
          <TagList items={project.coreLearningGoals} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Stretch Goal">
          <TagList items={project.stretchGoal} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Evaluation Metrics">
          <TagList items={project.evaluationMetrics} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Expected Output">
          <TagList items={project.expectedOutput} />
        </ProjectDetailSection>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ProjectDetailSection label="First Month Milestones">
          <TagList items={project.firstMonthMilestones} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Second Month Milestones">
          <TagList items={project.secondMonthMilestones} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Third Month Milestones">
          <TagList items={project.thirdMonthMilestones} />
        </ProjectDetailSection>
      </div>

      {project.created_at && (
        <p className="text-[11px] text-gray-500 pt-2 border-t border-zinc-800">
          Created {new Date(project.created_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function ProjectDetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// A recommended mentor is a real mentor row, so fullName is only ever null if
// that mentor has since been removed — show the gap rather than hiding the entry.
function formatRecommendedMentor(mentor: RecommendedMentor): string {
  const name = mentor.fullName ?? 'Unknown mentor';
  return mentor.organization ? `${name} · ${mentor.organization}` : name;
}

function PartnerList({ partners }: { partners?: ProjectPartner[] }) {
  if (!partners || partners.length === 0) return <p className="text-sm text-gray-500">-</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {partners.map(partner => (
        <span key={partner.name} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-zinc-750 text-gray-300">
          {partner.logoUrl && (
            <img src={partner.logoUrl} alt="" loading="lazy" className="w-4 h-4 object-contain rounded-sm" />
          )}
          {partner.name}
        </span>
      ))}
    </div>
  );
}

function TagList({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return <p className="text-sm text-gray-500">-</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="text-xs px-2 py-1 rounded-full bg-zinc-750 text-gray-300">
          {item}
        </span>
      ))}
    </div>
  );
}
