// Deciding which project a team ends up on.
//
// Two ways in, because there are genuinely two situations. Normally an admin is
// choosing between what the students themselves asked for, and the modal should
// keep them there — that path writes only the allocation and leaves the team's
// preferences alone. But a team whose *both* preferences came from another
// admission year has no valid choice to be steered towards, and the preferences
// path refuses every project including the right one. That is what the catalog
// tab is for: it is a repair, so it asks for a mentor too (a project that was
// never a preference carries none) and it rewrites both preference slots.
//
// The catalog is scoped server-side to the team's track and admission year.
// Nothing here narrows it, so there is no client-side filter to get wrong.
import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, Search, Users, AlertTriangle } from 'lucide-react';
import Modal from '../../../components/Modal';
import SpinnerSquare from '../../../components/SpinnerSquare';
import { useToast } from '../../../toast';
import {
  apiOverrideTeamAllocation,
  apiReassignToCatalogProject,
  apiGetAllocatableProjects,
  type AllocatableProject,
} from '../../../lib/api';
import type { TeamAllocationDetail, MentorLoadSummaryRow } from '../../../lib/types';

const PAGE_SIZE = 15;
const SEARCH_DEBOUNCE_MS = 350;
/** The ceiling the student-facing browse enforces. Shown here, never enforced. */
const CROWDED_AT = 2;

type Tab = 'preferences' | 'catalog';

interface Props {
  team: TeamAllocationDetail | null;
  /** The page's own mentor list — shared, not refetched here. */
  mentors: MentorLoadSummaryRow[];
  /**
   * Fills `mentors`. The page fetches them on demand rather than upfront, so a
   * modal that needs them has to say so — and only the catalog tab does, since
   * a preference already carries the mentor chosen alongside it.
   */
  loadMentors: () => Promise<void>;
  mentorsLoading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export default function AllocationOverrideModal({
  team,
  mentors,
  loadMentors,
  mentorsLoading,
  onClose,
  onSaved,
}: Props) {
  const { showSuccess, showError } = useToast();
  const [tab, setTab] = useState<Tab>('preferences');
  const [saving, setSaving] = useState(false);

  // Catalog tab state. Held here rather than in the page so closing the modal
  // discards a half-made choice instead of leaving it to be reopened later.
  const [projects, setProjects] = useState<AllocatableProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedProject, setSelectedProject] = useState<AllocatableProject | null>(null);
  const [mentorSearch, setMentorSearch] = useState('');
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every open starts clean — a team's catalog has nothing to do with the last
  // team's, and a stale selection here would be assigned to the wrong team.
  useEffect(() => {
    if (!team) return;
    setTab('preferences');
    setProjects([]);
    setSearchInput('');
    setSearch('');
    setPage(1);
    setSelectedProject(null);
    setMentorSearch('');
    setSelectedMentorId(null);
  }, [team?.teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchInput]);

  const loadProjects = useCallback(async () => {
    if (!team || tab !== 'catalog') return;
    setLoadingProjects(true);
    try {
      const res = await apiGetAllocatableProjects(team.teamId, {
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setProjects(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  }, [team, tab, search, page, showError]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Asked for on reaching the tab that needs them, not on opening the modal:
  // most opens are a straight choice between the team's two preferences, and
  // those carry their own mentor.
  useEffect(() => {
    if (tab === 'catalog' && mentors.length === 0 && !mentorsLoading) {
      loadMentors();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreferencePick = async (projectId: string) => {
    if (!team) return;
    setSaving(true);
    try {
      await apiOverrideTeamAllocation(team.teamId, projectId);
      showSuccess('Allocation updated.');
      onClose();
      await onSaved();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update allocation');
    } finally {
      setSaving(false);
    }
  };

  const handleCatalogAssign = async () => {
    if (!team || !selectedProject || !selectedMentorId) return;
    setSaving(true);
    try {
      await apiReassignToCatalogProject(team.teamId, selectedProject.id, selectedMentorId);
      showSuccess('Team moved to the new project.');
      onClose();
      await onSaved();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to assign the project');
    } finally {
      setSaving(false);
    }
  };

  if (!team) return null;

  const teamYear = team.members.find((m) => m.batch)?.batch ?? null;
  const visibleMentors = mentors.filter((m) =>
    (m.mentorName ?? '').toLowerCase().includes(mentorSearch.trim().toLowerCase())
  );

  return (
    <Modal
      open={!!team}
      onClose={onClose}
      size="xl"
      title={team.allocationStatus === 'allocated' ? 'Override Allocation' : 'Assign Allocation'}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-white font-semibold">{team.teamName ?? 'Team'}</span>
          <span className="text-gray-500">{team.track}</span>
          {teamYear && (
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-gray-300">
              Admission {teamYear}
            </span>
          )}
        </div>

        <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-fit">
          {([
            ['preferences', "Team's preferences"],
            ['catalog', 'From catalog'],
          ] as [Tab, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                tab === value ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'preferences' ? (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              Choose which of this team's own preferences to allocate. This leaves their
              submitted choices as they are.
            </p>
            {[team.preference1, team.preference2].map((pref, idx) => {
              const selected = team.allocatedProjectId === pref.projectId;
              return (
                <button
                  key={`${pref.projectId}-${idx}`}
                  onClick={() => handlePreferencePick(pref.projectId)}
                  disabled={saving}
                  className={`w-full text-left rounded-lg p-4 border transition-all duration-200 disabled:opacity-50 ${
                    selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">
                        Preference {idx + 1}
                      </p>
                      <p className="text-white font-semibold">{pref.projectTitle}</p>
                      {pref.mentorName && <p className="text-gray-400 text-xs mt-0.5">{pref.mentorName}</p>}
                    </div>
                    {selected && <CheckCircle2 size={18} className="text-gold shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">
              Every project this OJT offers on {team.track}
              {teamYear ? ` to the ${teamYear.slice(0, 4)} intake` : ''}. Assigning one replaces
              both of the team's preferences as well as their allocation.
            </p>

            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by title or code..."
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gold focus:outline-none"
              />
            </div>

            <div className="max-h-[280px] overflow-y-auto scrollbar-thin space-y-2 pr-1">
              {loadingProjects ? (
                <div className="py-10 flex justify-center">
                  <SpinnerSquare size={32} />
                </div>
              ) : projects.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">
                  No project on this track is offered to this team's admission year.
                </p>
              ) : (
                projects.map((project) => {
                  const selected = selectedProject?.id === project.id;
                  const crowded = project.teamsHolding >= CROWDED_AT;
                  return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className={`w-full text-left rounded-lg p-3 border transition-all duration-200 ${
                        selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{project.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 font-mono">
                            {project.projectId ?? '—'}
                            {project.batch.length > 0 && (
                              <span className="font-sans"> · {project.batch.join(', ')}</span>
                            )}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 flex items-center gap-1 text-xs whitespace-nowrap ${
                            crowded ? 'text-amber-400' : 'text-gray-500'
                          }`}
                          title={
                            crowded
                              ? `${project.teamsHolding} teams already hold this — above the usual limit of ${CROWDED_AT}`
                              : `${project.teamsHolding} of ${CROWDED_AT} places taken`
                          }
                        >
                          {crowded && <AlertTriangle size={12} />}
                          <Users size={12} />
                          {project.teamsHolding}/{CROWDED_AT}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="tabular-nums">
                  Page {page} of {totalPages} · {total} projects
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-2.5 py-1 rounded-md bg-zinc-800 border border-zinc-700 disabled:opacity-40 hover:border-zinc-600"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-2.5 py-1 rounded-md bg-zinc-800 border border-zinc-700 disabled:opacity-40 hover:border-zinc-600"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* The mentor step only appears once there is a project to attach one
                to — asking for it first would be asking about nothing. */}
            {selectedProject && (
              <div className="space-y-2 pt-3 border-t border-zinc-800">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                  Mentor for {selectedProject.title}
                </p>
                <input
                  value={mentorSearch}
                  onChange={(e) => setMentorSearch(e.target.value)}
                  placeholder="Search mentors..."
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gold focus:outline-none"
                />
                <div className="max-h-[160px] overflow-y-auto scrollbar-thin space-y-1.5 pr-1">
                  {mentorsLoading ? (
                    <div className="py-5 flex justify-center">
                      <SpinnerSquare size={24} />
                    </div>
                  ) : visibleMentors.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-500">
                      {mentors.length === 0 ? 'No mentors on this OJT yet.' : 'No mentor matches.'}
                    </p>
                  ) : (
                    visibleMentors.map((mentor) => (
                      <button
                        key={mentor.mentorId}
                        onClick={() => setSelectedMentorId(mentor.mentorId)}
                        className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${
                          selectedMentorId === mentor.mentorId
                            ? 'bg-gold/10 border-gold'
                            : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-white">{mentor.mentorName ?? '—'}</span>
                          <span className="text-xs text-gray-500 tabular-nums shrink-0">
                            {mentor.allocatedCount} allocated · {mentor.pendingCount} pending
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCatalogAssign}
                disabled={!selectedProject || !selectedMentorId || saving}
                className="px-4 py-2 rounded-lg bg-gold text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gold-hover transition-colors"
              >
                {saving ? 'Assigning...' : 'Assign project & mentor'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
