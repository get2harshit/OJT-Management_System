import { useState, useEffect } from 'react';
import { Users, GitBranch, FolderGit2, UserCog } from 'lucide-react';
import SpinnerSquare from './SpinnerSquare';
import { apiGetMyPeerTeams, type ApiPeerTeams } from '../lib/api/teamRoster';

/**
 * The other teams working under this student's mentor.
 *
 * Context, not a leaderboard: team name, track, project and who's on it —
 * the same things a student would pick up sharing a room with them. There is
 * deliberately no attendance, task or progress figure here, and none is in
 * the payload to render even if this component wanted to.
 */
export default function PeerTeamsPanel() {
  const [data, setData] = useState<ApiPeerTeams | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGetMyPeerTeams()
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Nothing to say when the student has no mentor yet — an empty card would
  // just be noise on a dashboard that already has plenty.
  if (!loading && (!data || !data.mentor)) return null;

  const mentorName = data?.mentor?.fullName ?? 'your mentor';

  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-3 border-b border-zinc-750 pb-4">
        <div className="p-2.5 rounded-xl bg-gold/10 text-gold border border-gold/20 shrink-0">
          <UserCog size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Under your mentor</p>
          <h2 className="text-lg font-bold text-white truncate">{mentorName}</h2>
        </div>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center">
          <SpinnerSquare size={32} />
        </div>
      ) : data!.teams.length === 0 ? (
        <p className="text-sm text-gray-400 mt-4">
          Yours is the only team under {mentorName} in this OJT right now.
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-500 mt-4 mb-3">
            {data!.teams.length} other team{data!.teams.length === 1 ? '' : 's'} working with the same mentor.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data!.teams.map((team) => (
              <div key={team.id} className="bg-zinc-900 border border-zinc-750 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2.5 gap-2">
                  <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold truncate">
                    <GitBranch size={12} className="shrink-0" />
                    {team.track ?? 'No track'}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                    <Users size={12} />
                    {team.members.length}
                  </span>
                </div>
                <p className="text-white font-semibold text-sm mb-1">{team.name ?? 'Team'}</p>
                <p className="text-gray-300 text-sm truncate flex items-center gap-1.5">
                  <FolderGit2 size={13} className="text-gray-500 shrink-0" />
                  {team.projectTitle ?? 'No project allocated yet'}
                </p>
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                  {team.members.map((m) => m.fullName ?? m.rollNumber ?? 'Student').join(', ')}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
