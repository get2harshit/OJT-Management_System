import { useState, useEffect, useMemo } from 'react';
import { Eye, Users, GitBranch, FolderGit2, CheckSquare, Upload } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import ViewOnlyBanner from '../../components/ViewOnlyBanner';
import { apiListGrantedCohortIds, apiListMentorsVisibleToMe, type ApiVisibleMentor } from '../../lib/api/mentorViewGrants';
import { apiGetMyRoster, apiGetMyOjtOverview, type ApiMentorRoster, type ApiMentorOjtOverview } from '../../lib/api/teamRoster';
import { apiGetCohort } from '../../lib/api/cohorts';
import { buildCohortOptions } from '../../lib/cohortLabel';
import type { CohortDetails } from '../../lib/types';

const ROSTER_WEEKS = 8;

/**
 * A mentor's view into another mentor's cohort — read-only, granted by an
 * admin (see admin's Mentor View Grants screen). Deliberately its own page
 * rather than merged into My Students/My OJT: it must always be obvious
 * whose data is on screen, and it needs to work the same way regardless of
 * which of the mentor's own OJTs (if any) happen to overlap with this one.
 */
export default function SharedWithMe() {
  const [cohorts, setCohorts] = useState<CohortDetails[] | null>(null);
  const [cohortId, setCohortId] = useState<string>('');
  const [mentors, setMentors] = useState<ApiVisibleMentor[] | null>(null);
  const [targetMentorId, setTargetMentorId] = useState<string>('');
  const [overview, setOverview] = useState<ApiMentorOjtOverview | null>(null);
  const [roster, setRoster] = useState<ApiMentorRoster | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiListGrantedCohortIds()
      .then(async (ids) => {
        if (ids.length === 0) {
          if (!cancelled) setCohorts([]);
          return;
        }
        const results = await Promise.all(ids.map((id) => apiGetCohort(id).catch(() => null)));
        if (!cancelled) setCohorts(results.filter((c): c is CohortDetails => !!c));
      })
      .catch(() => { if (!cancelled) setCohorts([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (cohorts && cohorts.length > 0 && !cohortId) {
      setCohortId(cohorts[0].id);
    }
  }, [cohorts, cohortId]);

  useEffect(() => {
    if (!cohortId) return;
    let cancelled = false;
    setMentors(null);
    setTargetMentorId('');
    apiListMentorsVisibleToMe(cohortId)
      .then((res) => { if (!cancelled) setMentors(res); })
      .catch(() => { if (!cancelled) setMentors([]); });
    return () => { cancelled = true; };
  }, [cohortId]);

  useEffect(() => {
    if (mentors && mentors.length > 0 && !targetMentorId) {
      setTargetMentorId(mentors[0].id);
    }
  }, [mentors, targetMentorId]);

  useEffect(() => {
    if (!cohortId || !targetMentorId) {
      setOverview(null);
      setRoster(null);
      return;
    }
    let cancelled = false;
    setLoadingRoster(true);
    setError(null);
    Promise.all([
      apiGetMyOjtOverview(cohortId, targetMentorId),
      apiGetMyRoster(cohortId, ROSTER_WEEKS, targetMentorId),
    ])
      .then(([o, r]) => {
        if (cancelled) return;
        setOverview(o);
        setRoster(r);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load this mentor\'s data');
      })
      .finally(() => { if (!cancelled) setLoadingRoster(false); });
    return () => { cancelled = true; };
  }, [cohortId, targetMentorId]);

  const targetMentorName = useMemo(
    () => mentors?.find((m) => m.id === targetMentorId)?.fullName ?? null,
    [mentors, targetMentorId]
  );

  return (
    <PageLayout mode="scroll" className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Eye size={24} className="text-gold" />
          Shared With Me
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Other mentors' students, shared with you by an admin — view-only.
        </p>
      </div>

      {cohorts === null ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : cohorts.length === 0 ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">
            No mentor's data has been shared with you yet — ask an admin to grant you access.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={cohortId}
              onChange={(v) => setCohortId(v as string)}
              variant="filter"
              className="w-[220px]"
              placeholder="Select an OJT"
              options={buildCohortOptions(cohorts)}
            />
            <Select
              value={targetMentorId}
              onChange={(v) => setTargetMentorId(v as string)}
              variant="filter"
              isSearchable
              className="w-[240px]"
              placeholder="Select a mentor"
              options={(mentors ?? []).map((m) => ({ value: m.id, label: m.fullName ?? m.id }))}
              disabled={!mentors || mentors.length === 0}
            />
          </div>

          {mentors !== null && mentors.length === 0 && (
            <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-10 text-center">
              <p className="text-gray-400 text-sm">No mentor has been shared with you for this OJT.</p>
            </div>
          )}

          {targetMentorId && <ViewOnlyBanner mentorName={targetMentorName} />}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          {loadingRoster ? (
            <div className="min-h-[30vh] flex items-center justify-center">
              <SpinnerSquare size={40} />
            </div>
          ) : overview && roster ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={Users} label="Teams" value={overview.teamCount} />
                <StatCard icon={Users} label="Students" value={overview.studentCount} />
                <StatCard icon={CheckSquare} label="Tasks Approved" value={`${overview.tasksApproved}/${overview.tasksTotal}`} />
                <StatCard icon={Upload} label="Submissions Pending" value={overview.submissionsPending} />
              </div>

              <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
                <h2 className="text-base font-semibold text-white mb-4">Students</h2>
                {roster.students.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-6">No students on this mentor's roster.</p>
                ) : (
                  <div className="space-y-2">
                    {roster.students.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3.5 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-white font-medium truncate">{s.fullName ?? s.id}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {s.rollNumber ?? '—'}
                            {s.teamName ? ` · ${s.teamName}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 text-xs text-gray-400">
                          <span>{s.tasksApproved} approved</span>
                          <span>{s.submissionsPending} pending</span>
                          <span>{s.skillRatingAvg != null ? `★ ${s.skillRatingAvg.toFixed(1)}` : '— rating'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
                <h2 className="text-base font-semibold text-white mb-4">Teams</h2>
                {roster.teams.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-6">No teams on this mentor's roster.</p>
                ) : (
                  <div className="space-y-2">
                    {roster.teams.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3.5 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-white font-medium truncate">{t.name ?? 'Unnamed team'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{t.memberCount} member{t.memberCount === 1 ? '' : 's'}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs text-gray-400">
                          {t.track && (
                            <span className="flex items-center gap-1">
                              <GitBranch size={12} />
                              {t.track}
                            </span>
                          )}
                          {t.allocatedProjectTitle && (
                            <span className="flex items-center gap-1 max-w-[200px] truncate" title={t.allocatedProjectTitle}>
                              <FolderGit2 size={12} className="shrink-0" />
                              {t.allocatedProjectTitle}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </>
      )}
    </PageLayout>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
        <Icon size={14} />
        {label}
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}
