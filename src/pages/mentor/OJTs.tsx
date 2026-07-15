import { useState, useEffect } from 'react';
import { Users, GitBranch, FolderGit2 } from 'lucide-react';
import Modal from '../../components/Modal';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { TeamWithProject } from '../../lib/types';
import { apiListMyTeamsDetailed } from '../../lib/api';

export default function MentorOJTs() {
  const [teams, setTeams] = useState<TeamWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<TeamWithProject | null>(null);

  useEffect(() => {
    apiListMyTeamsDetailed()
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">OJTs & Projects</h1>
        <p className="text-gray-400 text-sm mt-1">Teams allocated to you — click a team to see its project</p>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : teams.length === 0 ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-8 text-center text-gray-400 text-sm">
          No teams are allocated to you yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
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
              <p className="text-white font-semibold truncate">
                {team.project ? team.project.title : 'No project allocated yet'}
              </p>
              <p className="text-gray-500 text-xs mt-1 truncate">
                {team.members.map((m) => m.fullName ?? m.studentId).join(', ')}
              </p>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        title={selectedTeam ? `Team · ${selectedTeam.track}` : ''}
      >
        {selectedTeam && <TeamGraph team={selectedTeam} />}
      </Modal>
    </div>
  );
}

// Git-commit-graph-style drill-down: Project → branch → student(s) → branch
// → project details, top to bottom, connected by a single spine line.
function TeamGraph({ team }: { team: TeamWithProject }) {
  return (
    <div className="relative pl-7">
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-zinc-700" />

      <GraphNode dotClassName="bg-gold" label="Project">
        <p className="text-white font-semibold">
          {team.project ? team.project.title : 'No project allocated yet'}
        </p>
      </GraphNode>

      {team.members.map((member) => (
        <GraphNode key={member.studentId} dotClassName="bg-blue-400" label="Student">
          <p className="text-white font-medium">
            {member.fullName ?? 'Unnamed student'}
            {member.rollNumber && <span className="text-gray-500 text-xs ml-2">{member.rollNumber}</span>}
          </p>
        </GraphNode>
      ))}

      <GraphNode dotClassName="bg-green-400" label="Details" last>
        {team.project ? (
          <div className="space-y-2">
            <p className="text-gray-300 text-sm leading-relaxed">
              {team.project.description || 'No description provided.'}
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold">
              <FolderGit2 size={12} />
              {team.project.track}
            </span>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Once a project is allocated to this team, its details will show up here.</p>
        )}
      </GraphNode>
    </div>
  );
}

function GraphNode({
  dotClassName,
  label,
  last,
  children,
}: {
  dotClassName: string;
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative ${last ? '' : 'pb-6'}`}>
      <span className={`absolute -left-7 top-1 w-3 h-3 rounded-full ring-4 ring-zinc-850 ${dotClassName}`} />
      <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      {children}
    </div>
  );
}
