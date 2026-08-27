// The projects teams wrote for themselves, for one OJT.
//
// Its own page rather than another entry in ViewCohortPage's "View:" dropdown.
// That dropdown drives three views (students / projects / mentors) that share
// one list-and-detail machinery — paging, search, the selected-row detail
// pane — and this view shares none of it: it fetches its own rows, owns its
// own filter and paging, and opens a modal instead of a detail pane. Sitting
// in the dropdown meant every one of those pieces of shared state had to be
// stepped around on the way in and out. A button and a route cost nothing and
// make it linkable.
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import PageLayout from '../../../components/PageLayout';
import CohortPageHeader from './CohortPageHeader';
import SelfProposedProjectsPanel from './SelfProposedProjectsPanel';
import { useTracks } from '../../../hooks/useTracks';
import { apiGetCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';

export default function SelfProposedProjectsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { options: trackOptions } = useTracks();
  const [cohortLabel, setCohortLabel] = useState('');

  // Only for the header. A failure here must not keep the table off the page,
  // so it resolves to nothing rather than an error state.
  const loadLabel = useCallback(async () => {
    if (!cohortId) return;
    const cohort = await apiGetCohort(cohortId).catch(() => null);
    if (cohort) setCohortLabel(getCohortLabel(cohort));
  }, [cohortId]);

  useEffect(() => {
    loadLabel();
  }, [loadLabel]);

  if (!cohortId) return null;

  return (
    <PageLayout mode="scroll" className="space-y-4">
      <CohortPageHeader
        title="Student Proposed Projects"
        subtitle={cohortLabel || undefined}
        icon={Lightbulb}
      />
      <SelfProposedProjectsPanel cohortId={cohortId} trackOptions={trackOptions} />
    </PageLayout>
  );
}
