import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Briefcase, Users, Clock, CheckCircle2, Search, Layers, Sparkles, Plus, UserCheck, RotateCcw, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Star, Minimize2 } from 'lucide-react';
import SpinnerSquare from '../../components/SpinnerSquare';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import type { MyTeamStatus, AvailableTeammate, TeamProject, TeamAvailableMentor, Project, PreferenceReviewStatus, PreferenceResubmissionMode, TrackSubmissionMode } from '../../lib/types';
import type { ProjectSummary, ProjectDetail, ApiAvailableTrack } from '../../lib/api';
import {
  apiGetMyCohort,
  apiGetMyTeamStatus,
  apiGetAvailableTeammates,
  apiSendTeamRequest,
  apiRevokeTeamRequest,
  apiCreateIndividualTeam,
  apiGetAvailableProjects,
  apiGetAvailableProjectsPage,
  apiGetProjectDetail,
  apiGetAvailableMentors,
  apiProposeProject,
  apiSubmitProjectPreferences,
  apiResubmitPreference1,
  apiGetProject,
  apiGetAvailableTracks,
} from '../../lib/api';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';
import { useTracks } from '../../hooks/useTracks';

export default function ProjectPicker() {
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [cohortError, setCohortError] = useState<string | null>(null);
  const [status, setStatus] = useState<MyTeamStatus | null>(null);
  const [availableProjects, setAvailableProjects] = useState<TeamProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [availableMentors, setAvailableMentors] = useState<TeamAvailableMentor[]>([]);
  const [mentorsLoading, setMentorsLoading] = useState(true);

  const refreshStatus = useCallback(async (cid: string) => {
    try {
      const res = await apiGetMyTeamStatus(cid);
      setStatus(res);
      return res;
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load your status');
      return null;
    }
  }, [showError]);

  // Only the team+project-preferences screen needs the project catalog — the
  // backend requires team membership to serve it, so this is only worth
  // kicking off once we know the student actually has a team (see the
  // initial-load effect below), otherwise it always 400s.
  const loadAvailableProjects = useCallback(async (cid: string) => {
    setProjectsLoading(true);
    try {
      const res = await apiGetAvailableProjects(cid);
      setAvailableProjects(res);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setProjectsLoading(false);
    }
  }, [showError]);

  // Mentor pool is scoped to the team's cohort + track (not to a specific
  // project), so it's loaded once alongside the project catalog rather than
  // re-fetched per preference.
  const loadAvailableMentors = useCallback(async (cid: string) => {
    setMentorsLoading(true);
    try {
      const res = await apiGetAvailableMentors(cid);
      setAvailableMentors(res);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load mentors');
    } finally {
      setMentorsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    let handleStatusChange: (() => void) | null = null;
    (async () => {
      setLoading(true);
      try {
        const cohort = await apiGetMyCohort();
        setCohortId(cohort.cohortId);
        await refreshStatus(cohort.cohortId);
        
        handleStatusChange = () => refreshStatus(cohort.cohortId);
        window.addEventListener('ojt_team_status_changed', handleStatusChange);
      } catch (err) {
        setCohortError(err instanceof Error ? err.message : 'Failed to load your cohort');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (handleStatusChange) window.removeEventListener('ojt_team_status_changed', handleStatusChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The project catalog / mentor pool require team membership server-side
  // (a pre-team student always gets a 400 from both), so fetch them only
  // once we know the student has a team — covers both the initial load
  // (already teamed on reload) and forming one mid-session (accepting an
  // invite, or going individual).
  const teamProjectsFetchedRef = useRef(false);
  useEffect(() => {
    if (!cohortId || !status?.team || teamProjectsFetchedRef.current) return;
    teamProjectsFetchedRef.current = true;
    loadAvailableProjects(cohortId);
    loadAvailableMentors(cohortId);
  }, [cohortId, status?.team, loadAvailableProjects, loadAvailableMentors]);

  usePageRefresh(useCallback(async () => {
    if (!cohortId) return;
    await refreshStatus(cohortId);
    if (status?.team) {
      await Promise.all([loadAvailableProjects(cohortId), loadAvailableMentors(cohortId)]);
    }
  }, [cohortId, status?.team, refreshStatus, loadAvailableProjects, loadAvailableMentors]));



  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  if (cohortError || !cohortId) {
    return (
      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center">
        <Briefcase size={40} className="mx-auto text-gray-600 mb-3" />
        <p className="text-gray-400">{cohortError || 'You are not part of any active cohort yet.'}</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col space-y-6">
      <div className="shrink-0 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Briefcase size={24} className="text-gold" />
            Select Project
          </h1>
          <p className="text-gray-400 text-sm mt-1">Pick a track, team up, and lock in your projects.</p>
        </div>
        {status?.team && !status.projectPreferences && status.allowedSubmissionModes.length > 0 && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5 shrink-0 mt-1">
            <Layers size={13} className="text-gold shrink-0" />
            {/* How many projects a team submits depends on which options their
                track offers — only say "2" when every option needs two. */}
            {status.allowedSubmissionModes.every(m => MODE_SLOT_COUNT[m] === 1) ? (
              <>Choose <span className="text-gold font-semibold">1 project</span> for your track</>
            ) : status.allowedSubmissionModes.every(m => MODE_SLOT_COUNT[m] === 2) ? (
              <>Choose <span className="text-gold font-semibold">2 projects</span> — your 1st and 2nd preference</>
            ) : (
              <>Pick how you want to submit, then choose your <span className="text-gold font-semibold">project(s)</span></>
            )}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {status?.team ? (
          status.projectPreferences ? (
            <SummaryScreen
              cohortId={cohortId}
              team={status.team}
              preferences={status.projectPreferences}
              availableMentors={availableMentors}
              onResubmitted={() => refreshStatus(cohortId)}
            />
          ) : (
            <ProjectSelectionScreen
              cohortId={cohortId}
              availableProjects={availableProjects}
              projectsLoading={projectsLoading}
              availableMentors={availableMentors}
              mentorsLoading={mentorsLoading}
              allowedSubmissionModes={status.allowedSubmissionModes}
              onSubmitted={() => refreshStatus(cohortId)}
            />
          )
        ) : (
          <div className="space-y-6">
            <TrackAndTeammateScreen
              cohortId={cohortId}
              canInviteTeammate={status?.canInviteTeammate ?? true}
              pendingSentRequests={status?.pendingSentRequests ?? []}
              onTeamFormed={() => refreshStatus(cohortId)}
              onRevoke={async (requestId) => {
                try {
                  await apiRevokeTeamRequest(requestId);
                  showSuccess('Invite revoked.');
                  await refreshStatus(cohortId);
                } catch (err) {
                  showError(err instanceof Error ? err.message : 'Failed to revoke invite');
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 1 & 2: pick a track, then a teammate ────────────────────────────────

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;
const LIMIT_OPTIONS = [20, 40, 80, 100];

/**
 * The full-screen surface a project's detail opens into.
 *
 * Same shell the expanded table uses, so going table -> project -> back never
 * changes size under you. Escape leaves full screen rather than closing the
 * project: it is the same key that leaves the expanded table, and having it
 * mean two different things depending on what is showing is worse than having
 * it mean one.
 */
function FullscreenShell({ onExit, children }: { onExit: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onExit();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-[120] bg-black p-4 sm:p-6 overflow-y-auto">
      <button
        type="button"
        onClick={onExit}
        title="Exit full screen (Esc)"
        aria-label="Exit full screen"
        className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10 p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-zinc-800 transition-colors"
      >
        <Minimize2 size={16} />
      </button>
      {children}
    </div>
  );
}

// Columns for the browse table. Module scope, not rebuilt per render — they
// close over nothing, and a fresh array each render makes DataTable re-key
// every column on every keystroke of the search box.
const PROJECT_COLUMNS = [
  {
    key: 'title',
    header: 'Project',
    render: (p: ProjectSummary) => (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-white font-medium truncate">{p.title}</span>
        {p.isRecommended && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gold/10 text-gold font-semibold uppercase tracking-wider">
            <Sparkles size={10} />
            Suggested
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'problemStatement',
    header: 'Problem statement',
    render: (p: ProjectSummary) => (
      <span className="text-gray-400 text-xs line-clamp-2">{p.problemStatement || '\u2014'}</span>
    ),
  },
  {
    key: 'recommendedMentors',
    header: 'Recommended mentors',
    render: (p: ProjectSummary) =>
      p.recommendedMentors.length === 0 ? (
        <span className="text-gray-600 text-xs">{'\u2014'}</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {p.recommendedMentors.map(mentor => (
            <span
              key={mentor.mentorId}
              className="inline-flex items-center gap-1 text-[11px] text-gray-200 bg-zinc-800 border border-zinc-750 rounded-md px-1.5 py-0.5 whitespace-nowrap"
            >
              <UserCheck size={11} className="text-gold shrink-0" />
              {mentor.fullName ?? '\u2014'}
            </span>
          ))}
        </div>
      ),
  },
  {
    key: 'partners',
    header: 'Partners',
    render: (p: ProjectSummary) =>
      p.partners.length === 0 ? (
        <span className="text-gray-600 text-xs">{'\u2014'}</span>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {p.partners.map(partner => (
            <span key={partner.name} title={partner.name} className="inline-flex items-center bg-white/90 rounded-md px-1.5 py-1">
              {partner.logoUrl ? (
                <img src={partner.logoUrl} alt={partner.name} className="h-3.5 max-w-[64px] object-contain" loading="lazy" />
              ) : (
                <span className="text-[10px] font-semibold text-zinc-800">{partner.name}</span>
              )}
            </span>
          ))}
        </div>
      ),
  },
];

function TrackAndTeammateScreen({
  cohortId,
  canInviteTeammate,
  pendingSentRequests,
  onTeamFormed,
  onRevoke,
}: {
  cohortId: string;
  canInviteTeammate: boolean;
  pendingSentRequests: { id: string; receiverId: string; receiverName: string | null; track: string; expiresAt: string }[];
  onTeamFormed: () => void;
  onRevoke: (requestId: string) => Promise<void>;
}) {
  const { showError, showSuccess } = useToast();
  // Resumes on the track already implied by any invites already sent (e.g.
  // after a reload) instead of re-showing the track picker and losing that
  // context — every pending invite for a student is always the same track.
  const [track, setTrack] = useState<string | null>(pendingSentRequests[0]?.track ?? null);
  const [availableTracks, setAvailableTracks] = useState<ApiAvailableTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [teammates, setTeammates] = useState<AvailableTeammate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [creatingIndividual, setCreatingIndividual] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  const SEND_QUOTA = 3;
  const quotaFull = pendingSentRequests.length >= SEND_QUOTA;
  const selectedTrack = availableTracks.find(t => t.trackSlug === track);
  const trackName = selectedTrack?.trackName ?? track ?? '';
  // The track itself can force individual mode for this OJT — independent of
  // (and on top of) the batch/admin-override rule below. Whichever source
  // says "individual" wins, so this is checked in addition to
  // canInviteTeammate, not instead of it.
  const trackForcesIndividual = selectedTrack?.projectMode === 'individual';

  useEffect(() => {
    let cancelled = false;
    setTracksLoading(true);
    apiGetAvailableTracks(cohortId)
      .then((data) => {
        if (!cancelled) setAvailableTracks(data);
      })
      .catch((err) => {
        if (!cancelled) showError(err instanceof Error ? err.message : 'Failed to load available tracks');
      })
      .finally(() => {
        if (!cancelled) setTracksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cohortId, showError]);

  const fetchTeammates = useCallback(async () => {
    if (!canInviteTeammate || !track) return;
    setLoading(true);
    try {
      const res = await apiGetAvailableTeammates(cohortId, { page, limit, search: search || undefined, track: track ?? undefined });
      setTeammates(res.data);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load available teammates');
      setTeammates([]);
    } finally {
      setLoading(false);
    }
  }, [cohortId, canInviteTeammate, track, page, limit, search, showError]);

  // Covers both the initial fetch (once a track is picked or already implied
  // by a pending invite) and every subsequent page/limit/search change.
  useEffect(() => {
    fetchTeammates();
  }, [fetchTeammates]);

  const handlePickTrack = (t: string) => setTrack(t);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

  // Sizes the card grid to fill the space actually available below it,
  // mirroring DataTable's own body-height mechanism so this screen scrolls
  // and paginates the same way every other list in the app does.
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [maxGridHeight, setMaxGridHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const computeMaxHeight = () => {
      const wrap = gridWrapRef.current;
      if (!wrap) return;
      const wrapTop = wrap.getBoundingClientRect().top;
      const footerHeight = footerRef.current?.getBoundingClientRect().height ?? 60;
      const available = window.innerHeight - wrapTop - footerHeight - 16;
      setMaxGridHeight(Math.max(200, available));
    };
    computeMaxHeight();
    window.addEventListener('resize', computeMaxHeight);
    return () => window.removeEventListener('resize', computeMaxHeight);
  }, []);

  const handleSendRequest = async (teammate: AvailableTeammate) => {
    if (!track) return;
    setSendingTo(teammate.studentId);
    try {
      await apiSendTeamRequest(teammate.studentId, cohortId, track);
      showSuccess(`Request sent to ${teammate.fullName}.`);
      onTeamFormed();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setSendingTo(null);
    }
  };

  const handleCreateIndividualTeam = async () => {
    if (!track) return;
    setCreatingIndividual(true);
    try {
      await apiCreateIndividualTeam(cohortId, track);
      showSuccess('Individual project set up.');
      onTeamFormed();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to set up your individual project');
    } finally {
      setCreatingIndividual(false);
    }
  };

  if (!track) {
    return (
      <div className="space-y-4">
        <h2 className="text-white font-semibold">Choose your track</h2>
        {tracksLoading ? (
          <div className="flex items-center justify-center py-12">
            <SpinnerSquare size={40} />
          </div>
        ) : availableTracks.length === 0 ? (
          <p className="text-gray-500 text-sm">No tracks are available for you in this OJT yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableTracks.map(t => (
              <button
                key={t.trackSlug}
                onClick={() => handlePickTrack(t.trackSlug)}
                className="relative flex flex-col items-start gap-3 bg-zinc-850 border border-zinc-750 rounded-xl p-5 text-left hover:border-gold/40 hover:-translate-y-0.5 transition-all duration-200"
              >
                {t.opportunityEarned && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gold bg-gold/10 border border-gold/30 rounded-full px-2 py-0.5">
                    <Star size={10} className="fill-gold" />
                    Opportunity Earned
                  </span>
                )}
                <div className="p-2 rounded-lg bg-zinc-750">
                  <Layers size={20} className="text-gold" />
                </div>
                <p className="text-white font-semibold">{t.trackName}</p>
                <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">
                  {t.projectMode === 'individual' ? 'Individual project' : 'Team project'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!canInviteTeammate || trackForcesIndividual) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setTrack(null)}
            disabled={creatingIndividual}
            className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          >
            Change track
          </button>
          <span className="text-xs px-2.5 py-1 rounded-full bg-gold/10 text-gold font-medium">{trackName}</span>
        </div>

        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-8 text-center space-y-4">
          <Sparkles size={32} className="mx-auto text-gold" />
          <h2 className="text-white font-bold text-lg">You're on an individual project</h2>
          <p className="text-gray-400 text-sm">
            {trackForcesIndividual
              ? `${trackName} is an individual-only track for this OJT — you'll work on it solo.`
              : "Students in your batch complete this OJT individually and can't invite a teammate."}
          </p>
          <button
            onClick={handleCreateIndividualTeam}
            disabled={creatingIndividual}
            className="text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {creatingIndividual ? 'Setting up...' : 'Continue as Individual'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTrack(null)}
            disabled={pendingSentRequests.length > 0}
            title={pendingSentRequests.length > 0 ? 'Revoke your pending invites first to change track' : undefined}
            className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40 disabled:hover:text-gray-400"
          >
            Change track
          </button>
          <span className="text-xs px-2.5 py-1 rounded-full bg-gold/10 text-gold font-medium">{trackName}</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <Users size={18} className="text-gold" />
          Choose your teammate
        </h2>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={searchInput}
          onChange={e => handleSearchInputChange(e.target.value)}
          placeholder="Search by name or roll number..."
          className="w-full bg-zinc-850 border border-zinc-750 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
        />
      </div>

      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : (
        <div
          ref={gridWrapRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start overflow-y-auto"
          style={maxGridHeight ? { height: maxGridHeight } : undefined}
        >
          {teammates.map(t => {
            const pendingReq = pendingSentRequests.find(r => r.receiverId === t.studentId);
            return (
              <div
                key={t.studentId}
                className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between gap-3 shadow-sm hover:border-zinc-700 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">{t.fullName}</p>
                  <p className="text-gray-500 text-xs truncate">{t.rollNumber} · {t.batch}</p>
                </div>

                {pendingReq ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium">
                      <Clock size={11} /> Pending
                    </span>
                    <button
                      onClick={() => onRevoke(pendingReq.id)}
                      className="text-[11px] px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-400 hover:text-white hover:bg-red-500/20 rounded-md font-medium transition-colors"
                      title="Revoke request"
                    >
                      Revoke
                    </button>
                  </div>
                ) : quotaFull ? (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-800 text-gray-500 border border-zinc-700 font-medium shrink-0">
                    Quota Full
                  </span>
                ) : (
                  <button
                    onClick={() => handleSendRequest(t)}
                    disabled={sendingTo === t.studentId}
                    className="text-xs px-3 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50 shrink-0 shadow-sm"
                  >
                    {sendingTo === t.studentId ? 'Sending...' : 'Send Invite'}
                  </button>
                )}
              </div>
            );
          })}
          {teammates.length === 0 && (
            <div className="col-span-full bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center">
              <Users size={40} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-400">No available teammates found.</p>
            </div>
          )}
        </div>
      )}

      {!loading && pagination.totalPages > 1 && (
        <div ref={footerRef} className="flex items-center justify-between flex-wrap gap-3 pt-1">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="flex items-center gap-1">
              {LIMIT_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => handleLimitChange(opt)}
                  className={`text-xs px-2 py-1 rounded-md transition-colors ${
                    opt === limit ? 'bg-gold/20 text-gold font-semibold' : 'text-gray-400 hover:text-white hover:bg-zinc-750'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={pagination.page === 1}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={pagination.page === 1}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-400">{pagination.page} / {pagination.totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page === pagination.totalPages}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setPage(pagination.totalPages)}
              disabled={pagination.page === pagination.totalPages}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 3: waiting on the invite you sent ───────────────────────────────────

// ── Step 4 & 5: team picks how to fill its 2 project preferences ────────────

// The track decides which of these it offers (ojt_cohort_track_config
// .allowed_submission_modes); the team picks one of the offered ones. Keyed by
// the backend's own mode strings so there's nothing to translate at submit
// time — the value the student picked is the value that gets sent.
type SelectionMode = TrackSubmissionMode;

// How many project slots each mode fills. A one-slot mode has no Preference 2
// step at all — the team submits straight from the first screen.
const MODE_SLOT_COUNT: Record<SelectionMode, 1 | 2> = {
  '1_own': 1,
  '1_recommended': 1,
  '2_recommended': 2,
  '1_own_1_recommended': 2,
};

// Whether slot 1 is the team's own proposed project or a catalog pick.
const MODE_SLOT_1_IS_OWN: Record<SelectionMode, boolean> = {
  '1_own': true,
  '1_recommended': false,
  '2_recommended': false,
  '1_own_1_recommended': true,
};

const MODE_CARDS: Record<SelectionMode, { title: string; description: string; icon: typeof Sparkles }> = {
  '1_own': {
    title: 'Your Own Project',
    description: 'Propose your own project idea. Your mentor reviews it before it goes to allocation.',
    icon: Sparkles,
  },
  '1_recommended': {
    title: 'One Recommended Project',
    description: 'Pick a single project from the catalog.',
    icon: Briefcase,
  },
  '2_recommended': {
    title: 'Two Recommended Projects',
    description: 'Pick two different projects from the catalog as your 1st and 2nd preference.',
    icon: Briefcase,
  },
  '1_own_1_recommended': {
    title: 'Own Project + Recommended Project',
    description: 'Propose your own project as your 1st preference, and pick one from the catalog as your 2nd.',
    icon: Sparkles,
  },
};

function ProjectSelectionScreen({
  cohortId,
  availableProjects,
  projectsLoading,
  availableMentors,
  mentorsLoading,
  allowedSubmissionModes,
  onSubmitted,
}: {
  cohortId: string;
  availableProjects: TeamProject[];
  projectsLoading: boolean;
  availableMentors: TeamAvailableMentor[];
  mentorsLoading: boolean;
  /** What this team's track offers — only these options are shown. */
  allowedSubmissionModes: TrackSubmissionMode[];
  onSubmitted: () => void;
}) {
  const { showError, showSuccess } = useToast();
  const [selfProject, setSelfProject] = useState<TeamProject | null>(null);
  const [mode, setMode] = useState<SelectionMode | null>(null);
  // Preference 1 (project + mentor) is picked on its own page, then the
  // team moves to preference 2 — pairing each project with its mentor
  // right away instead of picking both projects first and both mentors after.
  const [step, setStep] = useState<1 | 2>(1);
  const [existingProjectId, setExistingProjectId] = useState<string | null>(null);
  const [existingProjectId1, setExistingProjectId1] = useState<string | null>(null);
  const [existingProjectId2, setExistingProjectId2] = useState<string | null>(null);
  const [mentor1Id, setMentor1Id] = useState<string | null>(null);
  const [mentor2Id, setMentor2Id] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Which preference slot the mentor-picker modal is currently open for —
  // null means closed. One shared modal instance serves both slots instead
  // of duplicating it, since only one is ever relevant at a time (steps 1
  // and 2 are mutually exclusive).
  const [mentorModalFor, setMentorModalFor] = useState<1 | 2 | null>(null);
  // While a project's detail is open, its own "Back to projects" is the back
  // that belongs on screen. Showing the wizard's alongside it puts two back
  // arrows in view that go to different places — one step out of the detail,
  // one all the way out of the flow.
  const [viewingProjectDetail, setViewingProjectDetail] = useState(false);

  useEffect(() => {
    const own = availableProjects.find(p => p.projectBy === 'STUDENT');
    setSelfProject(own ?? null);
  }, [availableProjects]);

  // Only offer what the track allows, in a stable order.
  const offeredModes = useMemo(
    () => (Object.keys(MODE_CARDS) as SelectionMode[]).filter(m => allowedSubmissionModes.includes(m)),
    [allowedSubmissionModes]
  );

  // With a single option there is nothing to choose — drop the team straight
  // into it rather than showing a one-card picker.
  useEffect(() => {
    if (mode === null && offeredModes.length === 1) setMode(offeredModes[0]);
  }, [mode, offeredModes]);

  // A team that already proposed its own project (e.g. before switching
  // devices, or a page reload mid-flow) has effectively already picked an
  // own-project mode — resume it instead of losing their work.
  useEffect(() => {
    if (!selfProject || mode !== null) return;
    const ownMode = offeredModes.find(m => MODE_SLOT_1_IS_OWN[m]);
    if (ownMode) setMode(ownMode);
  }, [selfProject, mode, offeredModes]);

  // Once the current step's project is picked but its mentor isn't yet,
  // prompt for one right away — covers both "just picked it" and "reloaded
  // with it already picked." Doesn't fight a manual close: this only
  // re-fires when its dependencies actually change.
  const slot1IsOwn = mode !== null && MODE_SLOT_1_IS_OWN[mode];
  const slotCount = mode !== null ? MODE_SLOT_COUNT[mode] : 2;

  useEffect(() => {
    if (mode === null) return;
    if (step === 1 && !mentor1Id) {
      if (slot1IsOwn && selfProject) setMentorModalFor(1);
      if (!slot1IsOwn && existingProjectId1) setMentorModalFor(1);
    }
    if (step === 2 && !mentor2Id) {
      if (slot1IsOwn && existingProjectId) setMentorModalFor(2);
      if (!slot1IsOwn && existingProjectId2) setMentorModalFor(2);
    }
  }, [mode, step, slot1IsOwn, selfProject, existingProjectId1, existingProjectId, existingProjectId2, mentor1Id, mentor2Id]);

  const preference1Id = slot1IsOwn ? (selfProject?.id ?? null) : existingProjectId1;
  // A one-slot mode has no second preference at all — not an unfilled one.
  const preference2Id = slotCount === 1 ? null : slot1IsOwn ? existingProjectId : existingProjectId2;
  const preference2MentorId = slotCount === 1 ? null : mentor2Id;

  const handleSubmit = async () => {
    if (!mode || !preference1Id || !mentor1Id) return;
    if (slotCount === 2 && (!preference2Id || !preference2MentorId)) return;
    setSubmitting(true);
    try {
      await apiSubmitProjectPreferences({
        cohortId,
        preference1Id,
        preference1MentorId: mentor1Id,
        preference2Id,
        preference2MentorId,
        submissionMode: mode,
      });
      showSuccess('Project selections submitted!');
      onSubmitted();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit project selections';
      showError(message);
      // A teammate can win this same race a moment earlier — refresh status
      // so this member lands on the summary screen showing what was
      // actually saved, instead of staying stuck on a now-stale form.
      if (message.includes('already been submitted')) {
        onSubmitted();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (projectsLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col space-y-6">
      {mode === null ? (
        <div className="space-y-4">
          {offeredModes.length === 0 ? (
            <p className="text-sm text-amber-400/90 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              Project selection isn't open for your track yet. Please check back once your admin has configured it.
            </p>
          ) : (
            <>
              <h2 className="text-white font-semibold">How do you want to pick your projects?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {offeredModes.map(offered => {
                  const card = MODE_CARDS[offered];
                  const Icon = card.icon;
                  return (
                    <button
                      key={offered}
                      onClick={() => setMode(offered)}
                      className="group flex flex-col items-start gap-3 bg-zinc-850 border border-zinc-750 rounded-xl p-5 text-left hover:border-gold/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-gold/5 transition-all duration-300"
                    >
                      <div className="p-2 rounded-lg bg-zinc-750 group-hover:bg-gold/10 transition-colors">
                        <Icon size={20} className="text-gold" />
                      </div>
                      <p className="text-white font-semibold">{card.title}</p>
                      <p className="text-gray-400 text-sm">{card.description}</p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col space-y-3">
          <div className="shrink-0 flex items-center gap-4 flex-wrap">
            {!viewingProjectDetail && (
              <button
                onClick={() => { setMode(null); setStep(1); }}
                disabled={!!selfProject || offeredModes.length <= 1}
                className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                ← Change selection type
              </button>
            )}

            {slotCount === 2 && (
              <>
                <span className="text-gray-700 shrink-0">|</span>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider shrink-0">
                  <span className={step === 1 ? 'text-gold' : 'text-gray-600'}>1. Preference 1</span>
                  <span className="text-gray-700">—</span>
                  <span className={step === 2 ? 'text-gold' : 'text-gray-600'}>2. Preference 2</span>
                </div>
              </>
            )}
          </div>

          {step === 1 ? (
            slot1IsOwn ? (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Preference 1 project</p>
                <SelfProjectProposer
                  cohortId={cohortId}
                  selfProject={selfProject}
                  onCreated={setSelfProject}
                  selectedMentor={availableMentors.find(m => m.id === mentor1Id) ?? null}
                  onChooseMentor={() => setMentorModalFor(1)}
                />
              </div>
            ) : (
              <ProjectCatalogBrowser
                cohortId={cohortId}
                selectedId={existingProjectId1}
                onSelect={setExistingProjectId1}
                excludeId={existingProjectId2}
                selectedMentor={availableMentors.find(m => m.id === mentor1Id) ?? null}
                onChooseMentor={() => setMentorModalFor(1)}
                label={slotCount === 1 ? 'Your project' : 'Preference 1'}
                onDetailOpenChange={setViewingProjectDetail}
              />
            )
          ) : (
            <ProjectCatalogBrowser
              cohortId={cohortId}
              selectedId={slot1IsOwn ? existingProjectId : existingProjectId2}
              onSelect={slot1IsOwn ? setExistingProjectId : setExistingProjectId2}
              excludeId={slot1IsOwn ? undefined : existingProjectId1}
              selectedMentor={availableMentors.find(m => m.id === mentor2Id) ?? null}
              onChooseMentor={() => setMentorModalFor(2)}
              onDetailOpenChange={setViewingProjectDetail}
              label="Preference 2"
            />
          )}

          <div className="shrink-0 sticky bottom-0 z-10 flex items-center justify-between gap-3 pt-3 pb-1 bg-gradient-to-t from-black via-black/95 to-transparent">
            {step === 2 ? (
              <button
                onClick={() => setStep(1)}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                ← Back to Preference 1
              </button>
            ) : (
              <span />
            )}

            {step === 1 && slotCount === 2 ? (
              <button
                onClick={() => setStep(2)}
                disabled={!preference1Id || !mentor1Id}
                className="py-3 px-6 bg-gold text-black font-semibold rounded-lg shadow-xl shadow-black/40 hover:bg-gold-hover hover:shadow-lg hover:shadow-gold/10 transition-all duration-200 disabled:opacity-40 disabled:hover:shadow-none"
              >
                Next: Preference 2 →
              </button>
            ) : (
              // One-slot modes submit straight from step 1; two-slot modes
              // reach this on step 2.
              <button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (slotCount === 1
                    ? !preference1Id || !mentor1Id
                    : !preference2Id || !preference2MentorId)
                }
                className="py-3 px-6 bg-gold text-black font-semibold rounded-lg shadow-xl shadow-black/40 hover:bg-gold-hover hover:shadow-lg hover:shadow-gold/10 transition-all duration-200 disabled:opacity-40 disabled:hover:shadow-none"
              >
                {submitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            )}
          </div>
        </div>
      )}

      <Modal
        open={mentorModalFor !== null}
        onClose={() => setMentorModalFor(null)}
        title={`Choose your Preference ${mentorModalFor ?? 1} mentor`}
        size="xl"
      >
        <MentorPicker
          label={`Preference ${mentorModalFor ?? 1} mentor`}
          mentors={availableMentors}
          loading={mentorsLoading}
          selectedId={mentorModalFor === 2 ? mentor2Id : mentor1Id}
          onSelect={(id) => {
            if (mentorModalFor === 2) setMentor2Id(id);
            else setMentor1Id(id);
            setMentorModalFor(null);
          }}
          excludeId={mentorModalFor === 2 ? mentor1Id : mentor2Id}
          bare
        />
      </Modal>
    </div>
  );
}

function MentorPicker({
  label,
  mentors,
  loading,
  selectedId,
  onSelect,
  excludeId,
  bare = false,
}: {
  label: string;
  mentors: TeamAvailableMentor[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  excludeId?: string | null;
  // Skips the outer card chrome + label — for callers that already provide
  // their own framing (e.g. inside a Modal, whose title already says what
  // this list is) so we don't end up with a card nested inside a card, or
  // the same heading repeated twice.
  bare?: boolean;
}) {
  const options = mentors.filter(m => m.id !== excludeId);

  const body = (
    <>
      {loading ? (
        <div className="py-6 flex justify-center"><SpinnerSquare size={24} /></div>
      ) : (
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${bare ? 'lg:grid-cols-3' : ''} gap-2 ${
            bare ? '' : 'max-h-[45vh] overflow-y-auto pr-1'
          }`}
        >
          {options.map(m => {
            const isSelected = selectedId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m.id)}
                className={`relative flex items-center gap-3 text-left rounded-lg p-3 border transition-all duration-200 ${
                  isSelected
                    ? 'bg-gold/10 border-gold shadow-lg shadow-gold/10'
                    : 'bg-zinc-900 border-zinc-750 hover:border-gold/30 hover:-translate-y-0.5'
                }`}
              >
                <MentorAvatar name={m.fullName} selected={isSelected} />
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold text-sm truncate">{m.fullName}</p>
                  <span
                    className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium truncate max-w-full ${
                      isSelected ? 'bg-gold/15 text-gold' : 'bg-zinc-800 text-gray-400'
                    }`}
                  >
                    {m.organization || (m.isExternal ? 'External' : 'Internal')}
                  </span>
                </div>
                {isSelected && <CheckCircle2 size={16} className="absolute top-2.5 right-2.5 text-gold shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
      {!loading && options.length === 0 && (
        <p className="text-gray-500 text-xs">No mentors available for this track right now.</p>
      )}
    </>
  );

  if (bare) return body;

  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 space-y-3 h-full">
      <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">{label}</label>
      {body}
    </div>
  );
}

function MentorAvatar({ name, selected }: { name: string; selected: boolean }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

  return (
    <div
      className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
        selected ? 'bg-gold text-black' : 'bg-zinc-750 text-gray-300'
      }`}
    >
      {initials || '?'}
    </div>
  );
}

// Full-width, paginated catalog browser — a click opens the full detail
// screen (ProjectDetailView) instead of selecting immediately, since picking
// off a title + one line is not enough to actually decide. Used for every
// catalog pick in this flow: Preference 1 in "two existing projects" mode,
// Preference 2 in both modes, and the post-rejection catalog-only resubmit.
function ProjectCatalogBrowser({
  cohortId,
  selectedId,
  onSelect,
  excludeId,
  selectedMentor,
  onChooseMentor,
  label,
  onDetailOpenChange,
}: {
  cohortId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  excludeId?: string | null;
  selectedMentor?: TeamAvailableMentor | null;
  onChooseMentor?: () => void;
  // Folds the caller's own "Preference N project" label into this
  // component's own heading row instead of a separate stacked line above
  // it — one less full-width row eating into the grid's vertical space.
  label?: string;
  /** Lets the caller drop its own back control while this one has a detail open. */
  onDetailOpenChange?: (open: boolean) => void;
}) {
  const { showError } = useToast();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  // Owned here, not inside DataTable, because opening a project replaces the
  // table entirely — the table can't keep a flag it is about to unmount with.
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);
  const [viewingDetail, setViewingDetail] = useState<ProjectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Detail of whichever project is currently the confirmed selection — kept
  // locally so the "Selected" summary always has a title, whether the pick
  // just happened or selectedId arrived already set (e.g. page reload).
  const [selectedDetail, setSelectedDetail] = useState<ProjectDetail | null>(null);
  const [browsingAfterSelect, setBrowsingAfterSelect] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetAvailableProjectsPage(cohortId, { page, limit, search: search || undefined, excludeId: excludeId ?? undefined });
      setProjects(res.data);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load projects');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [cohortId, page, limit, search, excludeId, showError]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Derived from the id rather than fired at each call site, so a detail
  // closed by selecting a project reports the same as one closed by the back
  // button. Reset on unmount too, or the caller keeps its back hidden after
  // this component goes away.
  useEffect(() => {
    onDetailOpenChange?.(viewingProjectId !== null);
    return () => onDetailOpenChange?.(false);
  }, [viewingProjectId, onDetailOpenChange]);

  useEffect(() => {
    if (!selectedId || selectedDetail?.id === selectedId) return;
    apiGetProjectDetail(cohortId, selectedId).then(setSelectedDetail).catch(() => {});
  }, [cohortId, selectedId, selectedDetail]);

  const openDetail = async (id: string) => {
    setViewingProjectId(id);
    setDetailLoading(true);
    try {
      setViewingDetail(await apiGetProjectDetail(cohortId, id));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load project details');
      setViewingProjectId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectFromDetail = () => {
    if (!viewingDetail) return;
    onSelect(viewingDetail.id);
    setSelectedDetail(viewingDetail);
    setViewingProjectId(null);
    setViewingDetail(null);
    setBrowsingAfterSelect(false);
  };

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchInputChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

  if (viewingProjectId) {
    const detailView = (
      <ProjectDetailView
        detail={viewingDetail}
        loading={detailLoading}
        onBack={() => { setViewingProjectId(null); setViewingDetail(null); }}
        onSelect={handleSelectFromDetail}
      />
    );
    // Asked for the whole screen, then clicked a row: the project you opened
    // is what you wanted the room for, so it opens in the same shell. Back
    // returns to the table, still expanded.
    return tableFullscreen ? (
      <FullscreenShell onExit={() => setTableFullscreen(false)}>{detailView}</FullscreenShell>
    ) : (
      detailView
    );
  }

  if (selectedId && !browsingAfterSelect) {
    return (
      <div className="group bg-zinc-850 border border-zinc-750 rounded-xl p-6 sm:p-8 space-y-4 transition-all duration-300 hover:border-gold/20 hover:shadow-lg hover:shadow-gold/5">
        <h2 className="text-white font-semibold flex items-center gap-3">
          <div className="p-2 rounded-lg bg-zinc-750 group-hover:bg-gold/10 transition-colors">
            <Briefcase size={18} className="text-gold" />
          </div>
          Recommended Project
        </h2>
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-green-400 text-xs font-semibold">
              <CheckCircle2 size={14} />
              Selected
            </div>
            <button type="button" onClick={() => setBrowsingAfterSelect(true)} className="text-xs text-gold hover:underline">
              Change project
            </button>
          </div>
          <p className="text-white font-bold">{selectedDetail?.title ?? '…'}</p>
          {selectedDetail?.problemStatement && <p className="text-gray-400 text-sm">{selectedDetail.problemStatement}</p>}
        </div>

        {onChooseMentor && (
          <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4 flex items-center justify-between gap-3">
            {selectedMentor ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <MentorAvatar name={selectedMentor.fullName} selected />
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Mentor</p>
                  <p className="text-white font-semibold text-sm truncate">{selectedMentor.fullName}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No mentor chosen yet.</p>
            )}
            <button
              type="button"
              onClick={onChooseMentor}
              className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-gold hover:bg-zinc-750 rounded-lg font-medium transition-colors shrink-0"
            >
              {selectedMentor ? 'Change mentor' : 'Choose mentor'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3">
      <div className="shrink-0 flex items-center gap-4 flex-wrap">
        <h2 className="text-white font-semibold flex items-center gap-3 shrink-0">
          <Briefcase size={18} className="text-gold" />
          {label ? `${label} — Recommended Projects` : 'Recommended Projects'}
        </h2>

        {browsingAfterSelect && (
          <>
            <span className="text-gray-700 shrink-0">|</span>
            <button type="button" onClick={() => setBrowsingAfterSelect(false)} className="text-sm text-gray-400 hover:text-white transition-colors shrink-0">
              ← Back to selected project
            </button>
          </>
        )}

      </div>

      {/* One table, not a grid of cards: the same fields in far less height,
          and DataTable already owns search, paging and the expand-to-full-
          screen control. Eighty projects are a list to scan, not a gallery. */}
      {/* Never swapped out for a spinner: unmounting the table throws away
          everything it holds, and the visible symptom was that changing page
          or page size while expanded quietly collapsed it back. The table
          dims itself instead. */}
      <DataTable<ProjectSummary>
        columns={PROJECT_COLUMNS}
        data={projects}
        loading={loading}
        fullscreen={tableFullscreen}
        onFullscreenChange={setTableFullscreen}
        searchPlaceholder="Search projects..."
        onSearchChange={handleSearchInputChange}
        onRowClick={p => openDetail(p.id)}
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          totalPages: pagination.totalPages,
          total: pagination.total,
          onPageChange: setPage,
          limitOptions: LIMIT_OPTIONS,
          onLimitChange: handleLimitChange,
        }}
      />
    </div>
  );
}

// Read-only full detail for one catalog project — every field the student
// asked to see before committing, nothing else (no industry/theme/level/
// estimated duration — those are admin-facing catalog metadata, not part of
// what a student needs to decide).
function ProjectDetailView({
  detail,
  loading,
  onBack,
  onSelect,
}: {
  detail: ProjectDetail | null;
  loading: boolean;
  onBack: () => void;
  onSelect: () => void;
}) {
  if (loading || !detail) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Back to projects
        </button>
        <div className="min-h-[30vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      </div>
    );
  }

  const textField = (label: string, value?: string) =>
    value ? (
      <div>
        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{label}</p>
        <p className="text-gray-300 text-sm whitespace-pre-wrap">{value}</p>
      </div>
    ) : null;
  const listField = (label: string, values: string[]) =>
    values.length > 0 ? (
      <div>
        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{label}</p>
        <p className="text-gray-300 text-sm">{values.join(', ')}</p>
      </div>
    ) : null;

  return (
    <div className="h-full min-h-0 flex flex-col space-y-4">
      <button type="button" onClick={onBack} className="shrink-0 text-sm text-gray-400 hover:text-white transition-colors">
        ← Back to projects
      </button>

      <div className="flex-1 min-h-0 bg-zinc-850 border border-zinc-750 rounded-xl flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-4 px-6 sm:px-8 pt-6 sm:pt-8 pb-4 border-b border-zinc-750">
          <h2 className="text-white font-bold text-xl">{detail.title}</h2>
          <button
            type="button"
            onClick={onSelect}
            className="shrink-0 flex items-center justify-center gap-1.5 text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg shadow-md hover:bg-gold-hover transition-all duration-200"
          >
            <CheckCircle2 size={16} />
            Select this project
          </button>
        </div>

        <div className="flex-1 min-h-0 p-6 sm:p-8 space-y-6 overflow-y-auto">
          <div className="space-y-3">
            <p className="text-xs text-gold uppercase font-bold tracking-wider">Overview</p>
            {textField('Problem statement', detail.problemStatement)}
            {textField('Project description (short)', detail.projectDescription)}
            {textField('Description (detailed)', detail.description)}
            {textField('End users defined', detail.endUsersDefined)}
          </div>

          {(detail.recommendedMentors?.length || detail.partners?.length) && (
            <div className="space-y-3">
              <p className="text-xs text-gold uppercase font-bold tracking-wider">Mentors & partners</p>

              {detail.recommendedMentors && detail.recommendedMentors.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1.5">Recommended mentors</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.recommendedMentors.map(mentor => (
                      <span
                        key={mentor.mentorId}
                        className="inline-flex items-center gap-1.5 text-sm text-gray-200 bg-zinc-800 border border-zinc-750 rounded-lg px-2.5 py-1"
                      >
                        <UserCheck size={13} className="text-gold shrink-0" />
                        {mentor.fullName ?? '—'}
                        {mentor.organization && <span className="text-gray-500 text-xs">· {mentor.organization}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detail.partners && detail.partners.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1.5">Partners</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {detail.partners.map(partner => (
                      <span
                        key={partner.name}
                        title={partner.name}
                        className="inline-flex items-center gap-2 bg-white/90 rounded-lg px-2.5 py-1.5"
                      >
                        {/* No logo when the stored name matches no known
                            partner — the name still shows, so a sheet typo
                            reads as a missing image rather than a lost partner. */}
                        {partner.logoUrl ? (
                          <img src={partner.logoUrl} alt={partner.name} className="h-5 max-w-[96px] object-contain" loading="lazy" />
                        ) : (
                          <span className="text-xs font-semibold text-zinc-800">{partner.name}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs text-gold uppercase font-bold tracking-wider">Scope</p>
            {listField('Tech stack', detail.techStack)}
            {listField('Framework', detail.framework)}
            {listField('Suggested libraries', detail.suggestedLibrariesTools)}
            {listField('Core learning goals', detail.coreLearningGoals)}
          </div>

          <div className="space-y-3">
            <p className="text-xs text-gold uppercase font-bold tracking-wider">Features & evaluation</p>
            {listField('Must-have features', detail.mustHaveFeatures)}
            {listField('Good-to-have features', detail.goodToHaveFeatures)}
            {listField('Expected output', detail.expectedOutput)}
            {listField('Evaluation metrics', detail.evaluationMetrics)}
            {listField('Stretch goal', detail.stretchGoal)}
          </div>

          <div className="space-y-3">
            <p className="text-xs text-gold uppercase font-bold tracking-wider">Milestones</p>
            {listField('First month', detail.firstMonthMilestones)}
            {listField('Second month', detail.secondMonthMilestones)}
            {listField('Third month', detail.thirdMonthMilestones)}
          </div>

          {detail.referenceDocs && (
            <div className="space-y-3">
              <p className="text-xs text-gold uppercase font-bold tracking-wider">Reference docs</p>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">{detail.referenceDocs}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Reusable "propose your own project" form — used both for the initial
// preference-1 pick (ProjectSelectionScreen) and for resubmitting a fresh
// preference-1 after a mentor rejection (ResubmitPreference1Panel).
function SelfProjectProposer({
  cohortId,
  selfProject,
  onCreated,
  selectedMentor,
  onChooseMentor,
  initialValues,
}: {
  cohortId: string;
  selfProject: TeamProject | null;
  onCreated: (project: TeamProject) => void;
  // Omitted by callers where the mentor isn't pickable here at all (e.g.
  // ResubmitPreference1Panel, where the mentor is fixed/read-only and shown
  // separately) — the mentor-status block below only renders when present.
  selectedMentor?: TeamAvailableMentor | null;
  onChooseMentor?: () => void;
  // The student's previously-rejected proposal, when resubmitting — seeds
  // the form so they're editing what they already wrote instead of retyping
  // it, since only the mentor-flagged parts usually need to change.
  initialValues?: Project | null;
}) {
  const { showError, showSuccess } = useToast();
  const [proposing, setProposing] = useState(false);
  const toCommaList = (values?: string[]) => values?.join(', ') ?? '';
  // Only pre-expand if the earlier submission actually used one of these —
  // an empty optional section shouldn't force itself open on resubmit.
  const hasInitialOptionalData = !!(
    initialValues?.endUsersDefined ||
    initialValues?.projectDescription ||
    initialValues?.framework?.length ||
    initialValues?.suggestedLibrariesTools?.length ||
    initialValues?.stretchGoal?.length ||
    initialValues?.firstMonthMilestones?.length ||
    initialValues?.secondMonthMilestones?.length ||
    initialValues?.thirdMonthMilestones?.length ||
    initialValues?.theme ||
    initialValues?.referenceDocs ||
    initialValues?.estimatedDuration ||
    initialValues?.sourceStartupSchool
  );
  const [showMore, setShowMore] = useState(hasInitialOptionalData);
  const [form, setForm] = useState({
    // Required (studentProposeProjectSchema on the backend)
    title: initialValues?.title ?? '',
    description: initialValues?.description ?? '',
    problemStatement: initialValues?.problemStatement ?? '',
    techStack: toCommaList(initialValues?.techStack),
    courseCovered: toCommaList(initialValues?.courseCovered),
    coreLearningGoals: toCommaList(initialValues?.coreLearningGoals),
    expectedOutput: toCommaList(initialValues?.expectedOutput),
    industry: initialValues?.industry ?? '',
    mustHaveFeatures: toCommaList(initialValues?.mustHaveFeatures),
    goodToHaveFeatures: toCommaList(initialValues?.goodToHaveFeatures),
    evaluationMetrics: toCommaList(initialValues?.evaluationMetrics),
    // Optional
    endUsersDefined: initialValues?.endUsersDefined ?? '',
    projectDescription: initialValues?.projectDescription ?? '',
    framework: toCommaList(initialValues?.framework),
    suggestedLibrariesTools: toCommaList(initialValues?.suggestedLibrariesTools),
    stretchGoal: toCommaList(initialValues?.stretchGoal),
    firstMonthMilestones: toCommaList(initialValues?.firstMonthMilestones),
    secondMonthMilestones: toCommaList(initialValues?.secondMonthMilestones),
    thirdMonthMilestones: toCommaList(initialValues?.thirdMonthMilestones),
    theme: initialValues?.theme ?? '',
    referenceDocs: initialValues?.referenceDocs ?? '',
    estimatedDuration: initialValues?.estimatedDuration ? String(initialValues.estimatedDuration) : '',
    sourceStartupSchool: initialValues?.sourceStartupSchool ?? '',
  });

  const setField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const requiredFilled =
    form.title.trim() &&
    form.description.trim() &&
    form.problemStatement.trim() &&
    form.techStack.trim() &&
    form.courseCovered.trim() &&
    form.coreLearningGoals.trim() &&
    form.expectedOutput.trim() &&
    form.industry.trim() &&
    form.mustHaveFeatures.trim() &&
    form.goodToHaveFeatures.trim() &&
    form.evaluationMetrics.trim();

  const toList = (raw: string) => raw.split(',').map(t => t.trim()).filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requiredFilled) return;
    setProposing(true);
    try {
      const created = await apiProposeProject(cohortId, {
        title: form.title.trim(),
        description: form.description.trim(),
        problemStatement: form.problemStatement.trim(),
        techStack: toList(form.techStack),
        courseCovered: toList(form.courseCovered),
        coreLearningGoals: toList(form.coreLearningGoals),
        expectedOutput: toList(form.expectedOutput),
        industry: form.industry.trim(),
        mustHaveFeatures: toList(form.mustHaveFeatures),
        goodToHaveFeatures: toList(form.goodToHaveFeatures),
        evaluationMetrics: toList(form.evaluationMetrics),
        endUsersDefined: form.endUsersDefined.trim() || undefined,
        projectDescription: form.projectDescription.trim() || undefined,
        framework: form.framework.trim() ? toList(form.framework) : undefined,
        suggestedLibrariesTools: form.suggestedLibrariesTools.trim() ? toList(form.suggestedLibrariesTools) : undefined,
        stretchGoal: form.stretchGoal.trim() ? toList(form.stretchGoal) : undefined,
        firstMonthMilestones: form.firstMonthMilestones.trim() ? toList(form.firstMonthMilestones) : undefined,
        secondMonthMilestones: form.secondMonthMilestones.trim() ? toList(form.secondMonthMilestones) : undefined,
        thirdMonthMilestones: form.thirdMonthMilestones.trim() ? toList(form.thirdMonthMilestones) : undefined,
        theme: form.theme.trim() || undefined,
        referenceDocs: form.referenceDocs.trim() || undefined,
        estimatedDuration: form.estimatedDuration.trim() ? Number(form.estimatedDuration) : undefined,
        sourceStartupSchool: form.sourceStartupSchool.trim() || undefined,
      });
      onCreated(created);
      showSuccess('Self project created.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create self project');
    } finally {
      setProposing(false);
    }
  };

  const inputClass = 'w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold';

  return (
    <div className="group bg-zinc-850 border border-zinc-750 rounded-xl p-6 sm:p-8 space-y-6 transition-all duration-300 hover:border-gold/20 hover:shadow-lg hover:shadow-gold/5">
      <h2 className="text-white font-semibold flex items-center gap-3">
        <div className="p-2 rounded-lg bg-zinc-750 group-hover:bg-gold/10 transition-colors">
          <Sparkles size={18} className="text-gold" />
        </div>
        Self Project
      </h2>

      {selfProject ? (
        <div className="space-y-3">
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-green-400 text-xs font-semibold">
              <CheckCircle2 size={14} />
              Selected
            </div>
            <p className="text-white font-bold">{selfProject.title}</p>
            {selfProject.description && <p className="text-gray-400 text-sm">{selfProject.description}</p>}
          </div>

          {onChooseMentor && (
            <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4 flex items-center justify-between gap-3">
              {selectedMentor ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <MentorAvatar name={selectedMentor.fullName} selected />
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Mentor</p>
                    <p className="text-white font-semibold text-sm truncate">{selectedMentor.fullName}</p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No mentor chosen yet.</p>
              )}
              <button
                type="button"
                onClick={onChooseMentor}
                className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-gold hover:bg-zinc-750 rounded-lg font-medium transition-colors shrink-0"
              >
                {selectedMentor ? 'Change mentor' : 'Choose mentor'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs text-gold uppercase font-bold tracking-wider">Overview</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="text" required placeholder="Project title" value={form.title} onChange={setField('title')} className={inputClass} />
              <input type="text" required placeholder="Industry" value={form.industry} onChange={setField('industry')} className={inputClass} />
            </div>
            <textarea required placeholder="Description (detailed)" value={form.description} onChange={setField('description')} rows={2} className={`${inputClass} resize-none`} />
            <textarea required placeholder="Problem statement" value={form.problemStatement} onChange={setField('problemStatement')} rows={2} className={`${inputClass} resize-none`} />
          </div>

          <div className="space-y-3">
            <p className="text-xs text-gold uppercase font-bold tracking-wider">Scope</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input type="text" required placeholder="Tech stack (comma separated)" value={form.techStack} onChange={setField('techStack')} className={inputClass} />
              <input type="text" required placeholder="Course(s) covered (comma separated)" value={form.courseCovered} onChange={setField('courseCovered')} className={inputClass} />
              <input type="text" required placeholder="Core learning goals (comma separated)" value={form.coreLearningGoals} onChange={setField('coreLearningGoals')} className={inputClass} />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-gold uppercase font-bold tracking-wider">Features & evaluation</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <textarea required placeholder="Must-have features (comma separated)" value={form.mustHaveFeatures} onChange={setField('mustHaveFeatures')} rows={2} className={`${inputClass} resize-none`} />
              <textarea required placeholder="Good-to-have features (comma separated)" value={form.goodToHaveFeatures} onChange={setField('goodToHaveFeatures')} rows={2} className={`${inputClass} resize-none`} />
              <textarea required placeholder="Expected output (comma separated)" value={form.expectedOutput} onChange={setField('expectedOutput')} rows={2} className={`${inputClass} resize-none`} />
              <textarea required placeholder="Evaluation metrics (comma separated)" value={form.evaluationMetrics} onChange={setField('evaluationMetrics')} rows={2} className={`${inputClass} resize-none`} />
            </div>
          </div>

          <button type="button" onClick={() => setShowMore(s => !s)} className="text-xs text-gold hover:underline">
            {showMore ? 'Hide optional details' : '+ Add optional details (end users, milestones...)'}
          </button>

          {showMore && (
            <div className="space-y-3 border-t border-zinc-800 pt-4">
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Optional details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" placeholder="End users" value={form.endUsersDefined} onChange={setField('endUsersDefined')} className={inputClass} />
                <input type="text" placeholder="Theme" value={form.theme} onChange={setField('theme')} className={inputClass} />
                <input type="text" placeholder="Framework (comma separated)" value={form.framework} onChange={setField('framework')} className={inputClass} />
                <input type="text" placeholder="Suggested libraries / tools (comma separated)" value={form.suggestedLibrariesTools} onChange={setField('suggestedLibrariesTools')} className={inputClass} />
                <input type="number" min={1} max={52} placeholder="Estimated duration (weeks)" value={form.estimatedDuration} onChange={setField('estimatedDuration')} className={inputClass} />
                <input type="text" placeholder="Source / Startup School" value={form.sourceStartupSchool} onChange={setField('sourceStartupSchool')} className={inputClass} />
                <input type="text" placeholder="Reference docs (links / notes)" value={form.referenceDocs} onChange={setField('referenceDocs')} className={inputClass} />
              </div>
              <textarea placeholder="Short project description" value={form.projectDescription} onChange={setField('projectDescription')} rows={2} className={`${inputClass} resize-none`} />
              <textarea placeholder="Stretch goal (comma separated)" value={form.stretchGoal} onChange={setField('stretchGoal')} rows={2} className={`${inputClass} resize-none`} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input type="text" placeholder="1st month milestones (comma separated)" value={form.firstMonthMilestones} onChange={setField('firstMonthMilestones')} className={inputClass} />
                <input type="text" placeholder="2nd month milestones (comma separated)" value={form.secondMonthMilestones} onChange={setField('secondMonthMilestones')} className={inputClass} />
                <input type="text" placeholder="3rd month milestones (comma separated)" value={form.thirdMonthMilestones} onChange={setField('thirdMonthMilestones')} className={inputClass} />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={proposing || !requiredFilled}
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
          >
            <Plus size={16} />
            {proposing ? 'Creating...' : 'Create Self Project'}
          </button>
        </form>
      )}
    </div>
  );
}

// A fresh preference-1 after a mentor rejection. The student can EITHER
// propose a new own project (goes back to that same mentor for review) OR
// pick a recommended catalog project (approved immediately) — but they can
// NOT change the mentor here; it stays whoever reviewed. Preference 2 is
// untouched; only preference 1 is ever replaced this way.
// Which project types are acceptable here is dictated by the mentor's
// decision, not a free student choice — 'own_only' (Resubmit) only shows the
// self-proposal form, 'catalog_only' (Return) only shows the catalog browser.
function ResubmitPreference1Panel({
  cohortId,
  mode,
  pref1MentorName,
  preference2Id,
  rejectedProject,
  onResubmitted,
}: {
  cohortId: string;
  mode: PreferenceResubmissionMode;
  pref1MentorName: string | null;
  preference2Id: string | null;
  // The rejected proposal's own data, only relevant for 'own_only' — seeds
  // SelfProjectProposer so the student edits what they already wrote.
  rejectedProject: Project | null;
  onResubmitted: () => void;
}) {
  const { showError, showSuccess } = useToast();
  const [newProject, setNewProject] = useState<TeamProject | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleResubmitOwn = async () => {
    if (!newProject) return;
    setSubmitting(true);
    try {
      await apiResubmitPreference1(cohortId, newProject.id);
      showSuccess('New proposal submitted for review.');
      onResubmitted();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to resubmit your project preference');
      setSubmitting(false);
    }
  };

  // The catalog browser's "Select this project" is itself the confirming
  // action here (mentor is fixed, nothing else to combine it with) — so
  // picking one submits immediately instead of needing a separate button.
  const handleSelectFromCatalog = async (projectId: string) => {
    setSelectedCatalogId(projectId);
    setSubmitting(true);
    try {
      await apiResubmitPreference1(cohortId, projectId);
      showSuccess('Recommended project selected.');
      onResubmitted();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to select this project');
      setSubmitting(false);
      setSelectedCatalogId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mentor stays the same — shown read-only so it's clear it can't change. */}
      <div className="flex items-center gap-2 text-sm bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2">
        <UserCheck size={15} className="text-gold shrink-0" />
        <span className="text-gray-400">Selected mentor:</span>
        <span className="text-white font-medium">{pref1MentorName ?? '—'}</span>
      </div>

      {mode === 'own_only' ? (
        <>
          <SelfProjectProposer
            cohortId={cohortId}
            selfProject={newProject}
            onCreated={setNewProject}
            initialValues={rejectedProject}
          />
          <button
            onClick={handleResubmitOwn}
            disabled={!newProject || submitting}
            className="py-3 px-6 bg-gold text-black font-semibold rounded-lg shadow-xl shadow-black/40 hover:bg-gold-hover hover:shadow-lg hover:shadow-gold/10 transition-all duration-200 disabled:opacity-40 disabled:hover:shadow-none"
          >
            {submitting ? 'Submitting...' : 'Resubmit for Review'}
          </button>
        </>
      ) : (
        <ProjectCatalogBrowser
          cohortId={cohortId}
          selectedId={selectedCatalogId}
          onSelect={handleSelectFromCatalog}
          excludeId={preference2Id}
        />
      )}
    </div>
  );
}

// ── Step 6: read-only summary once preferences are submitted ────────────────
// Preference 1's own-project status can be pending_review, rejected (with a
// resubmit form shown below), or approved — preference 2 (always a catalog
// pick) is locked in from the moment of submission regardless.

const REVIEW_BANNER: Record<PreferenceReviewStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  approved: { icon: CheckCircle2, className: 'text-green-400', label: 'Your selections are locked in' },
  pending_review: { icon: Clock, className: 'text-amber-400', label: 'Preference 1 is under review by your mentor' },
  rejected: { icon: RotateCcw, className: 'text-amber-400', label: 'Preference 1 needs resubmission — see below' },
};

function SummaryScreen({
  cohortId,
  team,
  preferences,
  availableMentors,
  onResubmitted,
}: {
  cohortId: string;
  team: { name: string | null; track: string; members: { studentId: string; fullName: string | null }[] };
  preferences: {
    preference1Id: string;
    // Null when the track allowed a single-preference submission.
    preference2Id: string | null;
    preference1MentorId: string | null;
    preference2MentorId: string | null;
    allocationStatus: 'pending' | 'allocated' | 'needs_review';
    allocatedProjectId: string | null;
    allocatedMentorId: string | null;
    allocatedMentorName: string | null;
    preference1ReviewStatus: PreferenceReviewStatus;
    preference1ReviewNote: string | null;
    preference1ResubmissionMode: PreferenceResubmissionMode | null;
  };
  availableMentors: TeamAvailableMentor[];
  onResubmitted: () => void;
}) {
  const mentor1 = availableMentors.find(m => m.id === preferences.preference1MentorId) ?? null;
  const mentor2 = availableMentors.find(m => m.id === preferences.preference2MentorId) ?? null;
  const { tracks } = useTracks();
  const teamTrackName = tracks.find(t => t.slug === team.track)?.name ?? team.track;
  // Rejected rows from before this mode split existed have no resubmission
  // mode recorded — default to 'own_only' (the old flow's own primary path).
  const resubmissionMode: PreferenceResubmissionMode = preferences.preference1ResubmissionMode ?? 'own_only';
  const [selfProject, setSelfProject] = useState<Project | null>(null);
  const [existingProject, setExistingProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  // Resubmit form stays collapsed behind an explicit button next to the
  // mentor's note, instead of dumping the full form the moment a rejection
  // loads — re-collapses whenever a fresh decision lands (a later round of
  // reject/resubmit shouldn't inherit the previous round's expanded state).
  const [showResubmitForm, setShowResubmitForm] = useState(false);
  useEffect(() => {
    setShowResubmitForm(false);
  }, [preferences.preference1ReviewStatus, preferences.preference1ResubmissionMode]);

  useEffect(() => {
    fetchedRef.current = false;
  }, [preferences.preference1Id]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    (async () => {
      try {
        // A single-preference submission has no second project to fetch.
        const [self, existing] = await Promise.all([
          apiGetProject(preferences.preference1Id),
          preferences.preference2Id ? apiGetProject(preferences.preference2Id) : Promise.resolve(null),
        ]);
        setSelfProject(self);
        setExistingProject(existing);
      } finally {
        setLoading(false);
      }
    })();
  }, [preferences.preference1Id, preferences.preference2Id]);

  const banner = REVIEW_BANNER[preferences.preference1ReviewStatus];
  const BannerIcon = banner.icon;
  const isRejected = preferences.preference1ReviewStatus === 'rejected';
  const isPending = preferences.preference1ReviewStatus === 'pending_review';

  const isAllocated = preferences.allocationStatus === 'allocated';
  const allocatedProjectTitle =
    preferences.allocatedProjectId === selfProject?.id
      ? selfProject?.title
      : preferences.allocatedProjectId === existingProject?.id
      ? existingProject?.title
      : null;

  // A dedicated page, not a section appended below the summary — same
  // pattern as ProjectDetailView replacing the browse grid instead of
  // stacking underneath it.
  if (isRejected && showResubmitForm) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowResubmitForm(false)}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Submit a new preference 1</h1>
          <p className="text-gray-400 text-sm mt-1">
            {resubmissionMode === 'catalog_only'
              ? 'Your mentor returned this to catalog selection — pick a recommended project below. Your mentor stays the same.'
              : 'Your mentor asked for a revised self-proposal — submit an updated version below. Your mentor stays the same.'}
          </p>
        </div>
        <ResubmitPreference1Panel
          cohortId={cohortId}
          mode={resubmissionMode}
          pref1MentorName={mentor1?.fullName ?? null}
          preference2Id={preferences.preference2Id}
          rejectedProject={selfProject}
          onResubmitted={onResubmitted}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!loading && (
        <div
          className={`rounded-xl p-6 ${
            isAllocated ? 'bg-gold/10 border border-gold' : 'bg-zinc-850 border border-zinc-750'
          }`}
        >
          {isAllocated ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-gold">
                <Sparkles size={16} />
                You've been allocated!
              </div>
              <p className="text-white font-semibold text-lg">{allocatedProjectTitle ?? 'Project'}</p>
              {preferences.allocatedMentorName && (
                <p className="text-gray-300 text-sm">Mentor: {preferences.allocatedMentorName}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-400">
              <Clock size={16} />
              Waiting for allocation results — your admin hasn't published them yet.
            </div>
          )}
        </div>
      )}

      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-6 space-y-4">
        <div className={`flex items-center gap-2 text-sm font-semibold ${banner.className}`}>
          <BannerIcon size={16} />
          {banner.label}
        </div>

        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Track</p>
            <span className="text-xs px-2.5 py-1 rounded-full bg-gold/10 text-gold font-medium">{teamTrackName}</span>
          </div>

          {team.name && (
            <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Group</p>
              <span className="text-xs px-2.5 py-1 rounded-full bg-gold/10 text-gold font-medium tracking-wider">{team.name}</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Team</p>
          <div className="flex flex-wrap gap-2">
            {team.members.map(m => (
              <span key={m.studentId} className="text-sm px-2.5 py-1 rounded-full bg-zinc-750 text-white font-medium">
                {m.fullName}
              </span>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-6 flex justify-center"><SpinnerSquare size={32} /></div>
        ) : isAllocated ? null : (
          <>
            <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">
                {selfProject?.projectBy === 'STUDENT' ? 'Self Project' : 'Recommended Project'} (Preference 1)
              </p>
              <div className="flex items-center gap-2">
                <p className="text-white font-semibold">{selfProject?.title}</p>
                {isPending && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-semibold uppercase tracking-wider">
                    Under Review
                  </span>
                )}
                {isRejected && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-semibold uppercase tracking-wider">
                    Resubmit
                  </span>
                )}
              </div>
              {isRejected && preferences.preference1ReviewNote && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 mt-2">
                  <p className="text-[10px] text-amber-400 uppercase font-bold tracking-wider">Mentor's note</p>
                  <p className="text-white text-sm mt-0.5">{preferences.preference1ReviewNote}</p>
                </div>
              )}
              {isRejected && !showResubmitForm && (
                <button
                  type="button"
                  onClick={() => setShowResubmitForm(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 mt-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold rounded-lg hover:bg-amber-500/20 transition-colors"
                >
                  <RotateCcw size={13} />
                  {resubmissionMode === 'catalog_only' ? 'Pick a recommended project' : 'Review and resubmit'}
                </button>
              )}
            </div>
            {/* Absent entirely on a single-preference track — not an empty slot. */}
            {preferences.preference2Id && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">
                  {existingProject?.projectBy === 'STUDENT' ? 'Self Project' : 'Recommended Project'} (Preference 2)
                </p>
                <p className="text-white font-semibold">{existingProject?.title}</p>
              </div>
            )}
          </>
        )}
      </div>

      {!isAllocated && (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-white text-sm font-semibold">
            <UserCheck size={16} className="text-gold" />
            Mentor selection
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Preference 1 mentor</p>
              {mentor1 ? (
                <div className="flex items-center gap-2">
                  <MentorAvatar name={mentor1.fullName} selected />
                  <p className="text-white font-semibold">{mentor1.fullName}</p>
                </div>
              ) : (
                <p className="text-white font-semibold">—</p>
              )}
            </div>
            {preferences.preference2Id && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Preference 2 mentor</p>
                {mentor2 ? (
                  <div className="flex items-center gap-2">
                    <MentorAvatar name={mentor2.fullName} selected />
                    <p className="text-white font-semibold">{mentor2.fullName}</p>
                  </div>
                ) : (
                  <p className="text-white font-semibold">—</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
