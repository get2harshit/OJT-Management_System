import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/PageLayout';
import SpinnerSquare from '../../components/SpinnerSquare';
import { useToast } from '../../toast';
import { apiListCohorts } from '../../lib/api';

/**
 * Entry point for the global Mentors list, which has no cohort in scope at
 * click time. Resolves the same default a cohort-nested page would (the
 * admin's active cohort, else the first one) and hands off to the real,
 * cohort-nested Workspace route via a replace-redirect — so the address bar
 * never sits on a URL with no cohort in it, and a reload or share of the
 * resulting link keeps working.
 */
export default function MentorWorkspaceRedirect() {
  const { mentorId } = useParams<{ mentorId: string }>();
  const navigate = useNavigate();
  const { showError } = useToast();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mentorId) return;
    apiListCohorts()
      .then((cohorts) => {
        const cohortId = cohorts.find((c) => c.isActive)?.id ?? cohorts[0]?.id;
        if (!cohortId) {
          setFailed(true);
          return;
        }
        navigate(`/admin/dashboard/ojts/${cohortId}/mentors/${mentorId}`, { replace: true });
      })
      .catch((err) => {
        showError(err instanceof Error ? err.message : 'Failed to load cohorts');
        setFailed(true);
      });
  }, [mentorId, navigate, showError]);

  if (failed) {
    return (
      <PageLayout className="flex items-center justify-center">
        <p className="text-sm text-gray-500">No cohort found to open this mentor's workspace in.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="flex items-center justify-center">
      <SpinnerSquare size={48} />
    </PageLayout>
  );
}
