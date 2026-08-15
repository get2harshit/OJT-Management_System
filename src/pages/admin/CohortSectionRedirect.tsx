import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/PageLayout';
import SpinnerSquare from '../../components/SpinnerSquare';
import { useToast } from '../../toast';
import { apiListCohorts } from '../../lib/api';

interface Props {
  /** The OJT Setup tab path segment to land on, e.g. 'allocations', 'sessions'. */
  section: string;
}

/**
 * Entry point for an old flat `/admin/dashboard/<section>` URL now that the
 * page itself lives inside OJT Setup — resolves the same default cohort a
 * cohort-nested page would (the admin's active cohort, else the first one)
 * and hands off via a replace-redirect, so a bookmark, a notification deep
 * link (see `admin/index.tsx`'s `useNotificationNavigate` switch), or a
 * stray old link all keep working instead of 404ing. Same pattern as
 * `MentorWorkspaceRedirect`, generalized since five sections need it rather
 * than just one.
 */
export default function CohortSectionRedirect({ section }: Props) {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiListCohorts()
      .then((cohorts) => {
        const cohortId = cohorts.find((c) => c.isActive)?.id ?? cohorts[0]?.id;
        if (!cohortId) {
          setFailed(true);
          return;
        }
        navigate(`/admin/dashboard/ojts/${cohortId}/${section}`, { replace: true });
      })
      .catch((err) => {
        showError(err instanceof Error ? err.message : 'Failed to load cohorts');
        setFailed(true);
      });
  }, [section, navigate, showError]);

  if (failed) {
    return (
      <PageLayout className="flex items-center justify-center">
        <p className="text-sm text-gray-500">No cohort found to open this in.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="flex items-center justify-center">
      <SpinnerSquare size={48} />
    </PageLayout>
  );
}
