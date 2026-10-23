import { useState, useMemo } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { Users, Loader2, Search, ChevronRight, ClipboardPlus, ClipboardCheck } from 'lucide-react';
import Select from '../../../components/Select';
import PageLayout from '../../../components/PageLayout';
import SkillAssessmentPanel from '../../../components/SkillAssessmentPanel';
import WeeklyAssessmentStrip from '../../../components/WeeklyAssessmentStrip';
import { WEEKLY_STATUS_STYLE, countMissedWeeks, isDueThisWeek as weekIsDue } from '../../../lib/weeklyAssessments';
import {
  PlacementRecommendationChip,
  PlacementRecommendationModal,
} from '../../../components/PlacementRecommendationControl';
import { taskCoveragePct, attendancePct } from '../../../lib/rosterMetrics';
import type { ApiMentorRosterStudent, ApiWeeklyAssessmentStatus } from '../../../lib/api/teamRoster';
import type { MentorOjtOutletContext } from './MentorOjtLayout';
import WeeklyAssessmentSession from './WeeklyAssessmentSession';

type StudentSort = 'name' | 'attendance' | 'open' | 'assessments';

const LEGEND_ORDER: ApiWeeklyAssessmentStatus[] = ['assessed', 'missed', 'due', 'not_tracked'];

/** Whether this week's assessment is still outstanding — sorts right behind missed weeks. */
const isDueThisWeek = (s: ApiMentorRosterStudent) => weekIsDue(s.weeklyAssessments);

/**
 * Every student this mentor has in this OJT, with its own full page — pulled
 * out of Overview once the per-student detail (task/attendance breakdown,
 * placement-readiness skill assessment) made that section too heavy to share
 * a screen with Performance. Same "give it real space" reasoning that already
 * moved Teams & Projects out.
 */
export default function MentorStudents() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { roster, loading, refreshRoster } = useOutletContext<MentorOjtOutletContext>();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<StudentSort>('name');
  const [expanded, setExpanded] = useState<string | null>(null);
  // Open while a mentor is going through assessments; null otherwise.
  const [assessmentSession, setAssessmentSession] = useState<{ order: string[]; firstStudentId: string | null } | null>(
    null
  );
  // Bumped after each save so an expanded student's assessment history
  // refetches straight away instead of only after a collapse/re-expand.
  const [assessmentsVersion, setAssessmentsVersion] = useState(0);

  const allStudents = useMemo(() => roster?.students ?? [], [roster]);

  // The whole roster in the chosen order. The assessment queue follows this
  // order too, but never the search: a search narrows what is on screen, not
  // who still needs assessing this week.
  const sortedStudents = useMemo(() => {
    const rate = (s: ApiMentorRosterStudent) =>
      s.attendanceMarked === 0 ? -1 : s.attendancePresent / s.attendanceMarked;

    return [...allStudents].sort((a, b) => {
      // Both "worst first" sorts exist to answer the same question — who needs
      // attention — so they put the problem at the top rather than the bottom.
      if (sort === 'attendance') return rate(a) - rate(b);
      if (sort === 'open') return b.tasksOpen + b.tasksNeedingResubmit - (a.tasksOpen + a.tasksNeedingResubmit);
      if (sort === 'assessments') {
        const byMissed = countMissedWeeks(b.weeklyAssessments) - countMissedWeeks(a.weeklyAssessments);
        if (byMissed !== 0) return byMissed;
        const byDue = Number(isDueThisWeek(b)) - Number(isDueThisWeek(a));
        if (byDue !== 0) return byDue;
      }
      return (a.fullName ?? '').localeCompare(b.fullName ?? '');
    });
  }, [allStudents, sort]);

  const students = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sortedStudents;
    return sortedStudents.filter(
      (s) =>
        (s.fullName ?? '').toLowerCase().includes(needle) ||
        (s.rollNumber ?? '').toLowerCase().includes(needle) ||
        (s.teamName ?? '').toLowerCase().includes(needle)
    );
  }, [sortedStudents, search]);

  const dueThisWeek = allStudents.filter(isDueThisWeek).length;

  const startAssessing = (firstStudentId: string | null) =>
    setAssessmentSession({ order: sortedStudents.map((s) => s.id), firstStudentId });

  return (
    <PageLayout mode="scroll" className="space-y-5">
      <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Users size={17} className="text-gold" />
              My students
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Where each of them currently stands. Assess every student at least once a week.
              {dueThisWeek > 0 && (
                <span className="text-amber-400"> {dueThisWeek} still due this week.</span>
              )}
            </p>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-[10px] text-gray-500">
              {LEGEND_ORDER.map((status) => (
                <span key={status} className="inline-flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-[2px] border ${WEEKLY_STATUS_STYLE[status].box}`} />
                  {WEEKLY_STATUS_STYLE[status].label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {dueThisWeek > 0 && (
              <button
                onClick={() => startAssessing(null)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-gold text-black font-semibold hover:bg-gold-hover transition-colors"
              >
                <ClipboardCheck size={14} />
                Start weekly assessments ({dueThisWeek})
              </button>
            )}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students…"
                className="w-[190px] bg-zinc-900 border border-zinc-750 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-gold/60"
              />
            </div>
            <Select
              value={sort}
              onChange={(v) => setSort(v as StudentSort)}
              variant="filter"
              className="w-[180px]"
              options={[
                { value: 'name', label: 'Name' },
                { value: 'attendance', label: 'Lowest attendance' },
                { value: 'open', label: 'Most open work' },
                { value: 'assessments', label: 'Missed assessments' },
              ]}
            />
          </div>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 size={22} className="animate-spin text-gray-500" />
          </div>
        ) : students.length === 0 ? (
          <p className="text-sm text-gray-500 bg-zinc-900 border border-zinc-750 border-dashed rounded-lg p-5 text-center">
            {search.trim() ? 'Nobody matches that search.' : 'No students are allocated to you in this OJT yet.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {students.map((student) => (
              <StudentRow
                key={student.id}
                student={student}
                cohortId={cohortId ?? ''}
                expanded={expanded === student.id}
                onToggle={() => setExpanded(expanded === student.id ? null : student.id)}
                onAssess={() => startAssessing(student.id)}
                assessmentsVersion={assessmentsVersion}
                onChanged={refreshRoster}
              />
            ))}
          </div>
        )}
      </section>

      {assessmentSession && (
        <WeeklyAssessmentSession
          cohortId={cohortId ?? ''}
          students={allStudents}
          order={assessmentSession.order}
          firstStudentId={assessmentSession.firstStudentId}
          onSaved={() => {
            setAssessmentsVersion((v) => v + 1);
            void refreshRoster();
          }}
          onClose={() => setAssessmentSession(null)}
        />
      )}
    </PageLayout>
  );
}

/**
 * A student's current standing. Task coverage, attendance and skill rating —
 * the three numbers a mentor actually glances at — sit right in the row,
 * never behind a click; expanding only surfaces the finer breakdown (exact
 * task counts, submissions awaiting review, email) and the read-only
 * assessment history, which genuinely needs the room a row can't give it.
 *
 * Recording a NEW assessment used to live one level deeper still — inside
 * that expanded panel — which meant expanding a student just to rate them.
 * The button now sits on the row itself, reachable in one click whether or
 * not the row is expanded.
 */
function StudentRow({
  student,
  cohortId,
  expanded,
  onToggle,
  onAssess,
  assessmentsVersion,
  onChanged,
}: {
  student: ApiMentorRosterStudent;
  cohortId: string;
  expanded: boolean;
  onToggle: () => void;
  /** Opens the assessment form on this student; saving moves on to whoever is still due. */
  onAssess: () => void;
  assessmentsVersion: number;
  /** Re-reads the roster after a write, so the week strip and recommendation chip show the save. */
  onChanged: () => Promise<void>;
}) {
  const attendance = attendancePct(student);
  const coverage = taskCoveragePct(student);
  const needsAttention = (attendance !== null && attendance < 75) || student.tasksNeedingResubmit > 0;

  const [recommendationOpen, setRecommendationOpen] = useState(false);

  return (
    <div className="bg-zinc-900 border border-zinc-750 rounded-lg">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onToggle();
        }}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left cursor-pointer"
      >
        <ChevronRight
          size={14}
          className={`text-gray-500 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white font-medium truncate">{student.fullName ?? 'Unnamed student'}</p>
          <p className="text-[11px] text-gray-500 truncate">
            {student.rollNumber ?? '—'}
            {student.teamName ? ` · ${student.teamName}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-[11px] tabular-nums">
          <span className="hidden lg:inline-flex">
            <WeeklyAssessmentStrip weeks={student.weeklyAssessments} />
          </span>
          <PlacementRecommendationChip
            current={student.placementRecommendation}
            onOpen={() => setRecommendationOpen(true)}
          />
          <span className="text-gray-400 hidden sm:inline">
            <span className="text-white font-semibold">{coverage === null ? '—' : `${coverage}%`}</span> tasks
          </span>
          <span className={attendance !== null && attendance < 75 ? 'text-red-400' : 'text-gray-400'}>
            <span className="font-semibold">{attendance === null ? '—' : `${attendance}%`}</span> attendance
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-gray-400">
            {student.skillRatingAvg === null ? (
              <span className="text-gray-600">not rated</span>
            ) : (
              <span className="tabular-nums">
                <span className="text-white font-semibold">{student.skillRatingAvg.toFixed(2)}</span>
                <span className="text-gray-500"> / 5</span>
              </span>
            )}
          </span>
          {needsAttention && (
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" title="Needs attention" />
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onAssess();
          }}
          title="New capability assessment"
          className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-md bg-zinc-800 text-gray-300 hover:text-gold hover:bg-zinc-750 transition-colors"
        >
          <ClipboardPlus size={13} />
          <span className="hidden md:inline">Assess</span>
        </button>
      </div>

      {expanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-zinc-750/60">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Detail
              label="Attendance"
              value={attendance === null ? 'Not marked yet' : `${student.attendancePresent} of ${student.attendanceMarked} sessions`}
            />
            <Detail label="Tasks approved" value={String(student.tasksApproved)} />
            <Detail label="Open tasks" value={String(student.tasksOpen)} />
            <Detail
              label="Needs resubmit"
              value={String(student.tasksNeedingResubmit)}
              warn={student.tasksNeedingResubmit > 0}
            />
            <Detail
              label="Submissions awaiting review"
              value={String(student.submissionsPending)}
              warn={student.submissionsPending > 0}
            />
            {student.email && <Detail label="Email" value={student.email} />}
          </div>

          {/* The strip is hidden in the row below lg widths; it always shows here. */}
          <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Weekly assessments</span>
            <WeeklyAssessmentStrip weeks={student.weeklyAssessments} />
          </div>

          <SkillAssessmentPanel studentId={student.id} cohortId={cohortId} refreshToken={assessmentsVersion} />
        </div>
      )}

      <PlacementRecommendationModal
        open={recommendationOpen}
        studentId={student.id}
        studentName={student.fullName ?? 'this student'}
        cohortId={cohortId}
        current={student.placementRecommendation}
        onClose={() => setRecommendationOpen(false)}
        onSaved={onChanged}
      />
    </div>
  );
}

function Detail({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm mt-0.5 ${warn ? 'text-yellow-400 font-semibold' : 'text-gray-200'}`}>{value}</p>
    </div>
  );
}
