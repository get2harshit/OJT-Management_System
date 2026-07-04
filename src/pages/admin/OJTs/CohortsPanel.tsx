import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Calendar, RefreshCw, Upload, Briefcase, Edit2, Users } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import DateRangePicker from '../../../components/DateRangePicker';
import type { Cohort, SemesterSession, Project, Profile, Student } from '../../../lib/types';
import {
  apiListCohorts,
  apiCreateCohort,
  apiDeleteCohort,
  apiUpdateCohort,
  apiAddProjectsToCohort,
  apiGetProjectsForCohort,
} from '../../../lib/api';
import { getDurationString, toDateOnly, formatDateDisplay } from '../../../lib/utils';
import { SEMESTER_SESSION_OPTIONS, SEMESTER_SESSION_LABELS } from '../../../lib/constants';
import { getCohortLabel, getSemesterSessionLabel } from '../../../lib/cohortLabel';
import { useStudentProfiles } from '../../../hooks/useStudents';
import SelectEntityModal from './SelectEntityModal';
import FormCsvImportModal from './FormCsvImportModal';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COHORT_NAME_REGEX = new RegExp(`^OJT (${MONTH_NAMES.join('|')}) [0-9]{4}$`);

// Derives Allowed Batches / Semester / Cohort Name from the OJT Start Date.
// A B.Tech program runs 4 years and the academic year turns over every
// August, so of the 5 batches whose span overlaps the start year Y, the
// (Y-4)-Y batch has already graduated (finishes before an August start).
// The remaining 4 — the 3 already mid-program plus the just-starting
// Y-(Y+4) batch — are offered as selectable options; only the 3 mid-program
// batches are auto-checked, the newly-starting batch is left for the admin
// to opt into manually.
function computeCohortDefaultsFromStartDate(startDate: string): {
  eligibleBatchOptions: string[];
  allowedBatches: string[];
  sessionTerm: SemesterSession;
  name: string;
} {
  const [yearStr, monthStr] = startDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12

  const allowedBatches = [
    `${year - 3}-${year + 1}`,
    `${year - 2}-${year + 2}`,
    `${year - 1}-${year + 3}`,
  ];
  const eligibleBatchOptions = [...allowedBatches, `${year}-${year + 4}`];

  const sessionTerm: SemesterSession = month >= 7 && month <= 12 ? 'ODD' : 'EVEN';

  const name = `OJT ${MONTH_NAMES[month - 1]} ${year}`;

  return { eligibleBatchOptions, allowedBatches, sessionTerm, name };
}

const EMPTY_COHORT_FORM = {
  name: '',
  allowedBatches: [] as string[],
  sessionTerm: 'ODD' as SemesterSession,
  startDate: '',
  endDate: '',
  isActive: true,
};

interface CohortsPanelProps {
  projects: Project[];
  profiles: Profile[];
  students: Student[];
  updateStudent: (userId: string, patch: Partial<Student>) => void;
  importOJTBatch: (cohortId: string, studentRecords: any[]) => void;
}

export default function CohortsPanel({ projects, profiles, students, updateStudent, importOJTBatch }: CohortsPanelProps) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCohortId, setEditingCohortId] = useState<string | null>(null);
  const [cohortModalOpen, setCohortModalOpen] = useState(false);
  const [cohortForm, setCohortForm] = useState(EMPTY_COHORT_FORM);
  const [eligibleBatchOptions, setEligibleBatchOptions] = useState<string[]>([]);
  const [formCsvModalOpen, setFormCsvModalOpen] = useState(false);

  // Cohort-Project mapping modal
  const [manageProjectsModalOpen, setManageProjectsModalOpen] = useState(false);
  const [selectedCohortForProjects, setSelectedCohortForProjects] = useState<Cohort | null>(null);
  const [mappedProjectIds, setMappedProjectIds] = useState<string[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [savingProjects, setSavingProjects] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');

  // Cohort-Student mapping modal
  const [manageStudentsModalOpen, setManageStudentsModalOpen] = useState(false);
  const [selectedCohortForStudents, setSelectedCohortForStudents] = useState<Cohort | null>(null);
  const [mappedStudentIds, setMappedStudentIds] = useState<string[]>([]);
  const [originalMappedStudentIds, setOriginalMappedStudentIds] = useState<string[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  const studentProfiles = useStudentProfiles(profiles);

  const fetchCohorts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiListCohorts();
      setCohorts(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to load cohorts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  const handleSaveCohort = async () => {
    if (!cohortForm.name || cohortForm.allowedBatches.length === 0 || !cohortForm.startDate || !cohortForm.endDate) return;

    if (!COHORT_NAME_REGEX.test(cohortForm.name)) {
      alert('Cohort Name must be in the format "OJT <Month> <Year>", e.g. OJT August 2026');
      return;
    }

    const invalidBatch = cohortForm.allowedBatches.find(batch => {
      const match = batch.match(/^(\d{4})-(\d{4})$/);
      return !match || Number(match[2]) - Number(match[1]) !== 4;
    });
    if (invalidBatch) {
      alert('Allowed Batches must be 4-year B.Tech spans in the format YYYY-YYYY, e.g. 2024-2028');
      return;
    }

    if (cohortForm.startDate > cohortForm.endDate) {
      alert('Start Date must be before End Date');
      return;
    }

    try {
      if (editingCohortId) {
        await apiUpdateCohort(editingCohortId, {
          name: cohortForm.name,
          allowedBatches: cohortForm.allowedBatches,
          sessionTerm: cohortForm.sessionTerm,
          startDate: cohortForm.startDate,
          endDate: cohortForm.endDate,
          isActive: cohortForm.isActive,
        });
      } else {
        await apiCreateCohort({
          name: cohortForm.name,
          allowedBatches: cohortForm.allowedBatches,
          sessionTerm: cohortForm.sessionTerm,
          startDate: cohortForm.startDate,
          endDate: cohortForm.endDate,
          isActive: cohortForm.isActive,
        });
      }
      setCohortForm(EMPTY_COHORT_FORM);
      setEligibleBatchOptions([]);
      setEditingCohortId(null);
      setCohortModalOpen(false);
      await fetchCohorts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save cohort');
    }
  };

  const handleEditCohort = (cohort: Cohort) => {
    setEditingCohortId(cohort.id);
    const allowedBatches = Array.isArray(cohort.allowedBatches) ? cohort.allowedBatches : [cohort.allowedBatches].filter(Boolean) as string[];
    const startDate = toDateOnly(cohort.startDate);
    // Union with the recomputed eligible options so existing selections
    // outside the formula (e.g. from data saved before this logic existed)
    // still show up as checked options instead of silently vanishing.
    const computedOptions = startDate ? computeCohortDefaultsFromStartDate(startDate).eligibleBatchOptions : [];
    setEligibleBatchOptions(Array.from(new Set([...computedOptions, ...allowedBatches])));
    setCohortForm({
      name: cohort.name ?? '',
      allowedBatches,
      sessionTerm: cohort.sessionTerm,
      startDate,
      endDate: toDateOnly(cohort.endDate),
      isActive: cohort.isActive,
    });
    setCohortModalOpen(true);
  };

  const handleDeleteCohort = async (id: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this OJT cohort?");
    if (!confirmDelete) return;
    try {
      await apiDeleteCohort(id);
      setCohorts(prev => prev.filter(c => c.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete cohort');
    }
  };

  // Project mapping handlers
  const handleOpenManageProjects = async (cohort: Cohort) => {
    setSelectedCohortForProjects(cohort);
    setLoadingProjects(true);
    setMappedProjectIds([]);
    setProjectSearchQuery('');
    setManageProjectsModalOpen(true);
    try {
      const data = await apiGetProjectsForCohort(cohort.id);
      setMappedProjectIds(Array.isArray(data) ? data.map(p => p.id) : []);
    } catch (err: unknown) {
      console.error(err);
      alert('Failed to load projects mapped to this cohort.');
    } finally {
      setLoadingProjects(false);
    }
  };

  const closeManageProjects = () => {
    setManageProjectsModalOpen(false);
    setSelectedCohortForProjects(null);
    setMappedProjectIds([]);
    setProjectSearchQuery('');
  };

  const handleToggleProjectMapping = (projectId: string) => {
    setMappedProjectIds(prev =>
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]
    );
  };

  const handleSaveCohortProjects = async () => {
    if (!selectedCohortForProjects) return;
    setSavingProjects(true);
    try {
      await apiAddProjectsToCohort(selectedCohortForProjects.id, mappedProjectIds);
      alert('Cohort projects updated successfully!');
      closeManageProjects();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to map projects to cohort');
    } finally {
      setSavingProjects(false);
    }
  };

  const filteredProjectsForMapping = projects.filter(p => {
    if (!projectSearchQuery) return true;
    const q = projectSearchQuery.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.track.toLowerCase().includes(q);
  });

  const allProjectsSelected = filteredProjectsForMapping.length > 0 && filteredProjectsForMapping.every(p => mappedProjectIds.includes(p.id));

  const handleSelectAllProjects = () => {
    if (allProjectsSelected) {
      const filteredIds = new Set(filteredProjectsForMapping.map(p => p.id));
      setMappedProjectIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      setMappedProjectIds(prev => Array.from(new Set([...prev, ...filteredProjectsForMapping.map(p => p.id)])));
    }
  };

  // Student mapping handlers
  const handleOpenManageStudents = (cohort: Cohort) => {
    setSelectedCohortForStudents(cohort);
    const currentlyMapped = students.filter(s => s.ojt_id === cohort.id).map(s => s.user_id);
    setMappedStudentIds(currentlyMapped);
    setOriginalMappedStudentIds(currentlyMapped);
    setStudentSearchQuery('');
    setManageStudentsModalOpen(true);
  };

  const closeManageStudents = () => {
    setManageStudentsModalOpen(false);
    setSelectedCohortForStudents(null);
    setMappedStudentIds([]);
    setStudentSearchQuery('');
  };

  const handleToggleStudentMapping = (userId: string) => {
    setMappedStudentIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const filteredStudentsForMapping = studentProfiles.filter(p => {
    if (!studentSearchQuery) return true;
    const q = studentSearchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.track || '').toLowerCase().includes(q);
  });

  const allStudentsSelected = filteredStudentsForMapping.length > 0 && filteredStudentsForMapping.every(p => mappedStudentIds.includes(p.id));

  const handleSelectAllStudents = () => {
    if (allStudentsSelected) {
      const filteredIds = new Set(filteredStudentsForMapping.map(p => p.id));
      setMappedStudentIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      setMappedStudentIds(prev => Array.from(new Set([...prev, ...filteredStudentsForMapping.map(p => p.id)])));
    }
  };

  const handleSaveCohortStudents = () => {
    if (!selectedCohortForStudents) return;
    const cohortId = selectedCohortForStudents.id;
    mappedStudentIds.forEach(userId => {
      if (!originalMappedStudentIds.includes(userId)) {
        updateStudent(userId, { ojt_id: cohortId });
      }
    });
    originalMappedStudentIds.forEach(userId => {
      if (!mappedStudentIds.includes(userId)) {
        updateStudent(userId, { ojt_id: null });
      }
    });
    alert('Cohort students updated successfully!');
    closeManageStudents();
  };

  const cohortData = cohorts.map(c => ({
    ...c,
    label: getCohortLabel(c),
    sessionTermMapped: getSemesterSessionLabel(c.sessionTerm),
    duration: getDurationString(c.startDate, c.endDate),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-lg font-bold text-white">Cohorts & Batches</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchCohorts}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 text-gray-300 rounded-lg transition-colors text-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setFormCsvModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-white font-semibold rounded-lg border border-zinc-700 hover:scale-105 transition-all duration-200 text-sm"
          >
            <Upload size={16} />
            Upload OJT Form CSV
          </button>
          <button
            onClick={() => setCohortModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200 text-sm"
          >
            <Plus size={16} />
            Create Cohort
          </button>
        </div>
      </div>

      {loading && cohortData.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Loading cohorts…</p>
          </div>
        </div>
      ) : (
        <DataTable
          columns={[
            { key: 'label', header: 'Cohort Name' },
            { key: 'sessionTermMapped', header: 'Semester' },
            {
              key: 'startDate',
              header: 'Start Date',
              render: (row) => <span>{formatDateDisplay(row.startDate)}</span>,
            },
            {
              key: 'endDate',
              header: 'End Date',
              render: (row) => <span>{formatDateDisplay(row.endDate)}</span>,
            },
            {
              key: 'duration',
              header: 'Duration',
              render: (row) => (
                <span className="flex items-center gap-1 text-gray-300 text-xs">
                  <Calendar size={14} className="text-gold" />
                  {row.duration}
                </span>
              ),
            },
            {
              key: 'isActive',
              header: 'Status',
              render: (row) => (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  row.isActive ? 'bg-green-400/10 text-green-400' : 'bg-gray-400/10 text-gray-400'
                }`}>
                  {row.isActive ? 'Active' : 'Inactive'}
                </span>
              ),
            },
          ]}
          data={cohortData}
          searchPlaceholder="Search cohorts..."
          actions={(row: any) => (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleEditCohort(row as unknown as Cohort)}
                className="p-1.5 text-gray-400 hover:text-gold transition-colors"
                title="Edit OJT"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={() => handleOpenManageProjects(row as unknown as Cohort)}
                className="p-1.5 text-gray-400 hover:text-gold transition-colors"
                title="Select Project"
              >
                <Briefcase size={16} />
              </button>
              <button
                onClick={() => handleOpenManageStudents(row as unknown as Cohort)}
                className="p-1.5 text-gray-400 hover:text-gold transition-colors"
                title="Select Student"
              >
                <Users size={16} />
              </button>
              <button
                onClick={() => handleDeleteCohort(row.id)}
                className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                title="Delete OJT"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        />
      )}

      {/* Cohort Modal */}
      <Modal
        open={cohortModalOpen}
        onClose={() => {
          setCohortModalOpen(false);
          setEditingCohortId(null);
          setCohortForm(EMPTY_COHORT_FORM);
          setEligibleBatchOptions([]);
        }}
        title={editingCohortId ? "Edit OJT Cohort" : "Create OJT Cohort"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">OJT Duration (Start → End Date)</label>
            <DateRangePicker
              startDate={cohortForm.startDate}
              endDate={cohortForm.endDate}
              onRangeChange={({ startDate, endDate }) => {
                if (startDate && startDate !== cohortForm.startDate) {
                  const defaults = computeCohortDefaultsFromStartDate(startDate);
                  setCohortForm({
                    ...cohortForm,
                    startDate,
                    endDate,
                    allowedBatches: defaults.allowedBatches,
                    sessionTerm: defaults.sessionTerm,
                    name: defaults.name,
                  });
                  setEligibleBatchOptions(defaults.eligibleBatchOptions);
                } else if (!startDate) {
                  setCohortForm({ ...cohortForm, startDate: '', endDate: '', allowedBatches: [] });
                  setEligibleBatchOptions([]);
                } else {
                  setCohortForm({ ...cohortForm, endDate });
                }
              }}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cohort Name</label>
            <input
              type="text"
              value={cohortForm.name}
              onChange={e => setCohortForm({ ...cohortForm, name: e.target.value })}
              placeholder="e.g. OJT August 2026"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Allowed Batches</label>
            <div className="flex flex-wrap gap-3 bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 min-h-[42px] items-center">
              {eligibleBatchOptions.length === 0 ? (
                <span className="text-sm text-gray-500">Select a Start Date to see eligible batches</span>
              ) : (
                eligibleBatchOptions.map(batch => {
                  const checked = cohortForm.allowedBatches.includes(batch);
                  return (
                    <label key={batch} className="flex items-center gap-1.5 text-sm text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? cohortForm.allowedBatches.filter(b => b !== batch)
                            : [...cohortForm.allowedBatches, batch];
                          setCohortForm({ ...cohortForm, allowedBatches: next });
                        }}
                        className="accent-gold"
                      />
                      {batch}
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Semester <span className="text-gray-600">(auto-set from Start Date)</span></label>
            <select
              value={cohortForm.sessionTerm}
              disabled
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-gray-400 text-sm cursor-not-allowed opacity-70"
            >
              {SEMESTER_SESSION_OPTIONS.map(t => (
                <option key={t} value={t}>{SEMESTER_SESSION_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center pb-1">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cohortForm.isActive}
                onChange={e => setCohortForm({ ...cohortForm, isActive: e.target.checked })}
                className="rounded bg-zinc-750 border-zinc-650 text-gold focus:ring-gold"
              />
              Mark as Active Cohort
            </label>
          </div>
          <button
            onClick={handleSaveCohort}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            {editingCohortId ? "Update Cohort" : "Create Cohort"}
          </button>
        </div>
      </Modal>

      <FormCsvImportModal
        open={formCsvModalOpen}
        onClose={() => setFormCsvModalOpen(false)}
        cohortOptions={cohortData.map(c => ({ id: c.id, label: c.label }))}
        profiles={profiles}
        importOJTBatch={importOJTBatch}
      />

      <SelectEntityModal<Project>
        open={manageProjectsModalOpen}
        onClose={closeManageProjects}
        title={`Select Projects for ${getCohortLabel(selectedCohortForProjects)}`}
        description="Select one or more master projects from the catalog templates to map to this cohort."
        searchQuery={projectSearchQuery}
        onSearchQueryChange={setProjectSearchQuery}
        searchPlaceholder="Search projects..."
        items={filteredProjectsForMapping}
        getId={p => p.id}
        selectedIds={mappedProjectIds}
        onSelectAll={handleSelectAllProjects}
        allSelected={allProjectsSelected}
        loading={loadingProjects}
        saving={savingProjects}
        onSave={handleSaveCohortProjects}
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
                onChange={() => handleToggleProjectMapping(p.id)}
                className="mt-0.5 shrink-0 rounded bg-zinc-750 border-zinc-650 text-gold focus:ring-gold"
              />
            </div>
            <p className="text-gray-400 text-xs line-clamp-3">{p.description}</p>
            <span className="text-[10px] text-gold/80 self-start bg-gold/10 px-2 py-0.5 rounded-full font-medium">{p.track}</span>
          </label>
        )}
      />

      <SelectEntityModal<Profile>
        open={manageStudentsModalOpen}
        onClose={closeManageStudents}
        title={`Select Students for ${getCohortLabel(selectedCohortForStudents)}`}
        description="Select one or more students to add to this cohort."
        searchQuery={studentSearchQuery}
        onSearchQueryChange={setStudentSearchQuery}
        searchPlaceholder="Search students..."
        items={filteredStudentsForMapping}
        getId={p => p.id}
        selectedIds={mappedStudentIds}
        onSelectAll={handleSelectAllStudents}
        allSelected={allStudentsSelected}
        saving={false}
        onSave={handleSaveCohortStudents}
        emptyMessage="No students found."
        renderCard={(p, selected) => (
          <label
            className={`flex flex-col gap-2 p-4 rounded-lg cursor-pointer transition-all border-2 ${
              selected ? 'border-gold bg-gold/10' : 'border-zinc-750 bg-zinc-850 hover:border-zinc-650'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-white font-semibold text-sm leading-snug">{p.name}</p>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => handleToggleStudentMapping(p.id)}
                className="mt-0.5 shrink-0 rounded bg-zinc-750 border-zinc-650 text-gold focus:ring-gold"
              />
            </div>
            <p className="text-gray-400 text-xs line-clamp-1">{p.email}</p>
            {p.track && (
              <span className="text-[10px] text-gold/80 self-start bg-gold/10 px-2 py-0.5 rounded-full font-medium">{p.track}</span>
            )}
          </label>
        )}
      />
    </div>
  );
}
