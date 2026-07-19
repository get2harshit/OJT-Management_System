import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calendar, Users, Briefcase, UserCog, Upload, ArrowLeft, type LucideIcon } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Select from '../../../components/Select';
import DataTable from '../../../components/DataTable';
import type { CohortDetails, Project, Profile, ApiStudent, ApiMentor, TeamAllocationDetail } from '../../../lib/types';
import { apiGetCohort, apiGetProjectsForCohort, apiGetProjectsForCohortPage, apiListStudentsPage, apiListMentorsPage } from '../../../lib/api';
import { apiGetTeamsForCohortDetailed } from '../../../lib/api/allocations';
import { getDurationString, formatDateDisplay } from '../../../lib/utils';
import { getCohortLabel, getSemesterSessionLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';
import FormCsvImportModal from './FormCsvImportModal';
import type { OJTBatchStudentRecord } from '../../../context/DataContext';
import { TRACKS } from '../../../lib/constants';
import { mapBackendTrackToFrontend } from '../../../lib/api/trackMapping';

import { useData } from '../../../context/DataContext';

type PanelView = '' | 'students' | 'projects' | 'mentors';

const PANEL_OPTIONS: { value: PanelView; label: string }[] = [
  { value: 'students', label: 'Students' },
  { value: 'projects', label: 'Projects' },
  { value: 'mentors', label: 'Mentors' },
];

interface AssignmentBranch {
  label: string;
  projectTitle: string;
  projectTrack: string;
  mentorName: string | null;
}

interface ResolvedAssignment {
  allocated: boolean;
  // One branch (the allocated project+mentor) once allocated; both
  // submitted preferences, each with its own mentor, while still pending.
  branches: AssignmentBranch[];
}

// `projectsById` (from apiGetProjectsForCohort) already stores track as a
// frontend label — team.track is the one raw backend enum value left to
// map, used only as a fallback when a project itself isn't found.
function resolveTeamAssignment(team: TeamAllocationDetail, projectsById: Map<string, Project>): ResolvedAssignment {
  const trackFor = (projectId: string) => projectsById.get(projectId)?.track ?? mapBackendTrackToFrontend(team.track);

  if (team.allocatedProjectId) {
    const project = projectsById.get(team.allocatedProjectId);
    const fromPref = team.preference1.projectId === team.allocatedProjectId ? team.preference1 : team.preference2;
    return {
      allocated: true,
      branches: [{
        label: 'Allocated',
        projectTitle: project?.title ?? fromPref.projectTitle,
        projectTrack: project?.track ?? mapBackendTrackToFrontend(team.track),
        mentorName: team.allocatedMentorName,
      }],
    };
  }
  return {
    allocated: false,
    branches: [
      {
        label: 'Preference 1',
        projectTitle: team.preference1.projectTitle,
        projectTrack: trackFor(team.preference1.projectId),
        mentorName: team.preference1.mentorName,
      },
      {
        label: 'Preference 2',
        projectTitle: team.preference2.projectTitle,
        projectTrack: trackFor(team.preference2.projectId),
        mentorName: team.preference2.mentorName,
      },
    ],
  };
}

const AVATAR_SIZES = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
} as const;

const AVATAR_TEXT_SIZES = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
} as const;

function InitialAvatar({ label, size = 'sm' }: { label: string; size?: keyof typeof AVATAR_SIZES }) {
  return (
    <div className={`${AVATAR_SIZES[size]} rounded-full bg-zinc-700 flex items-center justify-center shrink-0`}>
      <span className={`${AVATAR_TEXT_SIZES[size]} text-gray-400 font-bold`}>{(label || '?')[0].toUpperCase()}</span>
    </div>
  );
}

function StatusChip({ allocated, label }: { allocated: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
      allocated ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${allocated ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      {label}
    </span>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 -ml-2.5 rounded-lg hover:bg-zinc-800 transition-colors"
    >
      <ArrowLeft size={13} /> {label}
    </button>
  );
}

// One box in a flow diagram — an icon badge identifying what kind of node it
// is, a couple of lines of text, optionally a status chip. `onClick` makes
// it a real clickable node. `nodeId` is how FlowCanvas finds it to draw a
// connector to/from it — must be unique within the enclosing FlowCanvas.
function FlowNode({
  nodeId, lines, chip, onClick, icon: Icon,
}: {
  nodeId: string;
  lines: (string | null | undefined)[];
  chip?: React.ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
}) {
  const visibleLines = lines.filter(Boolean) as string[];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      data-node={nodeId}
      onClick={onClick}
      className={`relative bg-gradient-to-b from-zinc-850 to-zinc-900 border border-zinc-700/70 rounded-2xl px-4 py-3.5 min-w-[210px] max-w-[300px] text-left shadow-sm shadow-black/20 ${
        onClick ? 'hover:border-gold/50 hover:from-zinc-800 hover:shadow-md hover:shadow-black/30 transition-all cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
            <Icon size={15} className="text-gold" />
          </div>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          {chip && <div className="mb-1.5">{chip}</div>}
          {visibleLines.length === 0 ? (
            <p className="text-sm text-gray-500">—</p>
          ) : visibleLines.map((line, i) => (
            <p key={i} className={`truncate ${i === 0 ? 'text-white font-semibold text-base' : 'text-gray-500 text-sm mt-0.5'}`}>{line}</p>
          ))}
        </div>
      </div>
    </Tag>
  );
}

// Draws a curved connector — a gold bezier line with a small dot at each
// end — between any two FlowNodes inside it, the way Datawisp/node-editor
// canvases link ports. Measures actual rendered node positions rather than
// assuming a fixed layout, so it stays correct across column wraps/resizes.
function FlowCanvas({ edges, children }: { edges: { from: string; to: string }[]; children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ id: string; d: string; x1: number; y1: number; x2: number; y2: number }[]>([]);

  useLayoutEffect(() => {
    const compute = () => {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const next = edges
        .map((edge, i) => {
          const fromEl = container.querySelector<HTMLElement>(`[data-node="${edge.from}"]`);
          const toEl = container.querySelector<HTMLElement>(`[data-node="${edge.to}"]`);
          if (!fromEl || !toEl) return null;
          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();
          const x1 = fromRect.right - containerRect.left;
          const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
          const x2 = toRect.left - containerRect.left;
          const y2 = toRect.top + toRect.height / 2 - containerRect.top;
          const bend = Math.max(32, (x2 - x1) / 2);
          return {
            id: `${edge.from}->${edge.to}-${i}`,
            d: `M ${x1} ${y1} C ${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`,
            x1, y1, x2, y2,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      setPaths(next);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [edges]);

  return (
    <div ref={containerRef} className="relative">
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
        {paths.map(p => (
          <g key={p.id}>
            <path d={p.d} stroke="#C9922A" strokeWidth={1.75} fill="none" className="opacity-70" />
            <circle cx={p.x1} cy={p.y1} r={4} fill="#D9A94A" />
            <circle cx={p.x2} cy={p.y2} r={4} fill="#D9A94A" />
          </g>
        ))}
      </svg>
      {children}
    </div>
  );
}

// Student → team → project/track → mentor, drawn as a small flow diagram.
// Reused whenever a student is clicked, whether from the Students list, a
// project's team roster, or a mentor's student roster — "back" only ever
// dismisses this card.
function StudentDetailCard({
  student, team, teammate, assignment, onBack, showMentor = true,
}: {
  student: ApiStudent;
  team: TeamAllocationDetail | undefined;
  teammate: ApiStudent | undefined;
  assignment: ResolvedAssignment | null;
  onBack: () => void;
  // Hidden inside a mentor's own roster — the mentor is already the page
  // context there, so repeating it as a trailing node would be redundant.
  showMentor?: boolean;
}) {
  const isIndividual = team && team.members.length <= 1;
  const hasTeammateSlot = Boolean(team) && !isIndividual;
  const branches = assignment?.branches ?? [];

  const edges: { from: string; to: string }[] = [];
  if (assignment) {
    branches.forEach((_, i) => {
      edges.push({ from: 'student', to: `project-${i}` });
      if (hasTeammateSlot) edges.push({ from: 'teammate', to: `project-${i}` });
      if (showMentor) edges.push({ from: `project-${i}`, to: `mentor-${i}` });
    });
  } else {
    edges.push({ from: 'student', to: 'project-0' });
  }

  return (
    <div className="p-6 space-y-6">
      <BackButton label="Back" onClick={onBack} />

      <FlowCanvas edges={edges}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-16">
          <div className="flex flex-col gap-3">
            <FlowNode nodeId="student" icon={Users} lines={[student.fullName || student.email || student.id, student.batch || 'No batch']} />
            {isIndividual && (
              <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-700/50 text-gray-300 border border-zinc-700">
                Individual project
              </span>
            )}
            {hasTeammateSlot && (
              teammate ? (
                <FlowNode nodeId="teammate" icon={Users} lines={[teammate.fullName || teammate.email, teammate.batch || 'No batch']} />
              ) : (
                <FlowNode nodeId="teammate" icon={Users} lines={['Teammate', 'not found in roster']} />
              )
            )}
          </div>

          {assignment ? (
            <>
              <div className="flex flex-col gap-4">
                {!assignment.allocated && (
                  <p className="inline-flex items-center gap-1.5 text-amber-400 text-sm font-semibold w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Not yet allocated
                  </p>
                )}
                {branches.map((branch, i) => (
                  <FlowNode
                    key={branch.label}
                    nodeId={`project-${i}`}
                    icon={Briefcase}
                    lines={[branch.projectTitle, branch.projectTrack]}
                    chip={<StatusChip allocated={assignment.allocated} label={branch.label} />}
                  />
                ))}
              </div>
              {showMentor && (
                <div className="flex flex-col gap-4">
                  {branches.map((branch, i) => (
                    <FlowNode
                      key={branch.label}
                      nodeId={`mentor-${i}`}
                      icon={UserCog}
                      lines={[branch.mentorName || 'No mentor selected', branch.projectTrack]}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <FlowNode nodeId="project-0" icon={Briefcase} lines={['No project yet']} />
          )}
        </div>
      </FlowCanvas>

      {!team && <p className="text-sm text-gray-500">This student is not on a team yet.</p>}
    </div>
  );
}

// Project → the team(s) working on it, each drawn as its own flow row into
// that team's mentor.
function ProjectDetailCard({
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
function MentorRoster({
  mentor, teams, studentsById, projectsById, onBack,
}: {
  mentor: ApiMentor;
  teams: TeamAllocationDetail[];
  studentsById: Map<string, ApiStudent>;
  projectsById: Map<string, Project>;
  onBack: () => void;
}) {
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

  const mentorTracks = (mentor.tracks || []).map(mapBackendTrackToFrontend).join(', ');

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
      track: mapBackendTrackToFrontend(projectFromTeam.track),
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

      <div className="text-center py-5 border-b border-zinc-800 mt-2">
        <h2 className="text-white text-lg font-bold">{mentor.fullName || mentor.email}</h2>
        {mentorTracks && <p className="text-gray-500 text-xs mt-1">{mentorTracks}</p>}
      </div>

      <div className="flex flex-col md:flex-row gap-6 mt-4">
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

interface ViewCohortPageProps {
  profiles: Profile[];
  importOJTBatch: (cohortId: string, studentRecords: OJTBatchStudentRecord[], batchName?: string, semesterName?: string) => void;
}

export default function ViewCohortPage({
  profiles: propProfiles,
  importOJTBatch: propImportOJTBatch,
}: Partial<ViewCohortPageProps> = {}) {
  const { profiles: hookProfiles, importOJTBatch: hookImportOJTBatch } = useData();

  const profiles = propProfiles ?? hookProfiles;
  const importOJTBatch = propImportOJTBatch ?? hookImportOJTBatch;
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showError } = useToast();
  const [cohort, setCohort] = useState<CohortDetails | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<TeamAllocationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('');
  const [formCsvModalOpen, setFormCsvModalOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('');
  const [panelSearch, setPanelSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [panelTrack, setPanelTrack] = useState('');
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);

  // The browsable list for whichever category is active — server-paginated
  // and server-searched, independent of the full cohort/projects fetch
  // below (which detail cards need for cross-referencing regardless of
  // which page a given student/mentor would land on in a paginated list).
  const [studentsList, setStudentsList] = useState<ApiStudent[]>([]);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [mentorsList, setMentorsList] = useState<ApiMentor[]>([]);
  const [listPage, setListPage] = useState(1);
  const [listLimit, setListLimit] = useState(20);
  const [listLoading, setListLoading] = useState(false);
  const [listPagination, setListPagination] = useState({ totalPages: 1, total: 0 });

  const changePanelView = (next: string) => {
    setPanelView(next as PanelView);
    setPanelSearch('');
    setPanelTrack('');
    setDetailStudentId(null);
    setDetailProjectId(null);
    setSelectedMentorId(null);
  };

  const handleListLimitChange = (value: number) => {
    setListPage(1);
    setListLimit(value);
  };

  const fetchDetails = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const [details, mappedProjects, firstTeamsPage] = await Promise.all([
        apiGetCohort(cohortId),
        apiGetProjectsForCohort(cohortId),
        apiGetTeamsForCohortDetailed(cohortId, { limit: 200 }),
      ]);
      setCohort(details);
      setProjects(mappedProjects);

      let allTeams = firstTeamsPage.data;
      const { totalPages } = firstTeamsPage.pagination;
      if (totalPages > 1) {
        const restPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) => apiGetTeamsForCohortDetailed(cohortId, { limit: 200, page: i + 2 }))
        );
        allTeams = allTeams.concat(...restPages.map(p => p.data));
      }
      setTeams(allTeams);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load cohort');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [cohortId, navigate, showError]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Debounce free-text search so every keystroke doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(panelSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [panelSearch]);

  // Any change to what's being filtered by should land back on page 1.
  useEffect(() => {
    setListPage(1);
  }, [panelView, debouncedSearch, panelTrack, selectedBatchFilter]);

  // The actual server-paginated fetch for the active category's list.
  useEffect(() => {
    if (!panelView || !cohortId) return;
    let cancelled = false;
    setListLoading(true);
    (async () => {
      try {
        if (panelView === 'students') {
          const res = await apiListStudentsPage({
            page: listPage, limit: listLimit, cohortId,
            batch: selectedBatchFilter || undefined,
            search: debouncedSearch || undefined,
          });
          if (cancelled) return;
          setStudentsList(res.data);
          setListPagination({ totalPages: res.pagination.totalPages, total: res.pagination.total });
        } else if (panelView === 'projects') {
          const res = await apiGetProjectsForCohortPage(cohortId, {
            page: listPage, limit: listLimit,
            search: debouncedSearch || undefined,
            track: panelTrack || undefined,
          });
          if (cancelled) return;
          setProjectsList(res.data);
          setListPagination({ totalPages: res.pagination.totalPages, total: res.pagination.total });
        } else if (panelView === 'mentors') {
          const res = await apiListMentorsPage({
            page: listPage, limit: listLimit, cohortId,
            search: debouncedSearch || undefined,
            track: panelTrack || undefined,
          });
          if (cancelled) return;
          setMentorsList(res.data);
          setListPagination({ totalPages: res.pagination.totalPages, total: res.pagination.total });
        }
      } catch (err: unknown) {
        if (!cancelled) showError(err instanceof Error ? err.message : 'Failed to load list');
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [panelView, listPage, listLimit, debouncedSearch, panelTrack, selectedBatchFilter, cohortId, showError]);

  // Detail cards (student/project/mentor roster) aren't a DataTable, so they
  // don't get its auto-fit-to-viewport sizing for free — this mirrors the
  // same measurement so a short detail card still fills the same vertical
  // space the browsing list would have, instead of collapsing to its content.
  const detailWrapRef = useRef<HTMLDivElement>(null);
  const [detailMinHeight, setDetailMinHeight] = useState<number>();
  useEffect(() => {
    const compute = () => {
      const el = detailWrapRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setDetailMinHeight(Math.max(200, window.innerHeight - top - 16));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [detailStudentId, detailProjectId, selectedMentorId]);

  if (loading || !cohort) {
    return (
      <div className="space-y-6">
        <CohortPageHeader title="View OJT Cohort" />
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      </div>
    );
  }

  const cohortStudents = cohort.students || [];
  const cohortMentors = cohort.mentors || [];

  // Cross-reference indexes for detail cards — built from the full,
  // unpaginated cohort/projects/teams fetch above, so a teammate or roster
  // entry resolves correctly no matter what page it'd land on in the
  // browsable list.
  const studentsById = new Map(cohortStudents.map(s => [s.id, s]));
  const projectsById = new Map(projects.map(p => [p.id, p]));
  const studentIdToTeam = new Map<string, TeamAllocationDetail>();
  teams.forEach(t => t.members.forEach(m => studentIdToTeam.set(m.studentId, t)));
  const projectIdToTeams = new Map<string, TeamAllocationDetail[]>();
  teams.forEach(t => {
    const relevantIds = t.allocatedProjectId
      ? [t.allocatedProjectId]
      : [t.preference1.projectId, t.preference2.projectId];
    relevantIds.forEach(pid => {
      const arr = projectIdToTeams.get(pid) || [];
      arr.push(t);
      projectIdToTeams.set(pid, arr);
    });
  });
  const mentorIdToTeams = new Map<string, TeamAllocationDetail[]>();
  teams.forEach(t => {
    if (!t.allocatedMentorId) return;
    const arr = mentorIdToTeams.get(t.allocatedMentorId) || [];
    arr.push(t);
    mentorIdToTeams.set(t.allocatedMentorId, arr);
  });

  const openStudentDetail = (studentId: string) => setDetailStudentId(studentId);
  const isBrowsingList = !detailStudentId && !detailProjectId && !selectedMentorId;

  // Plain display-row objects for DataTable — it infers its row type from
  // whatever's passed to `data`, so these stay simple literals rather than
  // passing ApiStudent/Project/ApiMentor through directly.
  const studentRows = studentsList.map(s => ({ id: s.id, name: s.fullName || s.email || s.id, batch: s.batch || '—' }));
  const projectRows = projectsList.map((p, i) => ({
    id: p.id,
    index: (listPage - 1) * listLimit + i + 1,
    title: p.title,
    track: p.track,
  }));
  const mentorRows = mentorsList.map(m => ({ id: m.id, name: m.fullName || m.email || m.id, type: m.isExternal ? 'External' : 'Internal' }));

  const renderStudentDetail = () => {
    if (!detailStudentId) return null;
    const student = studentsById.get(detailStudentId);
    if (!student) return <p className="p-4 text-gray-500 text-xs">Student not found in this cohort's roster.</p>;
    const team = studentIdToTeam.get(detailStudentId);
    const teammateMember = team?.members.find(m => m.studentId !== detailStudentId);
    const teammate = teammateMember ? studentsById.get(teammateMember.studentId) : undefined;
    const assignment = team ? resolveTeamAssignment(team, projectsById) : null;
    return (
      <StudentDetailCard
        student={student}
        team={team}
        teammate={teammate}
        assignment={assignment}
        onBack={() => setDetailStudentId(null)}
      />
    );
  };

  return (
    <div className="space-y-6">
      <CohortPageHeader title={getCohortLabel(cohort)} subtitle="OJT cohort details" />

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            variant="filter"
            className="min-w-[160px]"
            value={selectedBatchFilter}
            onChange={setSelectedBatchFilter}
            placeholder="All Batches"
            options={(cohort.allowedBatches || []).map(b => ({ value: b, label: b }))}
          />
          <Select
            variant="filter"
            className="min-w-[160px]"
            value={panelView}
            onChange={changePanelView}
            placeholder="View: All"
            options={PANEL_OPTIONS}
          />
        </div>
        <button
          onClick={() => setFormCsvModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-white font-semibold rounded-lg border border-zinc-700 hover:scale-105 transition-all duration-200 text-sm"
        >
          <Upload size={16} />
          Upload OJT Form CSV
        </button>
      </div>

      {/* Top stats row — 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Status</p>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            cohort.isActive ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-700/50 text-gray-400 border border-zinc-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cohort.isActive ? 'bg-emerald-400' : 'bg-gray-500'}`} />
            {cohort.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Semester</p>
          <p className="text-white text-sm font-semibold">{getSemesterSessionLabel(cohort.sessionTerm)}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Duration</p>
          <p className="text-white text-sm font-semibold flex items-center gap-1.5">
            <Calendar size={13} className="text-gold shrink-0" />
            {getDurationString(cohort.startDate, cohort.endDate)}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Dates</p>
          <p className="text-white text-xs font-medium">{formatDateDisplay(cohort.startDate)} → {formatDateDisplay(cohort.endDate)}</p>
        </div>
      </div>

      {/* Students / Projects / Mentors */}
      {panelView !== '' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="p-1.5 bg-gold/10 rounded-lg">
              {panelView === 'students' && <Users size={14} className="text-gold" />}
              {panelView === 'projects' && <Briefcase size={14} className="text-gold" />}
              {panelView === 'mentors' && <UserCog size={14} className="text-gold" />}
            </div>
            <span className="text-white text-sm font-semibold">
              {panelView === 'students' ? 'Students' : panelView === 'projects' ? 'Projects' : 'Mentors'}
            </span>
          </div>

          {!isBrowsingList ? (
            <div
              ref={detailWrapRef}
              style={{
                minHeight: detailMinHeight,
                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
                backgroundSize: '18px 18px',
              }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
            >
              {panelView === 'students' && renderStudentDetail()}

              {panelView === 'projects' && (
                detailStudentId ? renderStudentDetail() : (() => {
                  const project = detailProjectId ? projectsById.get(detailProjectId) : undefined;
                  if (!project) return <p className="p-4 text-gray-500 text-xs">Project not found.</p>;
                  return (
                    <ProjectDetailCard
                      project={project}
                      teams={projectIdToTeams.get(project.id) || []}
                      studentsById={studentsById}
                      onBack={() => setDetailProjectId(null)}
                      onSelectStudent={openStudentDetail}
                    />
                  );
                })()
              )}

              {panelView === 'mentors' && (() => {
                const mentor = cohortMentors.find(m => m.id === selectedMentorId);
                if (!mentor) return <p className="p-4 text-gray-500 text-xs">Mentor not found.</p>;
                return (
                  <MentorRoster
                    mentor={mentor}
                    teams={mentorIdToTeams.get(mentor.id) || []}
                    studentsById={studentsById}
                    projectsById={projectsById}
                    onBack={() => setSelectedMentorId(null)}
                  />
                );
              })()}
            </div>
          ) : (
            <div className={`relative ${listLoading ? 'opacity-40 transition-opacity' : 'transition-opacity'}`}>
              {listLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center">
                  <SpinnerSquare size={40} />
                </div>
              )}

              {panelView === 'students' && (
                <DataTable
                  columns={[
                    {
                      key: 'name',
                      header: 'Name',
                      render: (row) => (
                        <span className="flex items-center gap-2.5">
                          <InitialAvatar label={row.name as string} />
                          {row.name as string}
                        </span>
                      ),
                    },
                    { key: 'batch', header: 'Batch' },
                  ]}
                  data={studentRows}
                  searchPlaceholder="Search students..."
                  onRowClick={(row) => openStudentDetail(row.id as string)}
                  onSearchChange={setPanelSearch}
                  serverPagination={{
                    page: listPage,
                    limit: listLimit,
                    total: listPagination.total,
                    totalPages: listPagination.totalPages,
                    onPageChange: setListPage,
                    limitOptions: [20, 40, 80, 100],
                    onLimitChange: handleListLimitChange,
                    autoFit: true,
                  }}
                />
              )}

              {panelView === 'projects' && (
                <DataTable
                  columns={[
                    { key: 'index', header: '#' },
                    { key: 'title', header: 'Title' },
                    { key: 'track', header: 'Track' },
                  ]}
                  data={projectRows}
                  searchPlaceholder="Search projects..."
                  onRowClick={(row) => setDetailProjectId(row.id as string)}
                  onSearchChange={setPanelSearch}
                  leftHeaderContent={
                    <Select
                      variant="filter"
                      className="min-w-[160px]"
                      value={panelTrack}
                      onChange={setPanelTrack}
                      placeholder="All Tracks"
                      options={TRACKS.map(t => ({ value: t, label: t }))}
                    />
                  }
                  serverPagination={{
                    page: listPage,
                    limit: listLimit,
                    total: listPagination.total,
                    totalPages: listPagination.totalPages,
                    onPageChange: setListPage,
                    limitOptions: [20, 40, 80, 100],
                    onLimitChange: handleListLimitChange,
                    autoFit: true,
                  }}
                />
              )}

              {panelView === 'mentors' && (
                <DataTable
                  columns={[
                    {
                      key: 'name',
                      header: 'Name',
                      render: (row) => (
                        <span className="flex items-center gap-2.5">
                          <InitialAvatar label={row.name as string} />
                          {row.name as string}
                        </span>
                      ),
                    },
                    { key: 'type', header: 'Type' },
                  ]}
                  data={mentorRows}
                  searchPlaceholder="Search mentors..."
                  onRowClick={(row) => setSelectedMentorId(row.id as string)}
                  onSearchChange={setPanelSearch}
                  leftHeaderContent={
                    <Select
                      variant="filter"
                      className="min-w-[160px]"
                      value={panelTrack}
                      onChange={setPanelTrack}
                      placeholder="All Tracks"
                      options={TRACKS.map(t => ({ value: t, label: t }))}
                    />
                  }
                  serverPagination={{
                    page: listPage,
                    limit: listLimit,
                    total: listPagination.total,
                    totalPages: listPagination.totalPages,
                    onPageChange: setListPage,
                    limitOptions: [20, 40, 80, 100],
                    onLimitChange: handleListLimitChange,
                    autoFit: true,
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {panelView === '' && (
        <div className="border border-dashed border-zinc-800 rounded-xl py-20 flex flex-col items-center justify-center gap-2">
          <p className="text-gray-500 text-sm">Select Students, Projects, or Mentors from the dropdown above to view details.</p>
        </div>
      )}

      <FormCsvImportModal
        open={formCsvModalOpen}
        onClose={() => setFormCsvModalOpen(false)}
        profiles={profiles}
        importOJTBatch={importOJTBatch}
        defaultCohortId={cohortId}
        defaultBatchName={cohort.allowedBatches?.[0]}
        defaultSemesterName={getCohortLabel(cohort)}
        onImportSuccess={fetchDetails}
      />
    </div>
  );
}
