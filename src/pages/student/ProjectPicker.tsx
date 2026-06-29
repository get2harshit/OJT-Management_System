import { useState, useMemo } from 'react';
import { Briefcase, CheckCircle2, Search } from 'lucide-react';
import type { Project, Student } from '../../lib/types';

interface Props {
  studentId: string;
  projects: Project[];
  students: Student[];
  updateStudent: (userId: string, patch: Partial<Student>) => void;
}

export default function ProjectPicker({ studentId, projects, students, updateStudent }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState('');

  const student = students.find(s => s.user_id === studentId);
  const currentProjectId = student?.project_id ?? null;

  const distinctTracks = useMemo(() => {
    return [...new Set(projects.map(p => p.track).filter(Boolean))];
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (trackFilter && p.track !== trackFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.track.toLowerCase().includes(q);
      }
      return true;
    });
  }, [projects, trackFilter, searchQuery]);

  const handlePick = (projectId: string) => {
    updateStudent(studentId, { project_id: projectId });
  };

  const handleUnpick = () => {
    updateStudent(studentId, { project_id: null });
  };

  const currentProject = currentProjectId ? projects.find(p => p.id === currentProjectId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Briefcase size={24} className="text-gold" />
          Pick Your Project
        </h1>
        <p className="text-gray-400 text-sm mt-1">Browse available projects and select one for your OJT</p>
      </div>

      {/* Current Assignment */}
      {currentProject && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={22} className="text-green-400" />
              <div>
                <h3 className="text-white font-semibold text-sm">Currently Assigned</h3>
                <p className="text-green-400 font-bold text-lg">{currentProject.title}</p>
                <p className="text-gray-400 text-sm mt-0.5">{currentProject.description}</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold mt-1 inline-block">{currentProject.track}</span>
              </div>
            </div>
            <button
              onClick={handleUnpick}
              className="px-4 py-2 bg-red-600/20 text-red-400 font-semibold text-sm rounded-lg hover:bg-red-600/30 transition-colors border border-red-500/20"
            >
              Remove Selection
            </button>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full bg-zinc-850 border border-zinc-750 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
          />
        </div>
        <select
          value={trackFilter}
          onChange={e => setTrackFilter(e.target.value)}
          className="bg-zinc-850 border border-zinc-750 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold min-w-[180px]"
        >
          <option value="">All Tracks</option>
          {distinctTracks.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProjects.map((project) => {
          const isSelected = currentProjectId === project.id;
          return (
            <div
              key={project.id}
              className={`bg-zinc-850 border rounded-xl p-5 transition-all duration-200 hover:scale-[1.01] ${
                isSelected
                  ? 'border-green-500/40 shadow-lg shadow-green-500/5'
                  : 'border-zinc-750 hover:border-gold/30'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold">
                  {project.track}
                </span>
                {isSelected && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    Selected
                  </span>
                )}
              </div>

              <h3 className="text-white font-bold text-base mb-2">{project.title}</h3>
              <p className="text-gray-400 text-sm mb-4 line-clamp-3">{project.description}</p>

              {isSelected ? (
                <button
                  onClick={handleUnpick}
                  className="w-full py-2 bg-green-600/20 text-green-400 font-semibold rounded-lg text-sm border border-green-500/20 hover:bg-green-600/30 transition-colors"
                >
                  ✓ Currently Selected
                </button>
              ) : (
                <button
                  onClick={() => handlePick(project.id)}
                  className="w-full py-2 bg-gold text-black font-semibold rounded-lg text-sm hover:bg-gold-hover hover:scale-[1.02] transition-all duration-200"
                >
                  Pick This Project
                </button>
              )}
            </div>
          );
        })}
      </div>

      {filteredProjects.length === 0 && (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center">
          <Briefcase size={40} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No projects found matching your search.</p>
        </div>
      )}
    </div>
  );
}
