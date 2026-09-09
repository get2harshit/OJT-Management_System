import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Loader2, ChevronDown, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Modal from './Modal';
import RatingScaleInput, { RatingValue, ScoreBar } from './RatingScaleInput';
import FrameworkExplainer from './FrameworkExplainer';
import {
  apiListSkillAssessments,
  FRAMEWORK_PARAMETERS,
  FRAMEWORK_DIMENSIONS,
  RATING_LEVELS,
  CURRENT_FRAMEWORK_VERSION,
  COMMUNICATION_KEY,
  LEGACY_MAX_SCORE,
  legacyAverage,
  type ApiSkillAssessment,
  type AssessmentComparison,
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

/** Mirrors the backend's own band — see skillAssessmentFramework.ts's COMPARISON_BAND. */
const COMPARISON_BAND = 0.5;

/**
 * Preview-only mirror of the backend's compareDimensions, for the same
 * reason previewDimension above exists: nothing is saved yet, so there is no
 * server response to read this from. Once saved, every other screen renders
 * the server's own computed comparison instead of this one.
 */
function previewComparison(technicalUnderstanding: number, engineeringExecution: number): AssessmentComparison {
  const difference = engineeringExecution - technicalUnderstanding;
  if (Math.abs(difference) <= COMPARISON_BAND) {
    return { relation: 'as_good_as', label: 'Engineering Execution is as good as Technical Understanding' };
  }
  return difference > 0
    ? { relation: 'better_than', label: 'Engineering Execution is better than Technical Understanding' }
    : { relation: 'weaker_than', label: 'Engineering Execution is weaker than Technical Understanding' };
}

/**
 * Preview-only mirror of the backend's generateDefaultNote (see
 * skillAssessmentFramework.ts) — what a mentor sees pre-filled in the note
 * field as they rate, so they know before saving what a student will read if
 * they leave it as is. Only called once every parameter is rated; the
 * backend runs the authoritative version of this same logic as a fallback
 * for whatever ends up in the note field at save time.
 */
function generateDefaultNote(scores: Record<string, number>): string {
  const technicalUnderstanding = previewDimension(scores, FRAMEWORK_DIMENSIONS[0].parameters)!;
  const engineeringExecution = previewDimension(scores, FRAMEWORK_DIMENSIONS[1].parameters)!;
  const comparison = previewComparison(technicalUnderstanding, engineeringExecution);

  const levelLabel = (value: number): string => {
    const rounded = Math.min(5, Math.max(1, Math.round(value)));
    return RATING_LEVELS.find((level) => level.value === rounded)?.label ?? '';
  };

  const strongest = FRAMEWORK_PARAMETERS.reduce((a, b) => (scores[b.key] > scores[a.key] ? b : a));
  const weakest = FRAMEWORK_PARAMETERS.reduce((a, b) => (scores[b.key] < scores[a.key] ? b : a));

  const sentences: string[] = [
    comparison.relation === 'as_good_as'
      ? 'Technical understanding and engineering execution are evenly matched this cycle.'
      : `${comparison.label} this cycle.`,
  ];

  sentences.push(
    scores[strongest.key] === scores[weakest.key]
      ? `Every parameter currently sits at the ${levelLabel(scores[strongest.key])} stage.`
      : `Strongest: ${strongest.label} (${levelLabel(scores[strongest.key])}). Needs focus: ${weakest.label} (${levelLabel(scores[weakest.key])}).`
  );

  if (strongest.key !== COMMUNICATION_KEY && weakest.key !== COMMUNICATION_KEY) {
    sentences.push(`Communication is at the ${levelLabel(scores[COMMUNICATION_KEY])} stage.`);
  }

  return sentences.join(' ');
}

const COMPARISON_BADGE_STYLES: Record<AssessmentComparison['relation'], string> = {
  better_than: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  weaker_than: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  as_good_as: 'bg-zinc-750 text-gray-400 border-zinc-700',
};

const COMPARISON_BADGE_ICON: Record<AssessmentComparison['relation'], typeof TrendingUp> = {
  better_than: TrendingUp,
  weaker_than: TrendingDown,
  as_good_as: Minus,
};

/**
 * The execution-vs-understanding read, as a small callout rather than a line
 * of plain text easy to skim past — this is the one comparison the framework
 * itself draws, and a mentor scanning many students should be able to spot
 * "needs attention here" at a glance rather than reading every caption.
 */
function ComparisonBadge({ comparison }: { comparison: AssessmentComparison }) {
  const Icon = COMPARISON_BADGE_ICON[comparison.relation];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border ${COMPARISON_BADGE_STYLES[comparison.relation]}`}
    >
      <Icon size={12} />
      {comparison.label}
    </span>
  );
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
        {assessment.comparison && <ComparisonBadge comparison={assessment.comparison} />}
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
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Mentor Feedback</p>
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

      <div className="mt-3">
        <FrameworkExplainer />
      </div>
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
  // Once a mentor types their own words, the auto-generated draft below stops
  // overwriting them — the whole point is a starting point they can keep or
  // replace, never text that fights back against their own edit.
  const [noteEdited, setNoteEdited] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset to a blank form each time the modal opens, rather than carrying
  // over whatever a previous assessment (of possibly a different student)
  // left behind.
  useEffect(() => {
    if (open) {
      setScores({});
      setNote('');
      setNoteEdited(false);
      setConfirmed(false);
    }
  }, [open]);

  const allRated = FRAMEWORK_PARAMETERS.every((p) => typeof scores[p.key] === 'number');

  // Drafts a description from the ratings as soon as all ten are in, so a
  // mentor sees — before saving — exactly what a student would read if they
  // added nothing of their own. Stops the moment they start typing (see
  // noteEdited above); a mentor who then clears the field entirely still gets
  // this same text written for them at save time, from the same generator
  // running server-side (see SkillAssessmentService.createAssessment).
  useEffect(() => {
    if (!allRated || noteEdited) return;
    setNote(generateDefaultNote(scores));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, allRated, noteEdited]);

  const dimensionPreviews = FRAMEWORK_DIMENSIONS.map((d) => ({
    ...d,
    value: previewDimension(scores, d.parameters),
  }));
  const finalPreview = dimensionPreviews.every((d) => d.value !== null)
    ? dimensionPreviews.reduce((sum, d) => sum + (d.value as number), 0) / dimensionPreviews.length
    : null;

  const submit = async () => {
    if (!allRated || !confirmed) return;
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
          <label className="block text-xs text-gray-400 mb-1.5">Mentor Feedback (optional)</label>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteEdited(true);
            }}
            rows={5}
            maxLength={2000}
            placeholder="What they should work on next, and what evidence you are basing this on."
            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60 resize-y"
          />
          <p className="mt-1.5 text-[11px] text-amber-400/90 flex items-start gap-1.5">
            <Info size={12} className="shrink-0 mt-0.5" />
            The student reads this. Write it to them.
          </p>
          {!noteEdited && allRated && (
            <p className="mt-1 text-[11px] text-gray-500">
              Drafted from the ratings above — edit it, or leave it as is.
            </p>
          )}
        </div>

      </div>

      {/* Sticky rather than part of the scrolling form above: ten parameters
          plus the note make this a long form, and a mentor should never have
          to hunt for Save (or lose sight of the confirmation they're about
          to give) by scrolling all the way down. Negative margins bleed it
          to the modal's own edges — Modal.tsx pads its scroll container, and
          without this the footer's background and border would stop short
          of that padding instead of spanning the full width. */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-5 mt-4 px-4 sm:px-6 pt-3 pb-4 bg-zinc-850 border-t border-zinc-750 space-y-3">
        <label className="flex items-start gap-2.5 text-xs text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 accent-gold shrink-0"
          />
          I confirm these ratings and feedback are accurate and ready for the student to see.
        </label>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !allRated || !confirmed}
            title={!allRated ? 'Rate every parameter before saving' : !confirmed ? 'Confirm the checkbox before saving' : undefined}
            className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save assessment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
