import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageLayout from '../../../components/PageLayout';
import { apiGetCohort, apiGetCohortTabCounts, type ApiCohortTabCounts } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';

// `external: true` entries leave the shell entirely — Payouts and Session
// Requests are cross-cohort admin queues with a real "all cohorts" view
// (unlike Sessions/Attendance, which are always for exactly one cohort), so
// they stay standalone pages; this just hands off to them with the current
// cohort pre-filled via ?cohortId= rather than forcing them to live inside
// the shell's own route tree.
//
// `countKey` is omitted for Overview (the hub, not a collection) and
// Attendance (a date-scoped view with no single meaningful "total").
const SECTIONS: { path: string; label: string; external?: boolean; countKey?: keyof ApiCohortTabCounts }[] = [
  { path: 'view', label: 'Overview' },
  { path: 'students', label: 'Students', countKey: 'students' },
  { path: 'mentors', label: 'Mentors', countKey: 'mentors' },
  { path: 'track-config', label: 'Tracks', countKey: 'tracks' },
  { path: 'projects', label: 'Projects', countKey: 'projects' },
  { path: 'teams', label: 'Teams & Roster', countKey: 'teams' },
  { path: 'allocations', label: 'Allocations', countKey: 'allocations' },
  { path: 'sessions', label: 'Sessions', countKey: 'sessions' },
  { path: 'session-requests', label: 'Session Requests', external: true, countKey: 'sessionRequests' },
  { path: 'attendance', label: 'Attendance' },
  { path: 'payouts', label: 'Payouts', external: true, countKey: 'payouts' },
  { path: 'evaluation-summary', label: 'Evaluation', countKey: 'evaluationConfigs' },
];

/**
 * One persistent tab strip around every top-level cohort section, so
 * Students/Projects/Mentors/Tracks/Teams & Roster/Allocations/Evaluation are
 * always the same one click away no matter which of them a link happens to
 * drop you into — replacing a mix of a row's "···" menu, an internal tab
 * inside the old Overview page, and links buried inside other pages that
 * previously made the same eight destinations reachable in three different,
 * inconsistent ways.
 *
 * Deliberately does not wrap the deeper drill-down pages (a specific track's
 * sub-pages, Manual Allocation, Breakdown, a mentor's own Workspace, ...) —
 * those stay full-page with their own Back button, unchanged, so a screen
 * whose entire job is one table isn't competing with this strip for height.
 */
export default function CohortDetailLayout() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const [cohortLabel, setCohortLabel] = useState('');
  const [tabCounts, setTabCounts] = useState<ApiCohortTabCounts | null>(null);

  useEffect(() => {
    if (!cohortId) return;
    apiGetCohort(cohortId)
      .then((cohort) => setCohortLabel(getCohortLabel(cohort)))
      .catch(() => setCohortLabel(''));
    apiGetCohortTabCounts(cohortId)
      .then(setTabCounts)
      .catch(() => setTabCounts(null));
  }, [cohortId]);

  return (
    <PageLayout className="space-y-4">
      <div className="space-y-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/admin/dashboard/ojts')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors shrink-0"
            title="Back to OJT Setup"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-base font-semibold text-white truncate">{cohortLabel || 'Loading…'}</h1>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-thin border-b border-zinc-750">
          {SECTIONS.map((section) => {
            const count = section.countKey && tabCounts ? tabCounts[section.countKey] : undefined;
            const content = (
              <>
                {section.label}
                {count !== undefined && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-zinc-750 text-[10px] font-semibold text-gray-400">{count}</span>
                )}
              </>
            );
            return section.external ? (
              <Link
                key={section.path}
                to={`/admin/dashboard/${section.path}?cohortId=${cohortId}`}
                className="flex items-center px-3.5 py-2 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-gray-400 hover:text-white hover:border-zinc-700 transition-colors"
              >
                {content}
              </Link>
            ) : (
              <NavLink
                key={section.path}
                to={`/admin/dashboard/ojts/${cohortId}/${section.path}`}
                className={({ isActive }) =>
                  `flex items-center px-3.5 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'text-gold border-gold'
                      : 'text-gray-400 border-transparent hover:text-white hover:border-zinc-700'
                  }`
                }
              >
                {content}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <Outlet />
      </div>
    </PageLayout>
  );
}
