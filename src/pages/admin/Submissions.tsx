import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Eye, Loader2 } from 'lucide-react';
import SplitPane from '../../components/SplitPane';
import RosterList from '../../components/RosterList';
import SubmissionDetail from '../../components/SubmissionDetail';
import ReviewActions from '../../components/ReviewActions';
import Select from '../../components/Select';
import type { PrdSubmission, StudentAllocation, DocumentType, ApiStudent, ApiMentor } from '../../lib/types';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from '../../lib/types';
import {
  apiGetAllPrdSubmissions,
  apiGetAllocation,
  apiListStudents,
  apiListMentors,
  apiGetPrdDownloadUrl,
  apiListProjects,
  apiReviewPrdSubmission,
} from '../../lib/api';
import { statusDotClass } from '../../lib/submissionDisplay';
import { useToast } from '../../toast';

type Row = PrdSubmission & { studentId: string; mentorId?: string };

export default function AdminSubmissions() {
  const { showSuccess, showError } = useToast();

  const [students, setStudents] = useState<ApiStudent[]>([]);
  const [globalMentors, setGlobalMentors] = useState<ApiMentor[]>([]);
  const [globalTracks, setGlobalTracks] = useState<string[]>([]);
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

  const loadSubmissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allSubs, allStudents, allMentors, allProjects] = await Promise.all([
        apiGetAllPrdSubmissions(),
        apiListStudents(),
        apiListMentors(),
        apiListProjects(),
      ]);

      setStudents(allStudents);
      setGlobalMentors(allMentors);
      setGlobalTracks(
        Array.from(new Set(allProjects.map((p) => p.track).filter((t): t is string => !!t && t !== '-'))).sort()
      );

      const mentorsById = new Map(allMentors.map((m) => [m.id, m]));
      const uniqueAllocationIds = Array.from(new Set(allSubs.map((s) => s.allocationId)));
      const allocations = await Promise.all(uniqueAllocationIds.map((id) => apiGetAllocation(id).catch(() => null)));
      const allocationsById = new Map<string, StudentAllocation>();
      allocations.forEach((alloc, idx) => {
        if (alloc) allocationsById.set(uniqueAllocationIds[idx], alloc);
      });

      const mapped = allSubs.reduce<Row[]>((acc, s) => {
        const alloc = allocationsById.get(s.allocationId);
        if (!alloc) return acc;
        const mentor = alloc.primaryMentorId ? mentorsById.get(alloc.primaryMentorId) : undefined;
        acc.push({ ...s, studentId: alloc.studentId, mentorId: mentor?.id });
        return acc;
      }, []);
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

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

  // Mentor filter operates on which mentor has reviewed/is reviewing a
  // student's submissions — students with no submissions yet have no known
  // mentor from this data, so they drop out only when a mentor filter is active.
  const studentMentorMap = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.mentorId) map.set(r.studentId, r.mentorId);
    });
    return map;
  }, [rows]);

  const rosterItems = useMemo(() => {
    return students
      .filter((s) => batchFilter === 'ALL' || s.batch === batchFilter)
      .filter((s) => trackFilter === 'ALL' || s.track === trackFilter)
      .filter((s) => mentorFilter === 'ALL' || studentMentorMap.get(s.id) === mentorFilter)
      .map((s) => ({
        id: s.id,
        primaryLabel: s.fullName || s.email || s.id,
        secondaryLabel: [s.rollNumber, s.batch].filter(Boolean).join(' · '),
        badge: pendingCountByStudent.get(s.id) ?? 0,
      }));
  }, [students, batchFilter, trackFilter, mentorFilter, studentMentorMap, pendingCountByStudent]);

  const globalBatches = useMemo(
    () => Array.from(new Set(students.map((s) => s.batch).filter((b): b is string => !!b && b !== '-'))).sort(),
    [students]
  );

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
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
      await loadSubmissions();
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
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-white">Submissions</h1>
        <p className="text-gray-400 text-sm mt-1">Review and manage student submissions</p>
      </div>

      {error && (
        <div className="shrink-0 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      <SplitPane
        sidebarCollapsed={!!activeSub}
        sidebar={
          <>
            <div className="p-3 border-b border-zinc-750 space-y-2">
              <Select
                value={batchFilter}
                onChange={(v) => setBatchFilter(v as string)}
                variant="filter"
                options={[{ value: 'ALL', label: 'All Batches' }, ...globalBatches.map((b) => ({ value: b, label: b }))]}
              />
              <Select
                value={trackFilter}
                onChange={(v) => setTrackFilter(v as string)}
                variant="filter"
                options={[{ value: 'ALL', label: 'All Tracks' }, ...globalTracks.map((t) => ({ value: t, label: t }))]}
              />
              <Select
                value={mentorFilter}
                onChange={(v) => setMentorFilter(v as string)}
                variant="filter"
                options={[
                  { value: 'ALL', label: 'All Mentors' },
                  ...globalMentors.map((m) => ({ value: m.id, label: m.fullName || m.email || m.id })),
                ]}
              />
            </div>
            <RosterList
              items={rosterItems}
              selectedId={selectedStudentId}
              onSelect={selectStudent}
              searchPlaceholder="Search students..."
              emptyMessage={loading ? 'Loading students…' : 'No students match these filters.'}
            />
          </>
        }
      >
        {!selectedStudent ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Select a student to view their submissions.
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
