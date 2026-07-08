import { useState } from 'react';
import { Briefcase, Layers } from 'lucide-react';
import type { Project, Profile } from '../../../lib/types';
import CohortsPanel from './CohortsPanel';
import ProjectCatalogPanel from './ProjectCatalogPanel';

interface OJTsProps {
  addProject: (proj: Omit<Project, 'id' | 'created_at'>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  deleteAllProjects: () => Promise<void>;
  profiles: Profile[];
  importOJTBatch: (cohortId: string, studentRecords: any[]) => void;
}
export default function AdminOJTs({
  addProject,
  deleteProject,
  deleteAllProjects,
  profiles,
  importOJTBatch
}: OJTsProps) {
  const [activeTab, setActiveTab] = useState<'cohorts' | 'catalog'>('cohorts');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Briefcase className="text-gold" size={26} />
          OJT Setup & Program Management
        </h1>
        <p className="text-gray-400 text-sm mt-1">Configure academic term cohorts, upload student responses, and publish project catalogs</p>
      </div>

      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('cohorts')}
          className={`px-5 py-2.5 font-semibold text-sm flex items-center gap-2 border-b-2 transition-all duration-200 ${activeTab === 'cohorts'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-gray-400 hover:text-white'
            }`}
        >
          <Layers size={16} />
          OJT Cohorts & Batches
        </button>
        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-5 py-2.5 font-semibold text-sm flex items-center gap-2 border-b-2 transition-all duration-200 ${activeTab === 'catalog'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-gray-400 hover:text-white'
            }`}
        >
          <Briefcase size={16} />
          Project Catalog Templates
        </button>
      </div>

      {activeTab === 'cohorts' && (
        <CohortsPanel
          profiles={profiles}
          importOJTBatch={importOJTBatch}
        />
      )}

      {activeTab === 'catalog' && (
        <ProjectCatalogPanel
          addProject={addProject}
          deleteProject={deleteProject}
          deleteAllProjects={deleteAllProjects}
        />
      )}
    </div>
  );
}
