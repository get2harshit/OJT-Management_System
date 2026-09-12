import { useState, useEffect } from 'react';
import { Loader2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { apiGetSubmissionsByStudent, apiGetPrdDownloadUrl } from '../../lib/api';
import { statusDotClass, submissionStatusLabel, fileNameFromGcsUri } from '../../lib/submissionDisplay';
import { useToast } from '../../toast';

// Lets an internal mentor check a student's actual PRD/logbook/etc submissions
// right from the viva scoring flow, instead of having to already remember
// where those live in the Task module — no coupling to the evaluation's own
// "internal only" criteria (there isn't one, deliberately: see
// evaluationScoring's own notes), this just surfaces the same submissions
// list apiGetSubmissionsByStudent already scopes to mentors who actually
// have access to this student.
export default function StudentSubmissionsPanel({ studentId }: { studentId: string }) {
  const { showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<Awaited<ReturnType<typeof apiGetSubmissionsByStudent>>>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGetSubmissionsByStudent(studentId);
        if (!cancelled) setSubmissions(data);
      } catch (err) {
        if (!cancelled) showError(err instanceof Error ? err.message : "Failed to load this student's submissions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const handleOpen = async (id: string) => {
    setOpeningId(id);
    try {
      const url = await apiGetPrdDownloadUrl(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to open this document');
    } finally {
      setOpeningId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 size={18} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (submissions.length === 0) {
    return <p className="text-xs text-gray-500 py-2">No submissions from this student yet.</p>;
  }

  return (
    <div className="space-y-2">
      {submissions.map((s) => {
        const statusStyle = statusDotClass(s.status);
        const isExpanded = expandedId === s.id;
        const isDocument = (s.submissionType ?? 'document') === 'document';
        return (
          <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{s.taskTitle || s.documentType}</p>
                <p className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusStyle.dot}`} />
                  <span className={statusStyle.text}>{submissionStatusLabel(s.status)}</span>
                  <span>· v{s.versionNumber} · {new Date(s.updatedAt).toLocaleDateString()}</span>
                </p>
              </div>
              {isDocument ? (
                <button
                  onClick={() => handleOpen(s.id)}
                  disabled={openingId === s.id}
                  className="shrink-0 flex items-center gap-1 text-xs font-medium text-gold hover:text-gold-hover disabled:opacity-50"
                >
                  {openingId === s.id ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                  Open
                </button>
              ) : (
                <button
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className="shrink-0 flex items-center gap-1 text-xs font-medium text-gold hover:text-gold-hover"
                >
                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {isExpanded ? 'Hide' : 'View'}
                </button>
              )}
            </div>
            {isExpanded && s.messageContent && (
              <div className="mt-2 pt-2 border-t border-zinc-800 text-xs text-gray-300 whitespace-pre-wrap break-words">
                {s.submissionType === 'link'
                  ? s.messageContent.split('\n').filter(Boolean).map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-gold hover:text-gold-hover truncate"
                      >
                        {url}
                      </a>
                    ))
                  : s.messageContent}
              </div>
            )}
            {isDocument && s.documentLink && (
              <p className="text-[11px] text-gray-600 mt-1 truncate">{fileNameFromGcsUri(s.documentLink)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
