import { useMemo } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { Loader2, Briefcase, CalendarCheck, TrendingUp, Users } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import SharedResourcesPanel from '../../components/SharedResourcesPanel';
import WeeklyTrendChart, { TREND_MEASURES } from '../../components/WeeklyTrendChart';
import { taskCoveragePct, attendancePct } from '../../lib/rosterMetrics';
import type { ApiMentorRoster, ApiMentorRosterTeam, ApiMentorRosterStudent } from '../../lib/api/teamRoster';
import type { MentorOjtOutletContext } from './ojt/MentorOjtLayout';

/**
 * The mentor's home page for one OJT: a line of context, then a glance at
 * how the roster is doing — every team and every student, one line each,
 * task/attendance/skill at a glance, no click required. The full interactive
 * versions of both (filters, project detail, the skill-assessment tool
 * itself) live on their own tabs (see MentorTeams.tsx / MentorStudents.tsx)
 * — the same "give it real space" reasoning that already pulled Performance
 * out of a click-through modal applies there.
 *
 * The roster itself is fetched once in MentorOjtLayout and shared with this
 * page (and Teams & Projects, and Students) via useOutletContext — separate
 * fetches of the same data is exactly the "two sources for one fact" shape
 * that once made Performance and Teams disagree about team count.
 */
export default function MentorOJTs() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const selectedCohortId = cohortId ?? '';
  const { roster, loading: rosterLoading } = useOutletContext<MentorOjtOutletContext>();

  const cohortTeams = useMemo(() => roster?.teams ?? [], [roster]);

  return (
    <PageLayout mode="scroll" className="space-y-5">
      {roster && (
        <p className="text-sm text-gray-400">
          {roster.teams.length} team{roster.teams.length === 1 ? '' : 's'} · {roster.students.length} student
          {roster.students.length === 1 ? '' : 's'} · {sessionsThisWeek(roster)} session
          {sessionsThisWeek(roster) === 1 ? '' : 's'} this week
        </p>
      )}

      {!selectedCohortId ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-10 text-center">
          <Briefcase size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Select an OJT above to see how your students are doing.</p>
        </div>
      ) : (
        <>
          {/* ── Performance — the headline, full width, no click needed ────── */}
          <PerformanceSection roster={roster} loading={rosterLoading} />

          {/* ── Students — same glance, one row per student ─────────────────── */}
          <StudentsOverviewSection roster={roster} loading={rosterLoading} />

          {/* ── Shared resources ────────────────────────────────────────────── */}
          <SharedResourcesPanel
            cohortId={selectedCohortId}
            mode="mentor"
            teams={cohortTeams.map((t) => ({ id: t.id, name: t.name }))}
          />
        </>
      )}
    </PageLayout>
  );
}

function sessionsThisWeek(roster: ApiMentorRoster): number {
  return roster.weeks[roster.weeks.length - 1]?.sessionsHeld ?? 0;
}

/** "8 weeks" once the OJT has run that long, "3 weeks" if it's only three in — never a fixed number regardless of how far the OJT has actually progressed. */
function weekSpanLabel(weekCount: number): string {
  return `last ${weekCount} week${weekCount === 1 ? '' : 's'}`;
}

// ── Performance ──────────────────────────────────────────────────────────────

function PerformanceSection({ roster, loading }: { roster: ApiMentorRoster | null; loading: boolean }) {
  return (
    <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <TrendingUp size={17} className="text-gold" />
            Performance
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Across everyone you mentor — {roster ? weekSpanLabel(roster.weeks.length) : 'this OJT'}, Monday to Sunday.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-gray-500" />
        </div>
      ) : !roster || roster.teams.length === 0 ? (
        <p className="text-sm text-gray-500 bg-zinc-900 border border-zinc-750 border-dashed rounded-lg p-5 text-center">
          No teams are allocated to you in this OJT yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {TREND_MEASURES.map((measure) => (
              <WeeklyTrendChart key={measure.title} weeks={roster.weeks} {...measure} />
            ))}
          </div>

          <div className="mt-5">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">By team</p>
            <div className="space-y-1.5">
              {roster.teams.map((team) => (
                <TeamTrendRow key={team.id} team={team} />
              ))}
            </div>
          </div>

          <p className="text-[11px] text-gray-500 mt-4">
            The final bar is the current week and is still filling up; a flat line means nothing happened that week,
            and a grey tick on Attendance means nothing was marked.
          </p>
        </>
      )}
    </section>
  );
}

/** One team's line in the breakdown — a sparkline plus the numbers that matter this week. */
function TeamTrendRow({ team }: { team: ApiMentorRosterTeam }) {
  const current = team.weeks[team.weeks.length - 1];
  const attendance =
    current.attendanceMarked === 0 ? null : Math.round((current.attendancePresent / current.attendanceMarked) * 100);

  return (
    <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-750 rounded-lg px-3.5 py-2.5">
      <div className="min-w-0 w-40 shrink-0">
        <p className="text-sm text-white font-medium truncate">{team.name ?? 'Team'}</p>
        <p className="text-[11px] text-gray-500 truncate">
          {team.groupName ?? 'Ungrouped'} · {team.memberCount} student{team.memberCount === 1 ? '' : 's'}
        </p>
      </div>

      <div className="flex-1 min-w-0">
        <WeeklyTrendChart
          title="Tasks approved"
          weeks={team.weeks}
          valueOf={(w) => w.tasksApproved}
          format={(v) => String(v)}
          compact
        />
      </div>

      <div className="hidden sm:flex items-center gap-3 shrink-0 text-[11px] tabular-nums">
        <Stat label="approved" value={String(current.tasksApproved)} />
        <Stat label="attendance" value={attendance === null ? '—' : `${attendance}%`} />
        <SkillRatingChip value={team.skillRatingAvg} />
        <CadenceChip team={team} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-gray-400">
      <span className="text-white font-semibold">{value}</span> {label}
    </span>
  );
}

/**
 * Shared by the team and student overview rows — the framework's final rating,
 * or a plain dash before anyone's been assessed under it.
 *
 * The denominator is spelled out because this number used to be an average out
 * of 5 under the previous rubric, and a bare "3.4" does not say which.
 */
function SkillRatingChip({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-gray-600">not rated</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-gray-400 tabular-nums">
      <span className="text-white font-semibold">{value.toFixed(2)}</span>
      <span className="text-gray-500">/ 5</span>
    </span>
  );
}

function CadenceChip({ team }: { team: ApiMentorRosterTeam }) {
  if (team.weeklySessionTarget === null) {
    return <span className="text-gray-600">no target</span>;
  }
  const met = team.cadenceStatus === 'met';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold ${
        met ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
      }`}
    >
      <CalendarCheck size={10} />
      {team.sessionsThisWeek}/{team.weeklySessionTarget}
    </span>
  );
}

// ── Students (Overview glance) ──────────────────────────────────────────────

/**
 * Every student, one line each — task coverage, attendance, skill rating, no
 * click needed. The interactive version (search/sort, full detail, the
 * skill-assessment tool itself) lives on the Students tab; this is the
 * headline glance, same three numbers, same shared helpers, so the two
 * screens can never disagree about what they mean for a given student.
 */
function StudentsOverviewSection({ roster, loading }: { roster: ApiMentorRoster | null; loading: boolean }) {
  const students = roster?.students ?? [];

  return (
    <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Users size={17} className="text-gold" />
          Students
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">Task coverage, attendance and placement-readiness, at a glance.</p>
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-gray-500" />
        </div>
      ) : students.length === 0 ? (
        <p className="text-sm text-gray-500 bg-zinc-900 border border-zinc-750 border-dashed rounded-lg p-5 text-center">
          No students are allocated to you in this OJT yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {students.map((student) => (
            <StudentGlanceRow key={student.id} student={student} />
          ))}
        </div>
      )}
    </section>
  );
}

function StudentGlanceRow({ student }: { student: ApiMentorRosterStudent }) {
  const coverage = taskCoveragePct(student);
  const attendance = attendancePct(student);

  return (
    <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-750 rounded-lg px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white font-medium truncate">{student.fullName ?? 'Unnamed student'}</p>
        <p className="text-[11px] text-gray-500 truncate">
          {student.rollNumber ?? '—'}
          {student.teamName ? ` · ${student.teamName}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0 text-[11px] tabular-nums">
        <Stat label="tasks" value={coverage === null ? '—' : `${coverage}%`} />
        <Stat
          label="attendance"
          value={attendance === null ? '—' : `${attendance}%`}
        />
        <SkillRatingChip value={student.skillRatingAvg} />
      </div>
    </div>
  );
}

