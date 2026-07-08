import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Target, Code, AlertTriangle } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import type { Project } from '../../../lib/types';
import { TRACKS } from '../../../lib/constants';
import { apiListProjectsPage } from '../../../lib/api';

interface ProjectCatalogPanelProps {
  addProject: (proj: Omit<Project, 'id' | 'created_at'>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  deleteAllProjects: () => Promise<void>;
}

const EMPTY_PROJECT_FORM = {
  title: '',
  description: '',
  track: TRACKS[0],
  end_goals: '',
  related_field: ''
};

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

export default function ProjectCatalogPanel({ addProject, deleteProject, deleteAllProjects }: ProjectCatalogPanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT_FORM);
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [deletingAll, setDeletingAll] = useState(false);

  const fetchCatalogPage = useCallback(async (targetPage: number, searchTerm: string) => {
    const res = await apiListProjectsPage({ page: targetPage, limit: PAGE_SIZE, search: searchTerm || undefined });
    setProjects(res.data);
    setPagination(res.pagination);
  }, []);

  useEffect(() => {
    fetchCatalogPage(page, search).catch(() => {});
  }, [page, search, fetchCatalogPage]);

  // Debounce search input so every keystroke doesn't fire a request.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSaveProject = async () => {
    if (!projectForm.title || !projectForm.description) return;
    await addProject({
      title: projectForm.title,
      description: projectForm.description,
      track: projectForm.track,
      end_goals: projectForm.end_goals,
      related_field: projectForm.related_field,
      source: 'Listed'
    });
    setProjectForm(EMPTY_PROJECT_FORM);
    setProjectModalOpen(false);
    await fetchCatalogPage(page, search);
  };

  const handleDeleteProject = async (id: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this project template from the catalog?");
    if (!confirmDelete) return;
    await deleteProject(id);
    await fetchCatalogPage(page, search);
  };

  const closeDeleteAllModal = () => {
    setDeleteAllModalOpen(false);
    setDeleteAllConfirmText('');
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await deleteAllProjects();
      closeDeleteAllModal();
      setPage(1);
      await fetchCatalogPage(1, search);
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-lg font-bold text-white">Project catalog templates</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDeleteAllModalOpen(true)}
            disabled={pagination.total === 0}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-850 hover:bg-red-500/10 border border-zinc-750 hover:border-red-500/50 text-gray-300 hover:text-red-400 rounded-lg transition-colors text-sm disabled:opacity-40 disabled:pointer-events-none"
          >
            <Trash2 size={16} />
            Delete All
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
          { key: 'problemStatement', header: 'Problem Statement', render: (row: any) => (
            <p className="text-xs text-gray-400 line-clamp-2 max-w-sm">{row.problemStatement || row.description || '-'}</p>
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
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          totalPages: pagination.totalPages,
          onPageChange: setPage,
        }}
        onSearchChange={handleSearchChange}
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
            <Select
              value={projectForm.track}
              onChange={v => setProjectForm({ ...projectForm, track: v })}
              className="w-full"
              options={TRACKS.map(t => ({ value: t, label: t }))}
            />
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

      <Modal open={deleteAllModalOpen} onClose={closeDeleteAllModal} title="Delete All Projects">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">
              This permanently removes all <span className="font-bold">{pagination.total}</span> project{pagination.total === 1 ? '' : 's'} from
              the catalog. This cannot be undone from the admin panel.
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Type <span className="font-mono text-red-400">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={deleteAllConfirmText}
              onChange={e => setDeleteAllConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 font-mono"
            />
          </div>
          <button
            onClick={handleDeleteAll}
            disabled={deleteAllConfirmText !== 'DELETE' || deletingAll}
            className="w-full py-2.5 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {deletingAll ? 'Deleting...' : `Delete All ${pagination.total} Projects`}
          </button>
        </div>
      </Modal>
    </div>
  );
}
