import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CohortPageHeader from './CohortPageHeader';
import SelectEntityGrid from './SelectEntityGrid';
import type { Project } from '../../../lib/types';
import { apiGetCohort, apiGetProjectsForCohort, apiAddProjectsToCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';

interface CohortProjectsPageProps {
  projects: Project[];
}

export default function CohortProjectsPage({ projects }: CohortProjectsPageProps) {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();

  const [cohortLabel, setCohortLabel] = useState('');
  const [mappedProjectIds, setMappedProjectIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      alert('Failed to load projects mapped to this cohort.');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [cohortId, navigate]);

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
    return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.track.toLowerCase().includes(q);
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
      alert('Cohort projects updated successfully!');
      navigate(-1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to map projects to cohort');
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
                className="mt-0.5 shrink-0 rounded bg-zinc-750 border-zinc-650 text-gold focus:ring-gold"
              />
            </div>
            <p className="text-gray-400 text-xs line-clamp-3">{p.description}</p>
            <span className="text-[10px] text-gold/80 self-start bg-gold/10 px-2 py-0.5 rounded-full font-medium">{p.track}</span>
          </label>
        )}
      />
    </div>
  );
}
