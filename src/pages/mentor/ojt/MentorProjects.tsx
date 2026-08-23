import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FolderGit2, Users, GitBranch } from 'lucide-react';
import PageLayout from '../../../components/PageLayout';
import SpinnerSquare from '../../../components/SpinnerSquare';
import TeamProjectDetail from '../../../components/TeamProjectDetail';
import type { MentorOjtOutletContext } from './MentorOjtLayout';

/**
 * Every one of this mentor's teams, each with its full project detail card
 * shown inline — no click needed. This used to only exist behind a
 * click-through modal on a team card, which meant "what is this team
 * actually building" cost a click per team; here every project gets its own
 * full-width space to be read at a glance, matching Performance's own
 * not-nested treatment.
 */
export default function MentorProjects() {
  const { roster, loading } = useOutletContext<MentorOjtOutletContext>();
  const teams = useMemo(() => roster?.teams ?? [], [roster]);

  return (
    <PageLayout mode="scroll" className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <FolderGit2 size={18} className="text-gold" />
          Projects
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">What each of your teams is building in this OJT.</p>
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
        <div className="space-y-5">
          {teams.map((team) => (
            <section key={team.id} className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
              <div className="flex items-center gap-2.5 mb-4 flex-wrap">
                <Users size={15} className="text-gold shrink-0" />
                <h2 className="text-sm font-semibold text-white">{team.name ?? 'Team'}</h2>
                {team.track && (
                  <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-gray-400 border border-zinc-700">
                    <GitBranch size={10} />
                    {team.track}
                  </span>
                )}
                <span className="text-[11px] text-gray-500">
                  {team.memberCount} student{team.memberCount === 1 ? '' : 's'}
                </span>
              </div>

              <TeamProjectDetail team={team} />
            </section>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
