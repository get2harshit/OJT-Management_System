import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, GitBranch, FolderGit2, Loader2, Briefcase, Layers, CalendarCheck } from 'lucide-react';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import TeamPerformancePanel from '../../components/TeamPerformancePanel';
import type { TeamWithProject, Cohort, Project } from '../../lib/types';
import { apiListMyTeamsDetailed, apiListMyCohorts, apiGetProject } from '../../lib/api';
import { apiGetMentorWorkspace, type ApiMentorWorkspace, type ApiMentorWorkspaceTeam } from '../../lib/api/teamRoster';
import { buildCohortOptions } from '../../lib/cohortLabel';
import { useAuth } from '../../context/useAuth';
import { usePageRefresh } from '../../context/RefreshContext';

// "G1 (Aditya, Subham)" — the team's number plus its members on one line.
function teamLabel(team: TeamWithProject): string {
  const names = team.members.map((m) => m.fullName ?? m.studentId).join(', ');
  const number = team.name ?? 'Team';
  return names ? `${number} (${names})` : number;
}

export default function MentorOJTs() {
  const { user } = useAuth();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [teams, setTeams] = useState<TeamWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCohortId, setSelectedCohortId] = useState('');

  // The mentor's own workspace for this cohort — where the batch/group each
  // team is filed under lives, plus its weekly meeting target. The team list
  // above knows members and projects but nothing about grouping.
  const [workspace, setWorkspace] = useState<ApiMentorWorkspace | null>(null);

  const [selectedTeam, setSelectedTeam] = useState<TeamWithProject | null>(null);

  const loadCohortsAndTeams = useCallback(() => {
    return Promise.all([apiListMyCohorts(), apiListMyTeamsDetailed()])
      .then(([cohortsRes, teamsRes]) => {
        setCohorts(cohortsRes || []);
        setTeams(teamsRes || []);
      })
      .catch(() => {
        setCohorts([]);
        setTeams([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCohortsAndTeams();
  }, [loadCohortsAndTeams]);

  usePageRefresh(loadCohortsAndTeams);

  // Default to the active cohort once the list arrives, rather than leaving
  // the dropdown on its placeholder — a mentor almost always wants the OJT
  // that's currently running, not a blank screen asking them to pick one.
  // Only fires while nothing is selected yet, so it never overrides a
  // mentor's own pick — including on the refresh usePageRefresh triggers.
  // /cohorts/mine is already ordered created_at DESC, so the first active
  // entry is the most recently created one, matching how the backend itself
  // treats "the" active cohort (see deactivateOtherCohorts).
  useEffect(() => {
    if (cohorts.length === 0) return;
    // Falls back to the first cohort when none is active, matching
    // mentor/Sessions.tsx — otherwise a mentor whose only OJT has finished
    // sits on "Select a cohort" forever with exactly one thing to select.
    setSelectedCohortId((prev) => prev || cohorts.find((c) => c.isActive)?.id || cohorts[0]?.id || prev);
  }, [cohorts]);

  useEffect(() => {
    if (!selectedCohortId || !user?.id) {
      setWorkspace(null);
      return;
    }
    let cancelled = false;
    apiGetMentorWorkspace(selectedCohortId, user.id)
      .then((data) => { if (!cancelled) setWorkspace(data); })
      // Grouping is extra context on top of the team list, not the point of
      // the page — if it fails the teams still render, just ungrouped.
      .catch(() => { if (!cancelled) setWorkspace(null); });
    return () => { cancelled = true; };
  }, [selectedCohortId, user?.id]);

  // Only this mentor's teams in the chosen cohort — the mentor picks a cohort
  // first, then sees its projects and students.
  const cohortTeams = useMemo(
    () => (selectedCohortId ? teams.filter((t) => t.cohortId === selectedCohortId) : []),
    [teams, selectedCohortId]
  );

  const workspaceByTeamId = useMemo(() => {
    const map = new Map<string, ApiMentorWorkspaceTeam>();
    workspace?.teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [workspace]);

  /**
   * Teams split into the batches the mentor's admin filed them under.
   *
   * Every declared group gets a section even when empty, so a batch that was
   * just created is visibly there waiting for teams rather than silently
   * missing. Anything not filed anywhere collects under "Ungrouped", which is
   * only rendered when it actually has teams.
   */
  const groupedTeams = useMemo(() => {
    const sections: { id: string; name: string; teams: TeamWithProject[] }[] =
      (workspace?.groups ?? []).map((g) => ({ id: g.id, name: g.name, teams: [] }));
    const byId = new Map(sections.map((s) => [s.id, s]));
    const ungrouped: TeamWithProject[] = [];

    cohortTeams.forEach((team) => {
      const groupId = workspaceByTeamId.get(team.teamId)?.groupId;
      const section = groupId ? byId.get(groupId) : undefined;
      if (section) section.teams.push(team);
      else ungrouped.push(team);
    });

    if (ungrouped.length > 0) {
      sections.push({ id: '__ungrouped', name: 'Ungrouped', teams: ungrouped });
    }
    return sections;
  }, [cohortTeams, workspace, workspaceByTeamId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">OJTs &amp; Projects</h1>
          <p className="text-gray-400 text-sm mt-1">Your teams and their projects, grouped into the batches they belong to.</p>
        </div>
        <Select
          value={selectedCohortId}
          onChange={(v) => setSelectedCohortId(v as string)}
          variant="filter"
          className="w-[220px]"
          placeholder="Select a cohort"
          options={buildCohortOptions(cohorts)}
        />
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : !selectedCohortId ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-10 text-center">
          <Briefcase size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Select a cohort above to view its projects and students.</p>
        </div>
      ) : cohortTeams.length === 0 ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-8 text-center text-gray-400 text-sm">
          No teams are allocated to you in this cohort yet.
        </div>
      ) : (
        <div className="space-y-6">
          {groupedTeams.map((section) => (
            <div key={section.id}>
              <div className="flex items-center gap-2 mb-3">
                <Layers size={14} className="text-gray-500 shrink-0" />
                <h2 className="text-sm font-semibold text-gray-300">{section.name}</h2>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-gray-400 font-semibold">
                  {section.teams.length}
                </span>
              </div>
              {section.teams.length === 0 ? (
                <p className="text-gray-500 text-sm bg-zinc-850 border border-zinc-750 border-dashed rounded-xl p-4">
                  No teams in this batch yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.teams.map((team) => (
                    <button
                      key={team.teamId}
                      onClick={() => setSelectedTeam(team)}
                      className="text-left bg-zinc-850 border border-zinc-750 rounded-xl p-5 hover:border-gold/60 hover:scale-[1.02] transition-all duration-200"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold">
                          <GitBranch size={12} />
                          {team.track}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Users size={12} />
                          {team.members.length}
                        </span>
                      </div>
                      <p className="text-white font-semibold text-sm mb-1 flex items-center gap-1.5">
                        <Users size={13} className="text-gold shrink-0" />
                        {teamLabel(team)}
                      </p>
                      <p className="text-gray-300 text-sm truncate flex items-center gap-1.5">
                        <FolderGit2 size={13} className="text-gray-500 shrink-0" />
                        {team.project ? team.project.title : 'No project allocated yet'}
                      </p>
                      <CadenceBadge team={workspaceByTeamId.get(team.teamId)} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        title={selectedTeam ? teamLabel(selectedTeam) : ''}
        size="lg"
      >
        {selectedTeam && <TeamProjectDetail team={selectedTeam} />}
      </Modal>
    </div>
  );
}

/**
 * How this week's meetings stand against the target an admin set for the team.
 * Renders nothing when no target is set — most teams have none, and "0 of 0"
 * would read as a miss rather than as "not tracked".
 */
function CadenceBadge({ team }: { team: ApiMentorWorkspaceTeam | undefined }) {
  if (!team || team.weeklySessionTarget === null) return null;

  const met = team.cadenceStatus === 'met';
  return (
    <p
      className={`mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
        met
          ? 'bg-green-500/10 text-green-400 border-green-500/20'
          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
      }`}
    >
      <CalendarCheck size={11} className="shrink-0" />
      {team.sessionsThisWeek}/{team.weeklySessionTarget} this week
      {met ? '' : ' — behind'}
    </p>
  );
}

// A team's members plus the full detail card of its allocated project —
// fetched on open so the mentor sees the complete project (problem statement,
// tech stack, goals…), not just the title/description on the team summary.
function TeamProjectDetail({ team }: { team: TeamWithProject }) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!team.project) {
      setProject(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiGetProject(team.project.id)
      .then((p) => { if (!cancelled) setProject(p); })
      .catch(() => { if (!cancelled) setProject(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [team.project]);

  return (
    <div className="space-y-5">
      {/* How the team has actually been doing, above the project brief — a
          mentor opening a team wants the current picture first, not the spec. */}
      <div>
        <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Recent activity</p>
        <TeamPerformancePanel teamId={team.teamId} />
      </div>

      {/* Team members */}
      <div>
        <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Students</p>
        <div className="flex flex-wrap gap-2">
          {team.members.map((m) => (
            <span
              key={m.studentId}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-gray-200 border border-zinc-700"
            >
              <Users size={12} className="text-gray-500" />
              {m.fullName ?? 'Unnamed student'}
              {m.rollNumber && <span className="text-gray-500">· {m.rollNumber}</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Project detail card */}
      <div className="bg-zinc-900 border border-zinc-750 rounded-xl p-5">
        {!team.project ? (
          <p className="text-gray-500 text-sm">No project has been allocated to this team yet.</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={22} className="animate-spin text-gray-500" />
          </div>
        ) : (
          <ProjectCard project={project} fallbackTitle={team.project.title} fallbackTrack={team.track} />
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
          {project?.projectId && (
            <span className="text-[11px] font-mono text-gray-500">{project.projectId}</span>
          )}
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
      {project?.techStack && project.techStack.length > 0 && (
        <ChipSection label="Tech stack" items={project.techStack} />
      )}
      {project?.framework && project.framework.length > 0 && (
        <ChipSection label="Frameworks" items={project.framework} />
      )}
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
