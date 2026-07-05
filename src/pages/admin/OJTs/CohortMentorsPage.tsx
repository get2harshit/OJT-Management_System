import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CohortPageHeader from './CohortPageHeader';
import SelectEntityGrid from './SelectEntityGrid';
import type { ApiMentor } from '../../../lib/types';
import { apiListMentors, apiGetCohort, apiAddMentorsToCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';

export default function CohortMentorsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allMentors, setAllMentors] = useState<ApiMentor[]>([]);
  const [mappedMentorIds, setMappedMentorIds] = useState<string[]>([]);
  const [originalMappedMentorIds, setOriginalMappedMentorIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const [mentors, details] = await Promise.all([
        apiListMentors(),
        apiGetCohort(cohortId),
      ]);
      setAllMentors(mentors);
      setCohortLabel(getCohortLabel(details));
      const currentlyMapped = details.mentors.map(m => m.id);
      setMappedMentorIds(currentlyMapped);
      setOriginalMappedMentorIds(currentlyMapped);
    } catch (err: unknown) {
      console.error(err);
      showError('Failed to load mentors.');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [cohortId, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = (mentorId: string) => {
    setMappedMentorIds(prev =>
      prev.includes(mentorId) ? prev.filter(id => id !== mentorId) : [...prev, mentorId]
    );
  };

  const filteredMentors = allMentors.filter(m => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (m.fullName || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q) || (m.organization || '').toLowerCase().includes(q);
  });

  const allSelected = filteredMentors.length > 0 && filteredMentors.every(m => mappedMentorIds.includes(m.id));

  const handleSelectAll = () => {
    if (allSelected) {
      const filteredIds = new Set(filteredMentors.map(m => m.id));
      setMappedMentorIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      setMappedMentorIds(prev => Array.from(new Set([...prev, ...filteredMentors.map(m => m.id)])));
    }
  };

  // Additive only — the backend has no unmap endpoint, so only newly
  // checked mentors (not present in the original mapping) are sent.
  const handleSave = async () => {
    if (!cohortId) return;
    const newlyAdded = mappedMentorIds.filter(id => !originalMappedMentorIds.includes(id));
    if (newlyAdded.length === 0) {
      navigate(-1);
      return;
    }
    setSaving(true);
    try {
      await apiAddMentorsToCohort(cohortId, newlyAdded);
      showSuccess('Cohort mentors updated successfully!');
      navigate(-1);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to map mentors to cohort');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <CohortPageHeader title="Select Mentors" subtitle={cohortLabel} />
      <SelectEntityGrid<ApiMentor>
        description="Select one or more mentors to assign to this cohort."
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchPlaceholder="Search mentors..."
        items={filteredMentors}
        getId={m => m.id}
        selectedIds={mappedMentorIds}
        onSelectAll={handleSelectAll}
        allSelected={allSelected}
        loading={loading}
        saving={saving}
        onSave={handleSave}
        onCancel={() => navigate(-1)}
        emptyMessage="No mentors found."
        renderCard={(m, selected) => (
          <label
            className={`flex flex-col gap-2 p-4 rounded-lg cursor-pointer transition-all border-2 ${
              selected ? 'border-gold bg-gold/10' : 'border-zinc-750 bg-zinc-850 hover:border-zinc-650'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-white font-semibold text-sm leading-snug">{m.fullName || m.email || m.id}</p>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => handleToggle(m.id)}
                className="mt-0.5 shrink-0 rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
              />
            </div>
            {m.email && <p className="text-gray-400 text-xs line-clamp-1">{m.email}</p>}
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-gold/80 bg-gold/10 px-2 py-0.5 rounded-full font-medium">
                {m.isExternal ? 'External' : 'Internal'}
              </span>
              {m.organization && (
                <span className="text-[10px] text-gray-300 bg-zinc-750 px-2 py-0.5 rounded-full font-medium">{m.organization}</span>
              )}
            </div>
          </label>
        )}
      />
    </div>
  );
}
