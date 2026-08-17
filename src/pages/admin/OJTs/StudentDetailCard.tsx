import { useState, useRef, useLayoutEffect } from 'react';
import { Users, Briefcase, UserCog, ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ApiStudent, Project, TeamAllocationDetail } from '../../../lib/types';

// resolveTeamAssignment falls back to the team's own track when a project
// isn't in this map — detail cards that don't have (or need) the cohort's
// full project catalog just pass this instead of fetching one.
export const EMPTY_PROJECTS_MAP = new Map<string, Project>();

interface AssignmentBranch {
  label: string;
  projectTitle: string;
  projectTrack: string;
  mentorName: string | null;
}

export interface ResolvedAssignment {
  allocated: boolean;
  // One branch (the allocated project+mentor) once allocated; both
  // submitted preferences, each with its own mentor, while still pending.
  branches: AssignmentBranch[];
}

// track is a slug end-to-end now — team.track is the fallback when a
// project itself isn't found in projectsById.
export function resolveTeamAssignment(team: TeamAllocationDetail, projectsById: Map<string, Project>): ResolvedAssignment {
  const trackFor = (projectId: string) => projectsById.get(projectId)?.track ?? team.track;

  if (team.allocatedProjectId) {
    const project = projectsById.get(team.allocatedProjectId);
    const fromPref = team.preference1.projectId === team.allocatedProjectId ? team.preference1 : team.preference2;
    return {
      allocated: true,
      branches: [{
        label: 'Allocated',
        projectTitle: project?.title ?? fromPref.projectTitle,
        projectTrack: project?.track ?? team.track,
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

export function StatusChip({ allocated, label }: { allocated: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
      allocated ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${allocated ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      {label}
    </span>
  );
}

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
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
export function FlowNode({
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
export function FlowCanvas({ edges, children }: { edges: { from: string; to: string }[]; children: React.ReactNode }) {
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
export default function StudentDetailCard({
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
    <div className="p-6 sm:p-8 space-y-6">
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
