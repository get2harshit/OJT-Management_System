import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Loader2, ChevronDown, Info } from 'lucide-react';
import Modal from './Modal';
import RatingScaleInput, { RatingValue, ScoreBar } from './RatingScaleInput';
import {
  apiListSkillAssessments,
  FRAMEWORK_PARAMETERS,
  FRAMEWORK_DIMENSIONS,
  CURRENT_FRAMEWORK_VERSION,
  COMMUNICATION_KEY,
  LEGACY_MAX_SCORE,
  legacyAverage,
  type ApiSkillAssessment,
} from '../lib/api/skillAssessments';
import { formatInIST } from '../lib/utils';

/**
 * Level 1 as the mentor fills the form in, before anything is saved.
 *
 * Only ever a preview: the stored dimensions are computed on the server and
 * are what every other screen reads. This exists so a mentor can watch a
 * dimension move as they rate, rather than discovering it after saving.
 */
function previewDimension(scores: Record<string, number>, parameters: string[]): number | null {
  const values = parameters.map((key) => scores[key]).filter((v): v is number => typeof v === 'number');
  if (values.length !== parameters.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** One saved snapshot, rendered according to the rubric it was written under. */
function AssessmentDetail({ assessment }: { assessment: ApiSkillAssessment }) {
  if (assessment.frameworkVersion !== CURRENT_FRAMEWORK_VERSION) {
    // A legacy row has none of the framework's parameters. It also runs 1-5,
    // so its average looks directly comparable and is not — saying which
    // rubric produced it is the whole point of showing it this way.
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] text-gray-500">
          Recorded under the earlier rubric — {legacyAverage(assessment.scores)} / {LEGACY_MAX_SCORE} across a different
          set of nine parameters. Not comparable with the ratings below it.
        </p>
        {assessment.note && <MentorFeedback note={assessment.note} />}
      </div>
    );
  }

  const communication = assessment.scores[COMMUNICATION_KEY] ?? null;

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 space-y-2.5">
        <ScoreBar label="Overall rating" value={assessment.finalRating} emphasis />
        {assessment.comparison && (
          <p className="text-[11px] text-gold/90">{assessment.comparison.label}</p>
        )}
      </div>

      {/* Stacked, not three across. Every bar here is on the same 1-5 scale, so
          they all have to share one width basis — a 4.60 drawn across a third
          of the panel next to a 3.48 drawn across all of it reads as the
          smaller number. Side by side also collided each label with the next
          one's value. */}
      <div className="space-y-2.5">
        {FRAMEWORK_DIMENSIONS.map((dimension) => (
          <ScoreBar key={dimension.key} label={dimension.label} value={assessment[dimension.key]} />
        ))}
      </div>

      {/* Deliberately outside the grid above. Communication is one of the ten
          parameters, not a fourth dimension — it sat alongside them before and
          read as one. It is pulled out because it is half of Professional
          Capability on its own and disappears inside that average. */}
      <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-2.5">
        <span className="text-[11px] text-gray-400">
          Communication
          <span className="text-gray-600"> · within Professional Capability</span>
        </span>
        <RatingValue value={communication} />
      </div>

      <details className="group">
        <summary className="text-[11px] text-gray-500 hover:text-gray-300 cursor-pointer list-none flex items-center gap-1">
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
          All ten parameters
        </summary>
        <div className="mt-2.5 space-y-2.5">
          {FRAMEWORK_DIMENSIONS.map((dimension) => (
            <div key={dimension.key}>
              <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">{dimension.label}</p>
              <div className="space-y-1">
                {dimension.parameters.map((key) => {
                  const param = FRAMEWORK_PARAMETERS.find((p) => p.key === key)!;
                  return (
                    <div key={key} className="flex items-center justify-between gap-3" title={param.guidingQuestion}>
                      <span className="text-[11px] text-gray-400 truncate">{param.label}</span>
                      <RatingValue value={assessment.scores[key] ?? null} className="shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </details>

      {assessment.note && <MentorFeedback note={assessment.note} />}
    </div>
  );
}

/** The mentor's own words, given room to be read rather than run in as italics. */
function MentorFeedback({ note }: { note: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Feedback</p>
      <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{note}</p>
    </div>
  );
}

/**
 * A mentor's capability read on one student, against the Student Feedback
 * Framework. Lazy-loaded so it only fetches once a mentor actually expands
 * this student rather than for the whole roster up front.
 *
 * Read-only: recording a new assessment lives on the student row itself (see
 * MentorStudents.tsx) so a mentor can reach it without expanding a student
 * first, rather than inside this panel where it used to sit one level
 * deeper. `refreshToken` exists for exactly that split — bump it after a
 * save made from the row so a panel that happens to already be open picks up
 * the new snapshot without a collapse/re-expand round trip.
 */
export default function SkillAssessmentPanel({
  studentId,
  cohortId,
  refreshToken,
}: {
  studentId: string;
  cohortId: string;
  refreshToken?: number;
}) {
  const [history, setHistory] = useState<ApiSkillAssessment[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(() => {
    apiListSkillAssessments(studentId, cohortId, { limit: 20 })
      .then((res) => setHistory(res.data))
      .catch(() => setHistory([]));
  }, [studentId, cohortId]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  const latest = history?.[0] ?? null;
  const older = history?.slice(1) ?? [];

  return (
    <div className="mt-3 pt-3 border-t border-zinc-750/60">
      <p className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2.5">
        <ClipboardList size={12} />
        Capability Assessment
      </p>

      {history === null ? (
        <div className="py-3 flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-gray-500" />
        </div>
      ) : !latest ? (
        <p className="text-xs text-gray-500">No assessments yet — the first one starts the trend.</p>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[11px] text-gray-500">
            Last rated {formatInIST(latest.assessedAt, { day: '2-digit', month: 'short' })}
            {latest.mentorName ? ` by ${latest.mentorName}` : ''}
          </p>

          <AssessmentDetail assessment={latest} />

          {older.length > 0 && (
            <div>
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ChevronDown size={12} className={`transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                {older.length} earlier assessment{older.length === 1 ? '' : 's'}
              </button>
              {historyOpen && (
                <div className="mt-2 space-y-1.5">
                  {older.map((snap) => (
                    <div
                      key={snap.id}
                      className="flex items-center justify-between text-[11px] text-gray-500 bg-zinc-950/40 rounded-md px-2.5 py-1.5"
                    >
                      <span>
                        {formatInIST(snap.assessedAt, { day: '2-digit', month: 'short', year: 'numeric' })}
                        {snap.mentorName ? ` · ${snap.mentorName}` : ''}
                        {snap.frameworkVersion !== CURRENT_FRAMEWORK_VERSION && (
                          <span className="ml-1.5 text-gray-600">· earlier rubric</span>
                        )}
                      </span>
                      <span className="font-semibold text-gray-300 tabular-nums">
                        {snap.frameworkVersion === CURRENT_FRAMEWORK_VERSION
                          ? `${snap.finalRating?.toFixed(2) ?? '—'} / 5`
                          : `${legacyAverage(snap.scores)} / ${LEGACY_MAX_SCORE}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NewAssessmentModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (scores: Record<string, number>, note: string) => Promise<void>;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset to a blank form each time the modal opens, rather than carrying
  // over whatever a previous assessment (of possibly a different student)
  // left behind.
  useEffect(() => {
    if (open) {
      setScores({});
      setNote('');
    }
  }, [open]);

  const allRated = FRAMEWORK_PARAMETERS.every((p) => typeof scores[p.key] === 'number');
  const dimensionPreviews = FRAMEWORK_DIMENSIONS.map((d) => ({
    ...d,
    value: previewDimension(scores, d.parameters),
  }));
  const finalPreview = dimensionPreviews.every((d) => d.value !== null)
    ? dimensionPreviews.reduce((sum, d) => sum + (d.value as number), 0) / dimensionPreviews.length
    : null;

  const submit = async () => {
    if (!allRated) return;
    setSaving(true);
    try {
      await onSubmit(scores, note.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New capability assessment" size="lg">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Rate each parameter on what the student can demonstrate independently, using evidence from their actual OJT
          work. This adds a new snapshot — it never overwrites an earlier one, so their trend across the OJT stays
          visible.
        </p>

        {FRAMEWORK_DIMENSIONS.map((dimension) => (
          <div key={dimension.key} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800 pb-1.5">
              <div className="min-w-0">
                <p className="text-sm text-white font-semibold">{dimension.label}</p>
                <p className="text-[11px] text-gray-500">{dimension.guidingQuestion}</p>
              </div>
              <RatingValue value={previewDimension(scores, dimension.parameters)} className="shrink-0" />
            </div>

            {dimension.parameters.map((key) => {
              const param = FRAMEWORK_PARAMETERS.find((p) => p.key === key)!;
              return (
                <div key={key} className="bg-zinc-900 border border-zinc-750 rounded-lg px-3.5 py-2.5 space-y-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium">{param.label}</p>
                    <p className="text-[11px] text-gray-500">{param.guidingQuestion}</p>
                  </div>
                  <RatingScaleInput
                    value={scores[key]}
                    onChange={(v) => setScores((s) => ({ ...s, [key]: v }))}
                  />
                </div>
              );
            })}
          </div>
        ))}

        {finalPreview !== null && (
          <div className="flex items-center justify-between bg-zinc-900 border border-gold/20 rounded-lg px-3.5 py-2.5">
            <span className="text-xs text-gray-300 font-medium">Final rating</span>
            <span className="text-sm font-bold text-gold tabular-nums">{finalPreview.toFixed(2)} / 5</span>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Feedback (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What they should work on next, and what evidence you are basing this on."
            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60 resize-none"
          />
          <p className="mt-1.5 text-[11px] text-amber-400/90 flex items-start gap-1.5">
            <Info size={12} className="shrink-0 mt-0.5" />
            The student reads this. Write it to them.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !allRated}
            title={!allRated ? 'Rate every parameter before saving' : undefined}
            className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save assessment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
