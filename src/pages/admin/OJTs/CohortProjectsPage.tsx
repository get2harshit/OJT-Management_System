import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload, Trash2 } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import ProjectCsvImportModal from './ProjectCsvImportModal';
import type { Project, ProjectPartner, RecommendedMentor } from '../../../lib/types';
import { getTrackColor } from '../../../lib/constants';
import { apiGetCohort, apiGetProjectsForCohortPage, apiDeleteProject } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';
import { usePageRefresh } from '../../../context/RefreshContext';
import { useTracks } from '../../../hooks/useTracks';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

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
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [projectCsvModalOpen, setProjectCsvModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const fetchPage = useCallback(async (targetPage: number, searchTerm: string) => {
    if (!cohortId) return;
    try {
      const res = await apiGetProjectsForCohortPage(cohortId, { page: targetPage, limit: PAGE_SIZE, search: searchTerm || undefined, track: trackSlug || undefined });
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
    fetchPage(page, search).catch(() => {});
  }, [page, search, fetchPage]);

  usePageRefresh(useCallback(
    () => Promise.all([loadCohortLabel(), fetchPage(page, search)]),
    [loadCohortLabel, fetchPage, page, search]
  ));

  // Debounce search input so every keystroke doesn't fire a request.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleImportSuccess = () => {
    fetchPage(1, search);
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
    await fetchPage(page, search);
  };

  return (
    <div className="space-y-6 flex-1 min-h-0 flex flex-col">
      <CohortPageHeader
        title={trackName ? `${trackName} Projects` : 'Projects'}
        subtitle={trackName ? `${cohortLabel} · ${trackName} track only` : cohortLabel}
      />

      <div className="space-y-4 flex-1 min-h-0 flex flex-col">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h2 className="text-lg font-bold text-white">Uploaded project templates</h2>
          <button
            onClick={() => setProjectCsvModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200 text-sm"
          >
            <Upload size={16} />
            Upload Projects CSV
          </button>
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
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.creditMapping || '-'}</p>
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
