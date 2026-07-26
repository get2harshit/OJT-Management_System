import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Eye, Loader2 } from 'lucide-react';
import SplitPane from '../../components/SplitPane';
import RosterList from '../../components/RosterList';
import SubmissionDetail from '../../components/SubmissionDetail';
import ReviewActions from '../../components/ReviewActions';
import type { PrdSubmission, DocumentType } from '../../lib/types';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from '../../lib/types';
import { apiGetAllPrdSubmissions, apiGetPrdDownloadUrl, apiReviewPrdSubmission } from '../../lib/api';
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
}

export default function MentorSubmissions({ mentorId }: Partial<Props> & { mentorId: string }) {
  const { showSuccess, showError } = useToast();

  const [mentees, setMentees] = useState<Mentee[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      const [teams, allSubs] = await Promise.all([apiListMyTeamsDetailed(), apiGetAllPrdSubmissions()]);

      const menteeMap = new Map<string, Mentee>();
      teams.forEach((team) => {
        team.members.forEach((m) => {
          if (!menteeMap.has(m.studentId)) {
            menteeMap.set(m.studentId, {
              studentId: m.studentId,
              fullName: m.fullName || m.studentId,
              rollNumber: m.rollNumber || '-',
              track: team.track,
            });
          }
        });
      });
      setMentees(Array.from(menteeMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName)));

      // studentId/primaryMentorId/secondaryMentorId now come back inline on
      // every submission (a backend join against ojt_allocations) — no more
      // resolving each unique allocation with its own GET /allocations/:id.
      const mapped = allSubs.reduce<Row[]>((acc, s) => {
        if (!s.studentId) return acc;
        if (s.primaryMentorId !== mentorId && s.secondaryMentorId !== mentorId) return acc;
        acc.push({ ...s, studentId: s.studentId });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

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
      mentees.map((m) => ({
        id: m.studentId,
        primaryLabel: m.fullName,
        secondaryLabel: `${m.rollNumber} · ${m.track}`,
        badge: pendingCountByStudent.get(m.studentId) ?? 0,
      })),
    [mentees, pendingCountByStudent]
  );

  const selectedStudent = mentees.find((m) => m.studentId === selectedStudentId);
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
                {selectedStudent.rollNumber} · {selectedStudent.track}
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
