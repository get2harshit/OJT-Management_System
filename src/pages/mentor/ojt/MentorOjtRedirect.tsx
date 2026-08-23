import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import SpinnerSquare from '../../../components/SpinnerSquare';
import { apiListMyCohorts } from '../../../lib/api';
import type { Cohort } from '../../../lib/types';

/**
 * Resolves a default OJT for the flat, cohort-less URLs that used to be
 * top-level sections (/mentor/dashboard/tasks and friends) and replaces them
 * with the nested equivalent.
 *
 * Exists so every old bookmark, and every notification click-handler that
 * still names a bare section, keeps working untouched — the handlers ask for
 * "tasks" and should not have to know an OJT id to do it.
 */
export default function MentorOjtRedirect({ section }: { section: string }) {
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);

  useEffect(() => {
    apiListMyCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
  }, []);

  if (cohorts === null) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <SpinnerSquare size={40} />
      </div>
    );
  }

  // Same resolution every cohort-scoped mentor screen already used: the
  // running OJT, else the first one they have. A mentor with none at all goes
  // to their dashboard, which knows how to say so.
  const target = cohorts.find((c) => c.isActive)?.id ?? cohorts[0]?.id ?? null;
  if (!target) return <Navigate to="/mentor/dashboard" replace />;
  return <Navigate to={`/mentor/dashboard/ojts/${target}/${section}`} replace />;
}
