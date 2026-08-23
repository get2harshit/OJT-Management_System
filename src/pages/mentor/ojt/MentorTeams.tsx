import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Users, GitBranch, FolderGit2, Briefcase, AlertTriangle } from 'lucide-react';
import Modal from '../../../components/Modal';
import SpinnerSquare from '../../../components/SpinnerSquare';
import PageLayout from '../../../components/PageLayout';
import TeamProjectDetail from '../../../components/TeamProjectDetail';
import type { ApiMentorRosterTeam } from '../../../lib/api/teamRoster';
import { teamAttentionReasons, type AttentionReason } from '../../../lib/teamAttention';
import type { MentorOjtOutletContext } from './MentorOjtLayout';

// "G1 (Aditya, Subham)" — the team's number plus its members on one line.
function teamLabel(team: ApiMentorRosterTeam): string {
  const names = team.members.map((m) => m.fullName ?? m.id).join(', ');
  const number = team.name ?? 'Team';
  return names ? `${number} (${names})` : number;
}

type TeamView = 'track' | 'group' | 'attention';

const TEAM_VIEWS: { id: TeamView; label: string }[] = [
  { id: 'track', label: 'By track' },
  { id: 'group', label: 'By group' },
  { id: 'attention', label: 'Needs attention' },
];

/**
 * Every team this mentor has in this OJT, with its own full page — pulled
 * out of Overview so it gets real space instead of sharing a screen with
 * Performance and My Students.
 */
export default function MentorTeams() {
  const { roster, loading } = useOutletContext<MentorOjtOutletContext>();
  const teams = useMemo(() => roster?.teams ?? [], [roster]);
  const [selectedTeam, setSelectedTeam] = useState<ApiMentorRosterTeam | null>(null);

  return (
    <PageLayout mode="scroll" className="space-y-5">
      <TeamsSection teams={teams} loading={loading} onOpenTeam={setSelectedTeam} />

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

/**
 * The mentor's teams, grouped the way they're currently thinking about them.
 *
 * Track and group are two real, different organisations of the same teams —
 * a track is what the team is building, a group is the batch an admin filed
 * them under — so neither can stand in for the other. "Needs attention" is
 * not a third grouping but a filter, and it opens selected whenever anything
 * is actually flagged, because a mentor arriving at this screen wants the
 * problems first and the inventory second.
 */
function TeamsSection({
  teams,
  loading,
  onOpenTeam,
}: {
  teams: ApiMentorRosterTeam[];
  loading: boolean;
  onOpenTeam: (team: ApiMentorRosterTeam) => void;
}) {
  const reasonsByTeam = useMemo(() => {
    const map = new Map<string, AttentionReason[]>();
    teams.forEach((team) => map.set(team.id, teamAttentionReasons(team)));
    return map;
  }, [teams]);

  const flaggedCount = useMemo(
    () => [...reasonsByTeam.values()].filter((r) => r.length > 0).length,
    [reasonsByTeam]
  );

  const [view, setView] = useState<TeamView>('track');
  // Land on the problems when there are any — but only as the initial view,
  // never overriding a mentor who has since picked a different one.
  const [viewTouched, setViewTouched] = useState(false);
  useEffect(() => {
    if (!viewTouched && flaggedCount > 0) setView('attention');
  }, [flaggedCount, viewTouched]);

  const sections = useMemo(() => {
    if (view === 'attention') {
      const flagged = teams
        .filter((t) => (reasonsByTeam.get(t.id) ?? []).length > 0)
        .sort((a, b) => (reasonsByTeam.get(b.id)?.length ?? 0) - (reasonsByTeam.get(a.id)?.length ?? 0));
      return flagged.length === 0 ? [] : [{ id: '__attention', name: 'Needs attention', teams: flagged }];
    }

    const buckets = new Map<string, { id: string; name: string; teams: ApiMentorRosterTeam[] }>();
    const unfiled: ApiMentorRosterTeam[] = [];

    teams.forEach((team) => {
      const key = view === 'track' ? team.track : team.groupId;
      const name = view === 'track' ? team.track : team.groupName ?? 'Batch';
      if (!key || !name) {
        unfiled.push(team);
        return;
      }
      if (!buckets.has(key)) buckets.set(key, { id: key, name, teams: [] });
      buckets.get(key)!.teams.push(team);
    });

    const result = [...buckets.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (unfiled.length > 0) {
      result.push({
        id: '__unfiled',
        name: view === 'track' ? 'No track' : 'Ungrouped',
        teams: unfiled,
      });
    }
    return result;
  }, [teams, view, reasonsByTeam]);

  return (
    <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Briefcase size={17} className="text-gold" />
            Teams
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {loading ? 'Loading teams…' : `${teams.length} active team${teams.length === 1 ? '' : 's'}`}
            {!loading && flaggedCount > 0 && (
              <>
                {' · '}
                <span className="text-yellow-400">
                  {flaggedCount} need{flaggedCount === 1 ? 's' : ''} attention
                </span>
              </>
            )}
          </p>
        </div>
        {!loading && teams.length > 0 && (
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-750 rounded-lg p-1">
            {TEAM_VIEWS.map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  setViewTouched(true);
                  setView(option.id);
                }}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  view === option.id ? 'bg-zinc-750 text-white font-medium' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {option.label}
                {option.id === 'attention' && flaggedCount > 0 && (
                  <span className="ml-1.5 text-[10px] text-yellow-400 font-semibold tabular-nums">{flaggedCount}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        // "No teams" is a claim about the data, so it waits until there is
        // data — otherwise every load flashes it before the roster arrives.
        <div className="py-8 flex items-center justify-center">
          <SpinnerSquare size={32} />
        </div>
      ) : teams.length === 0 ? (
        <p className="text-sm text-gray-500 bg-zinc-900 border border-zinc-750 border-dashed rounded-lg p-5 text-center">
          No teams are allocated to you in this OJT yet.
        </p>
      ) : sections.length === 0 ? (
        <p className="text-sm text-gray-500 bg-zinc-900 border border-zinc-750 border-dashed rounded-lg p-5 text-center">
          Nothing needs your attention right now — attendance, session cadence and task deadlines all look fine.
        </p>
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.id}>
              {view !== 'attention' && (
                <div className="flex items-center gap-2 mb-2.5">
                  {view === 'track' ? (
                    <GitBranch size={13} className="text-gray-500 shrink-0" />
                  ) : (
                    <Users size={13} className="text-gray-500 shrink-0" />
                  )}
                  <h3 className="text-sm font-medium text-gray-300">{section.name}</h3>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-gray-400 font-semibold">
                    {section.teams.length}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.teams.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    reasons={reasonsByTeam.get(team.id) ?? []}
                    onOpen={() => onOpenTeam(team)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TeamCard({
  team,
  reasons,
  onOpen,
}: {
  team: ApiMentorRosterTeam;
  reasons: AttentionReason[];
  onOpen: () => void;
}) {
  const flagged = reasons.length > 0;
  return (
    <button
      onClick={onOpen}
      className={`text-left bg-zinc-900 border rounded-xl p-4 transition-colors ${
        flagged ? 'border-yellow-500/40 hover:border-yellow-500/70' : 'border-zinc-750 hover:border-gold/60'
      }`}
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

      {/* The reason is always shown with the flag. A colour-only warning would
          leave the mentor to work out for themselves what is wrong. */}
      {flagged && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-zinc-800">
          {reasons.map((reason) => (
            <span
              key={reason.code}
              title={reason.detail}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
            >
              <AlertTriangle size={10} />
              {reason.label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
