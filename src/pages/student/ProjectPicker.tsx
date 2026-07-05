import { useState, useCallback, useMemo } from 'react';
import { Briefcase, ArrowLeft, CheckCircle2, Search, Layers, Sparkles, X } from 'lucide-react';
import Modal from '../../components/Modal';
import SpinnerSquare from '../../components/SpinnerSquare';
import { TRACKS } from '../../lib/constants';
import type { Project } from '../../lib/types';
import { apiListProjects, apiGetProject } from '../../lib/api';
import { useToast } from '../../toast';

type Step = 'track' | 'browse' | 'locked';

// Real flow (GET /projects?track=, GET /projects/:id — both batch/JWT-scoped
// server-side, no cohortId needed): pick a track, browse brief cards, open
// one for the full detail, lock it in. Mentor selection & final submission
// are a separate step still blocked on the backend exposing a way for a
// student to discover their own cohortId, so that step is stubbed for now
// and nothing here is persisted to the server yet.
export default function ProjectPicker() {
  const { showError } = useToast();
  const [step, setStep] = useState<Step>('track');
  const [track, setTrack] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTechStacks, setSelectedTechStacks] = useState<string[]>([]);

  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [lockedProject, setLockedProject] = useState<Project | null>(null);

  const handlePickTrack = useCallback(async (t: string) => {
    setTrack(t);
    setStep('browse');
    setSearchQuery('');
    setSelectedTechStacks([]);
    setLoading(true);
    try {
      const res = await apiListProjects(t);
      setProjects(Array.isArray(res) ? res : []);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load projects');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const handleOpenDetail = async (p: Project) => {
    setDetailModalOpen(true);
    setLoadingDetail(true);
    setDetailProject(null);
    try {
      const full = await apiGetProject(p.id);
      setDetailProject(full);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load project details');
      setDetailModalOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleConfirmSelection = () => {
    if (!detailProject) return;
    setLockedProject(detailProject);
    setDetailModalOpen(false);
    setStep('locked');
  };

  const handleChangeProject = () => {
    setLockedProject(null);
    setStep('browse');
  };

  const handleChangeTrack = () => {
    setLockedProject(null);
    setTrack(null);
    setProjects([]);
    setStep('track');
  };

  const distinctTechStacks = useMemo(() => {
    return Array.from(new Set(projects.flatMap(p => p.techStack || []))).sort();
  }, [projects]);

  const toggleTechStack = (tech: string) => {
    setSelectedTechStacks(prev =>
      prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]
    );
  };

  const filteredProjects = projects.filter(p => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch = p.title.toLowerCase().includes(q) || (p.problemStatement || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    if (selectedTechStacks.length > 0) {
      const projectStack = p.techStack || [];
      if (!selectedTechStacks.some(t => projectStack.includes(t))) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Briefcase size={24} className="text-gold" />
          Pick Your OJT Project
        </h1>
        <p className="text-gray-400 text-sm mt-1">Choose a track, browse the projects available to you, and lock in your pick.</p>
      </div>

      {step === 'track' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TRACKS.map(t => (
            <button
              key={t}
              onClick={() => handlePickTrack(t)}
              className="flex flex-col items-start gap-3 bg-zinc-850 border border-zinc-750 rounded-xl p-5 text-left hover:border-gold/40 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="p-2 rounded-lg bg-zinc-750">
                <Layers size={20} className="text-gold" />
              </div>
              <p className="text-white font-semibold">{t}</p>
            </button>
          ))}
        </div>
      )}

      {step === 'browse' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleChangeTrack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
              <ArrowLeft size={15} />
              Change track
            </button>
            <span className="text-xs px-2.5 py-1 rounded-full bg-gold/10 text-gold font-medium">{track}</span>
          </div>

          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full bg-zinc-850 border border-zinc-750 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
          </div>

          {distinctTechStacks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Tech stack</span>
              {distinctTechStacks.map(tech => {
                const selected = selectedTechStacks.includes(tech);
                return (
                  <button
                    key={tech}
                    onClick={() => toggleTechStack(tech)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors border ${
                      selected
                        ? 'bg-gold/10 text-gold border-gold/40'
                        : 'bg-zinc-850 text-gray-400 border-zinc-750 hover:border-zinc-650 hover:text-white'
                    }`}
                  >
                    {tech}
                  </button>
                );
              })}
              {selectedTechStacks.length > 0 && (
                <button
                  onClick={() => setSelectedTechStacks([])}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors"
                >
                  <X size={12} />
                  Clear
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="min-h-[40vh] flex items-center justify-center">
              <SpinnerSquare size={48} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleOpenDetail(p)}
                  className="text-left bg-zinc-850 border border-zinc-750 rounded-xl p-5 flex flex-col gap-3 hover:border-gold/30 hover:-translate-y-0.5 transition-all duration-200"
                >
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold font-medium self-start">{p.track}</span>
                  <h3 className="text-white font-bold text-base">{p.title}</h3>
                  {p.problemStatement && (
                    <p className="text-gray-400 text-xs leading-relaxed line-clamp-3">{p.problemStatement}</p>
                  )}
                  {p.techStack && p.techStack.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.techStack.map(ts => (
                        <span key={ts} className="text-[10px] text-gray-300 bg-zinc-750 px-2 py-0.5 rounded-full font-medium">{ts}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
              {filteredProjects.length === 0 && (
                <div className="col-span-full bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center">
                  <Briefcase size={40} className="mx-auto text-gray-600 mb-3" />
                  <p className="text-gray-400">No projects found for this track.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'locked' && lockedProject && (
        <div className="space-y-4">
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
              <CheckCircle2 size={16} />
              Project selected
            </div>
            <h2 className="text-white font-extrabold text-xl">{lockedProject.title}</h2>
            {lockedProject.description && (
              <p className="text-gray-300 text-sm leading-relaxed">{lockedProject.description}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold font-medium">{lockedProject.track}</span>
              {(lockedProject.techStack || []).map(t => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-zinc-750 text-gray-300 font-medium">{t}</span>
              ))}
            </div>
            <button onClick={handleChangeProject} className="text-xs text-gray-400 hover:text-white transition-colors underline underline-offset-2">
              Change project
            </button>
          </div>

          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 opacity-60">
            <div className="flex items-center gap-2 text-gray-400 text-sm font-semibold mb-1">
              <Sparkles size={16} />
              Mentor selection & final submission
            </div>
            <p className="text-gray-500 text-xs">
              Coming soon — this step isn't available yet, so your project pick above isn't saved to the server until it is.
            </p>
          </div>
        </div>
      )}

      {/* Full project detail, fetched on demand */}
      <Modal open={detailModalOpen} onClose={() => setDetailModalOpen(false)} title={detailProject?.title || 'Project details'}>
        {loadingDetail || !detailProject ? (
          <div className="flex items-center justify-center py-10">
            <SpinnerSquare size={40} />
          </div>
        ) : (
          <div className="space-y-4">
            <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold font-medium">{detailProject.track}</span>
            {detailProject.description && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Description</p>
                <p className="text-gray-300 text-sm leading-relaxed">{detailProject.description}</p>
              </div>
            )}
            {detailProject.problemStatement && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Problem Statement</p>
                <p className="text-gray-300 text-sm leading-relaxed">{detailProject.problemStatement}</p>
              </div>
            )}
            {detailProject.endUsersDefined && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">End Users</p>
                <p className="text-gray-300 text-sm leading-relaxed">{detailProject.endUsersDefined}</p>
              </div>
            )}
            {detailProject.techStack && detailProject.techStack.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Tech Stack</p>
                <div className="flex flex-wrap gap-1.5">
                  {detailProject.techStack.map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-zinc-750 text-gray-300 font-medium">{t}</span>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={handleConfirmSelection}
              className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
            >
              Select this project
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
