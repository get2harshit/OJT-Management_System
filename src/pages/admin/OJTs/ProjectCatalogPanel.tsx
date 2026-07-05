import { useState } from 'react';
import { Plus, Trash2, Upload, Target, Code } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import type { Project } from '../../../lib/types';
import { TRACKS } from '../../../lib/constants';
import ProjectCsvImportModal from './ProjectCsvImportModal';

interface ProjectCatalogPanelProps {
  projects: Project[];
  addProject: (proj: Omit<Project, 'id' | 'created_at'>) => void;
  addProjects: (projs: Omit<Project, 'id' | 'created_at'>[]) => void;
  deleteProject: (id: string) => void;
}

const EMPTY_PROJECT_FORM = {
  title: '',
  description: '',
  track: TRACKS[0],
  end_goals: '',
  related_field: ''
};

export default function ProjectCatalogPanel({ projects, addProject, addProjects, deleteProject }: ProjectCatalogPanelProps) {
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectCsvModalOpen, setProjectCsvModalOpen] = useState(false);
  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT_FORM);

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
    setProjectForm(EMPTY_PROJECT_FORM);
    setProjectModalOpen(false);
  };

  const handleDeleteProject = (id: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this project template from the catalog?");
    if (!confirmDelete) return;
    deleteProject(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-lg font-bold text-white">Project catalog templates</h2>
        <div className="flex flex-wrap items-center gap-2">
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

      <ProjectCsvImportModal
        open={projectCsvModalOpen}
        onClose={() => setProjectCsvModalOpen(false)}
        addProjects={addProjects}
      />
    </div>
  );
}
