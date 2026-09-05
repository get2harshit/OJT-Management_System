import { useState, useMemo } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { Users, Loader2, Search, ChevronRight, ClipboardPlus } from 'lucide-react';
import Select from '../../../components/Select';
import PageLayout from '../../../components/PageLayout';
import SkillAssessmentPanel, { NewAssessmentModal } from '../../../components/SkillAssessmentPanel';
import { apiCreateSkillAssessment } from '../../../lib/api/skillAssessments';
import { taskCoveragePct, attendancePct } from '../../../lib/rosterMetrics';
import type { ApiMentorRosterStudent } from '../../../lib/api/teamRoster';
import type { MentorOjtOutletContext } from './MentorOjtLayout';
import { useToast } from '../../../toast';

type StudentSort = 'name' | 'attendance' | 'open';

/**
 * Every student this mentor has in this OJT, with its own full page — pulled
 * out of Overview once the per-student detail (task/attendance breakdown,
 * placement-readiness skill assessment) made that section too heavy to share
 * a screen with Performance. Same "give it real space" reasoning that already
 * moved Teams & Projects out.
 */
export default function MentorStudents() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { roster, loading } = useOutletContext<MentorOjtOutletContext>();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<StudentSort>('name');
  const [expanded, setExpanded] = useState<string | null>(null);

  const students = useMemo(() => {
    const list = (roster?.students ?? []).filter((s) => {
      if (!search.trim()) return true;
      const needle = search.trim().toLowerCase();
      return (
        (s.fullName ?? '').toLowerCase().includes(needle) ||
        (s.rollNumber ?? '').toLowerCase().includes(needle) ||
        (s.teamName ?? '').toLowerCase().includes(needle)
      );
    });

    const rate = (s: ApiMentorRosterStudent) =>
      s.attendanceMarked === 0 ? -1 : s.attendancePresent / s.attendanceMarked;

    return [...list].sort((a, b) => {
      // Both "worst first" sorts exist to answer the same question — who needs
      // attention — so they put the problem at the top rather than the bottom.
      if (sort === 'attendance') return rate(a) - rate(b);
      if (sort === 'open') return b.tasksOpen + b.tasksNeedingResubmit - (a.tasksOpen + a.tasksNeedingResubmit);
      return (a.fullName ?? '').localeCompare(b.fullName ?? '');
    });
  }, [roster, search, sort]);

  return (
    <PageLayout mode="scroll" className="space-y-5">
      <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Users size={17} className="text-gold" />
              My students
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Where each of them currently stands.</p>
          </div>
          <div className="flex items-center gap-2.5">
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
              />
            ))}
          </div>
        )}
      </section>
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
}: {
  student: ApiMentorRosterStudent;
  cohortId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const attendance = attendancePct(student);
  const coverage = taskCoveragePct(student);
  const needsAttention = (attendance !== null && attendance < 75) || student.tasksNeedingResubmit > 0;

  const [formOpen, setFormOpen] = useState(false);
  // Bumped after a save so an already-open assessment panel (the row was
  // expanded before the mentor clicked Assess) refetches immediately, rather
  // than showing the new snapshot only after a collapse/re-expand.
  const [refreshToken, setRefreshToken] = useState(0);

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
            setFormOpen(true);
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

          <SkillAssessmentPanel studentId={student.id} cohortId={cohortId} refreshToken={refreshToken} />
        </div>
      )}

      <NewAssessmentModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={async (scores, note) => {
          try {
            await apiCreateSkillAssessment(student.id, { cohortId, scores, note: note || undefined });
            showSuccess('Assessment saved');
            setFormOpen(false);
            setRefreshToken((t) => t + 1);
          } catch (err) {
            showError(err instanceof Error ? err.message : 'Could not save that assessment');
          }
        }}
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
