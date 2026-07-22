import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Briefcase, Users, Clock, CheckCircle2, XCircle, Search, Layers, Sparkles, Plus, UserCheck } from 'lucide-react';
import SpinnerSquare from '../../components/SpinnerSquare';
import { TRACKS } from '../../lib/constants';
import type { MyTeamStatus, AvailableTeammate, TeamProject, TeamAvailableMentor, Project, PreferenceReviewStatus, ProjectLevel } from '../../lib/types';
import {
  apiGetMyCohort,
  apiGetMyTeamStatus,
  apiGetAvailableTeammates,
  apiSendTeamRequest,
  apiRespondToTeamRequest,
  apiRevokeTeamRequest,
  apiCreateIndividualTeam,
  apiGetAvailableProjects,
  apiGetAvailableMentors,
  apiProposeProject,
  apiSubmitProjectPreferences,
  apiResubmitPreference1,
  apiGetProject,
} from '../../lib/api';
import { useToast } from '../../toast';

const POLL_INTERVAL_MS = 15_000;

function useCountdown(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) return { label: '', expired: true };
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) return { label: 'Expired', expired: true };
  const totalSeconds = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { label: `${h}h ${m}m ${s}s`, expired: false };
}

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
    (async () => {
      setLoading(true);
      try {
        const cohort = await apiGetMyCohort();
        setCohortId(cohort.cohortId);
        await refreshStatus(cohort.cohortId);
      } catch (err) {
        setCohortError(err instanceof Error ? err.message : 'Failed to load your cohort');
      } finally {
        setLoading(false);
      }
    })();
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

  // While waiting on the other party, poll so acceptance/rejection/expiry
  // reflect without the student having to manually reload.
  const isWaiting = !!status?.pendingSentRequest || !!status?.pendingReceivedRequest;
  useEffect(() => {
    if (!cohortId || !isWaiting) return;
    const id = setInterval(() => refreshStatus(cohortId), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [cohortId, isWaiting, refreshStatus]);

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Briefcase size={24} className="text-gold" />
          Select Project
        </h1>
        <p className="text-gray-400 text-sm mt-1">Pick a track, team up, and lock in your projects.</p>
      </div>

      {(status?.pendingReceivedRequests && status.pendingReceivedRequests.length > 0) ? (
        <div className="space-y-4">
          <h2 className="text-white font-semibold">Pending Team Invites ({status.pendingReceivedRequests.length})</h2>
          {status.pendingReceivedRequests.map((req) => (
            <IncomingRequestScreen
              key={req.id}
              request={req}
              onDecide={async (action) => {
                try {
                  await apiRespondToTeamRequest(req.id, action);
                  showSuccess(action === 'accept' ? 'Team formed!' : 'Request rejected.');
                  await refreshStatus(cohortId);
                } catch (err) {
                  showError(err instanceof Error ? err.message : 'Failed to respond to request');
                }
              }}
            />
          ))}
        </div>
      ) : status?.team ? (
        status.projectPreferences ? (
          <SummaryScreen
            cohortId={cohortId}
            team={status.team}
            preferences={status.projectPreferences}
            availableMentors={availableMentors}
            mentorsLoading={mentorsLoading}
            onResubmitted={() => refreshStatus(cohortId)}
          />
        ) : (
          <ProjectSelectionScreen
            cohortId={cohortId}
            availableProjects={availableProjects}
            projectsLoading={projectsLoading}
            availableMentors={availableMentors}
            mentorsLoading={mentorsLoading}
            onSubmitted={() => refreshStatus(cohortId)}
          />
        )
      ) : (
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
      )}
    </div>
  );
}

// ── Step 1 & 2: pick a track, then a teammate ────────────────────────────────

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
  const [teammates, setTeammates] = useState<AvailableTeammate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [creatingIndividual, setCreatingIndividual] = useState(false);

  const SEND_QUOTA = 3;
  const invitedIds = useMemo(() => new Set(pendingSentRequests.map(r => r.receiverId)), [pendingSentRequests]);
  const quotaFull = pendingSentRequests.length >= SEND_QUOTA;

  const fetchTeammates = useCallback(async () => {
    if (!canInviteTeammate) return;
    setLoading(true);
    try {
      const res = await apiGetAvailableTeammates(cohortId);
      setTeammates(res);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load available teammates');
      setTeammates([]);
    } finally {
      setLoading(false);
    }
  }, [cohortId, canInviteTeammate, showError]);

  const handlePickTrack = useCallback(async (t: string) => {
    setTrack(t);
    await fetchTeammates();
  }, [fetchTeammates]);

  // Covers resuming with a track already implied by pending invites (see
  // the initial state above) — handlePickTrack only fires from the picker
  // click, so a reload with existing invites needs its own fetch trigger.
  const teammatesFetchedRef = useRef(false);
  useEffect(() => {
    if (!track || teammatesFetchedRef.current) return;
    teammatesFetchedRef.current = true;
    fetchTeammates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

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

  const filteredTeammates = teammates.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return t.fullName?.toLowerCase().includes(q) || t.rollNumber?.toLowerCase().includes(q);
  });

  if (!track) {
    return (
      <div className="space-y-4">
        <h2 className="text-white font-semibold">Choose your track</h2>
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
      </div>
    );
  }

  if (!canInviteTeammate) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setTrack(null)} className="text-sm text-gray-400 hover:text-white transition-colors">
            Change track
          </button>
          <span className="text-xs px-2.5 py-1 rounded-full bg-gold/10 text-gold font-medium">{track}</span>
        </div>

        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-8 text-center space-y-4">
          <Sparkles size={32} className="mx-auto text-gold" />
          <h2 className="text-white font-bold text-lg">You're on an individual project</h2>
          <p className="text-gray-400 text-sm">
            Students in your batch complete this OJT individually and can't invite a teammate.
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
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setTrack(null)}
          disabled={pendingSentRequests.length > 0}
          title={pendingSentRequests.length > 0 ? 'Revoke your pending invites first to change track' : undefined}
          className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40 disabled:hover:text-gray-400"
        >
          Change track
        </button>
        <span className="text-xs px-2.5 py-1 rounded-full bg-gold/10 text-gold font-medium">{track}</span>
      </div>

      {pendingSentRequests.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Clock size={18} className="text-gold" />
            Pending Invites ({pendingSentRequests.length}/{SEND_QUOTA})
          </h2>
          <div className="space-y-2">
            {pendingSentRequests.map(req => (
              <PendingSentInviteCard key={req.id} request={req} onRevoke={() => onRevoke(req.id)} />
            ))}
          </div>
        </div>
      )}

      <h2 className="text-white font-semibold flex items-center gap-2">
        <Users size={18} className="text-gold" />
        Choose your teammate
      </h2>

      {quotaFull && (
        <p className="text-xs text-gray-500">
          You've reached your invite limit ({SEND_QUOTA}/{SEND_QUOTA}). Revoke one above to invite someone else.
        </p>
      )}

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name or roll number..."
          className="w-full bg-zinc-850 border border-zinc-750 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
        />
      </div>

      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeammates.map(t => {
            const alreadyInvited = invitedIds.has(t.studentId);
            return (
              <div
                key={t.studentId}
                className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-white font-semibold">{t.fullName}</p>
                  <p className="text-gray-500 text-xs">{t.rollNumber} · {t.batch}</p>
                </div>
                <button
                  onClick={() => handleSendRequest(t)}
                  disabled={sendingTo === t.studentId || alreadyInvited || (quotaFull && !alreadyInvited)}
                  className="text-xs px-3 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
                >
                  {sendingTo === t.studentId ? 'Sending...' : alreadyInvited ? 'Pending' : 'Invite'}
                </button>
              </div>
            );
          })}
          {filteredTeammates.length === 0 && (
            <div className="col-span-full bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center">
              <Users size={40} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-400">No available teammates right now.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 3: waiting on the invite you sent ───────────────────────────────────

// Compact — several of these can be stacked at once, up to the 3-invite quota.
function PendingSentInviteCard({
  request,
  onRevoke,
}: {
  request: { id: string; receiverName: string | null; track: string; expiresAt: string };
  onRevoke: () => Promise<void>;
}) {
  const { label, expired } = useCountdown(request.expiresAt);
  const [revoking, setRevoking] = useState(false);

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await onRevoke();
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Clock size={18} className="text-gold shrink-0" />
        <div>
          <p className="text-white text-sm">
            Waiting for <span className="font-semibold">{request.receiverName}</span>
          </p>
          <p className="text-xs text-gray-500">
            {expired ? 'Expired' : `Expires in ${label}`}
          </p>
        </div>
      </div>
      <button
        onClick={handleRevoke}
        disabled={revoking}
        className="text-xs px-3 py-1.5 bg-zinc-750 hover:bg-zinc-700 text-red-400 font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0"
      >
        {revoking ? 'Revoking...' : 'Revoke'}
      </button>
    </div>
  );
}

// ── Step 3b: someone invited you ─────────────────────────────────────────────

function IncomingRequestScreen({
  request,
  onDecide,
}: {
  request: { senderName: string | null; track: string; expiresAt: string };
  onDecide: (action: 'accept' | 'reject') => void;
}) {
  const { label, expired } = useCountdown(request.expiresAt);
  const [deciding, setDeciding] = useState(false);

  const handleDecide = async (action: 'accept' | 'reject') => {
    setDeciding(true);
    try {
      await onDecide(action);
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-8 text-center space-y-4">
      <Users size={32} className="mx-auto text-gold" />
      <h2 className="text-white font-bold text-lg">Team Invite</h2>
      <p className="text-gray-400 text-sm">
        <span className="text-white font-medium">{request.senderName}</span> invited you to team up for{' '}
        <span className="text-gold">{request.track}</span>.
      </p>
      <p className="text-xs text-gray-500">
        {expired ? 'This invite has expired.' : `Expires in ${label}`}
      </p>
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          onClick={() => handleDecide('reject')}
          disabled={deciding}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <XCircle size={16} />
          Reject
        </button>
        <button
          onClick={() => handleDecide('accept')}
          disabled={deciding}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
        >
          <CheckCircle2 size={16} />
          Accept
        </button>
      </div>
    </div>
  );
}

// ── Step 4 & 5: team picks how to fill its 2 project preferences ────────────

type SelectionMode = 'own-existing' | 'two-existing';

function ProjectSelectionScreen({
  cohortId,
  availableProjects,
  projectsLoading,
  availableMentors,
  mentorsLoading,
  onSubmitted,
}: {
  cohortId: string;
  availableProjects: TeamProject[];
  projectsLoading: boolean;
  availableMentors: TeamAvailableMentor[];
  mentorsLoading: boolean;
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

  useEffect(() => {
    const own = availableProjects.find(p => p.projectBy === 'STUDENT');
    setSelfProject(own ?? null);
  }, [availableProjects]);

  // A team that already proposed its own project (e.g. before switching
  // devices, or a page reload mid-flow) has effectively already picked this
  // mode — skip straight past the mode picker instead of losing their work.
  useEffect(() => {
    if (selfProject && mode === null) setMode('own-existing');
  }, [selfProject, mode]);

  const catalogProjects = useMemo(
    () => availableProjects.filter(p => p.projectBy === 'PST'),
    [availableProjects]
  );

  const preference1Id = mode === 'own-existing' ? (selfProject?.id ?? null) : existingProjectId1;
  const preference2Id = mode === 'own-existing' ? existingProjectId : existingProjectId2;

  const handleSubmit = async () => {
    if (!preference1Id || !preference2Id || !mentor1Id || !mentor2Id) return;
    setSubmitting(true);
    try {
      await apiSubmitProjectPreferences(cohortId, preference1Id, preference2Id, mentor1Id, mentor2Id);
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
    <div className="space-y-6">
      <div className="bg-gold/5 border border-gold/20 rounded-xl px-5 py-4 flex items-center gap-3">
        <Layers size={20} className="text-gold shrink-0" />
        <p className="text-white text-sm font-medium">
          You need to choose <span className="text-gold font-bold">2 projects</span> — your 1st and 2nd preference.
        </p>
      </div>

      {mode === null ? (
        <div className="space-y-4">
          <h2 className="text-white font-semibold">How do you want to pick your projects?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('own-existing')}
              className="group flex flex-col items-start gap-3 bg-zinc-850 border border-zinc-750 rounded-xl p-5 text-left hover:border-gold/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-gold/5 transition-all duration-300"
            >
              <div className="p-2 rounded-lg bg-zinc-750 group-hover:bg-gold/10 transition-colors">
                <Sparkles size={20} className="text-gold" />
              </div>
              <p className="text-white font-semibold">Own Project + Recommended Project</p>
              <p className="text-gray-400 text-sm">Propose your own project as your 1st preference, and pick one from the catalog as your 2nd.</p>
            </button>
            <button
              onClick={() => setMode('two-existing')}
              className="group flex flex-col items-start gap-3 bg-zinc-850 border border-zinc-750 rounded-xl p-5 text-left hover:border-gold/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-gold/5 transition-all duration-300"
            >
              <div className="p-2 rounded-lg bg-zinc-750 group-hover:bg-gold/10 transition-colors">
                <Briefcase size={20} className="text-gold" />
              </div>
              <p className="text-white font-semibold">Two Recommended Projects</p>
              <p className="text-gray-400 text-sm">Pick two different projects from the catalog as your 1st and 2nd preference.</p>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => { setMode(null); setStep(1); }}
            disabled={!!selfProject}
            className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Change selection type
          </button>

          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
            <span className={step === 1 ? 'text-gold' : 'text-gray-600'}>1. Preference 1</span>
            <span className="text-gray-700">—</span>
            <span className={step === 2 ? 'text-gold' : 'text-gray-600'}>2. Preference 2</span>
          </div>

          {step === 1 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Preference 1 project — left */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Preference 1 project</p>
                {mode === 'own-existing' ? (
                  <SelfProjectProposer cohortId={cohortId} selfProject={selfProject} onCreated={setSelfProject} />
                ) : (
                  <ExistingProjectPicker
                    catalogProjects={catalogProjects}
                    selectedId={existingProjectId1}
                    onSelect={setExistingProjectId1}
                    excludeId={existingProjectId2}
                  />
                )}
              </div>

              {/* Preference 1 mentor — right */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Preference 1 mentor</p>
                <MentorPicker
                  label="Preference 1 mentor"
                  mentors={availableMentors}
                  loading={mentorsLoading}
                  selectedId={mentor1Id}
                  onSelect={setMentor1Id}
                  excludeId={mentor2Id}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Preference 2 project — left */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Preference 2 project</p>
                <ExistingProjectPicker
                  catalogProjects={catalogProjects}
                  selectedId={mode === 'own-existing' ? existingProjectId : existingProjectId2}
                  onSelect={mode === 'own-existing' ? setExistingProjectId : setExistingProjectId2}
                  excludeId={mode === 'own-existing' ? undefined : existingProjectId1}
                />
              </div>

              {/* Preference 2 mentor — right */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Preference 2 mentor</p>
                <MentorPicker
                  label="Preference 2 mentor"
                  mentors={availableMentors}
                  loading={mentorsLoading}
                  selectedId={mentor2Id}
                  onSelect={setMentor2Id}
                  excludeId={mentor1Id}
                />
              </div>
            </div>
          )}

          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 pt-3 pb-1 bg-gradient-to-t from-black via-black/95 to-transparent">
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

            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={!preference1Id || !mentor1Id}
                className="py-3 px-6 bg-gold text-black font-semibold rounded-lg shadow-xl shadow-black/40 hover:bg-gold-hover hover:shadow-lg hover:shadow-gold/10 transition-all duration-200 disabled:opacity-40 disabled:hover:shadow-none"
              >
                Next: Preference 2 →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!preference2Id || !mentor2Id || submitting}
                className="py-3 px-6 bg-gold text-black font-semibold rounded-lg shadow-xl shadow-black/40 hover:bg-gold-hover hover:shadow-lg hover:shadow-gold/10 transition-all duration-200 disabled:opacity-40 disabled:hover:shadow-none"
              >
                {submitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            )}
          </div>
        </div>
      )}
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
}: {
  label: string;
  mentors: TeamAvailableMentor[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  excludeId?: string | null;
}) {
  const options = mentors.filter(m => m.id !== excludeId);

  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 space-y-3 h-full">
      <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">{label}</label>
      {loading ? (
        <div className="py-6 flex justify-center"><SpinnerSquare size={24} /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[45vh] overflow-y-auto pr-1">
          {options.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              className={`flex items-center gap-2.5 text-left rounded-lg p-2.5 border transition-all duration-200 ${
                selectedId === m.id
                  ? 'bg-gold/10 border-gold shadow-lg shadow-gold/5'
                  : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
              }`}
            >
              <MentorAvatar name={m.fullName} selected={selectedId === m.id} />
              <div className="min-w-0">
                <p className="text-white font-semibold text-xs truncate">{m.fullName}</p>
                <p className="text-gray-500 text-[10px] truncate">
                  {m.organization || (m.isExternal ? 'External' : 'Internal')}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      {!loading && options.length === 0 && (
        <p className="text-gray-500 text-xs">No mentors available for this track right now.</p>
      )}
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
      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${
        selected ? 'bg-gold text-black' : 'bg-zinc-750 text-gray-300'
      }`}
    >
      {initials || '?'}
    </div>
  );
}

function ExistingProjectPicker({
  catalogProjects,
  selectedId,
  onSelect,
  excludeId,
}: {
  catalogProjects: TeamProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  excludeId?: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCatalog = catalogProjects.filter(p => {
    if (excludeId && p.id === excludeId) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.title.toLowerCase().includes(q) || (p.problemStatement || '').toLowerCase().includes(q);
  });

  return (
    <div className="group bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-4 h-full transition-all duration-300 hover:border-gold/20 hover:shadow-lg hover:shadow-gold/5">
      <h2 className="text-white font-semibold flex items-center gap-3">
        <div className="p-2 rounded-lg bg-zinc-750 group-hover:bg-gold/10 transition-colors">
          <Briefcase size={18} className="text-gold" />
        </div>
        Recommended Project
      </h2>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search projects..."
          className="w-full bg-zinc-900 border border-zinc-750 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 max-h-[45vh] overflow-y-auto pr-1">
        {filteredCatalog.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`text-left rounded-lg p-4 border transition-all duration-200 ${
              selectedId === p.id
                ? 'bg-gold/10 border-gold shadow-lg shadow-gold/5'
                : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600 hover:scale-[1.01]'
            }`}
          >
            <div className="flex items-center gap-2">
              <p className="text-white font-semibold text-sm">{p.title}</p>
              {p.isRecommended && (
                <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gold/10 text-gold font-semibold uppercase tracking-wider">
                  <Sparkles size={10} />
                  Suggested for you
                </span>
              )}
            </div>
            {p.problemStatement && (
              <p className="text-gray-400 text-xs mt-1 line-clamp-2">{p.problemStatement}</p>
            )}
          </button>
        ))}
        {filteredCatalog.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">No recommended projects available for this track.</p>
          </div>
        )}
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
}: {
  cohortId: string;
  selfProject: TeamProject | null;
  onCreated: (project: TeamProject) => void;
}) {
  const { showError, showSuccess } = useToast();
  const [proposing, setProposing] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState({
    // Required (studentProposeProjectSchema on the backend)
    title: '',
    description: '',
    problemStatement: '',
    techStack: '',
    courseCovered: '',
    coreLearningGoals: '',
    expectedOutput: '',
    industry: '',
    mustHaveFeatures: '',
    goodToHaveFeatures: '',
    evaluationMetrics: '',
    // Optional
    endUsersDefined: '',
    projectDescription: '',
    framework: '',
    suggestedLibrariesTools: '',
    stretchGoal: '',
    firstMonthMilestones: '',
    secondMonthMilestones: '',
    thirdMonthMilestones: '',
    level: '' as '' | ProjectLevel,
    theme: '',
    referenceDocs: '',
    estimatedDuration: '',
    sourceStartupSchool: '',
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
        level: form.level || undefined,
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
    <div className="group bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-4 h-full transition-all duration-300 hover:border-gold/20 hover:shadow-lg hover:shadow-gold/5">
      <h2 className="text-white font-semibold flex items-center gap-3">
        <div className="p-2 rounded-lg bg-zinc-750 group-hover:bg-gold/10 transition-colors">
          <Sparkles size={18} className="text-gold" />
        </div>
        Self Project
      </h2>

      {selfProject ? (
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 text-green-400 text-xs font-semibold">
            <CheckCircle2 size={14} />
            Selected
          </div>
          <p className="text-white font-bold">{selfProject.title}</p>
          {selfProject.description && <p className="text-gray-400 text-sm">{selfProject.description}</p>}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" required placeholder="Project title" value={form.title} onChange={setField('title')} className={inputClass} />
          <textarea required placeholder="Description (detailed)" value={form.description} onChange={setField('description')} rows={2} className={`${inputClass} resize-none`} />
          <textarea required placeholder="Problem statement" value={form.problemStatement} onChange={setField('problemStatement')} rows={2} className={`${inputClass} resize-none`} />
          <input type="text" required placeholder="Tech stack (comma separated)" value={form.techStack} onChange={setField('techStack')} className={inputClass} />
          <input type="text" required placeholder="Course(s) covered (comma separated)" value={form.courseCovered} onChange={setField('courseCovered')} className={inputClass} />
          <input type="text" required placeholder="Core learning goals (comma separated)" value={form.coreLearningGoals} onChange={setField('coreLearningGoals')} className={inputClass} />
          <textarea required placeholder="Expected output (comma separated)" value={form.expectedOutput} onChange={setField('expectedOutput')} rows={2} className={`${inputClass} resize-none`} />
          <input type="text" required placeholder="Industry" value={form.industry} onChange={setField('industry')} className={inputClass} />
          <textarea required placeholder="Must-have features (comma separated)" value={form.mustHaveFeatures} onChange={setField('mustHaveFeatures')} rows={2} className={`${inputClass} resize-none`} />
          <textarea required placeholder="Good-to-have features (comma separated)" value={form.goodToHaveFeatures} onChange={setField('goodToHaveFeatures')} rows={2} className={`${inputClass} resize-none`} />
          <textarea required placeholder="Evaluation metrics (comma separated)" value={form.evaluationMetrics} onChange={setField('evaluationMetrics')} rows={2} className={`${inputClass} resize-none`} />

          <button type="button" onClick={() => setShowMore(s => !s)} className="text-xs text-gold hover:underline">
            {showMore ? 'Hide optional details' : '+ Add optional details (end users, milestones...)'}
          </button>

          {showMore && (
            <div className="space-y-3 border-t border-zinc-800 pt-3">
              <input type="text" placeholder="End users" value={form.endUsersDefined} onChange={setField('endUsersDefined')} className={inputClass} />
              <textarea placeholder="Short project description" value={form.projectDescription} onChange={setField('projectDescription')} rows={2} className={`${inputClass} resize-none`} />
              <input type="text" placeholder="Framework (comma separated)" value={form.framework} onChange={setField('framework')} className={inputClass} />
              <input type="text" placeholder="Suggested libraries / tools (comma separated)" value={form.suggestedLibrariesTools} onChange={setField('suggestedLibrariesTools')} className={inputClass} />
              <textarea placeholder="Stretch goal (comma separated)" value={form.stretchGoal} onChange={setField('stretchGoal')} rows={2} className={`${inputClass} resize-none`} />
              <input type="text" placeholder="1st month milestones (comma separated)" value={form.firstMonthMilestones} onChange={setField('firstMonthMilestones')} className={inputClass} />
              <input type="text" placeholder="2nd month milestones (comma separated)" value={form.secondMonthMilestones} onChange={setField('secondMonthMilestones')} className={inputClass} />
              <input type="text" placeholder="3rd month milestones (comma separated)" value={form.thirdMonthMilestones} onChange={setField('thirdMonthMilestones')} className={inputClass} />
              <input type="text" placeholder="Theme" value={form.theme} onChange={setField('theme')} className={inputClass} />
              <input type="text" placeholder="Reference docs (links / notes)" value={form.referenceDocs} onChange={setField('referenceDocs')} className={inputClass} />
              <input type="number" min={1} max={52} placeholder="Estimated duration (weeks)" value={form.estimatedDuration} onChange={setField('estimatedDuration')} className={inputClass} />
              <input type="text" placeholder="Source / Startup School" value={form.sourceStartupSchool} onChange={setField('sourceStartupSchool')} className={inputClass} />
              <select value={form.level} onChange={setField('level')} className={inputClass}>
                <option value="">Level (optional)</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
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

// A fresh preference-1 proposal after a mentor rejection — propose a new
// self project and pick a mentor for it, then resubmit for review.
// Preference 2 is untouched; only preference 1 is ever replaced this way.
function ResubmitPreference1Panel({
  cohortId,
  availableMentors,
  mentorsLoading,
  preference2MentorId,
  onResubmitted,
}: {
  cohortId: string;
  availableMentors: TeamAvailableMentor[];
  mentorsLoading: boolean;
  preference2MentorId: string | null;
  onResubmitted: () => void;
}) {
  const { showError, showSuccess } = useToast();
  const [newProject, setNewProject] = useState<TeamProject | null>(null);
  const [newMentorId, setNewMentorId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleResubmit = async () => {
    if (!newProject || !newMentorId) return;
    setSubmitting(true);
    try {
      await apiResubmitPreference1(cohortId, newProject.id, newMentorId);
      showSuccess('New proposal submitted for review.');
      onResubmitted();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to resubmit your project preference');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SelfProjectProposer cohortId={cohortId} selfProject={newProject} onCreated={setNewProject} />
        <MentorPicker
          label="New preference 1 mentor"
          mentors={availableMentors}
          loading={mentorsLoading}
          selectedId={newMentorId}
          onSelect={setNewMentorId}
          excludeId={preference2MentorId}
        />
      </div>
      <button
        onClick={handleResubmit}
        disabled={!newProject || !newMentorId || submitting}
        className="py-3 px-6 bg-gold text-black font-semibold rounded-lg shadow-xl shadow-black/40 hover:bg-gold-hover hover:shadow-lg hover:shadow-gold/10 transition-all duration-200 disabled:opacity-40 disabled:hover:shadow-none"
      >
        {submitting ? 'Submitting...' : 'Resubmit for Review'}
      </button>
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
  rejected: { icon: XCircle, className: 'text-red-400', label: 'Preference 1 was rejected — resubmit below' },
};

function SummaryScreen({
  cohortId,
  team,
  preferences,
  availableMentors,
  mentorsLoading,
  onResubmitted,
}: {
  cohortId: string;
  team: { name: string | null; track: string; members: { studentId: string; fullName: string | null }[] };
  preferences: {
    preference1Id: string;
    preference2Id: string;
    preference1MentorId: string | null;
    preference2MentorId: string | null;
    allocationStatus: 'pending' | 'allocated' | 'needs_review';
    allocatedProjectId: string | null;
    allocatedMentorId: string | null;
    allocatedMentorName: string | null;
    preference1ReviewStatus: PreferenceReviewStatus;
    preference1ReviewNote: string | null;
  };
  availableMentors: TeamAvailableMentor[];
  mentorsLoading: boolean;
  onResubmitted: () => void;
}) {
  const mentor1 = availableMentors.find(m => m.id === preferences.preference1MentorId) ?? null;
  const mentor2 = availableMentors.find(m => m.id === preferences.preference2MentorId) ?? null;
  const [selfProject, setSelfProject] = useState<Project | null>(null);
  const [existingProject, setExistingProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    fetchedRef.current = false;
  }, [preferences.preference1Id]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    (async () => {
      try {
        const [self, existing] = await Promise.all([
          apiGetProject(preferences.preference1Id),
          apiGetProject(preferences.preference2Id),
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
            <span className="text-xs px-2.5 py-1 rounded-full bg-gold/10 text-gold font-medium">{team.track}</span>
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
        ) : (
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
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-semibold uppercase tracking-wider">
                    Rejected
                  </span>
                )}
              </div>
              {isRejected && preferences.preference1ReviewNote && (
                <p className="text-red-400 text-xs mt-1">Mentor's note: {preferences.preference1ReviewNote}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">
                {existingProject?.projectBy === 'STUDENT' ? 'Self Project' : 'Recommended Project'} (Preference 2)
              </p>
              <p className="text-white font-semibold">{existingProject?.title}</p>
            </div>
          </>
        )}
      </div>

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
        </div>
      </div>

      {isRejected && (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-white font-semibold">Submit a new preference 1</h2>
            <p className="text-gray-400 text-sm mt-1">
              Your mentor rejected this project. Propose a new one and pick a mentor to resubmit for review.
            </p>
          </div>
          <ResubmitPreference1Panel
            cohortId={cohortId}
            availableMentors={availableMentors}
            mentorsLoading={mentorsLoading}
            preference2MentorId={preferences.preference2MentorId}
            onResubmitted={onResubmitted}
          />
        </div>
      )}
    </div>
  );
}
