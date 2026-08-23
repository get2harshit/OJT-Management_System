import { useState, useMemo } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { Users, Loader2, Briefcase, CalendarCheck, Search, ChevronRight, TrendingUp } from 'lucide-react';
import Select from '../../components/Select';
import PageLayout from '../../components/PageLayout';
import SharedResourcesPanel from '../../components/SharedResourcesPanel';
import WeeklyTrendChart, { TREND_MEASURES } from '../../components/WeeklyTrendChart';
import type { ApiMentorRoster, ApiMentorRosterTeam, ApiMentorRosterStudent } from '../../lib/api/teamRoster';
import type { MentorOjtOutletContext } from './ojt/MentorOjtLayout';

/**
 * The mentor's home page for one OJT: a line of context, then how the
 * roster is doing, then the students themselves. Teams and Projects get
 * their own tabs (see MentorTeams.tsx / MentorProjects.tsx) rather than
 * sharing this page — the same "give it real space" reasoning that already
 * pulled Performance out of a click-through modal applies to those two.
 *
 * The roster itself is fetched once in MentorOjtLayout and shared with this
 * page (and Teams, and Projects) via useOutletContext — three separate
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

          {/* ── My Students ─────────────────────────────────────────────────── */}
          <StudentsSection roster={roster} loading={rosterLoading} />

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

// ── My Students ──────────────────────────────────────────────────────────────

type StudentSort = 'name' | 'attendance' | 'open';

function StudentsSection({ roster, loading }: { roster: ApiMentorRoster | null; loading: boolean }) {
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
              expanded={expanded === student.id}
              onToggle={() => setExpanded(expanded === student.id ? null : student.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * A student's current standing, with detail expanding inline rather than in a
 * modal — the same reason performance itself came out of one.
 */
function StudentRow({
  student,
  expanded,
  onToggle,
}: {
  student: ApiMentorRosterStudent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const attendance =
    student.attendanceMarked === 0
      ? null
      : Math.round((student.attendancePresent / student.attendanceMarked) * 100);
  const needsAttention = (attendance !== null && attendance < 75) || student.tasksNeedingResubmit > 0;

  return (
    <div className="bg-zinc-900 border border-zinc-750 rounded-lg">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left">
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
          <span className={attendance !== null && attendance < 75 ? 'text-red-400' : 'text-gray-400'}>
            <span className="font-semibold">{attendance === null ? '—' : `${attendance}%`}</span> attendance
          </span>
          <span className="text-gray-400 hidden sm:inline">
            <span className="text-white font-semibold">{student.tasksOpen}</span> open
          </span>
          {needsAttention && (
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" title="Needs attention" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-zinc-750/60 grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      )}
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

