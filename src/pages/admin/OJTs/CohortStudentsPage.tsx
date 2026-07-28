import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CohortPageHeader from './CohortPageHeader';
import SelectEntityGrid from './SelectEntityGrid';
import type { ApiStudent } from '../../../lib/types';
import { apiListStudents, apiGetCohort, apiAddStudentsToCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';

export default function CohortStudentsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [eligibleStudents, setEligibleStudents] = useState<ApiStudent[]>([]);
  const [mappedStudentIds, setMappedStudentIds] = useState<string[]>([]);
  const [originalMappedStudentIds, setOriginalMappedStudentIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const [students, details] = await Promise.all([
        apiListStudents({ cohortId }),
        apiGetCohort(cohortId, true),
      ]);
      setEligibleStudents(students);
      setCohortLabel(getCohortLabel(details));
      const currentlyMapped = details.students.map(s => s.id);
      setMappedStudentIds(currentlyMapped);
      setOriginalMappedStudentIds(currentlyMapped);
    } catch (err: unknown) {
      console.error(err);
      showError('Failed to load students eligible for this cohort.');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [cohortId, navigate, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = (userId: string) => {
    setMappedStudentIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const filteredStudents = eligibleStudents.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.fullName || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) || (p.rollNumber || '').toLowerCase().includes(q);
  });

  const allSelected = filteredStudents.length > 0 && filteredStudents.every(p => mappedStudentIds.includes(p.id));

  const handleSelectAll = () => {
    if (allSelected) {
      const filteredIds = new Set(filteredStudents.map(p => p.id));
      setMappedStudentIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      setMappedStudentIds(prev => Array.from(new Set([...prev, ...filteredStudents.map(p => p.id)])));
    }
  };

  // Additive only — the backend has no unmap endpoint, so only newly
  // checked students (not present in the original mapping) are sent.
  const handleSave = async () => {
    if (!cohortId) return;
    const newlyAdded = mappedStudentIds.filter(id => !originalMappedStudentIds.includes(id));
    if (newlyAdded.length === 0) {
      navigate(-1);
      return;
    }
    setSaving(true);
    try {
      await apiAddStudentsToCohort(cohortId, newlyAdded);
      showSuccess('Cohort students updated successfully!');
      navigate(-1);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to map students to cohort');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <CohortPageHeader title="Select Students" subtitle={cohortLabel} />
      <SelectEntityGrid<ApiStudent>
        description="Select one or more students to add to this cohort. Only students in this cohort's allowed batches are shown."
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchPlaceholder="Search students..."
        items={filteredStudents}
        getId={p => p.id}
        selectedIds={mappedStudentIds}
        onSelectAll={handleSelectAll}
        allSelected={allSelected}
        loading={loading}
        saving={saving}
        onSave={handleSave}
        onCancel={() => navigate(-1)}
        emptyMessage="No eligible students found."
        renderCard={(p, selected) => (
          <label
            className={`flex flex-col gap-2 p-4 rounded-lg cursor-pointer transition-all border-2 ${
              selected ? 'border-gold bg-gold/10' : 'border-zinc-750 bg-zinc-850 hover:border-zinc-650'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-white font-semibold text-sm leading-snug">{p.fullName || p.email || p.id}</p>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => handleToggle(p.id)}
                className="mt-0.5 shrink-0 rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
              />
            </div>
            {p.email && <p className="text-gray-400 text-xs line-clamp-1">{p.email}</p>}
            <div className="flex flex-wrap gap-1">
              {p.rollNumber && (
                <span className="text-[10px] text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full font-medium">{p.rollNumber}</span>
              )}
              {p.batch && (
                <span className="text-[10px] text-gray-300 bg-zinc-750 px-2 py-0.5 rounded-full font-medium">{p.batch}</span>
              )}
            </div>
          </label>
        )}
      />
    </div>
  );
}
