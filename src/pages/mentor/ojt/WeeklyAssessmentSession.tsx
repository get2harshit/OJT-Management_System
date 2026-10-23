import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import { NewAssessmentModal } from '../../../components/SkillAssessmentPanel';
import { apiCreateSkillAssessment } from '../../../lib/api/skillAssessments';
import type { ApiMentorRosterStudent } from '../../../lib/api/teamRoster';
import {
  countSkippedStillPending,
  pickNextStudent,
  summarizeWeeklyProgress,
  type WeeklyAssessmentProgress,
} from '../../../lib/assessmentQueue';
import { isAssessedThisWeek } from '../../../lib/weeklyAssessments';
import { useToast } from '../../../toast';

/**
 * One sitting of assessments: save a student and the next one still due this
 * week opens straight away, with the week's count in view the whole time.
 * Each save is its own request, so a closed tab or a failed save never costs
 * more than the one form on screen.
 *
 * Mounted fresh for every sitting, so what was saved or skipped in one never
 * carries into the next.
 */
export default function WeeklyAssessmentSession({
  cohortId,
  students,
  order,
  firstStudentId,
  onSaved,
  onClose,
}: {
  cohortId: string;
  /** The full roster — counts and the queue cover every student, not just a search's matches. */
  students: ApiMentorRosterStudent[];
  /**
   * Student ids in the order to go through them, fixed when the sitting
   * starts: under "Missed assessments" the page re-sorts after every save,
   * and a queue following that would jump around under the mentor.
   */
  order: string[];
  /** Who to start with; null starts with the first student still due. */
  firstStudentId: string | null;
  /** Called after each save — the page refreshes the roster in the background. */
  onSaved: () => void;
  onClose: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [skippedIds, setSkippedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [currentId, setCurrentId] = useState<string | null>(
    () =>
      firstStudentId ??
      pickNextStudent({ order, studentsById, savedIds: new Set(), skippedIds: new Set(), afterId: null })
  );

  const progress = summarizeWeeklyProgress(students, savedIds);
  // Undefined also when a background refresh dropped this student from the
  // roster — the summary below then takes over rather than a blank form.
  const currentStudent = currentId === null ? undefined : studentsById.get(currentId);

  const nextAfter = (afterId: string | null, saved: ReadonlySet<string>, skipped: ReadonlySet<string>) =>
    pickNextStudent({ order, studentsById, savedIds: saved, skippedIds: skipped, afterId });

  if (!currentStudent) {
    return (
      <SessionSummary
        progress={progress}
        skippedStillPending={countSkippedStillPending(studentsById, savedIds, skippedIds)}
        nextStudentId={nextAfter(null, savedIds, skippedIds)}
        onContinue={setCurrentId}
        onRevisitSkipped={() => {
          const noneSkipped = new Set<string>();
          setSkippedIds(noneSkipped);
          setCurrentId(nextAfter(null, savedIds, noneSkipped));
        }}
        onClose={onClose}
      />
    );
  }

  const hasNext = nextAfter(currentStudent.id, savedIds, skippedIds) !== null;
  const studentName = currentStudent.fullName ?? 'Unnamed student';

  return (
    <NewAssessmentModal
      // Remounted per student: scroll back to the top and a clean form, with
      // nothing from the previous student left in any field.
      key={currentStudent.id}
      open
      studentId={currentStudent.id}
      studentName={studentName}
      cohortId={cohortId}
      currentRecommendation={currentStudent.placementRecommendation?.recommended ?? null}
      banner={<SessionBanner student={currentStudent} progress={progress} />}
      continueLabel={hasNext ? 'Save & next' : 'Save & finish'}
      onClose={onClose}
      onSkip={() => {
        const skipped = new Set(skippedIds).add(currentStudent.id);
        setSkippedIds(skipped);
        setCurrentId(nextAfter(currentStudent.id, savedIds, skipped));
      }}
      onSubmit={async (scores, note, recommendedForPlacement, andContinue) => {
        try {
          await apiCreateSkillAssessment(currentStudent.id, {
            cohortId,
            scores,
            note: note || undefined,
            recommendedForPlacement,
          });
        } catch (err) {
          // The form stays on this student with everything still filled in.
          showError(err instanceof Error ? err.message : 'Could not save that assessment');
          return;
        }
        showSuccess(`Assessment saved for ${studentName}`);
        const saved = new Set(savedIds).add(currentStudent.id);
        setSavedIds(saved);
        onSaved();
        if (andContinue) setCurrentId(nextAfter(currentStudent.id, saved, skippedIds));
        else onClose();
      }}
    />
  );
}

/** Whose form this is, and how far along this week is — pinned above the form. */
function SessionBanner({
  student,
  progress,
}: {
  student: ApiMentorRosterStudent;
  progress: WeeklyAssessmentProgress;
}) {
  const details = [student.rollNumber, student.teamName].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <p className="text-sm text-white font-semibold truncate">{student.fullName ?? 'Unnamed student'}</p>
        <p className="text-[11px] text-gray-500 truncate">
          {details}
          {isAssessedThisWeek(student.weeklyAssessments) && (
            <span className="text-gray-400">{details ? ' · ' : ''}Already assessed this week — this adds another</span>
          )}
        </p>
      </div>
      <WeeklyProgress progress={progress} />
    </div>
  );
}

function WeeklyProgress({ progress }: { progress: WeeklyAssessmentProgress }) {
  // Nobody is covered by the weekly rule this week (it has not started for
  // them, or the OJT is over), so there is no count worth showing.
  if (progress.total === 0) return null;
  const donePct = Math.round((progress.done / progress.total) * 100);
  return (
    <div className="w-full sm:w-56 shrink-0">
      <p className="text-[11px] text-gray-400 tabular-nums">
        <span className="text-white font-semibold">{progress.done}</span> of {progress.total} done this week
        {progress.pending > 0 && <span className="text-amber-400"> · {progress.pending} pending</span>}
      </p>
      <div
        className="mt-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        aria-label="Assessments done this week"
      >
        <div className="h-full bg-emerald-500/80 transition-[width] duration-300" style={{ width: `${donePct}%` }} />
      </div>
    </div>
  );
}

/**
 * Shown when nobody is left to assess in this pass: either the week is done,
 * or only skipped students remain and the mentor chooses whether to go
 * through them again.
 */
function SessionSummary({
  progress,
  skippedStillPending,
  nextStudentId,
  onContinue,
  onRevisitSkipped,
  onClose,
}: {
  progress: WeeklyAssessmentProgress;
  skippedStillPending: number;
  /** Someone still due who was never skipped — only when the roster changed underneath the sitting. */
  nextStudentId: string | null;
  onContinue: (studentId: string) => void;
  onRevisitSkipped: () => void;
  onClose: () => void;
}) {
  const allDone = progress.pending === 0;
  return (
    <Modal open onClose={onClose} title="This week's assessments">
      <div className="space-y-4">
        {allDone ? (
          <p className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 size={16} />
            Every student is assessed for this week.
          </p>
        ) : nextStudentId === null && skippedStillPending > 0 ? (
          <p className="text-sm text-gray-300">
            You skipped {skippedStillPending} student{skippedStillPending === 1 ? '' : 's'} who still{' '}
            {skippedStillPending === 1 ? 'needs' : 'need'} an assessment this week.
          </p>
        ) : (
          <p className="text-sm text-gray-300">Some students still need an assessment this week.</p>
        )}

        <WeeklyProgress progress={progress} />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-2 rounded-lg bg-zinc-800 text-gray-300 hover:bg-zinc-750 transition-colors"
          >
            Done
          </button>
          {nextStudentId !== null ? (
            <button
              onClick={() => onContinue(nextStudentId)}
              className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
            >
              Continue
            </button>
          ) : (
            skippedStillPending > 0 && (
              <button
                onClick={onRevisitSkipped}
                className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
              >
                Go through skipped
              </button>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}
