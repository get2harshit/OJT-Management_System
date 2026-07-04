import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calendar, Users, Briefcase, UserCog } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import SpinnerSquare from '../../../spinner/logoSpinner';
import type { CohortDetails, Project } from '../../../lib/types';
import { apiGetCohort, apiGetProjectsForCohort } from '../../../lib/api';
import { getDurationString, formatDateDisplay } from '../../../lib/utils';
import { getCohortLabel, getSemesterSessionLabel } from '../../../lib/cohortLabel';

export default function ViewCohortPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const [cohort, setCohort] = useState<CohortDetails | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDetails = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const [details, mappedProjects] = await Promise.all([
        apiGetCohort(cohortId),
        apiGetProjectsForCohort(cohortId),
      ]);
      setCohort(details);
      setProjects(mappedProjects);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to load cohort');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [cohortId, navigate]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  if (loading || !cohort) {
    return (
      <div className="space-y-6">
        <CohortPageHeader title="View OJT Cohort" />
        <div className="flex items-center justify-center py-16">
          <SpinnerSquare size={48} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CohortPageHeader title={getCohortLabel(cohort)} subtitle="OJT cohort details" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Status</p>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
            cohort.isActive ? 'bg-green-400/10 text-green-400' : 'bg-gray-400/10 text-gray-400'
          }`}>
            {cohort.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Semester</p>
          <p className="text-white text-sm font-medium">{getSemesterSessionLabel(cohort.sessionTerm)}</p>
        </div>
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Duration</p>
          <p className="text-white text-sm font-medium flex items-center gap-1">
            <Calendar size={14} className="text-gold" />
            {getDurationString(cohort.startDate, cohort.endDate)}
          </p>
        </div>
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Allowed Batches</p>
          <p className="text-white text-sm font-medium">{cohort.allowedBatches.join(', ')}</p>
        </div>
      </div>

      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Dates</p>
        <p className="text-white text-sm">{formatDateDisplay(cohort.startDate)} → {formatDateDisplay(cohort.endDate)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-gold" />
            <p className="text-white text-sm font-semibold">Students ({cohort.students.length})</p>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {cohort.students.length === 0 && <p className="text-gray-500 text-xs">No students mapped yet.</p>}
            {cohort.students.map(s => (
              <p key={s.id} className="text-gray-300 text-xs truncate">{s.fullName || s.email || s.id}</p>
            ))}
          </div>
        </div>

        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase size={16} className="text-gold" />
            <p className="text-white text-sm font-semibold">Projects ({projects.length})</p>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {projects.length === 0 && <p className="text-gray-500 text-xs">No projects mapped yet.</p>}
            {projects.map(p => (
              <p key={p.id} className="text-gray-300 text-xs truncate">{p.title}</p>
            ))}
          </div>
        </div>

        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <UserCog size={16} className="text-gold" />
            <p className="text-white text-sm font-semibold">Mentors ({cohort.mentors.length})</p>
          </div>
          <p className="text-gray-500 text-xs">{cohort.mentors.length === 0 ? 'No mentors mapped yet.' : `${cohort.mentors.length} mentor(s) mapped.`}</p>
        </div>
      </div>
    </div>
  );
}
