import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Eye, Loader2, Users, X } from 'lucide-react';
import Button from '../../components/Button';
import SplitPane from '../../components/SplitPane';
import RosterList from '../../components/RosterList';
import SubmissionDetail from '../../components/SubmissionDetail';
import ReviewActions from '../../components/ReviewActions';
import Select from '../../components/Select';
import type { PrdSubmission, ApiMentor, Cohort, SubmissionKind, TeamAllocationDetail } from '../../lib/types';
import { DOCUMENT_TYPE_LABELS } from '../../lib/types';
import {
  apiGetAllPrdSubmissions,
  apiGetSubmissionsByStudent,
  apiGetTeamsForCohortDetailed,
  apiListMentors,
  apiGetPrdDownloadUrl,
  apiListCohorts,
  apiReviewPrdSubmission,
} from '../../lib/api';
import { statusDotClass } from '../../lib/submissionDisplay';
import { exportToCSV } from '../../lib/csvExport';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';
import { useTracks } from '../../hooks/useTracks';

type Row = PrdSubmission & { studentId: string; mentorId?: string };

// A student only has a project/mentor (and so can only have submissions)
// once their team's allocation is both resolved AND the cohort has been
// published — there's no per-team "published" flag, publish is sticky and
// cohort-wide (ojt_cohorts.allocation_published_at), same gate the
// student's/mentor's own apps use (TeamService.getMyStatus,
// getTeamsForMentorDetailed). Built from getTeamsForCohortDetailed's
// members instead of a raw student list so batch/track/mentor/search and
// pagination are all handled server-side by that (already paginated,
// already filterable) endpoint.
interface RosterStudent {
  studentId: string;
  fullName: string | null;
  rollNumber: string | null;
  batch: string | null;
  track: string;
  pendingReviewCount: number;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

interface Props {
  // Set by the Tasks tab's "View Submission" action to jump straight to a
  // specific student's submission for a given task — resets the roster
  // filters. The caller navigates here on the task's own cohort's route
  // (ojts/:cohortId/submissions) before setting this, so there's no cohort
  // to switch to any more — the URL already names it. onFocusHandled clears
  // it once consumed so a later manual visit to this tab doesn't re-trigger it.
  focusStudentId?: string | null;
  focusTaskId?: string | null;
  onFocusHandled?: () => void;
}

export default function AdminSubmissions({
  focusStudentId,
  focusTaskId,
  onFocusHandled,
}: Props = {}) {
  const { showSuccess, showError } = useToast();
  const { options: trackOptions } = useTracks();
  const [searchParams, setSearchParams] = useSearchParams();

  // The cohort this page is scoped to comes from the OJT Setup shell's own
  // route (ojts/:cohortId/submissions) — same treatment as Tasks.tsx.
  const { cohortId: cohortFilter } = useParams<{ cohortId: string }>();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortsLoaded, setCohortsLoaded] = useState(false);
  const [globalMentors, setGlobalMentors] = useState<ApiMentor[]>([]);

  const [page, setPage] = useState(1);
  const [rosterSearch, setRosterSearch] = useState('');
  // The page's teams, whole — student mode flattens this into one row per
  // member, team mode renders it as-is. One fetch backs both views, so
  // switching modes never re-hits the server.
  const [rosterTeams, setRosterTeams] = useState<TeamAllocationDetail[]>([]);
  const [rosterPagination, setRosterPagination] = useState({ page: 1, totalPages: 1 });
  const [rosterMode, setRosterMode] = useState<'student' | 'team'>('student');
  // Only the clicked student's submissions — fetched per-student, never the
  // whole cohort's at once.
  const [studentSubmissions, setStudentSubmissions] = useState<Row[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Empty selection means no filter (every batch/track) — same as the old
  // 'ALL' sentinel, just expressed as "nothing picked" the way a multi-select
  // naturally does, instead of a synthetic option living in the list.
  const [batchFilter, setBatchFilter] = useState<string[]>([]);
  const [trackFilter, setTrackFilter] = useState<string[]>([]);
  const [mentorFilter, setMentorFilter] = useState(searchParams.get('mentorId') || 'ALL');
  // Keyed by taskId when a submission is linked to one, else a synthetic
  // `type:<documentType>` key for older/unlinked submissions — a task's
  // title is what identifies a submission now, not a fixed document-type
  // enum, so filtering groups by task rather than by type.
  const [taskFilter, setTaskFilter] = useState<string>('ALL');

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const [reviewing, setReviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const loadCohorts = useCallback(() => {
    return apiListCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]))
      .finally(() => setCohortsLoaded(true));
  }, []);

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  const loadGlobalMentors = useCallback(() => {
    return apiListMentors().then(setGlobalMentors).catch(() => setGlobalMentors([]));
  }, []);

  useEffect(() => {
    loadGlobalMentors();
  }, [loadGlobalMentors]);

  const selectedCohort = cohorts.find((c) => c.id === cohortFilter);
  const isPublished = !!selectedCohort?.allocationPublishedAt;

  const loadRoster = useCallback(async () => {
    if (!cohortFilter) return;
    setLoading(true);
    setError(null);
    try {
      if (!isPublished) {
        setRosterTeams([]);
        setRosterPagination({ page: 1, totalPages: 1 });
        return;
      }

      // Just the visible page of teams — with each member's pending-review
      // count attached server-side (withPendingReviewCounts), so the badge
      // needs no separate submissions fetch. Paginated by team either way;
      // student mode just flattens the same page into one row per member.
      const teamsPage = await apiGetTeamsForCohortDetailed(cohortFilter, {
        status: 'allocated',
        track: trackFilter.length > 0 ? trackFilter : undefined,
        batch: batchFilter.length > 0 ? batchFilter : undefined,
        mentorId: mentorFilter !== 'ALL' ? mentorFilter : undefined,
        search: rosterSearch || undefined,
        page,
        limit: PAGE_SIZE,
        withPendingReviewCounts: true,
      });

      setRosterTeams(teamsPage.data);
      setRosterPagination({ page: teamsPage.pagination.page, totalPages: teamsPage.pagination.totalPages });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [cohortFilter, isPublished, trackFilter, batchFilter, mentorFilter, rosterSearch, page]);

  useEffect(() => {
    if (!cohortsLoaded || !cohortFilter) return;
    loadRoster();
  }, [cohortsLoaded, cohortFilter, loadRoster]);

  const rosterStudents = useMemo<RosterStudent[]>(
    () =>
      rosterTeams.flatMap((team) =>
        team.members.map((m) => ({
          studentId: m.studentId,
          fullName: m.fullName,
          rollNumber: m.rollNumber,
          batch: m.batch,
          track: team.track,
          pendingReviewCount: m.pendingReviewCount ?? 0,
        }))
      ),
    [rosterTeams]
  );

  // The clicked student's own submissions — backend-scoped by studentId.
  const loadStudentSubmissions = useCallback(async (studentId: string) => {
    setSubmissionsLoading(true);
    try {
      const subs = await apiGetSubmissionsByStudent(studentId);
      // s.studentId is whoever actually submitted it — for a teammate's
      // shared team submission that isn't the student we asked for, so keep
      // the backend's answer and only fall back to the one we queried.
      const rows = subs.map((s) => ({ ...s, studentId: s.studentId ?? studentId, mentorId: s.primaryMentorId }));
      setStudentSubmissions(rows);
      return rows;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
      setStudentSubmissions([]);
      return [];
    } finally {
      setSubmissionsLoading(false);
    }
  }, []);

  // A team's own submissions, merged from every member. A team-assigned
  // task's submission is shared — querying "by student" returns it for
  // every member on the team identically — so it would appear once per
  // member here if not deduped. Every member is queried rather than just
  // one, because a member who joined after a task was fanned out has no
  // assignment row for it and so wouldn't surface that task's work at all.
  const loadTeamSubmissions = useCallback(async (teamId: string) => {
    const team = rosterTeams.find((t) => t.teamId === teamId);
    if (!team) return [];
    setSubmissionsLoading(true);
    try {
      const perMember = await Promise.all(
        team.members.map((m) =>
          apiGetSubmissionsByStudent(m.studentId).then((subs) =>
            // Keep the backend's studentId (the real submitter) rather than
            // the member whose fetch happened to surface it — the same row
            // comes back from several members' calls.
            subs.map((s) => ({ ...s, studentId: s.studentId ?? m.studentId, mentorId: s.primaryMentorId }))
          )
        )
      );
      const seen = new Set<string>();
      const merged: Row[] = [];
      for (const row of perMember.flat()) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }
      setStudentSubmissions(merged);
      return merged;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
      setStudentSubmissions([]);
      return [];
    } finally {
      setSubmissionsLoading(false);
    }
  }, [rosterTeams]);

  usePageRefresh(useCallback(() => Promise.all([
    loadCohorts(),
    loadGlobalMentors(),
    cohortsLoaded && cohortFilter ? loadRoster() : Promise.resolve(),
    selectedStudentId
      ? loadStudentSubmissions(selectedStudentId)
      : selectedTeamId
      ? loadTeamSubmissions(selectedTeamId)
      : Promise.resolve(),
  ]), [loadCohorts, loadGlobalMentors, loadRoster, cohortsLoaded, cohortFilter, selectedStudentId, selectedTeamId, loadStudentSubmissions, loadTeamSubmissions]));

  // Resets every roster filter and switches cohort if needed, so the target
  // student is never hidden by a stale batch/track/mentor/search filter or
  // the wrong page — then loads their submissions directly (this doesn't
  // depend on the roster having loaded; the roster is only needed for the
  // header's name/roll/track display, which degrades gracefully below if it
  // hasn't caught up yet).
  useEffect(() => {
    if (!focusStudentId) return;

    setPage(1);
    setRosterSearch('');
    setBatchFilter([]);
    setTrackFilter([]);
    setMentorFilter('ALL');

    // This jump always means one specific student, regardless of whichever
    // view the admin was last browsing in.
    setRosterMode('student');
    setSelectedTeamId(null);
    setSelectedStudentId(focusStudentId);
    setSelectedSubId(null);
    setTaskFilter('ALL');
    setStudentSubmissions([]);

    loadStudentSubmissions(focusStudentId).then((rows) => {
      if (focusTaskId) {
        const matches = rows.filter((r) => r.taskId === focusTaskId);
        const latest = matches.sort((a, b) => b.versionNumber - a.versionNumber)[0];
        if (latest) {
          setTaskFilter(latest.taskId ?? `type:${latest.documentType}`);
          setSelectedSubId(latest.id);
        }
      }
      onFocusHandled?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStudentId, focusTaskId]);

  const rosterItems = useMemo(
    () =>
      rosterMode === 'student'
        ? rosterStudents.map((s) => ({
            id: s.studentId,
            primaryLabel: s.fullName || s.studentId,
            secondaryLabel: [s.rollNumber, s.batch].filter(Boolean).join(' · '),
            badge: s.pendingReviewCount,
          }))
        : rosterTeams.map((team) => ({
            id: team.teamId,
            primaryLabel: team.teamName || (team.isIndividual ? team.members[0]?.fullName || 'Individual' : 'Team'),
            secondaryLabel: team.members.map((m) => m.fullName || 'Unnamed').join(', '),
            badge: team.members.reduce((sum, m) => sum + (m.pendingReviewCount ?? 0), 0),
          })),
    [rosterMode, rosterStudents, rosterTeams]
  );

  const handleBatchFilterChange = (value: string[]) => {
    setPage(1);
    setBatchFilter(value);
  };
  const handleTrackFilterChange = (value: string[]) => {
    setPage(1);
    setTrackFilter(value);
  };
  const handleMentorFilterChange = (value: string) => {
    setPage(1);
    setMentorFilter(value);
  };
  const handleRosterModeChange = (value: string) => {
    setRosterMode(value as 'student' | 'team');
    setSelectedStudentId(null);
    setSelectedTeamId(null);
    setSelectedSubId(null);
    setTaskFilter('ALL');
    setStudentSubmissions([]);
  };
  const clearMentorFilter = () => {
    setPage(1);
    setMentorFilter('ALL');
    const next = new URLSearchParams(searchParams);
    next.delete('mentorId');
    setSearchParams(next, { replace: true });
  };

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleRosterSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setRosterSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const selectedStudent = rosterStudents.find((s) => s.studentId === selectedStudentId);
  const selectedTeam = rosterTeams.find((t) => t.teamId === selectedTeamId);
  const submissionTaskKey = (r: Row) => r.taskId ?? `type:${r.documentType}`;
  const submissionTaskLabel = (r: Row) => r.taskTitle ?? DOCUMENT_TYPE_LABELS[r.documentType];
  // Same split as the CSV export: Student mode browses individual work,
  // Team mode browses the team's shared work — never both at once, so
  // Browse and Export always agree. activeSub below deliberately still
  // resolves off the full, unfiltered studentSubmissions — a focused
  // deep-link (jump from Tasks) can land on a submission this would
  // otherwise hide, and it should still open correctly.
  const visibleSubmissions = studentSubmissions.filter((r) => !!r.isTeam === (rosterMode === 'team'));
  // What the mode split is holding back — drives the empty state's "it's
  // over in the other mode" hint instead of implying there's nothing.
  const hiddenByModeCount = studentSubmissions.length - visibleSubmissions.length;
  const taskFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of visibleSubmissions) {
      const key = submissionTaskKey(r);
      if (!seen.has(key)) seen.set(key, submissionTaskLabel(r));
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSubmissions]);
  const studentRows = visibleSubmissions.filter(
    (r) => taskFilter === 'ALL' || submissionTaskKey(r) === taskFilter
  );
  const activeSub = studentSubmissions.find((r) => r.id === selectedSubId);
  const activeSubKind: SubmissionKind = activeSub?.submissionType ?? 'document';
  // Whoever this specific submission belongs to — in student mode that's
  // always selectedStudent, but team mode mixes several people's rows
  // together, so the detail header has to look each one up individually.
  const activeSubStudent = rosterStudents.find((s) => s.studentId === activeSub?.studentId);

  useEffect(() => {
    // Only a document submission has a stored file to view.
    if (!activeSub || activeSubKind !== 'document') {
      setViewerUrl(null);
      return;
    }
    let cancelled = false;
    apiGetPrdDownloadUrl(activeSub.id)
      .then((url) => { if (!cancelled) setViewerUrl(url); })
      .catch(() => { if (!cancelled) setViewerUrl(null); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSub?.id]);

  const handleDownload = async () => {
    if (!activeSub) return;
    setDownloadError(null);
    setDownloadingId(activeSub.id);
    try {
      const url = await apiGetPrdDownloadUrl(activeSub.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to generate download link');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleReview = async (status: 'changes_requested' | 'approved', feedback?: string) => {
    if (!activeSub) return;
    setReviewing(true);
    try {
      await apiReviewPrdSubmission(activeSub.id, status, feedback);
      showSuccess(status === 'approved' ? 'Submission approved.' : 'Changes requested — the student has been notified.');
      // Refresh just what's on screen (the reviewed status) and the roster
      // (its pending-review badge) — not the whole cohort.
      await Promise.all([
        selectedStudentId
          ? loadStudentSubmissions(selectedStudentId)
          : selectedTeamId
          ? loadTeamSubmissions(selectedTeamId)
          : Promise.resolve(),
        loadRoster(),
      ]);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update review');
    } finally {
      setReviewing(false);
    }
  };

  // RosterList's onSelect is one callback regardless of what's listed —
  // which one it means depends on rosterMode.
  const selectRosterItem = (id: string) => {
    setSelectedSubId(null);
    setTaskFilter('ALL');
    setStudentSubmissions([]);
    if (rosterMode === 'student') {
      setSelectedStudentId(id);
      loadStudentSubmissions(id);
    } else {
      setSelectedTeamId(id);
      loadTeamSubmissions(id);
    }
  };

  // Every submission from whoever the current Batch/Track/Mentor/search
  // filters match — the same set the roster is already showing, just
  // unpaginated. The roster call itself caps at 200 teams/page, so a large
  // cohort is walked page by page rather than assumed to fit in one call.
  const handleExportCsv = async () => {
    if (!cohortFilter) return;
    setExporting(true);
    try {
      const allTeams: TeamAllocationDetail[] = [];
      let teamsPageNum = 1;
      let totalTeamPages = 1;
      do {
        const teamsPage = await apiGetTeamsForCohortDetailed(cohortFilter, {
          status: 'allocated',
          track: trackFilter.length > 0 ? trackFilter : undefined,
          batch: batchFilter.length > 0 ? batchFilter : undefined,
          mentorId: mentorFilter !== 'ALL' ? mentorFilter : undefined,
          search: rosterSearch || undefined,
          page: teamsPageNum,
          limit: 200,
        });
        allTeams.push(...teamsPage.data);
        totalTeamPages = teamsPage.pagination.totalPages;
        teamsPageNum += 1;
      } while (teamsPageNum <= totalTeamPages);

      // studentId -> everything the roster already knows about them, so a
      // submission's own row doesn't need a second lookup to say who/where.
      const studentInfo = new Map<
        string,
        { fullName: string; rollNumber: string | null; batch: string | null; track: string; teamName: string }
      >();
      for (const team of allTeams) {
        for (const m of team.members) {
          studentInfo.set(m.studentId, {
            fullName: m.fullName || m.studentId,
            rollNumber: m.rollNumber,
            batch: m.batch,
            track: team.track,
            teamName: team.teamName || (team.isIndividual ? 'Individual' : 'Team'),
          });
        }
      }

      if (studentInfo.size === 0) {
        showError('No students match the current filters — nothing to export.');
        return;
      }

      const allSubmissions = await apiGetAllPrdSubmissions(undefined, cohortFilter, true);
      const filtered = allSubmissions
        // By Student is individual work only; By Team is only the shared
        // team submissions — the two never mix, the same way the on-screen
        // roster shows one or the other depending on this same toggle.
        .filter((s) => s.studentId && studentInfo.has(s.studentId) && !!s.isTeam === (rosterMode === 'team'));

      // The export is a current-state report, not a full audit trail — a
      // resubmitted task should contribute one row (its latest version),
      // not one row per historical version. Individual work is keyed by
      // student+task; a team's shared work is keyed by team+task instead,
      // since a resubmit can land under a different teammate's name and
      // would otherwise read as two separate pieces of work.
      const latestByKey = new Map<string, (typeof filtered)[number]>();
      for (const s of filtered) {
        const taskKey = s.taskId ?? `type:${s.documentType}`;
        const key = s.isTeam ? `team:${taskKey}:${s.teamId ?? s.teamName ?? ''}` : `student:${taskKey}:${s.studentId}`;
        const existing = latestByKey.get(key);
        if (!existing || s.versionNumber > existing.versionNumber) {
          latestByKey.set(key, s);
        }
      }

      const entries = Array.from(latestByKey.values())
        .map((s) => {
          const info = studentInfo.get(s.studentId!)!;
          // A team submission's own recorded team (at the time it was
          // fanned out) is more accurate than the roster's current team —
          // a student who's since moved teams still submitted it under the old one.
          const teamName = s.isTeam ? s.teamName || info.teamName : info.teamName;
          return {
            teamName,
            studentName: info.fullName,
            row: {
              Mentor: s.mentorName || '',
              Team: teamName,
              Student: info.fullName,
              'Reg No': info.rollNumber || '',
              Batch: info.batch || '',
              Track: info.track,
              'Task Title': s.taskTitle || DOCUMENT_TYPE_LABELS[s.documentType],
              Version: s.versionNumber,
              Status: s.status.replace(/_/g, ' '),
              'Submission Type': s.submissionType || 'document',
              // A real signed link for a document submission (7-day expiry,
              // resolved server-side via includeDownloadUrls); text/link
              // submissions have no file, so messageContent is the content.
              'Document Link': s.downloadUrl || s.messageContent || '',
              'Updated At': s.updatedAt.slice(0, 10),
              'Mentor Feedback': s.mentorFeedback || '',
              'Reviewed By': s.reviewedByName || '',
            },
          };
        });
      entries.sort((a, b) =>
        rosterMode === 'team'
          ? a.teamName.localeCompare(b.teamName) || a.studentName.localeCompare(b.studentName)
          : a.studentName.localeCompare(b.studentName)
      );
      const rows = entries.map((e) => e.row);

      if (rows.length === 0) {
        showError('No submissions from the current filters — nothing to export.');
        return;
      }

      exportToCSV(`${selectedCohort?.name || 'submissions'} - submissions`, rows);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to export submissions');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="shrink-0 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Submissions</h1>
          <p className="text-gray-400 text-sm mt-1">Review and manage student submissions</p>
          {mentorFilter !== 'ALL' && (
            <div className="flex items-center gap-2 text-xs bg-gold/10 border border-gold/20 text-gold rounded-lg px-3 py-2 w-fit mt-2">
              <span>
                Showing only {globalMentors.find((m) => m.id === mentorFilter)?.fullName || 'this mentor'}&apos;s students
              </span>
              <button onClick={clearMentorFilter} className="hover:text-white transition-colors" aria-label="Clear mentor filter">
                <X size={13} />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={rosterMode}
            onChange={(v) => handleRosterModeChange(v as string)}
            variant="filter"
            options={[
              { value: 'student', label: 'By Student' },
              { value: 'team', label: 'By Team' },
            ]}
          />
          <Select
            isMulti
            value={batchFilter}
            onChange={handleBatchFilterChange}
            variant="filter"
            placeholder="All Batches"
            options={(selectedCohort?.allowedBatches ?? []).map((b) => ({ value: b, label: b }))}
          />
          <Select
            isMulti
            value={trackFilter}
            onChange={handleTrackFilterChange}
            variant="filter"
            placeholder="All Tracks"
            options={trackOptions}
          />
          <Select
            value={mentorFilter}
            onChange={(v) => handleMentorFilterChange(v as string)}
            variant="filter"
            options={[
              { value: 'ALL', label: 'All Mentors' },
              ...globalMentors.map((m) => ({ value: m.id, label: m.fullName || m.email || m.id })),
            ]}
          />
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={handleExportCsv}
            isLoading={exporting}
            disabled={!isPublished}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      <SplitPane
        sidebarCollapsed={!!activeSub}
        sidebar={
          <RosterList
            items={rosterItems}
            selectedId={rosterMode === 'student' ? selectedStudentId : selectedTeamId}
            onSelect={selectRosterItem}
            onSearchChange={handleRosterSearchChange}
            pagination={{ page: rosterPagination.page, totalPages: rosterPagination.totalPages, onPageChange: setPage }}
            searchPlaceholder={rosterMode === 'student' ? 'Search students...' : 'Search teams...'}
            emptyMessage={
              loading
                ? 'Loading…'
                : !isPublished
                ? "This cohort's allocation hasn't been published yet."
                : rosterMode === 'student'
                ? 'No students match these filters.'
                : 'No teams match these filters.'
            }
          />
        }
      >
        {!selectedStudentId && !selectedTeamId ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center px-6">
            {isPublished
              ? `Select a ${rosterMode} to view ${rosterMode === 'student' ? 'their' : 'its'} submissions.`
              : "This cohort's allocation hasn't been published yet — students only appear here once their project and mentor are live."}
          </div>
        ) : activeSub ? (
          <div className="space-y-0">
            <div className="px-6 pt-6">
              <button
                onClick={() => setSelectedSubId(null)}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-gray-300 rounded-lg hover:text-white hover:bg-zinc-700 transition-all text-sm font-semibold border border-zinc-700"
              >
                <ArrowLeft size={16} />
                {selectedStudent || selectedTeam ? `Back to ${selectedStudent?.fullName || selectedTeam?.teamName}'s submissions` : 'Back to submissions'}
              </button>
            </div>
            <SubmissionDetail
              status={activeSub.status}
              submissionKind={activeSubKind}
              versionNumber={activeSub.versionNumber}
              updatedAt={activeSub.updatedAt}
              documentLink={activeSub.documentLink}
              messageContent={activeSub.messageContent}
              mentorFeedback={activeSub.mentorFeedback}
              reviewedByName={activeSub.reviewedByName}
              viewerUrl={viewerUrl}
              downloading={downloadingId === activeSub.id}
              downloadError={downloadError}
              onDownload={handleDownload}
              headerExtra={
                activeSub.isTeam ? (
                  <p className="text-xs text-gray-500 mt-1">
                    Team {activeSub.teamName || selectedTeam?.teamName}
                    {activeSub.submitterName && <> · submitted by {activeSub.submitterName}</>}
                  </p>
                ) : activeSubStudent ? (
                  <p className="text-xs text-gray-500 mt-1">
                    {activeSubStudent.fullName} ({activeSubStudent.rollNumber}) · {activeSubStudent.track}
                  </p>
                ) : undefined
              }
              reviewControls={
                activeSub.taskAssignedByRole === 'mentor' ? (
                  <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    This task was assigned by a mentor — admin has view-only access here; only the assigning mentor or the student's own mentor can approve or request changes.
                  </p>
                ) : (
                  <ReviewActions
                    disabled={reviewing || activeSub.status === 'approved'}
                    onApprove={() => handleReview('approved')}
                    onRequestChanges={(feedback) => handleReview('changes_requested', feedback)}
                  />
                )
              }
            />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              {rosterMode === 'team' && selectedTeam ? (
                <>
                  <h2 className="text-lg font-bold text-white">{selectedTeam.teamName || 'Team'}</h2>
                  <p className="text-xs text-gray-500">
                    {selectedTeam.members.map((m) => m.fullName || 'Unnamed').join(', ')}{' · '}{selectedTeam.track}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-white">{selectedStudent?.fullName || 'Student'}</h2>
                  <p className="text-xs text-gray-500">
                    {selectedStudent ? `${selectedStudent.rollNumber} · ${selectedStudent.track} · ${selectedStudent.batch}` : ' '}
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTaskFilter('ALL')}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${taskFilter === 'ALL' ? 'border-gold text-gold bg-gold/10' : 'border-zinc-700 text-gray-400 hover:border-zinc-600'}`}
              >
                All
              </button>
              {taskFilterOptions.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTaskFilter(key)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${taskFilter === key ? 'border-gold text-gold bg-gold/10' : 'border-zinc-700 text-gray-400 hover:border-zinc-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {submissionsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-gray-500" />
              </div>
            ) : studentRows.length === 0 ? (
              <div className="text-center py-10 space-y-1">
                <p className="text-gray-500 text-sm">
                  {rosterMode === 'team' ? 'No team submissions from this team yet.' : 'No individual submissions from this student yet.'}
                </p>
                {/* Work does exist, it just belongs to the other mode — say so
                    rather than leaving "nothing here" to imply there's nothing
                    at all. Reachable from the Tasks deep-link, which lands in
                    student mode and can focus a team submission. */}
                {hiddenByModeCount > 0 && (
                  <p className="text-gray-600 text-xs">
                    {rosterMode === 'team'
                      ? `${hiddenByModeCount} individual ${hiddenByModeCount === 1 ? 'submission' : 'submissions'} from its members — switch to By Student to see ${hiddenByModeCount === 1 ? 'it' : 'them'}.`
                      : `${hiddenByModeCount} team ${hiddenByModeCount === 1 ? 'submission' : 'submissions'} — switch to By Team to see ${hiddenByModeCount === 1 ? 'it' : 'them'}.`}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {studentRows.map((row) => {
                  const style = statusDotClass(row.status);
                  return (
                    <button
                      key={row.id}
                      onClick={() => setSelectedSubId(row.id)}
                      className="w-full flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 hover:border-zinc-600 rounded-lg px-4 py-3 transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate flex items-center gap-2">
                          <span className="truncate">{submissionTaskLabel(row)} · v{row.versionNumber}</span>
                          {/* Only reachable in team mode — visibleSubmissions
                              already splits the two, so a row here is a team
                              row exactly when that's the mode. */}
                          {row.isTeam && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/25 shrink-0">
                              <Users size={10} />
                              {row.teamName ? `Team ${row.teamName}` : 'Team'}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {row.updatedAt.slice(0, 10)}
                          {row.isTeam && row.submitterName && <> · by {row.submitterName}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {row.status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <Eye size={16} className="text-gray-500" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </SplitPane>
    </div>
  );
}
