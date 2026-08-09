import PageLayout from '../../../components/PageLayout';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import CohortOpsOverview from './CohortOpsOverview';
import { apiGetCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';

/**
 * Allocation Breakdown — what this OJT's teams have chosen, in aggregate.
 *
 * Reached from the Allocations page. The page is the overview and nothing else:
 * it started out as three tables (per team, per mentor, per project) with the
 * overview as a fourth tab, and the tables were dropped because the numbers
 * turned out to be what anyone actually opened it for. The row-level views live
 * on elsewhere — the Allocation Blueprint covers per-student, and the
 * Allocations page covers per-team.
 *
 * The endpoints behind those tables (ops/teams, ops/mentors, ops/projects) are
 * still on the server; nothing calls them now.
 */
export default function CohortOpsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showError } = useToast();
  const [cohortLabel, setCohortLabel] = useState('');

  useEffect(() => {
    if (!cohortId) return;
    let cancelled = false;
    (async () => {
      try {
        const cohort = await apiGetCohort(cohortId);
        if (!cancelled) setCohortLabel(getCohortLabel(cohort));
      } catch (err) {
        if (!cancelled) showError(err instanceof Error ? err.message : 'Failed to load this OJT');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cohortId, showError]);

  if (!cohortId) return null;

  return (
    <PageLayout className="space-y-3">
      <CohortPageHeader
        title="Allocation Breakdown"
        subtitle={cohortLabel || undefined}
        icon={ClipboardList}
      />
      <CohortOpsOverview cohortId={cohortId} />
    </PageLayout>
  );
}
