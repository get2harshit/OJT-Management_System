import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, GitBranch, FolderGit2, Loader2, Briefcase, Layers, CalendarCheck, Search, ChevronRight, TrendingUp } from 'lucide-react';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import PageLayout from '../../components/PageLayout';
import OjtWeekBadge from '../../components/OjtWeekBadge';
import SharedResourcesPanel from '../../components/SharedResourcesPanel';
import WeeklyTrendChart, { TREND_MEASURES } from '../../components/WeeklyTrendChart';
import type { Cohort, Project } from '../../lib/types';
import { apiListMyCohorts, apiGetProject } from '../../lib/api';
import { apiGetMyRoster, type ApiMentorRoster, type ApiMentorRosterTeam, type ApiMentorRosterStudent } from '../../lib/api/teamRoster';
import { buildCohortOptions } from '../../lib/cohortLabel';
import { usePageRefresh } from '../../context/RefreshContext';

const WEEKS = 8;

// "G1 (Aditya, Subham)" — the team's number plus its members on one line.
function teamLabel(team: ApiMentorRosterTeam): string {
  const names = team.members.map((m) => m.fullName ?? m.id).join(', ');
  const number = team.name ?? 'Team';
  return names ? `${number} (${names})` : number;
}

/**
 * The mentor's workspace for one OJT, ordered by what they actually need:
 * a line of context, then how the roster is doing, then the students
 * themselves, then teams and resources.
 *
 * Performance is deliberately not behind a click. It used to live inside the
 * team modal, which meant the one thing a mentor should see first took two
 * clicks and got a modal's worth of space.
 */
export default function MentorOJTs() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');

  // Teams come from the roster too, not from /teams/my-teams. That endpoint
  // resolves a mentor's teams a different way (it excludes unpublished
  // allocations), and reading both on one screen produced the contradiction
  // of "1 team" in Performance and "no teams" in Teams & projects.
  const [roster, setRoster] = useState<ApiMentorRoster | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState<ApiMentorRosterTeam | null>(null);

  const loadCohorts = useCallback(() => {
    return apiListMyCohorts()
      .then((res) => setCohorts(res || []))
      .catch(() => setCohorts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  // Falls back to the first cohort when none is active, matching
  // mentor/Sessions.tsx — otherwise a mentor whose only OJT has finished sits
  // on "Select a cohort" forever with exactly one thing to select.
  useEffect(() => {
    if (cohorts.length === 0) return;
    setSelectedCohortId((prev) => prev || cohorts.find((c) => c.isActive)?.id || cohorts[0]?.id || prev);
  }, [cohorts]);

  // One call for the whole roster — every team's weekly buckets and every
  // student's rollup. Calling the single-team endpoint per team here would be
  // the N+1 this app has already been bitten by twice.
  const loadRoster = useCallback(async () => {
    if (!selectedCohortId) {
      setRoster(null);
      return;
    }
    setRosterLoading(true);
    try {
      setRoster(await apiGetMyRoster(selectedCohortId, WEEKS));
    } catch {
      setRoster(null);
    } finally {
      setRosterLoading(false);
    }
  }, [selectedCohortId]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  usePageRefresh(useCallback(() => Promise.all([loadCohorts(), loadRoster()]), [loadCohorts, loadRoster]));

  const selectedCohort = useMemo(
    () => cohorts.find((c) => c.id === selectedCohortId) ?? null,
    [cohorts, selectedCohortId]
  );

  const cohortTeams = useMemo(() => roster?.teams ?? [], [roster]);

  return (
    <PageLayout mode="scroll" className="space-y-5">
      {/* ── My OJT — context only, so it stays one line tall ───────────────── */}
      <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">My OJT</p>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white">{selectedCohort?.name ?? 'Select an OJT'}</h1>
              <OjtWeekBadge startDate={selectedCohort?.startDate} endDate={selectedCohort?.endDate} />
            </div>
            {roster && (
              <p className="text-sm text-gray-400 mt-1.5">
                {roster.teams.length} team{roster.teams.length === 1 ? '' : 's'} · {roster.students.length} student
                {roster.students.length === 1 ? '' : 's'} · {sessionsThisWeek(roster)} session
                {sessionsThisWeek(roster) === 1 ? '' : 's'} this week
              </p>
            )}
          </div>
          <Select
            value={selectedCohortId}
            onChange={(v) => setSelectedCohortId(v as string)}
            variant="filter"
            className="w-[220px]"
            placeholder="Select an OJT"
            options={buildCohortOptions(cohorts)}
          />
        </div>
      </section>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : !selectedCohortId ? (
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

          {/* ── Teams & projects ────────────────────────────────────────────── */}
          <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
            <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
              <Briefcase size={17} className="text-gold" />
              Teams &amp; projects
            </h2>
            <TeamsByGroup teams={cohortTeams} onOpenTeam={setSelectedTeam} />
          </section>

          {/* ── Shared resources ────────────────────────────────────────────── */}
          <SharedResourcesPanel
            cohortId={selectedCohortId}
            mode="mentor"
            teams={cohortTeams.map((t) => ({ id: t.id, name: t.name }))}
          />
        </>
      )}

      <Modal
        open={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        title={selectedTeam ? teamLabel(selectedTeam) : ''}
        size="lg"
      >
        {selectedTeam && <TeamProjectDetail team={selectedTeam} />}
      </Modal>
    </PageLayout>
  );
}

function sessionsThisWeek(roster: ApiMentorRoster): number {
  return roster.weeks[roster.weeks.length - 1]?.sessionsHeld ?? 0;
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
            Across everyone you mentor — last {WEEKS} weeks, Monday to Sunday.
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

// ── Teams & projects ─────────────────────────────────────────────────────────

function TeamsByGroup({
  teams,
  onOpenTeam,
}: {
  teams: ApiMentorRosterTeam[];
  onOpenTeam: (team: ApiMentorRosterTeam) => void;
}) {
  /**
   * Teams split into the batches an admin filed them under. Every group that
   * appears gets a section, and anything unfiled collects under "Ungrouped".
   */
  const sections = useMemo(() => {
    const byGroup = new Map<string, { id: string; name: string; teams: ApiMentorRosterTeam[] }>();
    const ungrouped: ApiMentorRosterTeam[] = [];

    teams.forEach((team) => {
      if (!team.groupId) {
        ungrouped.push(team);
        return;
      }
      if (!byGroup.has(team.groupId)) {
        byGroup.set(team.groupId, { id: team.groupId, name: team.groupName ?? 'Batch', teams: [] });
      }
      byGroup.get(team.groupId)!.teams.push(team);
    });

    const result = [...byGroup.values()];
    if (ungrouped.length > 0) result.push({ id: '__ungrouped', name: 'Ungrouped', teams: ungrouped });
    return result;
  }, [teams]);

  if (teams.length === 0) {
    return (
      <p className="text-sm text-gray-500 bg-zinc-900 border border-zinc-750 border-dashed rounded-lg p-5 text-center">
        No teams are allocated to you in this OJT yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <div key={section.id}>
          <div className="flex items-center gap-2 mb-2.5">
            <Layers size={13} className="text-gray-500 shrink-0" />
            <h3 className="text-sm font-medium text-gray-300">{section.name}</h3>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-gray-400 font-semibold">
              {section.teams.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.teams.map((team) => (
              <button
                key={team.id}
                onClick={() => onOpenTeam(team)}
                className="text-left bg-zinc-900 border border-zinc-750 rounded-xl p-4 hover:border-gold/60 transition-colors"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold">
                    <GitBranch size={12} />
                    {team.track ?? 'No track'}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Users size={12} />
                    {team.memberCount}
                  </span>
                </div>
                <p className="text-white font-semibold text-sm mb-1 flex items-center gap-1.5">
                  <Users size={13} className="text-gold shrink-0" />
                  {teamLabel(team)}
                </p>
                <p className="text-gray-300 text-sm truncate flex items-center gap-1.5">
                  <FolderGit2 size={13} className="text-gray-500 shrink-0" />
                  {team.allocatedProjectTitle ?? 'No project allocated yet'}
                </p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// A team's members plus the full detail card of its allocated project —
// fetched on open so the mentor sees the complete project (problem statement,
// tech stack, goals…), not just the title on the team summary.
function TeamProjectDetail({ team }: { team: ApiMentorRosterTeam }) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!team.allocatedProjectId) {
      setProject(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiGetProject(team.allocatedProjectId)
      .then((p) => { if (!cancelled) setProject(p); })
      .catch(() => { if (!cancelled) setProject(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [team.allocatedProjectId]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Students</p>
        <div className="flex flex-wrap gap-2">
          {team.members.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-gray-200 border border-zinc-700"
            >
              <Users size={12} className="text-gray-500" />
              {m.fullName ?? 'Unnamed student'}
              {m.rollNumber && <span className="text-gray-500">· {m.rollNumber}</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-750 rounded-xl p-5">
        {!team.allocatedProjectId ? (
          <p className="text-gray-500 text-sm">No project has been allocated to this team yet.</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={22} className="animate-spin text-gray-500" />
          </div>
        ) : (
          <ProjectCard
            project={project}
            fallbackTitle={team.allocatedProjectTitle ?? 'Project'}
            fallbackTrack={team.track ?? '—'}
          />
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, fallbackTitle, fallbackTrack }: { project: Project | null; fallbackTitle: string; fallbackTrack: string }) {
  const title = project?.title ?? fallbackTitle;
  const track = project?.track ?? fallbackTrack;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {project?.projectId && <span className="text-[11px] font-mono text-gray-500">{project.projectId}</span>}
          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold">
            <FolderGit2 size={12} />
            {track}
          </span>
        </div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
      </div>

      {project?.description && (
        <Section label="Description">
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{project.description}</p>
        </Section>
      )}
      {project?.problemStatement && (
        <Section label="Problem statement">
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{project.problemStatement}</p>
        </Section>
      )}
      {project?.techStack && project.techStack.length > 0 && <ChipSection label="Tech stack" items={project.techStack} />}
      {project?.framework && project.framework.length > 0 && <ChipSection label="Frameworks" items={project.framework} />}
      {project?.coreLearningGoals && project.coreLearningGoals.length > 0 && (
        <ListSection label="Core learning goals" items={project.coreLearningGoals} />
      )}
      {project?.stretchGoal && project.stretchGoal.length > 0 && (
        <ListSection label="Stretch goals" items={project.stretchGoal} />
      )}
      {project?.evaluationMetrics && project.evaluationMetrics.length > 0 && (
        <ListSection label="Evaluation metrics" items={project.evaluationMetrics} />
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  );
}

function ChipSection({ label, items }: { label: string; items: string[] }) {
  return (
    <Section label={label}>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-gray-300 border border-zinc-700">
            {item}
          </span>
        ))}
      </div>
    </Section>
  );
}

function ListSection({ label, items }: { label: string; items: string[] }) {
  return (
    <Section label={label}>
      <ul className="list-disc list-inside space-y-0.5 text-sm text-gray-300">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </Section>
  );
}
