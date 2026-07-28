import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { User, Users2, Shuffle, CheckCircle2, ArrowLeftRight, ArrowLeft, UserCog, UserPlus, Gauge, RotateCcw, AlertTriangle } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import SpinnerSquare from '../../../components/SpinnerSquare';
import type { TeamAllocationDetail, MentorLoadSummaryRow, CohortAllocationRunStatus, Project, StudentWithoutTeam, AllocationPreviewEntry, CohortPendingProposal } from '../../../lib/types';
import { TRACKS } from '../../../lib/constants';
import {
  apiGetTeamsForCohortDetailed,
  apiPreviewAllocation,
  apiDraftAllocation,
  apiOverrideTeamAllocation,
  apiResolveTeamAllocation,
  apiGetMentorLoadSummary,
  apiGetRunnableTeamCount,
  apiReverseAllocation,
  apiPublishAllocation,
  apiGetCohort,
  apiGetStudentsWithoutTeam,
  apiCreateManualTeam,
  apiGetProjectsForCohortPage,
  apiGetCohortPendingProposals,
} from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { formatDateDisplay } from '../../../lib/utils';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const STATUS_DOT: Record<string, { dot: string; text: string }> = {
  allocated: { dot: 'bg-green-500', text: 'text-green-500' },
  needs_review: { dot: 'bg-red-400', text: 'text-red-400' },
  pending: { dot: 'bg-gray-400', text: 'text-gray-400' },
};

const STATUS_LABELS: Record<string, string> = {
  allocated: 'Allocated',
  needs_review: 'Needs Review',
  pending: 'Pending',
};

// Cohort-wide run lifecycle — distinct from the per-team STATUS_DOT/LABELS
// above. 'review' reuses the same red as the per-team needs_review dot:
// same underlying signal (some team is stuck), just cohort-scoped.
const RUN_STATUS_DOT: Record<CohortAllocationRunStatus, { dot: string; text: string }> = {
  pending: { dot: 'bg-gray-400', text: 'text-gray-400' },
  draft: { dot: 'bg-blue-400', text: 'text-blue-400' },
  review: { dot: 'bg-red-400', text: 'text-red-400' },
  published: { dot: 'bg-green-500', text: 'text-green-500' },
};

const RUN_STATUS_LABELS: Record<CohortAllocationRunStatus, string> = {
  pending: 'Not Run Yet',
  draft: 'Draft',
  review: 'Needs Review',
  published: 'Published',
};

export default function CohortAllocationsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const [cohortLabel, setCohortLabel] = useState('');
  const [teams, setTeams] = useState<TeamAllocationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [runStatus, setRunStatus] = useState<CohortAllocationRunStatus>('pending');
  // Sticky — set once on first publish, never cleared, even while
  // runStatus later cycles back to 'draft'/'review' for a fresh batch of
  // teams. Drives the Reverse Allocation lock, which must stay disabled
  // forever once a cohort has ever been published.
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  // How many teams still have something for Run Allocation to do (status
  // 'pending' or 'needs_review') — once this hits 0, Run Allocation has
  // nothing left to run until a later batch of teams submits preferences.
  const [runnableCount, setRunnableCount] = useState(0);
  const [overrideTeam, setOverrideTeam] = useState<TeamAllocationDetail | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  const [resolveTeam, setResolveTeam] = useState<TeamAllocationDetail | null>(null);
  const [resolveProjectId, setResolveProjectId] = useState<string | null>(null);
  const [resolveMentorSearch, setResolveMentorSearch] = useState('');
  const [savingResolve, setSavingResolve] = useState(false);
  const [mentorLoadSummary, setMentorLoadSummary] = useState<MentorLoadSummaryRow[]>([]);
  const [mentorPickerLoading, setMentorPickerLoading] = useState(false);
  const [showLoadSummary, setShowLoadSummary] = useState(false);
  const [detailTeam, setDetailTeam] = useState<TeamAllocationDetail | null>(null);
  // Self-proposed pref1 projects still awaiting mentor approval — teams still
  // go into allocation (on their pref2), but the admin is warned these are
  // pending so they can chase the mentor before publishing.
  const [pendingProposals, setPendingProposals] = useState<CohortPendingProposal[]>([]);
  const [showProposalsModal, setShowProposalsModal] = useState(false);

  // Run Allocation preview — computed server-side, held here until Draft
  // commits it. Nothing here is persisted; a manual reassignment just
  // mutates this array client-side.
  const [previewMode, setPreviewMode] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<AllocationPreviewEntry[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [manualAllocateTeam, setManualAllocateTeam] = useState<AllocationPreviewEntry | null>(null);
  // 'choice' — pick "from student preference" vs "different project"; the
  // latter needs a freeform cohort-wide project search, the former just
  // shows the team's own already-known preference1/preference2.
  const [manualAllocateStep, setManualAllocateStep] = useState<'choice' | 'assignProject' | 'preference' | 'freeform'>('choice');
  const [manualAllocateProjects, setManualAllocateProjects] = useState<Project[]>([]);
  const [manualAllocateProjectSearch, setManualAllocateProjectSearch] = useState('');
  const [manualAllocateSelectedProjectId, setManualAllocateSelectedProjectId] = useState<string | null>(null);
  const [manualAllocateSelectedProjectTitle, setManualAllocateSelectedProjectTitle] = useState<string | null>(null);
  const [manualAllocateMentorSearch, setManualAllocateMentorSearch] = useState('');
  const [loadingManualAllocateProjects, setLoadingManualAllocateProjects] = useState(false);

  // Manual team creation — admin builds a team for 1-2 students who never
  // went through self-service team formation.
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [loadingStudentsWithoutTeam, setLoadingStudentsWithoutTeam] = useState(false);
  const [studentsWithoutTeam, setStudentsWithoutTeam] = useState<StudentWithoutTeam[]>([]);
  const [createTeamTrack, setCreateTeamTrack] = useState('');
  const [createTeamStudentSearch, setCreateTeamStudentSearch] = useState('');
  const [createTeamSelectedStudentIds, setCreateTeamSelectedStudentIds] = useState<string[]>([]);
  const [createTeamProjects, setCreateTeamProjects] = useState<Project[]>([]);
  const [createTeamProjectSearch, setCreateTeamProjectSearch] = useState('');
  const [createTeamSelectedProjectId, setCreateTeamSelectedProjectId] = useState<string | null>(null);
  const [createTeamMentorSearch, setCreateTeamMentorSearch] = useState('');
  const [createTeamSelectedMentorId, setCreateTeamSelectedMentorId] = useState<string | null>(null);
  const [savingCreateTeam, setSavingCreateTeam] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [trackFilter, setTrackFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'pending' | 'allocated' | 'overridden' | 'published'>('');
  const [search, setSearch] = useState('');
  const [cohortBatches, setCohortBatches] = useState<string[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  // Teams only — cheap enough to refetch on every page/filter change.
  const fetchTeams = useCallback(async (targetPage: number) => {
    if (!cohortId) return;
    try {
      const res = await apiGetTeamsForCohortDetailed(cohortId, {
        page: targetPage,
        limit,
        track: trackFilter || undefined,
        batch: batchFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setTeams(res.data);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load teams for allocation');
    }
  }, [cohortId, limit, trackFilter, batchFilter, statusFilter, search, showError]);

  // Cohort label/status/runnable-count — needed immediately for the header
  // and button states. Deliberately excludes the mentor roster and load
  // summary, which are only ever shown inside the 3 mentor-picker modals
  // below (Load Summary, Assign Project & Mentor, Create Team) — those are
  // fetched on demand by loadMentorPickerData() instead of on every mount.
  const fetchAuxData = useCallback(async () => {
    if (!cohortId) return;
    try {
      const [cohort, runnable, proposals] = await Promise.all([
        apiGetCohort(cohortId, false),
        apiGetRunnableTeamCount(cohortId),
        apiGetCohortPendingProposals(cohortId),
      ]);
      setPendingProposals(proposals);
      setCohortLabel(getCohortLabel(cohort));
      setCohortBatches(cohort.allowedBatches ?? []);
      // Falls back to 'pending' if talking to a backend deployment that
      // doesn't have the publish-gate feature yet (allocationRunStatus
      // would be undefined) — same defensive pattern as STATUS_DOT/LABELS
      // below, so a stale/mismatched backend degrades gracefully instead
      // of crashing the whole page.
      setRunStatus(cohort.allocationRunStatus ?? 'pending');
      setPublishedAt(cohort.allocationPublishedAt ?? null);
      setRunnableCount(runnable);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load cohort data');
    }
  }, [cohortId, showError]);

  // Mentor picker data — only needed once an admin actually opens one of the
  // mentor-picker modals, so it's fetched on open rather than upfront.
  // mentor-load-summary alone carries id/name/tracks/capacity for every
  // mentor in the cohort, so there's no need for the separate (much
  // heavier) full cohort-roster fetch just to get names and tracks.
  // Always refetches (not cached past first load) so allocatedCount stays
  // current after an override/resolve/run.
  const loadMentorPickerData = useCallback(async () => {
    if (!cohortId) return;
    setMentorPickerLoading(true);
    try {
      const loadSummary = await apiGetMentorLoadSummary(cohortId);
      setMentorLoadSummary(loadSummary);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load mentor data');
    } finally {
      setMentorPickerLoading(false);
    }
  }, [cohortId, showError]);

  // Full refresh after a mutation (run/reverse/override) — the current page
  // of teams plus the aux data that could have changed alongside it.
  const refreshAfterMutation = useCallback(async () => {
    await Promise.all([fetchTeams(page), fetchAuxData()]);
  }, [fetchTeams, fetchAuxData, page]);

  useEffect(() => {
    fetchAuxData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  // `loading` only gates the full-page spinner on first mount — once the
  // table has rendered once, a page/filter change just dims it briefly
  // instead of hiding the filter bar and search box too.
  useEffect(() => {
    setTableLoading(true);
    fetchTeams(page).finally(() => {
      setTableLoading(false);
      setLoading(false);
    });
  }, [page, limit, trackFilter, batchFilter, statusFilter, search, fetchTeams]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleTrackFilterChange = (value: string) => {
    setPage(1);
    setTrackFilter(value);
  };

  const handleBatchFilterChange = (value: string) => {
    setPage(1);
    setBatchFilter(value);
  };

  const handleStatusFilterChange = (value: string) => {
    setPage(1);
    setStatusFilter(value as '' | 'pending' | 'allocated' | 'overridden' | 'published');
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

  const handleReverseAllocation = async () => {
    if (!cohortId) return;
    const confirmReverse = await confirm({
      title: 'Reverse allocation',
      message:
        "Reset algorithm-allocated teams in this cohort back to pending? Submitted preferences are kept — a fresh Run Allocation will re-resolve them. Teams an admin manually overrode, or that are already visible to their students, are left untouched.",
      confirmLabel: 'Reverse Allocation',
      variant: 'danger',
    });
    if (!confirmReverse) return;

    setReversing(true);
    try {
      const { reversedCount } = await apiReverseAllocation(cohortId);
      showSuccess(`${reversedCount} team${reversedCount === 1 ? '' : 's'} reset back to pending.`);
      await refreshAfterMutation();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to reverse allocation');
    } finally {
      setReversing(false);
    }
  };

  const handleRunAllocation = async () => {
    if (!cohortId) return;
    setRunning(true);
    try {
      const preview = await apiPreviewAllocation(cohortId);
      if (preview.length === 0) {
        showSuccess('Nothing to run — no team is pending or needs review right now.');
        return;
      }
      setPreviewEntries(preview);
      setPreviewMode(true);
      loadMentorPickerData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to compute allocation preview');
    } finally {
      setRunning(false);
    }
  };

  const handleDiscardPreview = () => {
    setPreviewMode(false);
    setPreviewEntries([]);
  };

  const openManualAllocateModal = (entry: AllocationPreviewEntry) => {
    setManualAllocateTeam(entry);
    setManualAllocateStep('choice');
    setManualAllocateProjects([]);
    setManualAllocateProjectSearch('');
    setManualAllocateSelectedProjectId(null);
    setManualAllocateSelectedProjectTitle(null);
    setManualAllocateMentorSearch('');
  };

  const handleAssignProjectOnly = (pref: { projectId: string; projectTitle: string | null; mentorId: string | null; mentorName: string | null }) => {
    if (!manualAllocateTeam) return;
    setPreviewEntries((prev) =>
      prev.map((e) =>
        e.teamId === manualAllocateTeam.teamId
          ? { ...e, status: 'allocated' as const, projectId: pref.projectId, projectTitle: pref.projectTitle, mentorId: pref.mentorId, mentorName: pref.mentorName }
          : e
      )
    );
    setManualAllocateTeam(null);
  };

  const openFreeformStep = () => {
    setManualAllocateStep('freeform');
    setManualAllocateSelectedProjectId(null);
    setManualAllocateSelectedProjectTitle(null);
    if (!cohortId || !manualAllocateTeam) return;
    setLoadingManualAllocateProjects(true);
    apiGetProjectsForCohortPage(cohortId, { track: manualAllocateTeam.track, page: 1, limit: 50 })
      .then((res) => setManualAllocateProjects(res.data))
      .catch((err) => showError(err instanceof Error ? err.message : 'Failed to load projects'))
      .finally(() => setLoadingManualAllocateProjects(false));
  };

  const pickPreferenceProject = (pref: { projectId: string; projectTitle: string | null }) => {
    setManualAllocateSelectedProjectId(pref.projectId);
    setManualAllocateSelectedProjectTitle(pref.projectTitle);
  };

  const pickFreeformProject = (project: Project) => {
    setManualAllocateSelectedProjectId(project.id);
    setManualAllocateSelectedProjectTitle(project.title);
  };

  const handleManualAllocateProjectSearch = (value: string) => {
    setManualAllocateProjectSearch(value);
    if (!cohortId || !manualAllocateTeam) return;
    setLoadingManualAllocateProjects(true);
    apiGetProjectsForCohortPage(cohortId, { track: manualAllocateTeam.track, search: value, page: 1, limit: 50 })
      .then((res) => setManualAllocateProjects(res.data))
      .catch((err) => showError(err instanceof Error ? err.message : 'Failed to load projects'))
      .finally(() => setLoadingManualAllocateProjects(false));
  };

  const handleManualAllocatePick = (mentorId: string) => {
    if (!manualAllocateTeam || !manualAllocateSelectedProjectId) return;
    const mentor = mentorLoadSummary.find((m) => m.mentorId === mentorId);
    setPreviewEntries((prev) =>
      prev.map((e) =>
        e.teamId === manualAllocateTeam.teamId
          ? {
              ...e,
              status: 'allocated' as const,
              projectId: manualAllocateSelectedProjectId,
              projectTitle: manualAllocateSelectedProjectTitle ?? e.projectTitle,
              mentorId,
              mentorName: mentor?.mentorName ?? null,
            }
          : e
      )
    );
    setManualAllocateTeam(null);
  };

  const allPreviewResolved =
    previewEntries.length > 0 && previewEntries.every((e) => e.status === 'allocated' && !!e.projectId && !!e.mentorId);

  const handleDraftAllocation = async () => {
    if (!cohortId || !allPreviewResolved) return;
    setDrafting(true);
    try {
      await apiDraftAllocation(
        cohortId,
        previewEntries.map((e) => ({ teamId: e.teamId, allocatedProjectId: e.projectId!, mentorId: e.mentorId! }))
      );
      showSuccess('Draft committed.');
      setPreviewMode(false);
      setPreviewEntries([]);
      await refreshAfterMutation();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to commit draft');
    } finally {
      setDrafting(false);
    }
  };

  const handlePublishAllocation = async () => {
    if (!cohortId) return;
    const confirmPublish = await confirm({
      title: 'Publish allocation',
      message: 'Make the current draft results visible to students and mentors? Run Allocation, Reverse Allocation, and manual overrides will be locked for this cohort once published.',
      confirmLabel: 'Publish',
    });
    if (!confirmPublish) return;

    setPublishing(true);
    try {
      await apiPublishAllocation(cohortId);
      showSuccess('Allocation published — students and mentors can now see their results.');
      await refreshAfterMutation();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to publish allocation');
    } finally {
      setPublishing(false);
    }
  };

  const handleOverride = async (projectId: string) => {
    if (!overrideTeam) return;
    setSavingOverride(true);
    try {
      await apiOverrideTeamAllocation(overrideTeam.teamId, projectId);
      showSuccess('Allocation updated.');
      setOverrideTeam(null);
      await refreshAfterMutation();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update allocation');
    } finally {
      setSavingOverride(false);
    }
  };

  const handleResolveAllocation = async (mentorId: string) => {
    if (!resolveTeam || !resolveProjectId) return;
    setSavingResolve(true);
    try {
      await apiResolveTeamAllocation(resolveTeam.teamId, resolveProjectId, mentorId);
      showSuccess('Team allocated.');
      setResolveTeam(null);
      setResolveProjectId(null);
      setResolveMentorSearch('');
      await refreshAfterMutation();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to assign project and mentor');
    } finally {
      setSavingResolve(false);
    }
  };

  const openCreateTeamModal = async () => {
    setShowCreateTeamModal(true);
    setCreateTeamTrack('');
    setCreateTeamStudentSearch('');
    setCreateTeamSelectedStudentIds([]);
    setCreateTeamProjects([]);
    setCreateTeamProjectSearch('');
    setCreateTeamSelectedProjectId(null);
    setCreateTeamMentorSearch('');
    setCreateTeamSelectedMentorId(null);
    if (!cohortId) return;
    loadMentorPickerData();
    setLoadingStudentsWithoutTeam(true);
    try {
      const students = await apiGetStudentsWithoutTeam(cohortId);
      setStudentsWithoutTeam(students);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load students without a team');
    } finally {
      setLoadingStudentsWithoutTeam(false);
    }
  };

  const handleCreateTeamTrackChange = (value: string) => {
    setCreateTeamTrack(value);
    setCreateTeamSelectedProjectId(null);
    setCreateTeamProjects([]);
    if (!cohortId || !value) return;
    (async () => {
      try {
        const res = await apiGetProjectsForCohortPage(cohortId, { track: value, page: 1, limit: 50 });
        setCreateTeamProjects(res.data);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load projects for this track');
      }
    })();
  };

  const toggleCreateTeamStudent = (id: string) => {
    setCreateTeamSelectedStudentIds((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const handleCreateTeam = async () => {
    if (!cohortId || !createTeamTrack || createTeamSelectedStudentIds.length === 0 || !createTeamSelectedProjectId || !createTeamSelectedMentorId) {
      return;
    }
    setSavingCreateTeam(true);
    try {
      await apiCreateManualTeam(
        cohortId,
        createTeamSelectedStudentIds,
        createTeamTrack,
        createTeamSelectedProjectId,
        createTeamSelectedMentorId
      );
      showSuccess('Team created and allocated.');
      setShowCreateTeamModal(false);
      await refreshAfterMutation();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setSavingCreateTeam(false);
    }
  };

  const data = teams.map((t) => ({
    id: t.teamId,
    teamName: t.teamName,
    members: t.members.map((m) => m.fullName || m.studentId).join(', '),
    memberCount: t.members.length,
    submittedAt: formatDateDisplay(t.submittedAt),
    pref1Title: t.preference1.projectTitle,
    pref1Mentor: t.preference1.mentorName,
    pref2Title: t.preference2.projectTitle,
    pref2Mentor: t.preference2.mentorName,
    status: t.allocationStatus,
    // A self-proposed pref1's mentor-review state — surfaced as an extra tag
    // next to the allocation status (still under review, or rejected → the
    // team ends up on its 2nd preference).
    pref1UnderReview: t.preference1ReviewStatus === 'pending_review',
    pref1Rejected: t.preference1ReviewStatus === 'rejected',
    overriddenAt: t.overriddenAt,
    allocatedPrefNum: t.allocatedProjectId === t.preference1.projectId ? 1 : t.allocatedProjectId === t.preference2.projectId ? 2 : null,
    allocatedProjectTitle:
      t.allocatedProjectId === t.preference1.projectId
        ? t.preference1.projectTitle
        : t.allocatedProjectId === t.preference2.projectId
        ? t.preference2.projectTitle
        : null,
    allocatedMentorName: t.allocatedMentorName,
  }));

  const needsReviewCount = teams.filter((t) => t.allocationStatus === 'needs_review').length;
  // Sticky — a cohort that already published one batch can still Run/
  // Override/Resolve for a later batch of teams without limit; only
  // Reverse Allocation stays locked forever once this is true.
  const everPublished = !!publishedAt;
  const mutationInFlight = running || reversing || publishing;

  const proposalPendingCount = pendingProposals.filter((p) => p.reviewStatus === 'pending_review').length;
  const proposalRejectedCount = pendingProposals.filter((p) => p.reviewStatus === 'rejected').length;
  // Hard gate confirmed with the admin: Run Allocation / Draft / Publish all
  // stay disabled cohort-wide while any self-proposed pref1 hasn't cleared
  // mentor review (or is sitting rejected awaiting the student's resubmit/
  // return) — a team could otherwise get algorithm-allocated to its
  // preference-2 and published before its own project was ever decided on.
  // The backend enforces this too; this just keeps the buttons honest about
  // it instead of letting the admin hit a surprise error. Resolving it is
  // manual — the banner below already shows exactly which team/mentor is why.
  const hasBlockingProposals = pendingProposals.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <CohortPageHeader title="Project Allocations" subtitle={cohortLabel} icon={Shuffle} />
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${(RUN_STATUS_DOT[runStatus] ?? RUN_STATUS_DOT.pending).text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${(RUN_STATUS_DOT[runStatus] ?? RUN_STATUS_DOT.pending).dot}`} />
              {RUN_STATUS_LABELS[runStatus] ?? runStatus}
            </span>
            {runStatus === 'review' && (
              <span className="text-xs text-gray-400">
                {needsReviewCount} team{needsReviewCount === 1 ? '' : 's'} need{needsReviewCount === 1 ? 's' : ''} review before this cohort can be published.
              </span>
            )}
            {everPublished && (
              <span className="text-xs text-gray-400">
                Published — teams already visible to their students are locked for good.{' '}
                {runnableCount > 0
                  ? `${runnableCount} team${runnableCount === 1 ? '' : 's'} added since publish — Run Allocation will only resolve those.`
                  : 'Run Allocation has nothing new to do right now.'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setShowLoadSummary(true); loadMentorPickerData(); }}
            disabled={loading}
            title="Mentor load summary"
            className="flex items-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <Gauge size={14} />
          </button>
          <button
            onClick={openCreateTeamModal}
            disabled={loading || previewMode}
            title="Manually create a team"
            className="flex items-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <UserPlus size={14} />
          </button>
          {/* Always rendered — only `disabled` changes based on previewMode,
              so the button bar itself never restructures. Only the table
              content below swaps between the committed view and the preview. */}
          <button
            onClick={handleReverseAllocation}
            disabled={mutationInFlight || loading || previewMode}
            title={
              previewMode
                ? 'Discard or draft the current preview first'
                : everPublished
                ? 'Teams already visible to their students are protected — only resets teams drafted since the last publish'
                : undefined
            }
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {reversing ? 'Reversing...' : 'Reverse Allocation'}
          </button>
          <button
            onClick={handleRunAllocation}
            disabled={mutationInFlight || loading || runnableCount === 0 || previewMode || hasBlockingProposals}
            title={
              hasBlockingProposals
                ? 'Resolve every self-proposed project still awaiting mentor review or student resubmission first'
                : previewMode
                ? 'Discard or draft the current preview first'
                : runnableCount === 0
                ? 'Nothing to run — no team is pending or needs review right now'
                : everPublished
                ? `Resolves the ${runnableCount} team(s) added since this cohort was published`
                : undefined
            }
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <Shuffle size={14} />
            {running ? 'Computing preview...' : 'Run Allocation'}
          </button>
          <button
            onClick={handleDiscardPreview}
            disabled={!previewMode || drafting}
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            Discard Preview
          </button>
          <button
            onClick={handleDraftAllocation}
            disabled={!previewMode || drafting || !allPreviewResolved || hasBlockingProposals}
            title={
              hasBlockingProposals
                ? 'Resolve every self-proposed project still awaiting mentor review or student resubmission first'
                : !previewMode
                ? 'Run Allocation first to get a preview'
                : !allPreviewResolved
                ? 'Every team must be resolved to a project and mentor before drafting'
                : undefined
            }
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            {drafting ? 'Drafting...' : 'Draft'}
          </button>
          <button
            onClick={handlePublishAllocation}
            disabled={mutationInFlight || loading || runStatus !== 'draft' || previewMode || hasBlockingProposals}
            title={
              hasBlockingProposals
                ? 'Resolve every self-proposed project still awaiting mentor review or student resubmission first'
                : previewMode
                ? 'Discard or draft the current preview first'
                : runStatus !== 'draft'
                ? 'Only enabled once every team has cleared needs_review'
                : undefined
            }
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Some teams proposed their own project and its mentor review isn't a
          clean approval — still pending, or rejected awaiting the student's
          resubmit/return. This now hard-blocks Run Allocation, Draft, and
          Publish for the whole cohort (see hasBlockingProposals above) —
          the View here shows exactly who/which mentor to chase. */}
      {pendingProposals.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-amber-500/10 border border-amber-500/25 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-amber-300 text-sm">
            <AlertTriangle size={16} className="shrink-0" />
            <span>
              {[
                proposalPendingCount > 0 ? `${proposalPendingCount} under review by mentor` : null,
                proposalRejectedCount > 0 ? `${proposalRejectedCount} awaiting student resubmission` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              {' '}— blocking Run Allocation, Draft, and Publish until resolved.
            </span>
          </div>
          <button
            onClick={() => setShowProposalsModal(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-200 border border-amber-500/30 hover:bg-amber-500/25 transition-colors shrink-0"
          >
            View
          </button>
        </div>
      )}

      {previewMode && (
        <p className="text-xs text-gray-400 -mt-2">
          This is a preview only — nothing is saved yet. Reassign any team below, then click Draft to commit
          everything at once. Draft is disabled until every team is resolved to a project and mentor.
        </p>
      )}

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : previewMode ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-750 text-left text-gray-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Track</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Mentor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {previewEntries.map((entry) => (
                  <tr key={entry.teamId} className="border-b border-zinc-800 last:border-0">
                    <td className="px-4 py-3 text-white font-medium">
                      {entry.teamName || entry.teamId}
                      {entry.members.length > 0 && (
                        <span className="text-gray-400 font-normal">
                          {' '}
                          ({entry.members.map((m) => m.fullName || m.studentId).join(', ')})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{entry.track}</td>
                    <td className="px-4 py-3 text-gray-300">{entry.projectTitle || '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{entry.mentorName || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          (STATUS_DOT[entry.status] ?? STATUS_DOT.pending).text
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${(STATUS_DOT[entry.status] ?? STATUS_DOT.pending).dot}`} />
                        {STATUS_LABELS[entry.status] ?? entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openManualAllocateModal(entry)}
                        disabled={drafting}
                        className="text-xs text-gold hover:underline font-semibold disabled:opacity-50"
                      >
                        Reallocate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={`relative ${tableLoading ? 'opacity-20 transition-opacity' : 'transition-opacity'}`}>
        {tableLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <SpinnerSquare size={56} />
          </div>
        )}
        <DataTable
          columns={[
            {
              key: 'members',
              header: 'Team',
              render: (row) => (
                <span className="flex items-center gap-2">
                  {row.memberCount > 1 ? (
                    <Users2 size={14} className="text-gold shrink-0" />
                  ) : (
                    <User size={14} className="text-gold shrink-0" />
                  )}
                  <span className="text-white font-semibold tracking-wider">
                    {row.teamName ? (
                      <>
                        {row.teamName} <span className="text-gray-400 font-normal tracking-normal">({row.members})</span>
                      </>
                    ) : (
                      row.members
                    )}
                  </span>
                </span>
              ),
            },
            { key: 'submittedAt', header: 'Submitted' },
            {
              key: 'pref1',
              header: 'Preference 1',
              render: (row) => (
                <div>
                  <p className="text-gray-300">{row.pref1Title}</p>
                  {row.pref1Mentor && (
                    <p className="text-white font-medium text-xs mt-0.5 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-gold shrink-0" />
                      {row.pref1Mentor}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: 'pref2',
              header: 'Preference 2',
              render: (row) => (
                <div>
                  <p className="text-gray-300">{row.pref2Title}</p>
                  {row.pref2Mentor && (
                    <p className="text-white font-medium text-xs mt-0.5 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-gold shrink-0" />
                      {row.pref2Mentor}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: 'allocated',
              header: 'Allocated',
              render: (row) => (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-2.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${(STATUS_DOT[row.status] ?? STATUS_DOT.pending).text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${(STATUS_DOT[row.status] ?? STATUS_DOT.pending).dot}`} />
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                    {row.overriddenAt && (
                      <span
                        title="Manually overridden by an admin — skipped by bulk reverse"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        Overridden
                      </span>
                    )}
                    {row.pref1UnderReview && (
                      <span
                        title="This team proposed its own project — awaiting the mentor's approval"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Under review by mentor
                      </span>
                    )}
                    {row.pref1Rejected && (
                      <span
                        title="The mentor asked for a resubmission on this team's self-proposed project — blocking allocation until the student acts"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Awaiting resubmission
                      </span>
                    )}
                  </span>
                  {row.allocatedProjectTitle && (
                    <p className="text-gray-400 text-xs">
                      {row.allocatedPrefNum && <span className="text-gold">Pref {row.allocatedPrefNum} · </span>}
                      {row.allocatedProjectTitle}
                      {row.allocatedMentorName && <span className="text-white font-medium"> · {row.allocatedMentorName}</span>}
                    </p>
                  )}
                </div>
              ),
            },
          ]}
          data={data}
          searchPlaceholder="Search teams..."
          onRowClick={(row) => setDetailTeam(teams.find((t) => t.teamId === row.id) ?? null)}
          onSearchChange={handleSearchChange}
          serverPagination={{
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: pagination.totalPages,
            onPageChange: setPage,
            limitOptions: [20, 40, 80, 100],
            onLimitChange: handleLimitChange,
          }}
          leftHeaderContent={
            <>
              <Select
                variant="filter"
                className="min-w-[160px]"
                value={trackFilter}
                onChange={handleTrackFilterChange}
                placeholder="All Tracks"
                options={TRACKS.map((t) => ({ value: t, label: t }))}
              />
              <Select
                variant="filter"
                className="min-w-[140px]"
                value={batchFilter}
                onChange={handleBatchFilterChange}
                placeholder="All Batches"
                options={cohortBatches.map((b) => ({ value: b, label: b }))}
              />
              <Select
                variant="filter"
                className="min-w-[140px]"
                value={statusFilter}
                onChange={handleStatusFilterChange}
                placeholder="All Statuses"
                options={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'allocated', label: 'Allocated' },
                  { value: 'overridden', label: 'Overridden' },
                  { value: 'published', label: 'Published & Visible' },
                ]}
              />
            </>
          }
        />
        </div>
      )}

      <Modal open={showProposalsModal} onClose={() => setShowProposalsModal(false)} title="Self-proposed projects — mentor review">
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Run Allocation, Draft, and Publish are blocked for this cohort until every one of these clears —
            "Under review" needs the mentor to decide; "Awaiting resubmission" needs the student to act next.
          </p>
          {pendingProposals.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">No self-proposed projects awaiting or failing review.</p>
          ) : (
            pendingProposals.map((p) => {
              const memberNames = p.members.map((m) => m.fullName || m.studentId).join(', ');
              const rejected = p.reviewStatus === 'rejected';
              // Returned-to-catalog is the more consequential outcome (own
              // project is off the table for good), so it keeps the red
              // treatment; a plain resubmit ask stays amber like "under
              // review" — same severity split as the mentor's own page.
              const isSevere = rejected && p.resubmissionMode === 'catalog_only';
              return (
                <div key={p.teamId} className="bg-zinc-900 border border-zinc-750 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white flex items-center gap-2">
                      <Users2 size={14} className="text-gold shrink-0" />
                      {p.teamName ?? 'Team'}{memberNames && <span className="text-gray-400 font-normal">({memberNames})</span>}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        isSevere
                          ? 'text-red-400 bg-red-500/10 border-red-500/25'
                          : 'text-amber-400 bg-amber-500/10 border-amber-500/25'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isSevere ? 'bg-red-400' : 'bg-amber-400'}`} />
                      {rejected
                        ? p.resubmissionMode === 'catalog_only'
                          ? 'Awaiting resubmission — picking recommended'
                          : 'Awaiting resubmission — revising own project'
                        : 'Under review by mentor'}
                    </span>
                  </div>
                  {p.projectTitle && (
                    <p className="text-xs text-gray-400 mt-1">Project: <span className="text-gray-300">{p.projectTitle}</span></p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    With mentor: <span className="text-gray-300">{p.mentorName ?? '—'}</span>
                  </p>
                </div>
              );
            })
          )}
        </div>
      </Modal>

      <Modal open={!!detailTeam} onClose={() => setDetailTeam(null)} title="Team Detail">
        {detailTeam && (
          <div className="space-y-4">
            <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3 space-y-1">
              <p className="text-white text-sm font-semibold flex items-center gap-2">
                {detailTeam.members.length > 1 ? (
                  <Users2 size={14} className="text-gold shrink-0" />
                ) : (
                  <User size={14} className="text-gold shrink-0" />
                )}
                {detailTeam.teamName ? <span className="tracking-wider">{detailTeam.teamName}</span> : 'Unnamed Team'}
              </p>
              <p className="text-gray-300 text-xs">
                {detailTeam.members.map((m) => m.fullName || m.studentId).join(', ')}
              </p>
              <p className="text-gray-400 text-xs">
                {detailTeam.track} · Tier {detailTeam.tier} · Submitted {formatDateDisplay(detailTeam.submittedAt)}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${(STATUS_DOT[detailTeam.allocationStatus] ?? STATUS_DOT.pending).text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${(STATUS_DOT[detailTeam.allocationStatus] ?? STATUS_DOT.pending).dot}`} />
                {STATUS_LABELS[detailTeam.allocationStatus] ?? detailTeam.allocationStatus}
              </span>
              {detailTeam.overriddenAt && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Overridden
                </span>
              )}
            </div>

            {[detailTeam.preference1, detailTeam.preference2].map((pref, idx) => {
              const selected = detailTeam.allocatedProjectId === pref.projectId;
              return (
                <div
                  key={pref.projectId}
                  className={`rounded-lg p-3 border ${selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750'}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Preference {idx + 1}</p>
                    {selected && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/20 text-gold">
                        <CheckCircle2 size={11} />
                        Allocated
                      </span>
                    )}
                  </div>
                  <p className="text-white font-semibold text-sm">{pref.projectTitle}</p>
                  {(selected ? detailTeam.allocatedMentorName ?? pref.mentorName : pref.mentorName) && (
                    <p className="text-gray-400 text-xs mt-0.5">
                      {selected ? detailTeam.allocatedMentorName ?? pref.mentorName : pref.mentorName}
                    </p>
                  )}
                </div>
              );
            })}

            <div className="flex items-center gap-2 pt-2">
              {/* Not locked by publish state — a team from a batch added
                  after this cohort's first publish still needs Override/
                  Resolve to go through its own allocate → publish cycle. */}
              <button
                onClick={() => { setOverrideTeam(detailTeam); setDetailTeam(null); }}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                <ArrowLeftRight size={14} />
                {detailTeam.allocationStatus === 'allocated' ? 'Override Project' : 'Assign Project'}
              </button>
              <button
                onClick={() => {
                  setResolveProjectId(detailTeam.allocatedProjectId ?? null);
                  setResolveTeam(detailTeam);
                  setDetailTeam(null);
                  loadMentorPickerData();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                <UserCog size={14} />
                Assign Project & Mentor
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!overrideTeam}
        onClose={() => setOverrideTeam(null)}
        title={overrideTeam?.allocationStatus === 'allocated' ? 'Override Allocation' : 'Assign Allocation'}
      >
        {overrideTeam && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              {overrideTeam.allocationStatus === 'allocated'
                ? "Choose which of this team's own preferences to allocate. This overrides any recommendation."
                : "Choose which of this team's own preferences to allocate."}
            </p>
            {[overrideTeam.preference1, overrideTeam.preference2].map((pref, idx) => {
              const selected = overrideTeam.allocatedProjectId === pref.projectId;
              return (
                <button
                  key={pref.projectId}
                  onClick={() => handleOverride(pref.projectId)}
                  disabled={savingOverride}
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
        )}
      </Modal>

      <Modal
        open={!!resolveTeam}
        onClose={() => { setResolveTeam(null); setResolveProjectId(null); setResolveMentorSearch(''); }}
        title="Assign Project & Mentor"
      >
        {resolveTeam && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">
              Pick one of this team's own preferences as the project, then any mentor in the cohort — not limited to
              their track or the preference's own mentor.
            </p>

            <div>
              <div className="flex items-center gap-4 mb-2">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">1. Project</p>
                <div className="inline-flex items-center px-2.5 py-1 rounded-lg border border-gold bg-gold/10">
                  <span className="text-gold font-semibold text-xs">{resolveTeam.track}</span>
                </div>
              </div>
              <div className="space-y-2">
                {[resolveTeam.preference1, resolveTeam.preference2].map((pref, idx) => {
                  const selected = resolveProjectId === pref.projectId;
                  return (
                    <button
                      key={pref.projectId}
                      onClick={() => setResolveProjectId(pref.projectId)}
                      disabled={savingResolve}
                      className={`w-full text-left rounded-lg p-3 border transition-all duration-200 disabled:opacity-50 ${
                        selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Preference {idx + 1}</p>
                          <p className="text-white font-semibold text-sm">{pref.projectTitle}</p>
                        </div>
                        {selected && <CheckCircle2 size={16} className="text-gold shrink-0" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">2. Mentor</p>
              {!resolveProjectId && <p className="text-gray-500 text-xs mb-2">Pick a project first.</p>}
              <input
                type="text"
                value={resolveMentorSearch}
                onChange={(e) => setResolveMentorSearch(e.target.value)}
                placeholder="Search mentors..."
                disabled={!resolveProjectId}
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold disabled:opacity-50 mb-2"
              />
              <div className="max-h-64 overflow-y-auto space-y-2">
                {mentorLoadSummary
                  .filter((m) => (m.mentorName || '').toLowerCase().includes(resolveMentorSearch.toLowerCase()))
                  .map((mentor) => {
                    const overCapacity = mentor.allocatedCount >= mentor.threshold;
                    return (
                      <button
                        key={mentor.mentorId}
                        onClick={() => handleResolveAllocation(mentor.mentorId)}
                        disabled={!resolveProjectId || savingResolve}
                        className="w-full text-left rounded-lg p-3 border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-zinc-900 border-zinc-750 hover:border-zinc-600"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-white font-semibold text-sm">{mentor.mentorName || '—'}</p>
                            <p className="text-gray-500 text-xs">{(mentor.tracks ?? []).join(', ') || 'No tracks assigned'}</p>
                          </div>
                          <span className={`text-xs font-bold shrink-0 ${overCapacity ? 'text-red-400' : 'text-gray-400'}`}>
                            {mentor.allocatedCount}/{mentor.threshold}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!manualAllocateTeam}
        onClose={() => setManualAllocateTeam(null)}
        title="Reallocate"
      >
        {manualAllocateTeam && (
          <div className="space-y-4">
            {manualAllocateStep !== 'choice' && (
              <button
                onClick={() => setManualAllocateStep('choice')}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
              >
                <ArrowLeft size={12} /> Back
              </button>
            )}

            {manualAllocateStep === 'choice' && (
              <>
                <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3 space-y-1">
                  <p className="text-white text-sm font-semibold flex items-center gap-2">
                    {manualAllocateTeam.members.length > 1 ? (
                      <Users2 size={14} className="text-gold shrink-0" />
                    ) : (
                      <User size={14} className="text-gold shrink-0" />
                    )}
                    {manualAllocateTeam.teamName ? (
                      <span className="tracking-wider">{manualAllocateTeam.teamName}</span>
                    ) : (
                      'Unnamed Team'
                    )}
                  </p>
                  <p className="text-gray-300 text-xs">
                    {manualAllocateTeam.members.map((m) => m.fullName || m.studentId).join(', ')}
                  </p>
                  <p className="text-gray-400 text-xs">
                    {manualAllocateTeam.track} · Tier {manualAllocateTeam.tier} · Submitted{' '}
                    {formatDateDisplay(manualAllocateTeam.submittedAt)}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      (STATUS_DOT[manualAllocateTeam.status] ?? STATUS_DOT.pending).text
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${(STATUS_DOT[manualAllocateTeam.status] ?? STATUS_DOT.pending).dot}`} />
                    {STATUS_LABELS[manualAllocateTeam.status] ?? manualAllocateTeam.status}
                  </span>
                </div>

                {[manualAllocateTeam.preference1, manualAllocateTeam.preference2].map((pref, idx) => {
                  const selected = manualAllocateTeam.projectId === pref.projectId;
                  return (
                    <div
                      key={pref.projectId}
                      className={`rounded-lg p-3 border ${selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750'}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Preference {idx + 1}</p>
                        {selected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/20 text-gold">
                            <CheckCircle2 size={11} />
                            Allocated
                          </span>
                        )}
                      </div>
                      <p className="text-white font-semibold text-sm">{pref.projectTitle}</p>
                      {(selected ? manualAllocateTeam.mentorName ?? pref.mentorName : pref.mentorName) && (
                        <p className="text-gray-400 text-xs mt-0.5">
                          {selected ? manualAllocateTeam.mentorName ?? pref.mentorName : pref.mentorName}
                        </p>
                      )}
                    </div>
                  );
                })}

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => setManualAllocateStep('assignProject')}
                    className="flex items-center justify-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
                  >
                    <ArrowLeftRight size={14} />
                    Assign Project
                  </button>
                  <button
                    onClick={() => setManualAllocateStep('preference')}
                    className="flex items-center justify-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
                  >
                    <UserCog size={14} />
                    Assign Project & Mentor
                  </button>
                  <button
                    onClick={openFreeformStep}
                    className="flex items-center justify-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
                  >
                    <Shuffle size={14} />
                    Assign Different Project + Mentor
                  </button>
                </div>
              </>
            )}

            {manualAllocateStep === 'assignProject' && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">Pick a project</p>
                <div className="space-y-2">
                  {[manualAllocateTeam.preference1, manualAllocateTeam.preference2].map((pref, idx) => (
                    <button
                      key={pref.projectId}
                      onClick={() => handleAssignProjectOnly(pref)}
                      className="w-full text-left rounded-lg p-3 border bg-zinc-900 border-zinc-750 hover:border-gold transition-colors"
                    >
                      <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Preference {idx + 1}</p>
                      <p className="text-white font-semibold text-sm">{pref.projectTitle}</p>
                      {pref.mentorName && <p className="text-gray-400 text-xs mt-0.5">{pref.mentorName}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {manualAllocateStep === 'preference' && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">1. Project</p>
                <div className="space-y-2">
                  {[manualAllocateTeam.preference1, manualAllocateTeam.preference2].map((pref, idx) => {
                    const selected = manualAllocateSelectedProjectId === pref.projectId;
                    return (
                      <button
                        key={pref.projectId}
                        onClick={() => pickPreferenceProject(pref)}
                        className={`w-full text-left rounded-lg p-3 border transition-all duration-200 ${
                          selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Preference {idx + 1}</p>
                            <p className="text-white font-semibold text-sm">{pref.projectTitle}</p>
                          </div>
                          {selected && <CheckCircle2 size={16} className="text-gold shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {manualAllocateStep === 'freeform' && (
              <div>
                <div className="flex items-center gap-4 mb-2">
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">1. Project</p>
                  <div className="inline-flex items-center px-2.5 py-1 rounded-lg border border-gold bg-gold/10">
                    <span className="text-gold font-semibold text-xs">{manualAllocateTeam.track}</span>
                  </div>
                </div>
                <input
                  type="text"
                  value={manualAllocateProjectSearch}
                  onChange={(e) => handleManualAllocateProjectSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold mb-2"
                />
                <div className="max-h-56 overflow-y-auto space-y-2">
                  {loadingManualAllocateProjects ? (
                    <div className="flex justify-center py-6">
                      <SpinnerSquare size={28} />
                    </div>
                  ) : (
                    manualAllocateProjects.map((project) => {
                      const selected = manualAllocateSelectedProjectId === project.id;
                      return (
                        <button
                          key={project.id}
                          onClick={() => pickFreeformProject(project)}
                          className={`w-full text-left rounded-lg p-3 border transition-all duration-200 ${
                            selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-white font-semibold text-sm">{project.title}</p>
                            {selected && <CheckCircle2 size={16} className="text-gold shrink-0" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {(manualAllocateStep === 'preference' || manualAllocateStep === 'freeform') && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">2. Mentor</p>
                {!manualAllocateSelectedProjectId && <p className="text-gray-500 text-xs mb-2">Pick a project first.</p>}
                <input
                  type="text"
                  value={manualAllocateMentorSearch}
                  onChange={(e) => setManualAllocateMentorSearch(e.target.value)}
                  placeholder="Search mentors..."
                  disabled={!manualAllocateSelectedProjectId}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold disabled:opacity-50 mb-2"
                />
                <div className="max-h-56 overflow-y-auto space-y-2">
                  {mentorLoadSummary
                    .filter((m) => (m.mentorName || '').toLowerCase().includes(manualAllocateMentorSearch.toLowerCase()))
                    .map((mentor) => {
                      const overCapacity = mentor.allocatedCount >= mentor.threshold;
                      return (
                        <button
                          key={mentor.mentorId}
                          onClick={() => handleManualAllocatePick(mentor.mentorId)}
                          disabled={!manualAllocateSelectedProjectId}
                          className="w-full text-left rounded-lg p-3 border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-zinc-900 border-zinc-750 hover:border-zinc-600"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-white font-semibold text-sm">{mentor.mentorName || '—'}</p>
                              <p className="text-gray-500 text-xs">{(mentor.tracks ?? []).join(', ') || 'No tracks assigned'}</p>
                            </div>
                            <span className={`text-xs font-bold shrink-0 ${overCapacity ? 'text-red-400' : 'text-gray-400'}`}>
                              {mentor.allocatedCount}/{mentor.threshold}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={showCreateTeamModal}
        onClose={() => setShowCreateTeamModal(false)}
        title="Create Team"
        size="xl"
      >
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">
            For students who never went through self-service team formation. Pick a track, 1-2 students without a
            team, a project, and a mentor — the team is created already allocated and marked as overridden.
          </p>

          <div>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">1. Track</p>
            <Select
              variant="filter"
              className="w-full"
              value={createTeamTrack}
              onChange={handleCreateTeamTrackChange}
              placeholder="Select a track"
              options={TRACKS.map((t) => ({ value: t, label: t }))}
            />
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">
              2. Student(s) <span className="normal-case text-gray-500">(pick 1 or 2)</span>
            </p>
            <input
              type="text"
              value={createTeamStudentSearch}
              onChange={(e) => setCreateTeamStudentSearch(e.target.value)}
              placeholder="Search students..."
              className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold mb-2"
            />
            {loadingStudentsWithoutTeam ? (
              <div className="py-4 flex justify-center"><SpinnerSquare size={28} /></div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2">
                {studentsWithoutTeam.length === 0 && (
                  <p className="text-gray-500 text-xs">Every student in this cohort already has a team.</p>
                )}
                {studentsWithoutTeam
                  .filter((s) =>
                    (s.fullName || '').toLowerCase().includes(createTeamStudentSearch.toLowerCase()) ||
                    (s.rollNumber || '').toLowerCase().includes(createTeamStudentSearch.toLowerCase())
                  )
                  .map((student) => {
                    const selected = createTeamSelectedStudentIds.includes(student.id);
                    const disabled = !selected && createTeamSelectedStudentIds.length >= 2;
                    return (
                      <button
                        key={student.id}
                        onClick={() => toggleCreateTeamStudent(student.id)}
                        disabled={disabled}
                        className={`w-full text-left rounded-lg p-3 border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                          selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-white font-semibold text-sm">{student.fullName || '—'}</p>
                            <p className="text-gray-500 text-xs">{student.rollNumber} · {student.batch}</p>
                          </div>
                          {selected && <CheckCircle2 size={16} className="text-gold shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">3. Project</p>
            {!createTeamTrack && <p className="text-gray-500 text-xs mb-2">Pick a track first.</p>}
            <input
              type="text"
              value={createTeamProjectSearch}
              onChange={(e) => setCreateTeamProjectSearch(e.target.value)}
              placeholder="Search projects..."
              disabled={!createTeamTrack}
              className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold disabled:opacity-50 mb-2"
            />
            <div className="max-h-48 overflow-y-auto space-y-2">
              {createTeamProjects
                .filter((p) => p.title.toLowerCase().includes(createTeamProjectSearch.toLowerCase()))
                .map((project) => {
                  const selected = createTeamSelectedProjectId === project.id;
                  return (
                    <button
                      key={project.id}
                      onClick={() => setCreateTeamSelectedProjectId(project.id)}
                      className={`w-full text-left rounded-lg p-3 border transition-all duration-200 ${
                        selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white font-semibold text-sm">{project.title}</p>
                        {selected && <CheckCircle2 size={16} className="text-gold shrink-0" />}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">4. Mentor</p>
            {!createTeamSelectedProjectId && <p className="text-gray-500 text-xs mb-2">Pick a project first.</p>}
            <input
              type="text"
              value={createTeamMentorSearch}
              onChange={(e) => setCreateTeamMentorSearch(e.target.value)}
              placeholder="Search mentors..."
              disabled={!createTeamSelectedProjectId}
              className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold disabled:opacity-50 mb-2"
            />
            <div className="max-h-48 overflow-y-auto space-y-2">
              {mentorLoadSummary
                .filter((m) => (m.mentorName || '').toLowerCase().includes(createTeamMentorSearch.toLowerCase()))
                .map((mentor) => {
                  const overCapacity = mentor.allocatedCount >= mentor.threshold;
                  const selected = createTeamSelectedMentorId === mentor.mentorId;
                  return (
                    <button
                      key={mentor.mentorId}
                      onClick={() => setCreateTeamSelectedMentorId(mentor.mentorId)}
                      disabled={!createTeamSelectedProjectId}
                      className={`w-full text-left rounded-lg p-3 border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                        selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-white font-semibold text-sm">{mentor.mentorName || '—'}</p>
                          <p className="text-gray-500 text-xs">{(mentor.tracks ?? []).join(', ') || 'No tracks assigned'}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-bold ${overCapacity ? 'text-red-400' : 'text-gray-400'}`}>
                            {mentor.allocatedCount}/{mentor.threshold}
                          </span>
                          {selected && <CheckCircle2 size={16} className="text-gold shrink-0" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleCreateTeam}
              disabled={
                savingCreateTeam ||
                !createTeamTrack ||
                createTeamSelectedStudentIds.length === 0 ||
                !createTeamSelectedProjectId ||
                !createTeamSelectedMentorId
              }
              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
            >
              <UserPlus size={14} />
              {savingCreateTeam ? 'Creating...' : 'Lock Team'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showLoadSummary} onClose={() => setShowLoadSummary(false)} title="Mentor Load Summary">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {mentorPickerLoading ? (
            <div className="py-4 flex justify-center"><SpinnerSquare size={28} /></div>
          ) : mentorLoadSummary.length === 0 ? (
            <p className="text-gray-400 text-sm">No mentor capacity configured for this cohort yet.</p>
          ) : (
            [...mentorLoadSummary]
              .sort((a, b) => (a.mentorName || '').localeCompare(b.mentorName || ''))
              .map((row) => {
                const overCapacity = row.allocatedCount > row.threshold;
                return (
                  <div
                    key={row.mentorId}
                    className="flex items-center justify-between gap-3 bg-zinc-800/50 border border-zinc-750 rounded-lg px-3 py-2"
                  >
                    <div>
                      <p className="text-white text-sm font-medium">{row.mentorName || '—'}</p>
                      <p className="text-gray-500 text-xs">{(row.tracks ?? []).join(', ') || 'No tracks assigned'}</p>
                    </div>
                    <span className={`text-sm font-bold ${overCapacity ? 'text-red-400' : 'text-gray-300'}`}>
                      {row.allocatedCount}/{row.threshold}
                    </span>
                  </div>
                );
              })
          )}
        </div>
      </Modal>
    </div>
  );
}
