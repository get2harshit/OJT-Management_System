import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import SelectEntityGrid from './SelectEntityGrid';
import ProjectCsvImportModal from './ProjectCsvImportModal';
import type { Project } from '../../../lib/types';
import { TRACK_DOT_COLORS } from '../../../lib/constants';
import { apiGetCohort, apiGetProjectsForCohort, apiAddProjectsToCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';

interface CohortProjectsPageProps {
  projects: Project[];
  onProjectsImported: () => void;
}

export default function CohortProjectsPage({ projects, onProjectsImported }: CohortProjectsPageProps) {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [mappedProjectIds, setMappedProjectIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectCsvModalOpen, setProjectCsvModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const [cohort, mapped] = await Promise.all([
        apiGetCohort(cohortId),
        apiGetProjectsForCohort(cohortId),
      ]);
      setCohortLabel(getCohortLabel(cohort));
      setMappedProjectIds(mapped.map(p => p.id));
    } catch (err: unknown) {
      console.error(err);
      showError('Failed to load projects mapped to this cohort.');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [cohortId, navigate, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = (projectId: string) => {
    setMappedProjectIds(prev =>
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]
    );
  };

  const filteredProjects = projects.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.title.toLowerCase().includes(q) || (p.problemStatement || '').toLowerCase().includes(q) || p.track.toLowerCase().includes(q);
  });

  const allSelected = filteredProjects.length > 0 && filteredProjects.every(p => mappedProjectIds.includes(p.id));

  const handleSelectAll = () => {
    if (allSelected) {
      const filteredIds = new Set(filteredProjects.map(p => p.id));
      setMappedProjectIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      setMappedProjectIds(prev => Array.from(new Set([...prev, ...filteredProjects.map(p => p.id)])));
    }
  };

  const handleSave = async () => {
    if (!cohortId) return;
    setSaving(true);
    try {
      await apiAddProjectsToCohort(cohortId, mappedProjectIds);
      showSuccess('Cohort projects updated successfully!');
      navigate(-1);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to map projects to cohort');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <CohortPageHeader title="Select Projects" subtitle={cohortLabel} />
      <SelectEntityGrid<Project>
        description="Select one or more master projects from the catalog templates to map to this cohort."
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchPlaceholder="Search projects..."
        items={filteredProjects}
        getId={p => p.id}
        selectedIds={mappedProjectIds}
        onSelectAll={handleSelectAll}
        allSelected={allSelected}
        loading={loading}
        saving={saving}
        onSave={handleSave}
        onCancel={() => navigate(-1)}
        emptyMessage="No projects found."
        rightAction={
          <button
            onClick={() => setProjectCsvModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-white font-semibold rounded-lg border border-zinc-700 hover:scale-105 transition-all duration-200 text-sm whitespace-nowrap"
          >
            <Upload size={16} />
            Upload Projects CSV
          </button>
        }
        renderCard={(p, selected) => (
          <label
            className={`flex flex-col gap-2 p-4 rounded-lg cursor-pointer transition-all border-2 ${
              selected ? 'border-gold bg-gold/10' : 'border-zinc-750 bg-zinc-850 hover:border-zinc-650'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-white font-semibold text-sm leading-snug">{p.title}</p>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => handleToggle(p.id)}
                className="mt-0.5 shrink-0 rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wide text-gray-500 font-medium">Track:</span>
              {(() => {
                const style = TRACK_DOT_COLORS[p.track] ?? { dot: 'bg-gray-400', text: 'text-gray-300' };
                return (
                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${style.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {p.track}
                  </span>
                );
              })()}
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wide text-gray-500 font-medium">Description:</span>
              <p className="text-gray-400 text-xs line-clamp-3">{p.problemStatement || p.description}</p>
            </div>
            {p.related_field && (
              <div>
                <span className="text-[9px] uppercase tracking-wide text-gray-500 font-medium">Tech Stack:</span>
                <p className="text-[10px] text-gray-300 font-mono line-clamp-2">{p.related_field}</p>
              </div>
            )}
          </label>
        )}
      />

      <ProjectCsvImportModal
        open={projectCsvModalOpen}
        onClose={() => setProjectCsvModalOpen(false)}
        onImportSuccess={onProjectsImported}
      />
    </div>
  );
}
