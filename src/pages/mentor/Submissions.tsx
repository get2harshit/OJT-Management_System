import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Eye, Loader2, Users } from 'lucide-react';
import SplitPane from '../../components/SplitPane';
import RosterList from '../../components/RosterList';
import SubmissionDetail from '../../components/SubmissionDetail';
import ReviewActions from '../../components/ReviewActions';
import type { PrdSubmission, SubmissionKind } from '../../lib/types';
import { DOCUMENT_TYPE_LABELS } from '../../lib/types';
import { apiGetSubmissionsByStudent, apiGetPrdDownloadUrl, apiReviewPrdSubmission } from '../../lib/api';
import { apiListMyTeamsDetailed } from '../../lib/api/teams';
import { statusDotClass } from '../../lib/submissionDisplay';
import { useToast } from '../../toast';

interface Props {
  mentorId: string;
}

type Row = PrdSubmission & { studentId: string };

interface Mentee {
  studentId: string;
  fullName: string;
  rollNumber: string;
  track: string;
  pendingReviewCount: number;
}

export default function MentorSubmissions({ mentorId }: Partial<Props> & { mentorId: string }) {
  const { showSuccess, showError } = useToast();

  const [mentees, setMentees] = useState<Mentee[]>([]);
  // Only the clicked student's submissions — fetched per-student, backend
  // already restricts a mentor to their own mentees.
  const [studentSubmissions, setStudentSubmissions] = useState<Row[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Keyed by taskId when a submission is linked to one, else a synthetic
  // `type:<documentType>` key for older/unlinked submissions — a task's
  // title is what identifies a submission now, not a fixed document-type
  // enum, so filtering groups by task rather than by type.
  const [taskFilter, setTaskFilter] = useState<string>('ALL');

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const [reviewing, setReviewing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // The mentee roster with each one's pending-review badge count attached
  // server-side (withPendingReviewCounts) — no bulk submissions fetch.
  const loadRoster = async () => {
    setLoading(true);
    setError(null);
    try {
      const teams = await apiListMyTeamsDetailed(true);

      const menteeMap = new Map<string, Mentee>();
      teams.forEach((team) => {
        team.members.forEach((m) => {
          if (!menteeMap.has(m.studentId)) {
            menteeMap.set(m.studentId, {
              studentId: m.studentId,
              fullName: m.fullName || m.studentId,
              rollNumber: m.rollNumber || '-',
              track: team.track,
              pendingReviewCount: m.pendingReviewCount ?? 0,
            });
          }
        });
      });
      setMentees(Array.from(menteeMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  const loadStudentSubmissions = async (studentId: string) => {
    setSubmissionsLoading(true);
    try {
      const subs = await apiGetSubmissionsByStudent(studentId);
      setStudentSubmissions(subs.map((s) => ({ ...s, studentId })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
      setStudentSubmissions([]);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const rosterItems = useMemo(
    () =>
      mentees.map((m) => ({
        id: m.studentId,
        primaryLabel: m.fullName,
        secondaryLabel: `${m.rollNumber} · ${m.track}`,
        badge: m.pendingReviewCount,
      })),
    [mentees]
  );

  const selectedStudent = mentees.find((m) => m.studentId === selectedStudentId);
  const submissionTaskKey = (r: Row) => r.taskId ?? `type:${r.documentType}`;
  const submissionTaskLabel = (r: Row) => r.taskTitle ?? DOCUMENT_TYPE_LABELS[r.documentType];
  const taskFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of studentSubmissions) {
      const key = submissionTaskKey(r);
      if (!seen.has(key)) seen.set(key, submissionTaskLabel(r));
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentSubmissions]);
  const studentRows = studentSubmissions.filter(
    (r) => taskFilter === 'ALL' || submissionTaskKey(r) === taskFilter
  );
  const activeSub = studentSubmissions.find((r) => r.id === selectedSubId);
  const activeSubKind: SubmissionKind = activeSub?.submissionType ?? 'document';

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
      // Refresh this student's submissions and the roster badge — not everyone's.
      await Promise.all([
        selectedStudentId ? loadStudentSubmissions(selectedStudentId) : Promise.resolve(),
        loadRoster(),
      ]);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update review');
    } finally {
      setReviewing(false);
    }
  };

  const selectStudent = (id: string) => {
    setSelectedStudentId(id);
    setSelectedSubId(null);
    setTaskFilter('ALL');
    setStudentSubmissions([]);
    loadStudentSubmissions(id);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-white">Submissions</h1>
        <p className="text-gray-400 text-sm mt-1">Review and manage your students' submissions</p>
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
            searchPlaceholder="Search your students..."
            emptyMessage={loading ? 'Loading students…' : 'No students assigned to you yet.'}
          />
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
                Back to {selectedStudent.fullName}'s submissions
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
                {selectedStudent.rollNumber} · {selectedStudent.track}
              </p>
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
                        <p className="text-sm font-medium text-white truncate flex items-center gap-2">
                          <span className="truncate">{submissionTaskLabel(row)} · v{row.versionNumber}</span>
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
