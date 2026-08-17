import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calendar, Users, Briefcase, UserCog, Upload, Megaphone, X, CheckCircle2, type LucideIcon } from 'lucide-react';
import SpinnerSquare from '../../../components/SpinnerSquare';
import type { CohortDetails } from '../../../lib/types';
import { apiGetCohort, apiGetProjectsForCohortPage, apiListStudentsPage } from '../../../lib/api';
import { apiGetTeamsForCohortDetailed, apiGetMentorLoadSummary } from '../../../lib/api/allocations';
import { getDurationString, formatDateDisplay } from '../../../lib/utils';
import { getSemesterSessionLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';
import { apiCreateAnnouncement } from '../../../lib/api/notifications';
import PastAnnouncements from '../../../components/PastAnnouncements';
import { usePageRefresh } from '../../../context/RefreshContext';
import { useTracks } from '../../../hooks/useTracks';

interface CohortHealth {
  totalTeams: number;
  allocatedTeams: number;
  totalProjects: number;
  unassignedProjects: number;
  totalStudents: number;
  studentsWithoutTeam: number;
  mentorsNearOrAtCapacity: number;
  totalMentors: number;
}

// One box in the health row — a status color (based on whether the number
// is something to worry about), a label, the number, and a one-line gloss.
function HealthCard({
  icon: Icon, label, value, detail, tone,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone: 'good' | 'warn' | 'neutral';
}) {
  const toneClasses = {
    good: 'text-emerald-400 bg-emerald-500/10',
    warn: 'text-amber-400 bg-amber-500/10',
    neutral: 'text-gold bg-gold/10',
  }[tone];
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${toneClasses}`}>
          <Icon size={13} />
        </div>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-white text-lg font-bold">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
    </div>
  );
}

export default function ViewCohortPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const { options: trackOptions } = useTracks();
  const [cohort, setCohort] = useState<CohortDetails | null>(null);
  const [loading, setLoading] = useState(true);

  // Announcement modal state
  const [showAnnModal, setShowAnnModal] = useState(false);
  // Bumped after a publish so the list below reloads — the announcement that
  // was just sent should be the first thing visible after the modal closes.
  const [annRefreshKey, setAnnRefreshKey] = useState(0);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annTargetBatch, setAnnTargetBatch] = useState('All Batches');
  const [annTargetTrack, setAnnTargetTrack] = useState('');
  const [annPriority, setAnnPriority] = useState<'normal' | 'important' | 'urgent'>('normal');
  const [annSaving, setAnnSaving] = useState(false);

  const [health, setHealth] = useState<CohortHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  // Only the cohort itself gates the page's main spinner — this is the one
  // thing every visit needs (the top stat cards render as soon as it's in).
  const fetchCohort = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const details = await apiGetCohort(cohortId);
      setCohort(details);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load cohort');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [cohortId, navigate, showError]);

  useEffect(() => {
    fetchCohort();
  }, [fetchCohort]);

  // A few numbers that say what needs attention right now, instead of a
  // browsable mirror of the Students/Projects/Mentors tabs (which already do
  // browsing — and, via their own "view details" icon, the same drill-down —
  // natively). Capped at 500 rows per list: a cohort's roster/catalog is
  // expected to fit comfortably under that, and this is a summary, not an
  // audit — undercounting past the cap is an acceptable trade for not
  // paging through the whole cohort just to compute four numbers.
  const fetchHealth = useCallback(async () => {
    if (!cohortId) return;
    setHealthLoading(true);
    try {
      const [teamsRes, projectsRes, studentsRes, mentorLoadRows] = await Promise.all([
        apiGetTeamsForCohortDetailed(cohortId, { limit: 500 }),
        apiGetProjectsForCohortPage(cohortId, { page: 1, limit: 500 }),
        apiListStudentsPage({ page: 1, limit: 500, cohortId }),
        apiGetMentorLoadSummary(cohortId),
      ]);

      const allocatedProjectIds = new Set(
        teamsRes.data.filter(t => t.allocatedProjectId).map(t => t.allocatedProjectId as string)
      );
      const studentIdsOnTeams = new Set(teamsRes.data.flatMap(t => t.members.map(m => m.studentId)));

      setHealth({
        totalTeams: teamsRes.pagination.total,
        allocatedTeams: teamsRes.data.filter(t => t.allocatedProjectId).length,
        totalProjects: projectsRes.pagination.total,
        unassignedProjects: projectsRes.data.filter(p => !allocatedProjectIds.has(p.id)).length,
        totalStudents: studentsRes.pagination.total,
        studentsWithoutTeam: Math.max(0, studentsRes.pagination.total - studentIdsOnTeams.size),
        mentorsNearOrAtCapacity: mentorLoadRows.filter(r => r.isFull || r.isNearingCapacity).length,
        totalMentors: mentorLoadRows.length,
      });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load cohort health');
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  usePageRefresh(useCallback(() => Promise.all([fetchCohort(), fetchHealth()]), [fetchCohort, fetchHealth]));

  if (loading || !cohort) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  return (
    <PageLayout className="space-y-6">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAnnModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 active:scale-95 transition-all duration-200 text-sm shadow-md shadow-gold/10"
          >
            <Megaphone size={16} />
            Create Announcement
          </button>
          <button
            onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/projects`)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-white font-semibold rounded-lg border border-zinc-700 hover:scale-105 transition-all duration-200 text-sm"
          >
            <Upload size={16} />
            Upload Projects for This Cohort
          </button>
        </div>
      </div>

      {/* Top stats row — 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
      </div>

      {/* Cohort health — what needs attention, not a browsable mirror of the
          Students/Projects/Mentors tabs (which already own browsing and
          detail drill-down). */}
      <div className="space-y-3">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest px-1">Cohort Health</p>
        {healthLoading ? (
          <div className="flex items-center justify-center py-10">
            <SpinnerSquare size={32} />
          </div>
        ) : !health ? (
          <p className="text-sm text-gray-500 px-1">Couldn't load cohort health right now.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <HealthCard
              icon={CheckCircle2}
              label="Team Allocation"
              tone={health.totalTeams === 0 || health.allocatedTeams === health.totalTeams ? 'good' : 'warn'}
              value={`${health.allocatedTeams} / ${health.totalTeams}`}
              detail={health.totalTeams === 0 ? 'No teams yet' : `${health.totalTeams - health.allocatedTeams} team${health.totalTeams - health.allocatedTeams === 1 ? '' : 's'} still pending`}
            />
            <HealthCard
              icon={UserCog}
              label="Mentors Near Capacity"
              tone={health.mentorsNearOrAtCapacity === 0 ? 'good' : 'warn'}
              value={health.mentorsNearOrAtCapacity}
              detail={`out of ${health.totalMentors} mentor${health.totalMentors === 1 ? '' : 's'} on this OJT`}
            />
            <HealthCard
              icon={Briefcase}
              label="Projects Without a Team"
              tone={health.unassignedProjects === 0 ? 'good' : 'warn'}
              value={health.unassignedProjects}
              detail={`out of ${health.totalProjects} project${health.totalProjects === 1 ? '' : 's'} uploaded`}
            />
            <HealthCard
              icon={Users}
              label="Students Without a Team"
              tone={health.studentsWithoutTeam === 0 ? 'good' : 'warn'}
              value={health.studentsWithoutTeam}
              detail={`out of ${health.totalStudents} student${health.totalStudents === 1 ? '' : 's'} in this cohort`}
            />
          </div>
        )}
      </div>

      {/* On the same screen as the button that publishes them: what has already
          been said is the context for writing the next one, and being able to
          correct or withdraw an announcement is no use if you cannot find it. */}
      {cohortId && (
        <div className="border-t border-zinc-800 pt-5">
          <PastAnnouncements cohortId={cohortId} refreshKey={annRefreshKey} />
        </div>
      )}

      {/* Announcement creation modal */}
      {showAnnModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAnnModal(false)} />
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-6 mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-5 border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Megaphone size={20} className="text-gold" />
                Create Announcement
              </h3>
              <button
                onClick={() => setShowAnnModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Target Batch</label>
                  <select
                    value={annTargetBatch}
                    onChange={e => setAnnTargetBatch(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
                  >
                    <option value="All Batches">All Batches</option>
                    {(cohort?.allowedBatches || []).map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Target Track</label>
                  <select
                    value={annTargetTrack}
                    onChange={e => setAnnTargetTrack(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
                  >
                    <option value="">All Tracks</option>
                    {trackOptions.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Priority</label>
                  <select
                    value={annPriority}
                    onChange={e => setAnnPriority(e.target.value as 'normal' | 'important' | 'urgent')}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
                  >
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Announcement Title</label>
                <input
                  type="text"
                  value={annTitle}
                  onChange={e => setAnnTitle(e.target.value)}
                  placeholder="Enter announcement title..."
                  className="w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Message / Content</label>
                <textarea
                  value={annContent}
                  onChange={e => setAnnContent(e.target.value)}
                  placeholder="Write your announcement message..."
                  rows={4}
                  className="w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowAnnModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!annTitle.trim() || !annContent.trim() || !cohortId) return;
                  setAnnSaving(true);
                  try {
                    const { recipientCount } = await apiCreateAnnouncement({
                      cohortId,
                      title: annTitle.trim(),
                      message: annContent.trim(),
                      targetBatch: annTargetBatch !== 'All Batches' ? annTargetBatch : undefined,
                      targetTrack: annTargetTrack || undefined,
                      priority: annPriority,
                    });
                    setAnnTitle('');
                    setAnnContent('');
                    setAnnTargetBatch('All Batches');
                    setAnnTargetTrack('');
                    setAnnPriority('normal');
                    setShowAnnModal(false);
                    setAnnRefreshKey((k) => k + 1);
                    showSuccess(
                      recipientCount > 0
                        ? `Announcement published to ${recipientCount} student${recipientCount !== 1 ? 's' : ''}.`
                        : 'Announcement published, but no students matched this target — nothing was sent.'
                    );
                  } catch (err) {
                    showError(err instanceof Error ? err.message : 'Failed to publish announcement');
                  } finally {
                    setAnnSaving(false);
                  }
                }}
                disabled={!annTitle.trim() || !annContent.trim() || annSaving}
                className="px-5 py-2 text-sm font-semibold text-black bg-gold hover:bg-gold-hover rounded-lg shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                {annSaving ? 'Publishing...' : 'Publish Announcement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
