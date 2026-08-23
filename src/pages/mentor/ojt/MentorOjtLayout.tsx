import { useEffect, useState, useCallback } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../../components/PageLayout';
import Select from '../../../components/Select';
import OjtWeekBadge from '../../../components/OjtWeekBadge';
import { apiListMyCohorts } from '../../../lib/api';
import { apiGetMyRoster, type ApiMentorRoster } from '../../../lib/api/teamRoster';
import { buildCohortOptions } from '../../../lib/cohortLabel';
import { usePageRefresh } from '../../../context/RefreshContext';
import type { Cohort } from '../../../lib/types';

/**
 * `external: true` entries leave the hub. Session Requests and Work Summary
 * both have a real, load-bearing "all OJTs" view — a mentor's outbox to admin
 * and their whole delivered-work record — so forcing either into one OJT
 * would delete a capability rather than organise one. These hand off with the
 * current OJT pre-filled instead.
 */
const SECTIONS: { path: string; label: string; external?: boolean }[] = [
  { path: 'overview', label: 'Overview' },
  { path: 'teams', label: 'Teams' },
  { path: 'projects', label: 'Projects' },
  { path: 'tasks', label: 'Tasks' },
  { path: 'submissions', label: 'Submissions' },
  { path: 'sessions', label: 'Sessions' },
  { path: 'attendance', label: 'Attendance' },
  { path: 'evaluation', label: 'Evaluation' },
];

const ROSTER_WEEKS = 8;

/**
 * Shared with every child tab via useOutletContext — Overview, Teams and
 * Projects all read the same roster, fetched once here rather than three
 * times as a mentor switches tabs. Tasks/Submissions/Sessions/Attendance/
 * Evaluation don't need it and don't consume this context.
 */
export interface MentorOjtOutletContext {
  roster: ApiMentorRoster | null;
  loading: boolean;
}

/**
 * One tab strip around everything a mentor does inside a single OJT.
 *
 * The OJT lives in the URL rather than in each page's own `useState`, which
 * is what Tasks, Submissions, Sessions, Attendance and Evaluation each used
 * to keep privately — five separate pickers that reset on reload, could not
 * be bookmarked, and could silently disagree with each other about which OJT
 * you were looking at.
 */
export default function MentorOjtLayout() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);

  useEffect(() => {
    apiListMyCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
  }, []);

  const cohort = cohorts.find((c) => c.id === cohortId) ?? null;

  // The roster underlying Overview/Teams/Projects — one fetch for the whole
  // hub. Calling apiGetMyRoster once per tab, as each used to do on its own,
  // is the exact "two sources for one fact" shape this app has already been
  // bitten by (Performance vs. Teams & projects once disagreed about team
  // count for precisely this reason).
  const [roster, setRoster] = useState<ApiMentorRoster | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);

  const loadRoster = useCallback(async () => {
    if (!cohortId) {
      setRoster(null);
      return;
    }
    setRosterLoading(true);
    try {
      setRoster(await apiGetMyRoster(cohortId, ROSTER_WEEKS));
    } catch {
      setRoster(null);
    } finally {
      setRosterLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  usePageRefresh(loadRoster);

  return (
    <PageLayout className="space-y-4">
      <div className="space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide shrink-0">My OJT</p>
            <h1 className="text-base font-semibold text-white truncate">{cohort?.name ?? 'Loading…'}</h1>
            <OjtWeekBadge startDate={cohort?.startDate} endDate={cohort?.endDate} />
          </div>
          {/* Switching OJT navigates rather than setting state, so the URL
              stays the single source of truth for which one is open. */}
          <Select
            value={cohortId ?? ''}
            onChange={(v) => navigate(`/mentor/dashboard/ojts/${v}/overview`, { replace: true })}
            variant="filter"
            className="w-[220px]"
            placeholder="Select an OJT"
            options={buildCohortOptions(cohorts)}
          />
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-thin border-b border-zinc-750">
          {SECTIONS.map((section) =>
            section.external ? (
              <Link
                key={section.path}
                to={`/mentor/dashboard/${section.path}?cohortId=${cohortId}`}
                className="flex items-center px-3.5 py-2 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-gray-400 hover:text-white hover:border-zinc-700 transition-colors"
              >
                {section.label}
              </Link>
            ) : (
              <NavLink
                key={section.path}
                to={`/mentor/dashboard/ojts/${cohortId}/${section.path}`}
                className={({ isActive }) =>
                  `flex items-center px-3.5 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'text-gold border-gold'
                      : 'text-gray-400 border-transparent hover:text-white hover:border-zinc-700'
                  }`
                }
              >
                {section.label}
              </NavLink>
            )
          )}
        </nav>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <Outlet context={{ roster, loading: rosterLoading } satisfies MentorOjtOutletContext} />
      </div>
    </PageLayout>
  );
}
