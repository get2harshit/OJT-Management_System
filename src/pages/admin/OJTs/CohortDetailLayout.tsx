import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageLayout from '../../../components/PageLayout';
import { apiGetCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';

const SECTIONS = [
  { path: 'view', label: 'Overview' },
  { path: 'students', label: 'Students' },
  { path: 'projects', label: 'Projects' },
  { path: 'mentors', label: 'Mentors' },
  { path: 'track-config', label: 'Tracks' },
  { path: 'teams', label: 'Teams & Roster' },
  { path: 'allocations', label: 'Allocations' },
  { path: 'evaluation-summary', label: 'Evaluation' },
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

  useEffect(() => {
    if (!cohortId) return;
    apiGetCohort(cohortId)
      .then((cohort) => setCohortLabel(getCohortLabel(cohort)))
      .catch(() => setCohortLabel(''));
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
          {SECTIONS.map((section) => (
            <NavLink
              key={section.path}
              to={`/admin/dashboard/ojts/${cohortId}/${section.path}`}
              className={({ isActive }) =>
                `px-3.5 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'text-gold border-gold'
                    : 'text-gray-400 border-transparent hover:text-white hover:border-zinc-700'
                }`
              }
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <Outlet />
      </div>
    </PageLayout>
  );
}
