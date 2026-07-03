import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Calendar, RefreshCw, Upload, FileText, Briefcase, Layers, Target, Code, Edit2 } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { Cohort, TermSession, Project, Profile } from '../../lib/types';
import { apiListCohorts, apiCreateCohort, apiDeleteCohort, apiUpdateCohort, apiAddProjectsToCohort, apiGetProjectsForCohort } from '../../lib/api';
import { getDurationString } from '../../lib/utils';

const TERM_OPTIONS: TermSession[] = ['Semester 1', 'Semester 2', 'Term 1', 'Term 2', 'Summer Fast-Track'];
const TRACKS = ['Product Development', 'Application Development', 'Data Scientist', 'Open Source', 'Gen AI'];

interface OJTsProps {
  projects: Project[];
  addProject: (proj: Omit<Project, 'id' | 'created_at'>) => void;
  addProjects: (projs: Omit<Project, 'id' | 'created_at'>[]) => void;
  deleteProject: (id: string) => void;
  profiles: Profile[];
  importOJTBatch: (cohortId: string, studentRecords: any[]) => void;
}

export default function AdminOJTs({
  projects,
  addProject,
  addProjects,
  deleteProject,
  profiles,
  importOJTBatch
}: OJTsProps) {
  const [activeTab, setActiveTab] = useState<'cohorts' | 'catalog'>('cohorts');
  
  // Cohorts State
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [editingCohortId, setEditingCohortId] = useState<string | null>(null);

  // Cohort Project Mapping State
  const [manageProjectsModalOpen, setManageProjectsModalOpen] = useState(false);
  const [selectedCohortForProjects, setSelectedCohortForProjects] = useState<Cohort | null>(null);
  const [mappedProjectIds, setMappedProjectIds] = useState<string[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [savingProjects, setSavingProjects] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [cohortModalOpen, setCohortModalOpen] = useState(false);
  const [cohortForm, setCohortForm] = useState({
    name: '',
    academicYear: [] as string[],
    sessionTerm: 'Term 1' as TermSession,
    startDate: '',
    endDate: '',
    isActive: true,
  });

  // Projects State
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({
    title: '',
    description: '',
    track: TRACKS[0],
    end_goals: '',
    related_field: ''
  });

  // CSV Import States
  const [formCsvModalOpen, setFormCsvModalOpen] = useState(false);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [formCsvText, setFormCsvText] = useState('');
  
  const [projectCsvModalOpen, setProjectCsvModalOpen] = useState(false);
  const [projectCsvText, setProjectCsvText] = useState('');

  const formFileRef = useRef<HTMLInputElement>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);

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
    if (!cohortForm.name || cohortForm.academicYear.length === 0 || !cohortForm.startDate || !cohortForm.endDate) return;

    if (!COHORT_NAME_REGEX.test(cohortForm.name)) {
      setError('Cohort Name must be in the format "OJT <Month>,<Year>", e.g. OJT August,2026');
      return;
    }

    const invalidBatch = cohortForm.academicYear.find(batch => {
      const match = batch.match(/^(\d{4})-(\d{4})$/);
      return !match || Number(match[2]) - Number(match[1]) !== 4;
    });
    if (invalidBatch) {
      setError('Allowed Batches must be 4-year B.Tech spans in the format YYYY-YYYY, e.g. 2024-2028');
      return;
    }

    if (cohortForm.startDate > cohortForm.endDate) {
      setError('Start Date must be before End Date');
      return;
    }

    try {
      if (editingCohortId) {
        await apiUpdateCohort(editingCohortId, {
          name: cohortForm.name,
          academicYear: cohortForm.academicYear,
          sessionTerm: cohortForm.sessionTerm,
          startDate: cohortForm.startDate,
          endDate: cohortForm.endDate,
          isActive: cohortForm.isActive,
        });
      } else {
        await apiCreateCohort({
          name: cohortForm.name,
          academicYear: cohortForm.academicYear,
          sessionTerm: cohortForm.sessionTerm,
          startDate: cohortForm.startDate,
          endDate: cohortForm.endDate,
          isActive: cohortForm.isActive,
        });
      }
      setCohortForm({ name: '', academicYear: [], sessionTerm: 'Term 1', startDate: '', endDate: '', isActive: true });
      setEditingCohortId(null);
      setCohortModalOpen(false);
      await fetchCohorts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save cohort');
    }
  };

  const handleEditCohort = (cohort: Cohort) => {
    setEditingCohortId(cohort.id);
    setCohortForm({
      name: cohort.name ?? '',
      academicYear: Array.isArray(cohort.academicYear) ? cohort.academicYear : [cohort.academicYear].filter(Boolean) as string[],
      sessionTerm: cohort.sessionTerm,
      startDate: toDateOnly(cohort.startDate),
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
      setManageProjectsModalOpen(false);
      setSelectedCohortForProjects(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to map projects to cohort');
    } finally {
      setSavingProjects(false);
    }
  };

  // Project Handlers
  const handleSaveProject = () => {
    if (!projectForm.title || !projectForm.description) return;
    addProject({
      title: projectForm.title,
      description: projectForm.description,
      track: projectForm.track,
      end_goals: projectForm.end_goals,
      related_field: projectForm.related_field,
      source: 'Listed'
    });
    setProjectForm({ title: '', description: '', track: TRACKS[0], end_goals: '', related_field: '' });
    setProjectModalOpen(false);
  };

  const handleDeleteProject = (id: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this project template from the catalog?");
    if (!confirmDelete) return;
    deleteProject(id);
  };

  // CSV Parsing helper (supports quotes with commas)
  const parseCSVLines = (text: string) => {
    const lines = text.trim().split('\n').filter(Boolean);
    return lines.map(line => {
      const cols: string[] = [];
      let inQuotes = false;
      let currentCol = '';
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cols.push(currentCol.trim().replace(/^"|"$/g, ''));
          currentCol = '';
        } else {
          currentCol += char;
        }
      }
      cols.push(currentCol.trim().replace(/^"|"$/g, ''));
      return cols;
    });
  };

  // OJT Form CSV Upload Handlers
  const handleFormCsvUpload = () => {
    if (!selectedCohortId || !formCsvText) return;
    const parsed = parseCSVLines(formCsvText);
    if (parsed.length <= 1) return;

    const headers = parsed[0].map(h => h.toLowerCase());
    
    // Find column indexes
    const nameIdx = headers.findIndex(h => h.includes('student name') || h.includes('name'));
    const contactIdx = headers.findIndex(h => h.includes('contact') || h.includes('phone') || h.includes('number'));
    const trackIdx = headers.findIndex(h => h.includes('track') || h.includes('domain'));
    const mentorIdx = headers.findIndex(h => h.includes('mentorship') || h.includes('preference 1') || h.includes('mentor'));
    const choiceIdx = headers.findIndex(h => h.includes('own project') || h.includes('select between') || h.includes('choice'));
    const titleIdx = headers.findIndex(h => h.includes('project title') || (h.includes('title') && !h.includes('track')));
    const descIdx = headers.findIndex(h => h.includes('project description') || h.includes('description'));
    const stackIdx = headers.findIndex(h => h.includes('stack') || h.includes('framework') || h.includes('tech'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('username'));

    const mentorsList = profiles.filter(p => p.role === 'MENTOR');

    const records = parsed.slice(1).map((cols, idx) => {
      if (cols.length < 2) return null;

      const name = nameIdx !== -1 ? cols[nameIdx] : `Student ${idx + 1}`;
      const contact = contactIdx !== -1 ? cols[contactIdx] : '';
      const email = emailIdx !== -1 && cols[emailIdx] ? cols[emailIdx] : `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}${idx + 1}@ojt.edu`;
      const trackRaw = trackIdx !== -1 ? cols[trackIdx] : 'Product Development';
      
      let track = 'Product Development';
      if (trackRaw.toLowerCase().includes('app')) track = 'Application Development';
      else if (trackRaw.toLowerCase().includes('data')) track = 'Data Scientist';
      else if (trackRaw.toLowerCase().includes('open')) track = 'Open Source';
      else if (trackRaw.toLowerCase().includes('gen')) track = 'Gen AI';

      const mentorPrefRaw = mentorIdx !== -1 ? cols[mentorIdx] : '';
      const matchedMentor = mentorsList.find(m => 
        m.name.toLowerCase().replace(/\s/g, '').includes(mentorPrefRaw.toLowerCase().replace(/\s/g, '')) ||
        mentorPrefRaw.toLowerCase().replace(/\s/g, '').includes(m.name.toLowerCase().replace(/\s/g, ''))
      );
      const preferred_mentors = matchedMentor ? [matchedMentor.id] : [];

      const choiceRaw = choiceIdx !== -1 ? cols[choiceIdx] : 'Own';
      const is_own_project = choiceRaw.toLowerCase().includes('own');

      const project_title = titleIdx !== -1 ? cols[titleIdx] : '';
      const project_description = descIdx !== -1 ? cols[descIdx] : '';
      const tech_stack = stackIdx !== -1 ? cols[stackIdx] : '';

      return {
        name,
        email,
        contact_no: contact,
        track,
        preferred_mentors,
        is_own_project,
        project_title,
        project_description,
        tech_stack
      };
    }).filter(Boolean);

    if (records.length > 0) {
      importOJTBatch(selectedCohortId, records);
      alert(`Successfully imported ${records.length} students from the OJT form responses!`);
    }

    setFormCsvText('');
    setSelectedCohortId('');
    setFormCsvModalOpen(false);
  };

  // Bulk Projects CSV Upload Handlers
  const handleProjectCsvUpload = () => {
    if (!projectCsvText) return;
    const parsed = parseCSVLines(projectCsvText);
    if (parsed.length <= 1) return;

    const projs = parsed.slice(1).map(cols => {
      if (cols.length < 2) return null;
      return {
        title: cols[0],
        description: cols[1],
        track: cols[2] || TRACKS[0],
        end_goals: cols[3] || '',
        related_field: cols[4] || '',
        source: 'Listed' as const
      };
    }).filter(Boolean) as Omit<Project, 'id' | 'created_at'>[];

    if (projs.length > 0) {
      addProjects(projs);
      alert(`Successfully imported ${projs.length} project templates!`);
    }

    setProjectCsvText('');
    setProjectCsvModalOpen(false);
  };

  const cohortData = cohorts.map(c => {
    const termLabel = c.sessionTerm === 'Term 1' ? 'ODD' : 
                      c.sessionTerm === 'Term 2' ? 'EVEN' : 
                      c.sessionTerm;
    return {
      ...c,
      label: c.name || `${(Array.isArray(c.academicYear) ? c.academicYear : [c.academicYear]).join(', ')} — ${termLabel}`,
      sessionTermMapped: termLabel,
      duration: getDurationString(c.startDate, c.endDate),
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Briefcase className="text-gold" size={26} />
          OJT Setup & Program Management
        </h1>
        <p className="text-gray-400 text-sm mt-1">Configure academic term cohorts, upload student responses, and publish project catalogs</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('cohorts')}
          className={`px-5 py-2.5 font-semibold text-sm flex items-center gap-2 border-b-2 transition-all duration-200 ${
            activeTab === 'cohorts'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Layers size={16} />
          OJT Cohorts & Batches
        </button>
        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-5 py-2.5 font-semibold text-sm flex items-center gap-2 border-b-2 transition-all duration-200 ${
            activeTab === 'catalog'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Briefcase size={16} />
          Project Catalog Templates
        </button>
      </div>

      {/* Tab 1: Cohorts Panel */}
      {activeTab === 'cohorts' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Cohorts & Batches</h2>
            <div className="flex items-center gap-2">
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
                    onClick={() => handleOpenManageProjects(row as unknown as Cohort)}
                    className="p-1.5 text-gray-400 hover:text-gold transition-colors"
                    title="Manage Cohort Projects"
                  >
                    <Briefcase size={16} />
                  </button>
                  <button
                    onClick={() => handleEditCohort(row as unknown as Cohort)}
                    className="p-1.5 text-gray-400 hover:text-gold transition-colors"
                    title="Edit Cohort"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteCohort(row.id)}
                    className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete Cohort"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            />
          )}
        </div>
      )}

      {/* Tab 2: Catalog Panel */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Project catalog templates</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setProjectCsvModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-white font-semibold rounded-lg border border-zinc-700 hover:scale-105 transition-all duration-200 text-sm"
              >
                <Upload size={16} />
                Upload Projects CSV
              </button>
              <button
                onClick={() => setProjectModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200 text-sm"
              >
                <Plus size={16} />
                Create Project
              </button>
            </div>
          </div>

          <DataTable
            columns={[
              { key: 'title', header: 'Project Title' },
              { key: 'track', header: 'Related Track', render: (row: any) => (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-gold/10 text-gold font-medium">{row.track}</span>
              )},
              { key: 'description', header: 'Description', render: (row: any) => (
                <p className="text-xs text-gray-400 line-clamp-2 max-w-sm">{row.description}</p>
              )},
              { key: 'end_goals', header: 'Endgoals & Outcomes', render: (row: any) => (
                <p className="text-xs text-gray-300 line-clamp-1 max-w-xs">{row.end_goals || '-'}</p>
              )},
              { key: 'related_field', header: 'Tech / Stack', render: (row: any) => (
                <span className="text-xs text-gray-300 font-mono">{row.related_field || '-'}</span>
              )},
            ]}
            data={projects as unknown as Record<string, unknown>[]}
            searchPlaceholder="Search projects catalog..."
            actions={(row: any) => (
              <button
                onClick={() => handleDeleteProject(row.id)}
                className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                title="Delete Project Template"
              >
                <Trash2 size={16} />
              </button>
            )}
          />
        </div>
      )}

      {/* Cohort Modal */}
      <Modal
        open={cohortModalOpen}
        onClose={() => {
          setCohortModalOpen(false);
          setEditingCohortId(null);
          setCohortForm({ name: '', academicYear: [], sessionTerm: 'Term 1', startDate: '', endDate: '', isActive: true });
        }}
        title={editingCohortId ? "Edit OJT Cohort" : "Create OJT Cohort"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cohort Name</label>
            <input
              type="text"
              value={cohortForm.name}
              onChange={e => setCohortForm({ ...cohortForm, name: e.target.value })}
              placeholder="e.g. OJT August,2026"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Allowed Batches</label>
            <div className="flex flex-wrap gap-3 bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2">
              {Array.from(new Set([...COHORT_BATCH_OPTIONS, ...cohortForm.academicYear])).map(batch => (
                <label key={batch} className="flex items-center gap-1.5 text-sm text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cohortForm.academicYear.includes(batch)}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...cohortForm.academicYear, batch]
                        : cohortForm.academicYear.filter(b => b !== batch);
                      setCohortForm({ ...cohortForm, academicYear: next });
                    }}
                    className="accent-gold"
                  />
                  {batch}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Semester</label>
            <select
              value={cohortForm.sessionTerm}
              onChange={e => setCohortForm({ ...cohortForm, sessionTerm: e.target.value as TermSession })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            >
              {TERM_OPTIONS.map(t => (
                <option key={t} value={t}>{TERM_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Start Date</label>
              <input
                type="date"
                value={cohortForm.startDate}
                onChange={e => setCohortForm({ ...cohortForm, startDate: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">End Date</label>
              <input
                type="date"
                value={cohortForm.endDate}
                onChange={e => setCohortForm({ ...cohortForm, endDate: e.target.value })}
                className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
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

      {/* Project Modal */}
      <Modal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} title="Create Project Template">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Project Title</label>
            <input
              type="text"
              value={projectForm.title}
              onChange={e => setProjectForm({ ...projectForm, title: e.target.value })}
              placeholder="e.g. E-Commerce Backend"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Track</label>
            <select
              value={projectForm.track}
              onChange={e => setProjectForm({ ...projectForm, track: e.target.value })}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            >
              {TRACKS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={projectForm.description}
              onChange={e => setProjectForm({ ...projectForm, description: e.target.value })}
              placeholder="Provide a detailed description of the project..."
              rows={3}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1">
              <Target size={14} className="text-gold" />
              Endgoals & Deliverables
            </label>
            <textarea
              value={projectForm.end_goals}
              onChange={e => setProjectForm({ ...projectForm, end_goals: e.target.value })}
              placeholder="Define successful outcomes or goals..."
              rows={2}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1">
              <Code size={14} className="text-gold" />
              Tech Stack / Related Fields
            </label>
            <input
              type="text"
              value={projectForm.related_field}
              onChange={e => setProjectForm({ ...projectForm, related_field: e.target.value })}
              placeholder="e.g. Next.js, Node.js, Express"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <button
            onClick={handleSaveProject}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            Create Project Template
          </button>
        </div>
      </Modal>

      {/* CSV Import OJT Form Responses Modal */}
      <Modal open={formCsvModalOpen} onClose={() => setFormCsvModalOpen(false)} title="Import OJT Student Responses (Google Form CSV)">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Select a target cohort, and upload/paste your OJT student choices Google Form CSV report.
          </p>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Target OJT Cohort *</label>
            <select
              value={selectedCohortId}
              onChange={e => setSelectedCohortId(e.target.value)}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            >
              <option value="">Select Cohort...</option>
              {cohortData.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="bg-zinc-800/40 p-3 rounded-lg text-[10px] font-mono text-gray-400 space-y-1">
            <span className="text-gold font-bold">Expected Headers:</span>
            <div className="truncate text-white font-semibold">Student Name,Contact No.,Select Your Project Track,Mentorship Guidance Request – Preference 1,Select Between Own Project vs. Picking Up a Project,Project Title,Project Description,tech stack</div>
            <span className="text-gray-500 block pt-1">Example Row:</span>
            <div className="truncate">John Doe,9876543210,Application Development,Rohit Gupta,Own Project,Social Network App,MERN stack feeds,React Node Mongo</div>
          </div>

          <div>
            <input
              ref={formFileRef}
              type="file"
              accept=".csv,.txt"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => setFormCsvText(ev.target?.result as string);
                reader.readAsText(file);
              }}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gold/10 file:text-gold hover:file:bg-gold/20"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Or paste CSV text below</label>
            <textarea
              value={formCsvText}
              onChange={e => setFormCsvText(e.target.value)}
              rows={5}
              placeholder="Paste raw CSV content here..."
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono"
            />
          </div>

          <button
            onClick={handleFormCsvUpload}
            disabled={!selectedCohortId || !formCsvText}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <FileText size={18} />
            Import Student Responses
          </button>
        </div>
      </Modal>

      {/* CSV Import Projects Catalog Modal */}
      <Modal open={projectCsvModalOpen} onClose={() => setProjectCsvModalOpen(false)} title="Import Project templates via CSV">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Upload or paste a CSV of project catalog templates.
          </p>

          <div className="bg-zinc-800/40 p-3 rounded-lg text-xs font-mono text-gray-400 space-y-1">
            <span className="text-gold">Expected Format:</span>
            <div className="text-white">title,description,track,end_goals,related_field</div>
            <span className="text-gray-500 block pt-1">Example Row:</span>
            <div className="truncate">E-Commerce Marketplace,Full stack stripe checkout,Product Development,Working checkout,React Node Stripe</div>
          </div>

          <div>
            <input
              ref={projectFileRef}
              type="file"
              accept=".csv,.txt"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => setProjectCsvText(ev.target?.result as string);
                reader.readAsText(file);
              }}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gold/10 file:text-gold hover:file:bg-gold/20"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Or paste CSV text below</label>
            <textarea
              value={projectCsvText}
              onChange={e => setProjectCsvText(e.target.value)}
              rows={5}
              placeholder="title,description,track,end_goals,related_field..."
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono"
            />
          </div>

          <button
            onClick={handleProjectCsvUpload}
            disabled={!projectCsvText}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <FileText size={18} />
            Import Project Catalog
          </button>
        </div>
      </Modal>

      {/* Manage Cohort Projects Modal */}
      <Modal
        open={manageProjectsModalOpen}
        onClose={() => {
          setManageProjectsModalOpen(false);
          setSelectedCohortForProjects(null);
          setMappedProjectIds([]);
          setProjectSearchQuery('');
        }}
        title={`Manage Projects for ${selectedCohortForProjects?.academicYear} — ${
          selectedCohortForProjects?.sessionTerm === 'Term 1' ? 'Semester 1' :
          selectedCohortForProjects?.sessionTerm === 'Term 2' ? 'Semester 2' :
          selectedCohortForProjects?.sessionTerm ?? ''
        }`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Select one or more master projects from the catalog templates to map to this cohort.
          </p>

          <input
            type="text"
            value={projectSearchQuery}
            onChange={e => setProjectSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold mb-2"
          />

          {loadingProjects ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 border border-zinc-750 p-2 rounded-lg bg-zinc-800/40">
              {projects
                .filter(p => {
                  if (!projectSearchQuery) return true;
                  const q = projectSearchQuery.toLowerCase();
                  return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.track.toLowerCase().includes(q);
                })
                .map(p => (
                  <label
                    key={p.id}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-zinc-750 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={mappedProjectIds.includes(p.id)}
                      onChange={() => handleToggleProjectMapping(p.id)}
                      className="mt-1 rounded bg-zinc-750 border-zinc-650 text-gold focus:ring-gold"
                    />
                    <div className="text-xs">
                      <p className="text-white font-semibold">{p.title}</p>
                      <p className="text-gray-400 line-clamp-1">{p.description}</p>
                      <span className="text-[10px] text-gold/80 mt-0.5 inline-block bg-gold/10 px-1.5 py-0.2 rounded-full font-medium">{p.track}</span>
                    </div>
                  </label>
                ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setManageProjectsModalOpen(false);
                setSelectedCohortForProjects(null);
                setMappedProjectIds([]);
                setProjectSearchQuery('');
              }}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCohortProjects}
              disabled={savingProjects || loadingProjects}
              className="px-4 py-2 bg-gold hover:bg-gold-hover text-black font-semibold rounded-lg transition-colors text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {savingProjects && <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
