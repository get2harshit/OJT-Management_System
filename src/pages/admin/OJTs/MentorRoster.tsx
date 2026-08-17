import { useState } from 'react';
import { Users, Briefcase, UserCog, Mail, Phone, Layers, Gauge, type LucideIcon } from 'lucide-react';
import type { Project, ApiStudent, ApiMentor, TeamAllocationDetail } from '../../../lib/types';
import { useTracks } from '../../../hooks/useTracks';
import StudentDetailCard, {
  resolveTeamAssignment,
  StatusChip,
  BackButton,
  FlowNode,
  FlowCanvas,
} from './StudentDetailCard';

// One fact about the mentor — an icon, a label, a value. Used by the info
// card at the top of MentorRoster so every fact reads the same way whether
// it's present or "—", instead of some fields disappearing and reflowing
// the grid when a mentor is missing a phone number or organization.
function MentorFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={13} className="text-gold" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</p>
        <p className="text-sm text-gray-200 truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

// Project → the team(s) working on it, each drawn as its own flow row into
// that team's mentor.
export function ProjectDetailCard({
  project, teams, studentsById, onBack, onSelectStudent, showMentor = true,
}: {
  project: Project;
  teams: TeamAllocationDetail[];
  studentsById: Map<string, ApiStudent>;
  onBack: () => void;
  onSelectStudent: (studentId: string) => void;
  showMentor?: boolean;
}) {
  return (
    <div className="p-6 space-y-6">
      <BackButton label="Back" onClick={onBack} />

      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-white text-base font-semibold">{project.title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold font-semibold">
            {project.track}
          </span>
        </div>
        {project.description && <p className="text-sm text-gray-500 leading-relaxed">{project.description}</p>}
      </div>

      <div className="space-y-4">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Teams working on this project</p>
        {teams.length === 0 ? (
          <div className="flex items-center gap-3 border border-dashed border-zinc-700 rounded-2xl px-4 py-3.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
              <Briefcase size={15} className="text-gray-500" />
            </div>
            <p className="text-sm text-gray-500">No team has picked this project yet.</p>
          </div>
        ) : teams.map(team => {
          const allocated = team.allocatedProjectId === project.id;
          const mentorName = allocated
            ? team.allocatedMentorName
            : (team.preference1.projectId === project.id ? team.preference1.mentorName : team.preference2.mentorName);
          const chip = <StatusChip allocated={allocated} label={allocated ? 'Allocated' : 'Not yet allocated'} />;
          const mentorNodeId = `mentor-${team.teamId}`;
          const edges = showMentor ? team.members.map(m => ({ from: m.studentId, to: mentorNodeId })) : [];
          return (
            <FlowCanvas key={team.teamId} edges={edges}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-16">
                <div className="flex flex-col gap-3">
                  {!showMentor && <div>{chip}</div>}
                  {team.members.map(m => (
                    <FlowNode
                      key={m.studentId}
                      nodeId={m.studentId}
                      icon={Users}
                      lines={[m.fullName, studentsById.get(m.studentId)?.batch || 'No batch']}
                      onClick={() => onSelectStudent(m.studentId)}
                    />
                  ))}
                </div>
                {showMentor && (
                  <FlowNode nodeId={mentorNodeId} icon={UserCog} lines={[mentorName || 'No mentor yet', project.track]} chip={chip} />
                )}
              </div>
            </FlowCanvas>
          );
        })}
      </div>
    </div>
  );
}

// Mentor → a split view: their students and projects listed on the left,
// the selected one's own detail card (mentor node omitted — it's this same
// mentor, already the page context) on the right. Self-contained: unlike
// the Students/Projects tabs, selecting something here doesn't leave this
// view, it just fills the right-hand pane.
export default function MentorRoster({
  mentor, teams, studentsById, projectsById, onBack, load,
}: {
  mentor: ApiMentor;
  teams: TeamAllocationDetail[];
  studentsById: Map<string, ApiStudent>;
  projectsById: Map<string, Project>;
  onBack: () => void;
  /** Teams currently allocated to this mentor in this cohort, against their
   * threshold — undefined while it hasn't been fetched (or a caller doesn't
   * have a cohort to fetch it for), rendered as "—" rather than guessed. */
  load?: { allocatedCount: number; threshold: number } | null;
}) {
  const { tracks } = useTracks();
  const trackNameBySlug = new Map(tracks.map(t => [t.slug, t.name]));
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const selectStudent = (id: string) => { setSelectedStudentId(id); setSelectedProjectId(null); };
  const selectProject = (id: string) => { setSelectedProjectId(id); setSelectedStudentId(null); };

  const studentRows = teams.flatMap(t => t.members);

  const studentIdToTeam = new Map<string, TeamAllocationDetail>();
  teams.forEach(t => t.members.forEach(m => studentIdToTeam.set(m.studentId, t)));

  const projectRows = new Map<string, string>();
  const projectIdToTeams = new Map<string, TeamAllocationDetail[]>();
  teams.forEach(t => {
    if (!t.allocatedProjectId) return;
    projectRows.set(t.allocatedProjectId, projectsById.get(t.allocatedProjectId)?.title ?? t.preference1.projectTitle);
    const arr = projectIdToTeams.get(t.allocatedProjectId) || [];
    arr.push(t);
    projectIdToTeams.set(t.allocatedProjectId, arr);
  });

  const mentorTracks = (mentor.tracks || []).map(slug => trackNameBySlug.get(slug) ?? slug).join(', ');

  let detail: React.ReactNode = (
    <div className="h-full flex items-center justify-center px-6 py-12">
      <p className="text-gray-500 text-sm text-center">Select a student or project on the left to see its details.</p>
    </div>
  );
  if (selectedStudentId) {
    const student = studentsById.get(selectedStudentId);
    const team = studentIdToTeam.get(selectedStudentId);
    if (student) {
      const teammateMember = team?.members.find(m => m.studentId !== selectedStudentId);
      const teammate = teammateMember ? studentsById.get(teammateMember.studentId) : undefined;
      const assignment = team ? resolveTeamAssignment(team, projectsById) : null;
      detail = (
        <StudentDetailCard
          student={student}
          team={team}
          teammate={teammate}
          assignment={assignment}
          onBack={() => setSelectedStudentId(null)}
          showMentor={false}
        />
      );
    }
  } else if (selectedProjectId) {
    // Self-proposed (STUDENT) projects aren't mapped via ojt_cohort_projects,
    // so they never show up in the cohort's catalog `projectsById` — fall
    // back to what the team itself recorded when the catalog lookup misses.
    const projectFromTeam = projectIdToTeams.get(selectedProjectId)?.[0];
    const project: Project | undefined = projectsById.get(selectedProjectId) ?? (projectFromTeam ? {
      id: selectedProjectId,
      title: projectRows.get(selectedProjectId) || 'Untitled project',
      track: projectFromTeam.track,
      created_at: '',
    } : undefined);
    if (project) {
      detail = (
        <ProjectDetailCard
          project={project}
          teams={projectIdToTeams.get(selectedProjectId) || []}
          studentsById={studentsById}
          onBack={() => setSelectedProjectId(null)}
          onSelectStudent={selectStudent}
          showMentor={false}
        />
      );
    }
  }

  return (
    <div className="p-4">
      <BackButton label="Back to mentors" onClick={onBack} />

      {/* Mentor info card — set apart with its own border/background so it
          reads as a fact sheet about the mentor, distinct from the
          students/projects roster below it. */}
      <div className="mt-3 rounded-2xl border border-gold/20 bg-gradient-to-b from-gold/[0.06] to-transparent p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4">
          <h2 className="text-white text-lg font-bold">{mentor.fullName || mentor.email}</h2>
          <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
            mentor.isExternal
              ? 'bg-sky-500/10 text-sky-400 border-sky-500/25'
              : 'bg-zinc-700/50 text-gray-300 border-zinc-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${mentor.isExternal ? 'bg-sky-400' : 'bg-gray-400'}`} />
            {mentor.isExternal ? 'External' : 'Internal'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          <MentorFact icon={Mail} label="Email" value={mentor.email} />
          <MentorFact icon={Phone} label="Phone" value={mentor.phoneNumber} />
          <MentorFact icon={Layers} label="Tracks" value={mentorTracks} />
          <MentorFact
            icon={Gauge}
            label="Load"
            value={load ? `${load.allocatedCount} / ${load.threshold} teams` : undefined}
          />
        </div>
      </div>

      <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-6 mb-2">Roster on this OJT</p>
      <div className="flex flex-col md:flex-row gap-6 border-t border-zinc-800 pt-4">
        <div className="grid grid-cols-2 gap-4 md:w-72 shrink-0">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Students</p>
            <div className="space-y-1">
              {studentRows.length === 0 ? (
                <p className="text-gray-500 text-xs">None yet.</p>
              ) : studentRows.map(m => (
                <button
                  key={m.studentId}
                  onClick={() => selectStudent(m.studentId)}
                  className={`block w-full text-left px-2 py-1.5 rounded-lg text-xs truncate transition-colors ${
                    selectedStudentId === m.studentId ? 'bg-gold/10 text-gold' : 'text-gray-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  {m.fullName}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Projects</p>
            <div className="space-y-1">
              {projectRows.size === 0 ? (
                <p className="text-gray-500 text-xs">None yet.</p>
              ) : [...projectRows.entries()].map(([id, title]) => (
                <button
                  key={id}
                  onClick={() => selectProject(id)}
                  className={`block w-full text-left px-2 py-1.5 rounded-lg text-xs truncate transition-colors ${
                    selectedProjectId === id ? 'bg-gold/10 text-gold' : 'text-gray-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  {title}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 border-t md:border-t-0 md:border-l border-zinc-800 pt-4 md:pt-0 md:pl-6">
          {detail}
        </div>
      </div>
    </div>
  );
}
