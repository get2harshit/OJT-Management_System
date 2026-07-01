import { useState, useMemo } from 'react';
import { Briefcase, CheckCircle2, Search, ArrowLeftRight, HelpCircle, UserCheck } from 'lucide-react';
import type { Project, Student, Profile } from '../../lib/types';
import Modal from '../../components/Modal';

interface Props {
  studentId: string;
  projects: Project[];
  students: Student[];
  profiles: Profile[];
  updateStudent: (userId: string, patch: Partial<Student>) => void;
  addStudentChangeRequest: (studentId: string, type: 'MENTOR' | 'PROJECT', requestedId: string, reason: string) => void;
}

export default function ProjectPicker({ studentId, projects, students, profiles, updateStudent, addStudentChangeRequest }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapType, setSwapType] = useState<'MENTOR' | 'PROJECT'>('MENTOR');
  const [requestedId, setRequestedId] = useState('');
  const [reason, setReason] = useState('Mentor Allocation change');

  const student = students.find(s => s.user_id === studentId);
  const currentProjectId = student?.project_id ?? null;
  const currentMentorId = student?.mentor_id ?? null;

  const distinctTracks = useMemo(() => {
    return [...new Set(projects.map(p => p.track).filter(Boolean))];
  }, [projects]);

  const mentors = useMemo(() => {
    return profiles.filter(p => p.role === 'MENTOR');
  }, [profiles]);

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

  const handleOpenSwap = (type: 'MENTOR' | 'PROJECT') => {
    setSwapType(type);
    setRequestedId('');
    setReason(type === 'MENTOR' ? 'Mentor Allocation change' : 'Project swap request');
    setSwapModalOpen(true);
  };

  const handleSendSwapRequest = () => {
    if (!requestedId) return;
    addStudentChangeRequest(studentId, swapType, requestedId, reason);
    setSwapModalOpen(false);
  };

  const currentProject = currentProjectId ? projects.find(p => p.id === currentProjectId) : null;
  const currentMentor = currentMentorId ? mentors.find(m => m.id === currentMentorId) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Briefcase size={24} className="text-gold" />
            OJT Projects & Allocations
          </h1>
          <p className="text-gray-400 text-sm mt-1">Browse project deliverables, select your stack, and manage advisor allocations</p>
        </div>
      </div>

      {/* Current Assignment Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Allocated Project */}
        <div className={`rounded-xl p-5 border ${
          currentProject ? 'bg-green-500/5 border-green-500/20' : 'bg-zinc-850 border-zinc-750'
        }`}>
          <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
            <Briefcase size={16} className="text-gold" />
            Project Assignment
          </h3>
          {currentProject ? (
            <div className="space-y-2">
              <p className="text-green-400 font-extrabold text-lg">{currentProject.title}</p>
              <p className="text-gray-400 text-xs line-clamp-2">{currentProject.description}</p>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold">{currentProject.track}</span>
                <button
                  onClick={() => handleOpenSwap('PROJECT')}
                  className="flex items-center gap-1 text-xs text-gold hover:underline font-semibold"
                >
                  <ArrowLeftRight size={13} />
                  Request Swap
                </button>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-gray-500 text-sm">No project selected yet</p>
            </div>
          )}
        </div>

        {/* Allocated Mentor */}
        <div className={`rounded-xl p-5 border ${
          currentMentor ? 'bg-purple-500/5 border-purple-500/20' : 'bg-zinc-850 border-zinc-750'
        }`}>
          <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
            <UserCheck size={16} className="text-gold" />
            Mentor Assignment
          </h3>
          {currentMentor ? (
            <div className="space-y-2">
              <p className="text-purple-400 font-extrabold text-lg">{currentMentor.name}</p>
              <p className="text-gray-400 text-xs">Assigned track advisor for specialized reviews</p>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">
                  {(currentMentor.tracks && currentMentor.tracks.length > 0) ? currentMentor.tracks.join(', ') : (currentMentor.track || 'General')}
                </span>
                <button
                  onClick={() => handleOpenSwap('MENTOR')}
                  className="flex items-center gap-1 text-xs text-purple-400 hover:underline font-semibold"
                >
                  <ArrowLeftRight size={13} />
                  Request Change
                </button>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-gray-500 text-sm">No mentor allocated yet by admin</p>
            </div>
          )}
        </div>
      </div>

      {/* Mentor Preferences Panel */}
      {student?.track && (
        <div className="bg-zinc-850 border border-zinc-750 p-5 rounded-xl space-y-4">
          <div>
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <UserCheck size={16} className="text-gold" />
              Your Mentor Preferences
            </h3>
            <p className="text-gray-400 text-xs mt-1">Select and rank your top 3 preferred mentors for the OJT project track ({student.track}).</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((index) => {
              const prefMentorId = (student.preferred_mentors || [])[index] || '';
              // Filter mentors specializing in the student's track
              const trackMentors = mentors.filter(m => 
                m.tracks?.includes(student.track || '') || m.track === student.track
              );

              return (
                <div key={index} className="space-y-1">
                  <label className="block text-xs text-gray-400 font-semibold">
                    Preference {index + 1}
                  </label>
                  <select
                    value={prefMentorId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const currentPrefs = [...(student.preferred_mentors || [])];
                      currentPrefs[index] = selectedId || '';
                      const cleanedPrefs = currentPrefs.filter(Boolean);
                      updateStudent(studentId, { preferred_mentors: cleanedPrefs });
                    }}
                    className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                  >
                    <option value="">None Selected</option>
                    {trackMentors.map(m => {
                      const isSelectedElsewhere = (student.preferred_mentors || []).some((id, idx) => id === m.id && idx !== index);
                      if (isSelectedElsewhere) return null;
                      const isAvail = m.is_available !== false;
                      return (
                        <option key={m.id} value={m.id}>
                          {m.name} {!isAvail ? '(Unavailable)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
          </div>
          {(student.preferred_mentors || []).length > 0 && (
            <div className="text-xs text-gold/80 bg-gold/5 border border-gold/10 p-2.5 rounded-lg flex items-center gap-1.5">
              <span>✓ Preferences saved:</span>
              <span className="font-semibold text-white">
                {(student.preferred_mentors || [])
                  .map(id => mentors.find(m => m.id === id)?.name)
                  .filter(Boolean)
                  .join(' → ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Change Request Info status */}
      {student?.change_request && (
        <div className="bg-zinc-850 border border-zinc-750 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArrowLeftRight size={18} className="text-gold animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-white">
                Pending Swap Request ({student.change_request.type})
              </p>
              <p className="text-xs text-gray-400">
                Reason: {student.change_request.reason} (Attempt count: {student.change_request.count})
              </p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
            student.change_request.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-500' :
            student.change_request.status === 'APPROVED' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            Status: {student.change_request.status}
          </span>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3 pt-4 border-t border-zinc-750">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search project titles, endgoals or stacks..."
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
              className={`bg-zinc-850 border rounded-xl p-5 flex flex-col justify-between transition-all duration-200 hover:scale-[1.01] ${
                isSelected
                  ? 'border-green-500/40 shadow-lg shadow-green-500/5'
                  : 'border-zinc-750 hover:border-gold/30'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold font-medium">
                    {project.track}
                  </span>
                  {isSelected && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                      <CheckCircle2 size={10} />
                      Selected
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-white font-bold text-base mb-1.5">{project.title}</h3>
                  <p className="text-gray-400 text-xs leading-relaxed mb-3 line-clamp-3">{project.description}</p>
                </div>

                {project.end_goals && (
                  <div className="border-t border-zinc-750/50 pt-2.5">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Expected Endgoals</p>
                    <p className="text-gray-300 text-xs leading-normal">{project.end_goals}</p>
                  </div>
                )}

                {project.related_field && (
                  <div className="border-t border-zinc-750/50 pt-2.5">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Tech / Related Field</p>
                    <p className="text-gold text-xs font-mono">{project.related_field}</p>
                  </div>
                )}
              </div>

              <div className="pt-4 mt-auto">
                {isSelected ? (
                  <button
                    onClick={handleUnpick}
                    className="w-full py-2 bg-green-600/20 text-green-400 font-semibold rounded-lg text-sm border border-green-500/20 hover:bg-green-600/30 transition-colors"
                  >
                    ✓ Selection Confirmed
                  </button>
                ) : (
                  <button
                    onClick={() => handlePick(project.id)}
                    className="w-full py-2 bg-gold text-black font-semibold rounded-lg text-sm hover:bg-gold-hover hover:scale-[1.02] transition-all duration-200"
                  >
                    Select Project
                  </button>
                )}
              </div>
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

      {/* Swap Request Modal */}
      <Modal open={swapModalOpen} onClose={() => setSwapModalOpen(false)} title={`Request Swap: ${swapType}`}>
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            Submit a swap request to the admin dashboard. Each attempt is logged and tracked.
          </p>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Select Requested {swapType === 'MENTOR' ? 'Mentor' : 'Project'}
            </label>
            <select
              value={requestedId}
              onChange={e => setRequestedId(e.target.value)}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            >
              <option value="">Choose target...</option>
              {swapType === 'MENTOR' ? (
                mentors.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({(m.tracks && m.tracks.length > 0) ? m.tracks.join(', ') : (m.track || 'General')})</option>
                ))
              ) : (
                projects.map(p => (
                  <option key={p.id} value={p.id}>{p.title} ({p.track})</option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1">
              <HelpCircle size={14} className="text-gold" />
              Reason for Request
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>

          <button
            onClick={handleSendSwapRequest}
            disabled={!requestedId}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            Submit Swap Request
          </button>
        </div>
      </Modal>
    </div>
  );
}
