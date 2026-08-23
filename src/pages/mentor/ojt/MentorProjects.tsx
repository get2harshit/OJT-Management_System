import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FolderGit2, Users, GitBranch, ChevronRight } from 'lucide-react';
import PageLayout from '../../../components/PageLayout';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Modal from '../../../components/Modal';
import TeamProjectDetail from '../../../components/TeamProjectDetail';
import type { ApiMentorRosterTeam } from '../../../lib/api/teamRoster';
import type { MentorOjtOutletContext } from './MentorOjtLayout';

/**
 * Every project this mentor's teams are covering in this OJT — one row per
 * team, click through for the full brief (description, tech stack, goals).
 * A list first, detail on demand: with more than a handful of teams,
 * rendering every project's full write-up inline pushed the tab past a
 * useful scroll and buried the one thing this screen exists to answer —
 * "what is each team building" — under paragraphs of detail nobody asked
 * to read yet.
 */
export default function MentorProjects() {
  const { roster, loading } = useOutletContext<MentorOjtOutletContext>();
  const teams = useMemo(() => roster?.teams ?? [], [roster]);
  const [selectedTeam, setSelectedTeam] = useState<ApiMentorRosterTeam | null>(null);

  return (
    <PageLayout mode="scroll" className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <FolderGit2 size={18} className="text-gold" />
          Projects
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">What each of your teams is building in this OJT — click one for the full brief.</p>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : teams.length === 0 ? (
        <p className="text-sm text-gray-500 bg-zinc-850 border border-zinc-750 border-dashed rounded-xl p-10 text-center">
          No teams are allocated to you in this OJT yet.
        </p>
      ) : (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl divide-y divide-zinc-800">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeam(team)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-zinc-900/60 transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white truncate">
                    {team.allocatedProjectTitle ?? 'No project allocated yet'}
                  </p>
                  {team.track && (
                    <span className="flex items-center gap-1 shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-gold/10 text-gold">
                      <GitBranch size={10} />
                      {team.track}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                  <Users size={11} />
                  {team.name ?? 'Team'} · {team.memberCount} student{team.memberCount === 1 ? '' : 's'}
                </p>
              </div>
              <ChevronRight size={16} className="text-gray-500 shrink-0" />
            </button>
          ))}
        </div>
      )}

      <Modal
        open={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        title={selectedTeam?.allocatedProjectTitle ?? selectedTeam?.name ?? 'Project'}
        size="lg"
      >
        {selectedTeam && <TeamProjectDetail team={selectedTeam} />}
      </Modal>
    </PageLayout>
  );
}
