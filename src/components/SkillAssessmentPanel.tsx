import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { ClipboardList, Loader2, ChevronDown, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Modal from './Modal';
import RatingScaleInput, { RatingValue, ScoreBar } from './RatingScaleInput';
import FrameworkExplainer from './FrameworkExplainer';
import {
  apiListSkillAssessments,
  FRAMEWORK_PARAMETERS,
  FRAMEWORK_DIMENSIONS,
  CURRENT_FRAMEWORK_VERSION,
  COMMUNICATION_KEY,
  apiPreviewAssessmentNote,
  LEGACY_MAX_SCORE,
  legacyAverage,
  type ApiSkillAssessment,
  type AssessmentComparison,
} from '../lib/api/skillAssessments';
import { formatInIST } from '../lib/utils';
import { useConfirm } from '../confirm';

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

/**
 * How a figure being drafted now compares with the same figure last cycle.
 *
 * The sign is written out rather than left to colour, so the direction still
 * reads without it. Two decimals because that is the precision the dimensions
 * and the final rating are stored at — rounding further here would report "no
 * change" for a move the saved record will show.
 */
function Delta({ from, to }: { from: number | null | undefined; to: number | null | undefined }) {
  if (from === null || from === undefined || to === null || to === undefined) return null;
  const difference = Math.round((to - from) * 100) / 100;
  if (difference === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 tabular-nums">
        <Minus size={11} />
        no change
      </span>
    );
  }
  const improved = difference > 0;
  const Icon = improved ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${
        improved ? 'text-emerald-400' : 'text-amber-400'
      }`}
    >
      <Icon size={11} />
      {improved ? '+' : '−'}
      {Math.abs(difference).toFixed(2)}
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
      {assessment.recommendedForPlacement !== null && (
        <div className="flex items-center justify-between border-t border-zinc-800 pt-2.5">
          <span className="text-[11px] text-gray-400">Recommended for Placement</span>
          <span className="text-[11px] font-medium text-gray-200">
            {assessment.recommendedForPlacement ? 'Recommended' : 'Not Recommended'}
          </span>
        </div>
      )}

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

/**
 * The form a mentor records a new assessment on.
 *
 * It carries the student's last snapshot as a reference — marked on each
 * rating scale (see RatingScaleInput's previousValue) and summarised against
 * the dimensions and the final rating below. Nothing is prefilled from it:
 * the point is a mentor rating this cycle with last cycle in view, not a
 * mentor confirming last cycle.
 */
export function NewAssessmentModal({
  open,
  studentId,
  studentName,
  cohortId,
  currentRecommendation = null,
  banner,
  onClose,
  onSkip,
  continueLabel,
  onSubmit,
}: {
  open: boolean;
  studentId: string;
  /** Shown in the title, so a mentor going through several students always sees whose form this is. */
  studentName: string;
  cohortId: string;
  /**
   * The student's current placement recommendation, preselected so a mentor
   * re-assessing them only touches it to change it. Null when none exists
   * yet, which leaves the choice empty and required.
   */
  currentRecommendation?: boolean | null;
  /** Pinned above the form while it scrolls — the caller's place for who this is and how far along the week is. */
  banner?: ReactNode;
  onClose: () => void;
  /** When given, a Skip button moves on without saving. */
  onSkip?: () => void;
  /**
   * When given, the main button saves and continues under this label
   * ("Save & next"), and a second one saves and closes instead.
   */
  continueLabel?: string;
  /**
   * `andContinue` is true for "Save & next" and false for "Save & close" —
   * what happens next is the caller's decision, the form only reports it.
   */
  onSubmit: (
    scores: Record<string, number>,
    note: string,
    recommendedForPlacement: boolean,
    andContinue: boolean
  ) => Promise<void>;
}) {
  const confirm = useConfirm();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [recommendedForPlacement, setRecommendedForPlacement] = useState<boolean | null>(null);
  // The snapshot shown as reference. Only ever one, and only ever on the
  // current rubric — the server filters, so a student whose newest row is a
  // legacy one simply has no reference rather than a set of nine scores that
  // cannot be lined up against these ten parameters.
  const [previous, setPrevious] = useState<ApiSkillAssessment | null>(null);
  const [previousLoading, setPreviousLoading] = useState(false);
  const [note, setNote] = useState('');
  // Once a mentor types their own words, the auto-generated draft below stops
  // overwriting them — the whole point is a starting point they can keep or
  // replace, never text that fights back against their own edit.
  const [noteEdited, setNoteEdited] = useState(false);
  const [draftingNote, setDraftingNote] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  // Which dimensions are collapsed — all three by default, so a mentor opens
  // the form to three short headers rather than all ten parameter cards at
  // once, and expands one dimension at a time to actually rate it.
  const [collapsedDimensions, setCollapsedDimensions] = useState<Set<string>>(
    () => new Set(FRAMEWORK_DIMENSIONS.map((d) => d.key))
  );

  // Reset to a blank form each time the modal opens, rather than carrying
  // over whatever a previous assessment (of possibly a different student)
  // left behind — and re-read the reference snapshot for whoever is being
  // assessed now, for the same reason.
  useEffect(() => {
    if (!open) return;
    setScores({});
    setRecommendedForPlacement(currentRecommendation);
    setNote('');
    setNoteEdited(false);
    setConfirmed(false);
    setCollapsedDimensions(new Set(FRAMEWORK_DIMENSIONS.map((d) => d.key)));

    setPrevious(null);
    setPreviousLoading(true);
    // Guarded rather than aborted: a reopen for a different student would
    // otherwise be able to land the earlier request's answer on this form.
    let cancelled = false;
    apiListSkillAssessments(studentId, cohortId, {
      frameworkVersion: CURRENT_FRAMEWORK_VERSION,
      limit: 1,
    })
      .then((res) => {
        if (!cancelled) setPrevious(res.data[0] ?? null);
      })
      // The reference is an aid, never a prerequisite. A failed read leaves
      // the form exactly as usable as it was before this existed, rather
      // than blocking an assessment on it.
      .catch(() => {
        if (!cancelled) setPrevious(null);
      })
      .finally(() => {
        if (!cancelled) setPreviousLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // currentRecommendation is read only at the moment the modal opens: a
    // roster refresh landing mid-form must not overwrite the mentor's pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId, cohortId]);

  const toggleDimension = (key: string) => {
    setCollapsedDimensions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const allRated = FRAMEWORK_PARAMETERS.every((p) => typeof scores[p.key] === 'number');

  // Drafts the feedback from the ratings as soon as all ten are in, so a
  // mentor sees — before saving — exactly what a student would read if they
  // added nothing of their own. The server writes the text (the same code
  // that fills a note saved blank), so this preview cannot drift from it.
  // Stops the moment they start typing (see noteEdited above).
  useEffect(() => {
    if (!allRated || noteEdited) return;
    const request = new AbortController();
    // Debounced so changing a rating or two sends one request once the
    // mentor pauses, not one per click.
    const timer = setTimeout(() => {
      setDraftingNote(true);
      apiPreviewAssessmentNote(scores, request.signal)
        .then(setNote)
        // A failed draft leaves the field as it was: a note saved blank is
        // still written from the ratings on the server.
        .catch(() => undefined)
        .finally(() => {
          if (!request.signal.aborted) setDraftingNote(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      request.abort();
      setDraftingNote(false);
    };
  }, [scores, allRated, noteEdited]);

  // How many ratings match the last assessment — shown by Save so starting
  // from last time's ratings stays a starting point, not a copy.
  const unchangedFromPrevious =
    previous && allRated ? FRAMEWORK_PARAMETERS.filter((p) => scores[p.key] === previous.scores[p.key]).length : null;
  const matchesPrevious = unchangedFromPrevious === FRAMEWORK_PARAMETERS.length;

  const fillFromPrevious = async () => {
    if (!previous) return;
    if (Object.keys(scores).length > 0) {
      const replace = await confirm({
        title: 'Replace your ratings?',
        message: `Every parameter will be set to what ${studentName} was rated last time, replacing the ratings you have given so far.`,
        confirmLabel: 'Replace',
      });
      if (!replace) return;
    }
    const previousScores: Record<string, number> = {};
    for (const parameter of FRAMEWORK_PARAMETERS) {
      const value = previous.scores[parameter.key];
      if (typeof value === 'number') previousScores[parameter.key] = value;
    }
    setScores(previousScores);
    // Opened up so every carried-over rating is in view to be checked.
    setCollapsedDimensions(new Set());
  };

  const dimensionPreviews = FRAMEWORK_DIMENSIONS.map((d) => ({
    ...d,
    value: previewDimension(scores, d.parameters),
  }));
  const finalPreview = dimensionPreviews.every((d) => d.value !== null)
    ? dimensionPreviews.reduce((sum, d) => sum + (d.value as number), 0) / dimensionPreviews.length
    : null;

  const submit = async (andContinue: boolean) => {
    if (!allRated || !confirmed || recommendedForPlacement === null) return;
    setSaving(true);
    try {
      await onSubmit(scores, note.trim(), recommendedForPlacement, andContinue);
    } finally {
      setSaving(false);
    }
  };

  // Ten ratings are a few minutes of thought; a stray Skip, Escape or
  // backdrop click must not throw them away without asking. The note alone
  // never counts — it is only ever drafted from the ratings until edited.
  const hasUnsavedInput =
    Object.keys(scores).length > 0 || noteEdited || recommendedForPlacement !== currentRecommendation;

  // Modal and the confirm dialog both listen for Escape on window, so one
  // press while the prompt is up would cancel it and immediately ask again.
  const discardPromptOpen = useRef(false);
  const leaveIfConfirmed = async (leave: () => void) => {
    if (!hasUnsavedInput) {
      leave();
      return;
    }
    if (discardPromptOpen.current) return;
    discardPromptOpen.current = true;
    try {
      const discard = await confirm({
        title: 'Discard this assessment?',
        message: `Your ratings for ${studentName} have not been saved.`,
        confirmLabel: 'Discard',
        variant: 'danger',
      });
      if (discard) leave();
    } finally {
      discardPromptOpen.current = false;
    }
  };

  const cannotSaveReason = !allRated
    ? 'Rate every parameter before saving'
    : recommendedForPlacement === null
      ? 'Choose a placement recommendation before saving'
      : !confirmed
        ? 'Confirm the checkbox before saving'
        : undefined;
  const saveDisabled = saving || cannotSaveReason !== undefined;

  return (
    <Modal open={open} onClose={() => leaveIfConfirmed(onClose)} title={`Assess · ${studentName}`} size="xl">
      {/* Sticky for the same reason as the footer below, and bled to the
          modal's edges the same way — -mt-5 cancels Modal's top padding so it
          pins flush against the header rather than a gap below it. */}
      {banner && (
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 -mt-5 mb-4 px-4 sm:px-6 py-3 bg-zinc-850 border-b border-zinc-750">
          {banner}
        </div>
      )}
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Rate each parameter on what the student can demonstrate independently, using evidence from their actual OJT
          work. This adds a new snapshot — it never overwrites an earlier one, so their trend across the OJT stays
          visible.
        </p>

        {/* Said once, here, rather than repeated on each of the fifty rating
            buttons below: at phone width a five-column scale has no room for
            a caption per option, and ten copies of the same sentence is noise
            a mentor reads past by the second parameter. */}
        {previousLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <Loader2 size={12} className="animate-spin" />
            Looking up their last assessment…
          </div>
        ) : previous ? (
          <div className="flex items-start gap-2 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gold/70 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-[11px] text-gray-400 leading-relaxed">
              Dashed options are what they were rated{' '}
              <span className="text-gray-300">
                {formatInIST(previous.assessedAt, { day: '2-digit', month: 'short' })}
                {previous.mentorName ? ` by ${previous.mentorName}` : ''}
              </span>
              . Start from those and change what has moved, or rate from scratch.
            </p>
            {!matchesPrevious && (
              <button
                type="button"
                onClick={fillFromPrevious}
                className="shrink-0 text-[11px] px-2.5 py-1 rounded-md bg-zinc-800 text-gray-200 hover:text-gold hover:bg-zinc-750 transition-colors"
              >
                Start from these ratings
              </button>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-gray-500">
            First assessment on the current framework — there is nothing earlier to compare against yet.
          </p>
        )}

        {FRAMEWORK_DIMENSIONS.map((dimension) => {
          const isExpanded = !collapsedDimensions.has(dimension.key);
          return (
            <div key={dimension.key} className="space-y-2">
              <button
                type="button"
                onClick={() => toggleDimension(dimension.key)}
                className="w-full flex items-start justify-between gap-3 border-b border-zinc-800 pb-1.5 text-left"
              >
                <div className="min-w-0 flex items-start gap-2">
                  <ChevronDown
                    size={14}
                    className={`shrink-0 mt-1 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-white font-semibold">{dimension.label}</p>
                    <p className="text-[11px] text-gray-500">{dimension.guidingQuestion}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <RatingValue value={previewDimension(scores, dimension.parameters)} />
                  {/* The server's own stored dimension, not one recomputed
                      here — the saved record is the thing being compared
                      against, so it is the thing that gets read. */}
                  {previous?.[dimension.key] != null && (
                    <p className="text-[10px] text-gray-500 tabular-nums mt-0.5">
                      was {previous[dimension.key]!.toFixed(2)}
                    </p>
                  )}
                </div>
              </button>

              {isExpanded &&
                dimension.parameters.map((key) => {
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
                        previousValue={previous?.scores[key] ?? null}
                      />
                    </div>
                  );
                })}
            </div>
          );
        })}

        {finalPreview !== null && (
          <div className="bg-zinc-900 border border-gold/20 rounded-lg px-3.5 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-300 font-medium">Final rating</span>
              <span className="text-sm font-bold text-gold tabular-nums">{finalPreview.toFixed(2)} / 5</span>
            </div>
            {/* The one place the movement is spelled out as a number. Each
                parameter already shows it as a distance along its own scale,
                and the final rating has no scale to show it on. */}
            {previous?.finalRating != null && (
              <div className="flex items-center justify-between border-t border-zinc-800 pt-1.5">
                <span className="text-[11px] text-gray-500 tabular-nums">
                  Last cycle {previous.finalRating.toFixed(2)} / 5
                </span>
                <Delta from={previous.finalRating} to={finalPreview} />
              </div>
            )}
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-750 rounded-lg px-3.5 py-2.5 space-y-2">
          <p className="text-sm text-white font-semibold">Recommended for Placement</p>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Recommended for Placement">
            {[
              { value: true, label: 'Recommended' },
              { value: false, label: 'Not Recommended' },
            ].map(({ value, label }) => {
              const selected = recommendedForPlacement === value;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setRecommendedForPlacement(value)}
                  className={`rounded-lg border px-2 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-gold/60 ${
                    selected
                      ? 'bg-gold text-black border-gold'
                      : 'bg-zinc-900 border-zinc-750 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Mentor Feedback (optional)</label>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteEdited(true);
            }}
            // Tall enough for the drafted feedback's sections to be read as laid out.
            rows={12}
            maxLength={2000}
            placeholder="What they should work on next, and what evidence you are basing this on."
            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60 resize-y"
          />
          <p className="mt-1.5 text-[11px] text-amber-400/90 flex items-start gap-1.5">
            <Info size={12} className="shrink-0 mt-0.5" />
            The student reads this. Write it to them.
          </p>
          {!noteEdited && allRated && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
              {draftingNote ? (
                <>
                  <Loader2 size={11} className="animate-spin" />
                  Drafting feedback from the ratings…
                </>
              ) : note ? (
                'Drafted from the ratings above — edit it, or leave it as is.'
              ) : (
                'Leave this blank and feedback is written from the ratings when you save.'
              )}
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

        {unchangedFromPrevious !== null && (
          <p className={`text-[11px] ${matchesPrevious ? 'text-amber-400' : 'text-gray-500'}`}>
            {matchesPrevious
              ? `All ${FRAMEWORK_PARAMETERS.length} ratings are the same as last time — make sure that is still true.`
              : `${unchangedFromPrevious} of ${FRAMEWORK_PARAMETERS.length} ratings unchanged from last time.`}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          {onSkip ? (
            <button
              onClick={() => leaveIfConfirmed(onSkip)}
              disabled={saving}
              title="Move on without saving — this student comes back after the rest"
              className="mr-auto text-xs px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
            >
              Skip
            </button>
          ) : (
            <button
              onClick={() => leaveIfConfirmed(onClose)}
              className="text-xs px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          )}
          {continueLabel && (
            <button
              onClick={() => submit(false)}
              disabled={saveDisabled}
              title={cannotSaveReason}
              className="text-xs px-3 py-2 rounded-lg bg-zinc-800 text-gray-200 hover:bg-zinc-750 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save &amp; close
            </button>
          )}
          <button
            onClick={() => submit(continueLabel !== undefined)}
            disabled={saveDisabled}
            title={cannotSaveReason}
            className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : (continueLabel ?? 'Save assessment')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
