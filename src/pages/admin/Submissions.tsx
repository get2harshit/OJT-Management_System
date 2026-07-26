import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, Eye, Loader2 } from 'lucide-react';
import SplitPane from '../../components/SplitPane';
import RosterList from '../../components/RosterList';
import SubmissionDetail from '../../components/SubmissionDetail';
import ReviewActions from '../../components/ReviewActions';
import Select from '../../components/Select';
import type { PrdSubmission, DocumentType, ApiMentor, Cohort } from '../../lib/types';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from '../../lib/types';
import {
  apiGetAllPrdSubmissions,
  apiGetTeamsForCohortDetailed,
  apiListMentors,
  apiGetPrdDownloadUrl,
  apiListCohorts,
  apiReviewPrdSubmission,
} from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import { TRACKS } from '../../lib/constants';
import { statusDotClass } from '../../lib/submissionDisplay';
import { useToast } from '../../toast';

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
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

export default function AdminSubmissions() {
  const { showSuccess, showError } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortFilter, setCohortFilter] = useState('');
  const [cohortsLoaded, setCohortsLoaded] = useState(false);
  const [globalMentors, setGlobalMentors] = useState<ApiMentor[]>([]);

  const [page, setPage] = useState(1);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [rosterPagination, setRosterPagination] = useState({ page: 1, totalPages: 1 });
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [batchFilter, setBatchFilter] = useState('ALL');
  const [trackFilter, setTrackFilter] = useState('ALL');
  const [mentorFilter, setMentorFilter] = useState('ALL');
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentType | 'ALL'>('ALL');

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const [reviewing, setReviewing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Resolves cohorts AND the default cohortFilter in the same state update
  // (not a separate effect reacting to `cohorts`) — otherwise loadRoster
  // below fires once with cohortFilter still '' and then again a render
  // later once the default is picked, doubling every call for no reason.
  useEffect(() => {
    apiListCohorts()
      .then((list) => {
        setCohorts(list);
        const active = list.find(c => c.is_active || (c as { activeStatus?: boolean }).activeStatus) || list[0];
        if (active) setCohortFilter(active.id);
      })
      .catch(() => setCohorts([]))
      .finally(() => setCohortsLoaded(true));
  }, []);

  useEffect(() => {
    apiListMentors().then(setGlobalMentors).catch(() => setGlobalMentors([]));
  }, []);

  const selectedCohort = cohorts.find((c) => c.id === cohortFilter);
  const isPublished = !!selectedCohort?.allocationPublishedAt;

  const loadRoster = useCallback(async () => {
    if (!cohortFilter) return;
    setLoading(true);
    setError(null);
    try {
      if (!isPublished) {
        setRosterStudents([]);
        setRosterPagination({ page: 1, totalPages: 1 });
        setRows([]);
        return;
      }

      const [teamsPage, allSubs] = await Promise.all([
        apiGetTeamsForCohortDetailed(cohortFilter, {
          status: 'allocated',
          track: trackFilter !== 'ALL' ? trackFilter : undefined,
          batch: batchFilter !== 'ALL' ? batchFilter : undefined,
          mentorId: mentorFilter !== 'ALL' ? mentorFilter : undefined,
          search: rosterSearch || undefined,
          page,
          limit: PAGE_SIZE,
        }),
        apiGetAllPrdSubmissions(),
      ]);

      const flattenedStudents = teamsPage.data.flatMap((team) =>
        team.members.map((m) => ({
          studentId: m.studentId,
          fullName: m.fullName,
          rollNumber: m.rollNumber,
          batch: m.batch,
          track: team.track,
        }))
      );
      setRosterStudents(flattenedStudents);
      setRosterPagination({ page: teamsPage.pagination.page, totalPages: teamsPage.pagination.totalPages });

      // studentId/primaryMentorId/cohortId come back inline on every
      // submission (a backend join against ojt_allocations) — no separate
      // GET /allocations/:id per unique allocation needed.
      const mapped = allSubs.reduce<Row[]>((acc, s) => {
        if (!s.studentId || s.cohortId !== cohortFilter) return acc;
        acc.push({ ...s, studentId: s.studentId, mentorId: s.primaryMentorId });
        return acc;
      }, []);
      setRows(mapped);
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

  // Pending-review count per student, shown as the roster badge.
  const pendingCountByStudent = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      if (r.status === 'submitted' || r.status === 'under_review') {
        map.set(r.studentId, (map.get(r.studentId) ?? 0) + 1);
      }
    });
    return map;
  }, [rows]);

  const rosterItems = useMemo(
    () =>
      rosterStudents.map((s) => ({
        id: s.studentId,
        primaryLabel: s.fullName || s.studentId,
        secondaryLabel: [s.rollNumber, s.batch].filter(Boolean).join(' · '),
        badge: pendingCountByStudent.get(s.studentId) ?? 0,
      })),
    [rosterStudents, pendingCountByStudent]
  );

  const handleCohortChange = (value: string) => {
    setPage(1);
    setCohortFilter(value);
  };
  const handleBatchFilterChange = (value: string) => {
    setPage(1);
    setBatchFilter(value);
  };
  const handleTrackFilterChange = (value: string) => {
    setPage(1);
    setTrackFilter(value);
  };
  const handleMentorFilterChange = (value: string) => {
    setPage(1);
    setMentorFilter(value);
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
  const studentRows = rows
    .filter((r) => r.studentId === selectedStudentId)
    .filter((r) => docTypeFilter === 'ALL' || r.documentType === docTypeFilter);
  const activeSub = rows.find((r) => r.id === selectedSubId);

  useEffect(() => {
    if (!activeSub) {
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
      await loadRoster();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update review');
    } finally {
      setReviewing(false);
    }
  };

  const selectStudent = (id: string) => {
    setSelectedStudentId(id);
    setSelectedSubId(null);
    setDocTypeFilter('ALL');
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="shrink-0 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Submissions</h1>
          <p className="text-gray-400 text-sm mt-1">Review and manage student submissions</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={cohortFilter}
            onChange={(v) => handleCohortChange(v as string)}
            variant="filter"
            placeholder="Select cohort"
            options={cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) }))}
          />
          <Select
            value={batchFilter}
            onChange={(v) => handleBatchFilterChange(v as string)}
            variant="filter"
            options={[
              { value: 'ALL', label: 'All Batches' },
              ...(selectedCohort?.allowedBatches ?? []).map((b) => ({ value: b, label: b })),
            ]}
          />
          <Select
            value={trackFilter}
            onChange={(v) => handleTrackFilterChange(v as string)}
            variant="filter"
            options={[{ value: 'ALL', label: 'All Tracks' }, ...TRACKS.map((t) => ({ value: t, label: t }))]}
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
            selectedId={selectedStudentId}
            onSelect={selectStudent}
            onSearchChange={handleRosterSearchChange}
            pagination={{ page: rosterPagination.page, totalPages: rosterPagination.totalPages, onPageChange: setPage }}
            searchPlaceholder="Search students..."
            emptyMessage={
              loading
                ? 'Loading students…'
                : !isPublished
                ? "This cohort's allocation hasn't been published yet."
                : 'No students match these filters.'
            }
          />
        }
      >
        {!selectedStudent ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center px-6">
            {isPublished ? 'Select a student to view their submissions.' : "This cohort's allocation hasn't been published yet — students only appear here once their project and mentor are live."}
          </div>
        ) : activeSub ? (
          <div className="space-y-0">
            <div className="px-6 pt-6">
              <button
                onClick={() => setSelectedSubId(null)}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-gray-300 rounded-lg hover:text-white hover:bg-zinc-700 transition-all text-sm font-semibold border border-zinc-700"
              >
                <ArrowLeft size={16} />
                Back to {selectedStudent.fullName || 'student'}'s submissions
              </button>
            </div>
            <SubmissionDetail
              status={activeSub.status}
              documentType={activeSub.documentType}
              versionNumber={activeSub.versionNumber}
              updatedAt={activeSub.updatedAt}
              documentLink={activeSub.documentLink}
              messageContent={activeSub.messageContent}
              mentorFeedback={activeSub.mentorFeedback}
              viewerUrl={viewerUrl}
              downloading={downloadingId === activeSub.id}
              downloadError={downloadError}
              onDownload={handleDownload}
              headerExtra={
                <p className="text-xs text-gray-500 mt-1">
                  {selectedStudent.fullName} ({selectedStudent.rollNumber}) · {selectedStudent.track}
                </p>
              }
              reviewControls={
                <ReviewActions
                  disabled={reviewing || activeSub.status === 'approved'}
                  onApprove={() => handleReview('approved')}
                  onRequestChanges={(feedback) => handleReview('changes_requested', feedback)}
                />
              }
            />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">{selectedStudent.fullName}</h2>
              <p className="text-xs text-gray-500">
                {selectedStudent.rollNumber} · {selectedStudent.track} · {selectedStudent.batch}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setDocTypeFilter('ALL')}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${docTypeFilter === 'ALL' ? 'border-gold text-gold bg-gold/10' : 'border-zinc-700 text-gray-400 hover:border-zinc-600'}`}
              >
                All
              </button>
              {DOCUMENT_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setDocTypeFilter(type)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${docTypeFilter === type ? 'border-gold text-gold bg-gold/10' : 'border-zinc-700 text-gray-400 hover:border-zinc-600'}`}
                >
                  {DOCUMENT_TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-gray-500" />
              </div>
            ) : studentRows.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-10">No submissions from this student yet.</p>
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
                        <p className="text-sm font-medium text-white truncate">
                          {DOCUMENT_TYPE_LABELS[row.documentType]} · v{row.versionNumber}
                        </p>
                        <p className="text-xs text-gray-500">{row.updatedAt.slice(0, 10)}</p>
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
