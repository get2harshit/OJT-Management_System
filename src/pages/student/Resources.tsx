import { useState, useEffect } from 'react';
import { Share2 } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import SpinnerSquare from '../../components/SpinnerSquare';
import SharedResourcesPanel from '../../components/SharedResourcesPanel';
import { apiGetMyCohort } from '../../lib/api';
import type { MyCohort } from '../../lib/types';

/**
 * What this student's own mentors have shared with them in their OJT.
 *
 * No cohort picker: a student belongs to exactly one active OJT, and the
 * backend already resolves their mentors from that allocation.
 */
export default function StudentResources() {
  const [cohort, setCohort] = useState<MyCohort | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGetMyCohort()
      .then((c) => { if (!cancelled) setCohort(c); })
      .catch(() => { if (!cancelled) setCohort(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <PageLayout mode="scroll" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Share2 size={24} className="text-gold" />
          Resources
        </h1>
        <p className="text-gray-400 text-sm mt-1">Everything shared with you in this OJT, newest first.</p>
      </div>

      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : !cohort ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">You&apos;re not part of an active OJT yet.</p>
        </div>
      ) : (
        <SharedResourcesPanel cohortId={cohort.cohortId} mode="student" />
      )}
    </PageLayout>
  );
}
