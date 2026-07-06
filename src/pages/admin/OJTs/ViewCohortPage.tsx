import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calendar, Users, Briefcase, UserCog } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import SpinnerSquare from '../../../components/SpinnerSquare';
import type { CohortDetails, Project } from '../../../lib/types';
import { apiGetCohort, apiGetProjectsForCohort } from '../../../lib/api';
import { getDurationString, formatDateDisplay } from '../../../lib/utils';
import { getCohortLabel, getSemesterSessionLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';

export default function ViewCohortPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showError } = useToast();
  const [cohort, setCohort] = useState<CohortDetails | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('');

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
      showError(err instanceof Error ? err.message : 'Failed to load cohort');
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
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      </div>
    );
  }

  const filteredStudents = selectedBatchFilter
    ? cohort.students.filter(s => s.batch === selectedBatchFilter)
    : cohort.students;

  return (
    <div className="space-y-6">
      <CohortPageHeader title={getCohortLabel(cohort)} subtitle="OJT cohort details" />

      {/* Top stats row — 5 cards including batch filter */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Status</p>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            cohort.isActive ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-700/50 text-gray-400 border border-zinc-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cohort.isActive ? 'bg-emerald-400' : 'bg-gray-500'}`} />
            {cohort.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Semester</p>
          <p className="text-white text-sm font-semibold">{getSemesterSessionLabel(cohort.sessionTerm)}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Duration</p>
          <p className="text-white text-sm font-semibold flex items-center gap-1.5">
            <Calendar size={13} className="text-gold shrink-0" />
            {getDurationString(cohort.startDate, cohort.endDate)}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Dates</p>
          <p className="text-white text-xs font-medium">{formatDateDisplay(cohort.startDate)} → {formatDateDisplay(cohort.endDate)}</p>
        </div>

        {/* Batch Filter as 5th card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 col-span-2 lg:col-span-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">Batch</p>
          <select
            value={selectedBatchFilter}
            onChange={(e) => setSelectedBatchFilter(e.target.value)}
            className="w-full bg-zinc-800 text-white text-xs border border-zinc-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition-all appearance-none cursor-pointer"
          >
            <option value="">All Batches</option>
            {cohort.allowedBatches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Students / Projects / Mentors grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Students */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gold/10 rounded-lg">
                <Users size={14} className="text-gold" />
              </div>
              <span className="text-white text-sm font-semibold">Students</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gold">{filteredStudents.length}</span>
              {selectedBatchFilter && (
                <span className="text-xs text-gray-500">/ {cohort.students.length}</span>
              )}
            </div>
          </div>
          <div className="p-3 max-h-72 overflow-y-auto space-y-1 custom-scroll">
            {cohort.students.length === 0 && (
              <p className="text-gray-500 text-xs text-center py-4">No students mapped yet.</p>
            )}
            {filteredStudents.length === 0 && cohort.students.length > 0 && (
              <p className="text-gray-500 text-xs text-center py-4">No students in batch "{selectedBatchFilter}".</p>
            )}
            {filteredStudents.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors group">
                <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                  <span className="text-[9px] text-gray-400 font-bold">{(s.fullName || s.email || '?')[0].toUpperCase()}</span>
                </div>
                <span className="text-gray-300 text-xs truncate flex-1 group-hover:text-white transition-colors">
                  {s.fullName || s.email || s.id}
                </span>
                <span className="text-[10px] text-gray-600 shrink-0">#{i + 1}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Projects */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gold/10 rounded-lg">
                <Briefcase size={14} className="text-gold" />
              </div>
              <span className="text-white text-sm font-semibold">Projects</span>
            </div>
            <span className="text-xs font-bold text-gold">{projects.length}</span>
          </div>
          <div className="p-3 max-h-72 overflow-y-auto space-y-1">
            {projects.length === 0 && (
              <p className="text-gray-500 text-xs text-center py-4">No projects mapped yet.</p>
            )}
            {projects.map((p, i) => (
              <div key={p.id} className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors group">
                <div className="w-5 h-5 rounded-lg bg-gold/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[9px] text-gold font-bold">{i + 1}</span>
                </div>
                <span className="text-gray-300 text-xs flex-1 group-hover:text-white transition-colors leading-relaxed">
                  {p.title}
                </span>
              </div>
            ))}
          </div>
          {selectedBatchFilter && (
            <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-800/40">
              <p className="text-[10px] text-gray-500">Projects are cohort-wide (not batch-specific)</p>
            </div>
          )}
        </div>

        {/* Mentors */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gold/10 rounded-lg">
                <UserCog size={14} className="text-gold" />
              </div>
              <span className="text-white text-sm font-semibold">Mentors</span>
            </div>
            <span className="text-xs font-bold text-gold">{cohort.mentors.length}</span>
          </div>
          <div className="p-3 max-h-72 overflow-y-auto space-y-1">
            {cohort.mentors.length === 0 && (
              <p className="text-gray-500 text-xs text-center py-4">No mentors mapped yet.</p>
            )}
            {cohort.mentors.map((m, i) => (
              <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors group">
                <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                  <span className="text-[9px] text-gray-400 font-bold">{(m.fullName || m.email || '?')[0].toUpperCase()}</span>
                </div>
                <span className="text-gray-300 text-xs truncate flex-1 group-hover:text-white transition-colors">
                  {m.fullName || m.email || m.id}
                </span>
                <span className="text-[10px] text-gray-600 shrink-0">#{i + 1}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
