import { useState, useEffect, useMemo } from 'react';
import { Users, Search, GitBranch, FolderGit2 } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import SpinnerSquare from '../../components/SpinnerSquare';
import { apiGetMyMentoredStudents, type ApiMentoredStudentRecord } from '../../lib/api/teamRoster';
import { getCohortLabel } from '../../lib/cohortLabel';
import type { SemesterSession } from '../../lib/types';

interface CohortGroup {
  cohortId: string;
  label: string;
  isActive: boolean;
  records: ApiMentoredStudentRecord[];
}

/**
 * Every student this mentor has ever mentored, grouped by OJT, most recent
 * first — the history directory. My OJT's own "My students" section is the
 * current-OJT roster; this is its all-time counterpart, reached from the
 * Sidebar rather than from inside any one OJT.
 */
export default function MentoredStudents() {
  const [records, setRecords] = useState<ApiMentoredStudentRecord[] | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiGetMyMentoredStudents()
      .then((res) => { if (!cancelled) setRecords(res); })
      .catch(() => { if (!cancelled) setRecords([]); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo<CohortGroup[]>(() => {
    if (!records) return [];
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? records.filter((r) =>
          (r.fullName ?? '').toLowerCase().includes(needle) ||
          (r.rollNumber ?? '').toLowerCase().includes(needle) ||
          (r.teamName ?? '').toLowerCase().includes(needle) ||
          (r.track ?? '').toLowerCase().includes(needle)
        )
      : records;

    // Records already arrive most-recent-cohort-first from the backend —
    // grouping preserves that order rather than re-sorting.
    const byCohort = new Map<string, CohortGroup>();
    filtered.forEach((r) => {
      if (!byCohort.has(r.cohortId)) {
        byCohort.set(r.cohortId, {
          cohortId: r.cohortId,
          label: getCohortLabel({ name: r.cohortName ?? undefined, allowedBatches: r.allowedBatches, sessionTerm: r.sessionTerm as SemesterSession }),
          isActive: r.cohortIsActive,
          records: [],
        });
      }
      byCohort.get(r.cohortId)!.records.push(r);
    });
    return [...byCohort.values()];
  }, [records, search]);

  return (
    <PageLayout mode="scroll" className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users size={24} className="text-gold" />
            My Students
          </h1>
          <p className="text-gray-400 text-sm mt-1">Everyone you&apos;ve mentored, across every OJT — most recent first.</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, roll no., team, track…"
            className="w-72 bg-zinc-900 border border-zinc-750 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60"
          />
        </div>
      </div>

      {records === null ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">
            {records.length === 0 ? "You haven't mentored anyone yet." : 'No student matches that search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.cohortId} className="bg-zinc-850 border border-zinc-750 rounded-xl p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <h2 className="text-base font-semibold text-white">{group.label}</h2>
                <span
                  className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${
                    group.isActive
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-zinc-800 text-gray-400 border-zinc-700'
                  }`}
                >
                  {group.isActive ? 'Current' : 'Completed'}
                </span>
                <span className="text-[11px] text-gray-500">
                  {group.records.length} student{group.records.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-2">
                {group.records.map((r) => (
                  <div
                    key={`${r.cohortId}:${r.studentId}`}
                    className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">
                        {r.fullName ?? r.studentId}
                        {r.mentorRole === 'secondary' && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500">secondary mentor</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {r.rollNumber ?? '—'}
                        {r.teamName ? ` · ${r.teamName}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-gray-400">
                      {r.track && (
                        <span className="flex items-center gap-1">
                          <GitBranch size={12} />
                          {r.track}
                        </span>
                      )}
                      {r.allocatedProjectTitle && (
                        <span className="flex items-center gap-1 max-w-[220px] truncate" title={r.allocatedProjectTitle}>
                          <FolderGit2 size={12} className="shrink-0" />
                          {r.allocatedProjectTitle}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
