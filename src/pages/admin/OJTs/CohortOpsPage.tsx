import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardList, Users, UserCog, FolderKanban, Download } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import DataTable from '../../../components/DataTable';
import Select from '../../../components/Select';
import {
  apiGetCohort,
  apiGetOpsTeams,
  apiGetOpsMentors,
  apiGetOpsProjects,
  apiGetOpsFilterOptions,
  OPS_TEAM_STATUS_LABELS,
  SUBMISSION_MODE_LABELS,
} from '../../../lib/api';
import type {
  OpsFilterOptions,
  OpsMentor,
  OpsPagination,
  OpsPreferenceSlot,
  OpsProject,
  OpsTeam,
  OpsTeamStatus,
} from '../../../lib/api/ops';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { exportToCSV } from '../../../lib/csvExport';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 400;

/**
 * Allocation Breakdown — the same OJT read three ways.
 *
 * Reached from the Allocations page. One screen rather than three because the
 * questions run into each other: a mentor looks overloaded, so which teams
 * picked them, and what project were those teams after. Switching view keeps
 * the OJT and drops everything else, which is right — a batch filter means
 * nothing on the mentor table, and carrying it across would silently narrow a
 * list the admin thinks is complete.
 *
 * Every list is paged, searched and filtered on the server. None of these three
 * is small: a live OJT runs to hundreds of teams and thousands of catalog
 * projects.
 */

type OpsView = 'teams' | 'mentors' | 'projects';

const VIEWS: { key: OpsView; label: string; icon: LucideIcon }[] = [
  { key: 'teams', label: 'Students', icon: Users },
  { key: 'mentors', label: 'Mentors', icon: UserCog },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
];

// Same convention as the Allocation Blueprint's stages — gray for "formed but
// idle", yellow for "waiting on us", green for done.
const STATUS_STYLES: Record<OpsTeamStatus, string> = {
  pending: 'bg-zinc-800 text-gray-400 border-zinc-700',
  submitted: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/25',
  allocated: 'bg-green-500/10 text-green-500 border-green-500/25',
};

// ── Shared list plumbing ─────────────────────────────────────────────────────

interface OpsList<T> {
  rows: T[];
  pagination: OpsPagination;
  loading: boolean;
  page: number;
  limit: number;
  search: string;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  onSearchChange: (value: string) => void;
}

/**
 * Paging, debounced search and the fetch/loading cycle the three views share.
 *
 * `load` is the only thing that differs, and each view supplies it as a
 * useCallback over its own filters — so a filter change changes `load`, which
 * re-runs the effect. Filter setters reset the page themselves rather than this
 * hook watching for it: resetting here would mean a fetch on the old page
 * followed immediately by one on page 1.
 */
function useOpsList<T>(
  load: (page: number, limit: number, search: string) => Promise<{ data: T[]; pagination: OpsPagination }>
): OpsList<T> {
  const { showError } = useToast();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<T[]>([]);
  const [pagination, setPagination] = useState<OpsPagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await load(page, limit, search);
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [load, page, limit, search, showError]);

  useEffect(() => {
    run();
  }, [run]);
  usePageRefresh(run);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const onSearchChange = (value: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  return { rows, pagination, loading, page, limit, search, setPage, setLimit, onSearchChange };
}

/**
 * Exports everything currently matching, not just the page on screen — a second
 * request sized to the full count. An export that silently stopped at 25 rows
 * would be worse than no export, because nothing about the file says it is
 * partial.
 */
function useCsvExport() {
  const { showError } = useToast();
  const [exporting, setExporting] = useState(false);

  const runExport = async (fetchAll: () => Promise<void>) => {
    setExporting(true);
    try {
      await fetchAll();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  return { exporting, runExport };
}

function ExportButton({ onClick, disabled, exporting }: { onClick: () => void; disabled: boolean; exporting: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || exporting}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors shrink-0 disabled:opacity-50"
    >
      <Download size={13} />
      {exporting ? 'Exporting...' : 'Export CSV'}
    </button>
  );
}

function TrackFilter({ options, value, onChange }: { options: OpsFilterOptions; value: string; onChange: (v: string) => void }) {
  if (options.tracks.length === 0) return null;
  return (
    <Select
      variant="filter"
      value={value}
      onChange={(v) => onChange(v as string)}
      options={options.tracks.map((t) => ({ value: t.id, label: t.name }))}
      placeholder="All Tracks"
      className="min-w-[150px] !text-xs !py-1.5"
    />
  );
}

function RowCount({ total, noun }: { total: number; noun: string }) {
  return (
    <span className="text-xs text-gray-500 shrink-0">
      {total} {noun}
      {total === 1 ? '' : 's'}
    </span>
  );
}

// ── Students (teams) ─────────────────────────────────────────────────────────

/** "Aditya_2024 A, Priya_2024 A" — how ops refers to a team. */
function teamLabel(team: OpsTeam): string {
  if (team.members.length === 0) return team.teamName || '—';
  return team.members.map((m) => `${m.fullName}_${m.batch ?? '?'}`).join(', ');
}

function mentorLabel(slot: OpsPreferenceSlot): string {
  return slot.mentorName ?? 'No mentor';
}

/**
 * One preference slot: the project, then its mentor in the accent colour —
 * the pair is what an admin reads across, and the mentor is the half that
 * decides whether the allocation can happen.
 */
function PreferenceCell({ slot, isAllocated }: { slot: OpsPreferenceSlot | null; isAllocated: boolean }) {
  if (!slot) return <span className="text-gray-600">—</span>;
  return (
    <div className={`min-w-0 max-w-[260px] ${isAllocated ? 'border-l-2 border-green-500/60 pl-2' : ''}`}>
      <p className="text-white text-xs truncate" title={slot.projectTitle}>
        {slot.projectTitle}
      </p>
      <p className="text-[11px] text-gold truncate" title={mentorLabel(slot)}>
        {mentorLabel(slot)}
        {slot.mentorIsExternal && <span className="text-gray-500"> · Industry</span>}
      </p>
      <p className="text-[10px] text-gray-600 truncate">
        {slot.projectCode ?? '—'}
        {slot.isSelfProposed && ' · Self proposed'}
      </p>
    </div>
  );
}

function TeamsView({ cohortId, options, cohortLabel }: { cohortId: string; options: OpsFilterOptions; cohortLabel: string }) {
  const [trackId, setTrackId] = useState('');
  const [batch, setBatch] = useState('');
  const [status, setStatus] = useState<OpsTeamStatus | ''>('');

  const load = useCallback(
    (page: number, limit: number, search: string) =>
      apiGetOpsTeams(cohortId, {
        page,
        limit,
        search: search || undefined,
        trackId: trackId || undefined,
        batch: batch || undefined,
        status: status || undefined,
      }),
    [cohortId, trackId, batch, status]
  );

  const list = useOpsList<OpsTeam>(load);
  const { exporting, runExport } = useCsvExport();

  // Every filter change goes back to page 1 — page 4 of the old result set is
  // rarely a page of the new one, and an empty table reads as "no matches".
  const { setPage } = list;
  const changeTrack = (value: string) => { setPage(1); setTrackId(value); };
  const changeBatch = (value: string) => { setPage(1); setBatch(value); };
  const changeStatus = (value: string) => { setPage(1); setStatus(value as OpsTeamStatus | ''); };

  const rows = useMemo(() => list.rows.map((t) => ({ ...t, id: t.teamId })), [list.rows]);

  const handleExport = () =>
    runExport(async () => {
      const res = await apiGetOpsTeams(cohortId, {
        page: 1,
        limit: Math.max(list.pagination.total, 1),
        search: list.search || undefined,
        trackId: trackId || undefined,
        batch: batch || undefined,
        status: status || undefined,
      });
      exportToCSV(
        `allocation_breakdown_teams_${(cohortLabel || cohortId).replace(/\s+/g, '_')}`,
        res.data.map((t) => ({
          team: teamLabel(t),
          mode: t.submissionMode ? SUBMISSION_MODE_LABELS[t.submissionMode] : '',
          track: t.trackName,
          preference1Project: t.preference1?.projectTitle ?? '',
          preference1Mentor: t.preference1?.mentorName ?? '',
          preference2Project: t.preference2?.projectTitle ?? '',
          preference2Mentor: t.preference2?.mentorName ?? '',
          status: t.allocationStatus === 'needs_review' ? 'Needs review' : OPS_TEAM_STATUS_LABELS[t.status],
          allocatedProject: t.allocatedProjectTitle ?? '',
          allocatedMentor: t.allocatedMentorName ?? '',
        })),
        [
          { key: 'team', header: 'Team' },
          { key: 'mode', header: 'Mode' },
          { key: 'track', header: 'Track' },
          { key: 'preference1Project', header: 'Preference 1 Project' },
          { key: 'preference1Mentor', header: 'Preference 1 Mentor' },
          { key: 'preference2Project', header: 'Preference 2 Project' },
          { key: 'preference2Mentor', header: 'Preference 2 Mentor' },
          { key: 'status', header: 'Status' },
          { key: 'allocatedProject', header: 'Allocated Project' },
          { key: 'allocatedMentor', header: 'Allocated Mentor' },
        ]
      );
    });

  const columns = [
    {
      key: 'team',
      header: 'Team',
      render: (t: OpsTeam) => (
        <div className="min-w-0 max-w-[280px]">
          <p className="text-white text-xs font-medium truncate" title={teamLabel(t)}>
            {teamLabel(t)}
          </p>
          <p className="text-[10px] text-gray-500 truncate">
            {t.isIndividual ? 'Individual' : `${t.members.length} member${t.members.length === 1 ? '' : 's'}`}
            {t.teamName ? ` · ${t.teamName}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'submissionMode',
      header: 'Mode',
      render: (t: OpsTeam) =>
        t.submissionMode ? (
          <span className="text-[11px] text-gray-300">{SUBMISSION_MODE_LABELS[t.submissionMode]}</span>
        ) : (
          <span className="text-gray-600">—</span>
        ),
    },
    { key: 'trackName', header: 'Track', render: (t: OpsTeam) => <span className="text-xs text-gray-300">{t.trackName}</span> },
    {
      key: 'preference1',
      header: 'Preference 1',
      render: (t: OpsTeam) => (
        <PreferenceCell
          slot={t.preference1}
          isAllocated={t.status === 'allocated' && t.allocatedProjectTitle === t.preference1?.projectTitle}
        />
      ),
    },
    {
      key: 'preference2',
      header: 'Preference 2',
      render: (t: OpsTeam) => (
        <PreferenceCell
          slot={t.preference2}
          isAllocated={t.status === 'allocated' && t.allocatedProjectTitle === t.preference2?.projectTitle}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t: OpsTeam) => (
        <div className="min-w-0">
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLES[t.status]}`}>
            {OPS_TEAM_STATUS_LABELS[t.status]}
          </span>
          {t.status === 'allocated' && t.allocatedMentorName && (
            <p className="text-[10px] text-gray-500 truncate mt-0.5" title={t.allocatedMentorName}>
              → {t.allocatedMentorName}
            </p>
          )}
          {t.allocationStatus === 'needs_review' && (
            <p className="text-[10px] text-red-400 mt-0.5">Needs review</p>
          )}
          {t.preference1ReviewStatus === 'pending_review' && (
            <p className="text-[10px] text-yellow-500/80 mt-0.5">Proposal in review</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      loading={list.loading}
      hideExport
      searchPlaceholder="Search team, student or project..."
      onSearchChange={list.onSearchChange}
      serverPagination={{
        page: list.page,
        limit: list.limit,
        total: list.pagination.total,
        totalPages: list.pagination.totalPages,
        onPageChange: list.setPage,
        onLimitChange: (value) => {
          list.setPage(1);
          list.setLimit(value);
        },
      }}
      leftHeaderContent={
        <>
          <TrackFilter options={options} value={trackId} onChange={changeTrack} />
          {options.batches.length > 0 && (
            <Select
              variant="filter"
              value={batch}
              onChange={(v) => changeBatch(v as string)}
              options={options.batches.map((b) => ({ value: b, label: b }))}
              placeholder="All Batches"
              className="min-w-[120px] !text-xs !py-1.5"
            />
          )}
          <Select
            variant="filter"
            value={status}
            onChange={(v) => changeStatus(v as string)}
            options={(Object.keys(OPS_TEAM_STATUS_LABELS) as OpsTeamStatus[]).map((s) => ({
              value: s,
              label: OPS_TEAM_STATUS_LABELS[s],
            }))}
            placeholder="All Statuses"
            className="min-w-[140px] !text-xs !py-1.5"
          />
          <RowCount total={list.pagination.total} noun="team" />
          <ExportButton onClick={handleExport} disabled={list.pagination.total === 0} exporting={exporting} />
        </>
      }
    />
  );
}

// ── Mentors ──────────────────────────────────────────────────────────────────

function MentorsView({ cohortId, options, cohortLabel }: { cohortId: string; options: OpsFilterOptions; cohortLabel: string }) {
  const [trackId, setTrackId] = useState('');

  const load = useCallback(
    (page: number, limit: number, search: string) =>
      apiGetOpsMentors(cohortId, { page, limit, search: search || undefined, trackId: trackId || undefined }),
    [cohortId, trackId]
  );

  const list = useOpsList<OpsMentor>(load);
  const { exporting, runExport } = useCsvExport();
  const rows = useMemo(() => list.rows.map((m) => ({ ...m, id: m.mentorId })), [list.rows]);

  const handleExport = () =>
    runExport(async () => {
      const res = await apiGetOpsMentors(cohortId, {
        page: 1,
        limit: Math.max(list.pagination.total, 1),
        search: list.search || undefined,
        trackId: trackId || undefined,
      });
      exportToCSV(
        `allocation_breakdown_mentors_${(cohortLabel || cohortId).replace(/\s+/g, '_')}`,
        res.data.map((m) => ({
          mentor: m.fullName,
          email: m.email,
          type: m.isExternal ? 'Industry' : 'Internal',
          tracks: m.trackNames.join(' | '),
          preference1: String(m.preference1Count),
          preference2: String(m.preference2Count),
          pending: String(m.pendingCount),
          allocated: String(m.allocatedCount),
          capacity: String(m.capacity),
          state: m.isFull ? 'Full' : m.isNearingCapacity ? 'Nearing capacity' : 'Open',
        })),
        [
          { key: 'mentor', header: 'Mentor' },
          { key: 'email', header: 'Email' },
          { key: 'type', header: 'Type' },
          { key: 'tracks', header: 'Tracks' },
          { key: 'preference1', header: 'Chosen as Preference 1' },
          { key: 'preference2', header: 'Chosen as Preference 2' },
          { key: 'pending', header: 'Pending selections' },
          { key: 'allocated', header: 'Allocated teams' },
          { key: 'capacity', header: 'Capacity' },
          { key: 'state', header: 'State' },
        ]
      );
    });

  const columns = [
    {
      key: 'fullName',
      header: 'Mentor',
      render: (m: OpsMentor) => (
        <div className="min-w-0 max-w-[240px]">
          <p className="text-white text-xs font-medium truncate" title={m.fullName}>
            {m.fullName}
          </p>
          <p className="text-[10px] text-gray-500 truncate">
            {m.isExternal ? `Industry${m.organization ? ` · ${m.organization}` : ''}` : 'Internal'}
          </p>
        </div>
      ),
    },
    {
      key: 'trackNames',
      header: 'Tracks',
      render: (m: OpsMentor) =>
        m.trackNames.length === 0 ? (
          <span className="text-[11px] text-red-400">Not staffed</span>
        ) : (
          <span className="text-[11px] text-gray-400 line-clamp-2 max-w-[220px]" title={m.trackNames.join(', ')}>
            {m.trackNames.join(', ')}
          </span>
        ),
    },
    {
      key: 'preference1Count',
      header: 'Chosen as Pref 1',
      render: (m: OpsMentor) => <span className="text-white font-semibold tabular-nums">{m.preference1Count}</span>,
    },
    {
      key: 'preference2Count',
      header: 'Chosen as Pref 2',
      render: (m: OpsMentor) => <span className="text-gray-300 font-semibold tabular-nums">{m.preference2Count}</span>,
    },
    {
      key: 'capacity',
      header: 'Capacity',
      render: (m: OpsMentor) => (
        <div className="tabular-nums min-w-0">
          <span className={`font-semibold ${m.isFull ? 'text-red-400' : m.isNearingCapacity ? 'text-amber-400' : 'text-white'}`}>
            {m.pendingCount}/{m.capacity}
          </span>
          <p className="text-[10px] text-gray-500">
            {m.allocatedCount} allocated
            {!m.hasCapacityOverride && ' · capacity not set'}
          </p>
          {(m.isFull || m.isNearingCapacity) && (
            <span
              className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full border mt-0.5 ${
                m.isFull ? 'bg-red-500/10 text-red-400 border-red-500/25' : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
              }`}
            >
              {m.isFull ? 'FULL' : 'NEARING'}
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      loading={list.loading}
      hideExport
      searchPlaceholder="Search mentor, email or organisation..."
      onSearchChange={list.onSearchChange}
      serverPagination={{
        page: list.page,
        limit: list.limit,
        total: list.pagination.total,
        totalPages: list.pagination.totalPages,
        onPageChange: list.setPage,
        onLimitChange: (value) => {
          list.setPage(1);
          list.setLimit(value);
        },
      }}
      leftHeaderContent={
        <>
          <TrackFilter
            options={options}
            value={trackId}
            onChange={(value) => {
              list.setPage(1);
              setTrackId(value);
            }}
          />
          <RowCount total={list.pagination.total} noun="mentor" />
          <ExportButton onClick={handleExport} disabled={list.pagination.total === 0} exporting={exporting} />
        </>
      }
    />
  );
}

// ── Projects ─────────────────────────────────────────────────────────────────

function ProjectsView({ cohortId, options, cohortLabel }: { cohortId: string; options: OpsFilterOptions; cohortLabel: string }) {
  const [trackId, setTrackId] = useState('');

  const load = useCallback(
    (page: number, limit: number, search: string) =>
      apiGetOpsProjects(cohortId, { page, limit, search: search || undefined, trackId: trackId || undefined }),
    [cohortId, trackId]
  );

  const list = useOpsList<OpsProject>(load);
  const { exporting, runExport } = useCsvExport();
  const rows = useMemo(() => list.rows.map((p) => ({ ...p, id: p.projectId })), [list.rows]);

  const handleExport = () =>
    runExport(async () => {
      const res = await apiGetOpsProjects(cohortId, {
        page: 1,
        limit: Math.max(list.pagination.total, 1),
        search: list.search || undefined,
        trackId: trackId || undefined,
      });
      exportToCSV(
        `allocation_breakdown_projects_${(cohortLabel || cohortId).replace(/\s+/g, '_')}`,
        res.data.map((p) => ({
          code: p.projectCode ?? '',
          title: p.title,
          mentors: (p.recommendedMentorNames.length ? p.recommendedMentorNames : p.chosenMentorNames).join(' | '),
          teamsSelected: String(p.preference1Count + p.preference2Count),
          preference1: String(p.preference1Count),
          preference2: String(p.preference2Count),
          allocated: String(p.allocatedCount),
          track: p.trackName,
          source: p.isSelfProposed ? 'Self proposed' : 'PST catalog',
        })),
        [
          { key: 'code', header: 'Project ID' },
          { key: 'title', header: 'Project' },
          { key: 'mentors', header: 'Mentor' },
          { key: 'teamsSelected', header: 'Teams selected' },
          { key: 'preference1', header: 'As Preference 1' },
          { key: 'preference2', header: 'As Preference 2' },
          { key: 'allocated', header: 'Allocated' },
          { key: 'track', header: 'Track' },
          { key: 'source', header: 'Source' },
        ]
      );
    });

  const columns = [
    {
      key: 'title',
      header: 'Project',
      render: (p: OpsProject) => (
        <div className="min-w-0 max-w-[320px]">
          <p className="text-white text-xs font-medium truncate" title={p.title}>
            {p.title}
          </p>
          <p className="text-[10px] text-gray-500 truncate">
            {p.projectCode ?? '—'}
            {p.isSelfProposed && ' · Self proposed'}
          </p>
        </div>
      ),
    },
    {
      key: 'recommendedMentorNames',
      header: 'Mentor',
      render: (p: OpsProject) => {
        // The catalog's mentors are the answer whenever it has any. Falling back
        // to whoever teams actually paired with it covers self-proposed
        // projects, which have a real mentor the catalog never knew about.
        const recommended = p.recommendedMentorNames;
        const names = recommended.length > 0 ? recommended : p.chosenMentorNames;
        if (names.length === 0) return <span className="text-gray-600">—</span>;
        return (
          <div className="min-w-0 max-w-[200px]">
            <p className="text-[11px] text-gold truncate" title={names.join(', ')}>
              {names.join(', ')}
            </p>
            {recommended.length === 0 && <p className="text-[10px] text-gray-600">picked by team</p>}
          </div>
        );
      },
    },
    {
      key: 'teamsSelected',
      header: 'Teams selected',
      render: (p: OpsProject) => {
        const selected = p.preference1Count + p.preference2Count;
        return (
          <div className="tabular-nums">
            <span className={`font-semibold ${selected === 0 ? 'text-gray-600' : 'text-white'}`}>{selected}</span>
            <p className="text-[10px] text-gray-500">
              P1 {p.preference1Count} · P2 {p.preference2Count}
              {p.allocatedCount > 0 && <span className="text-green-500"> · {p.allocatedCount} allocated</span>}
            </p>
          </div>
        );
      },
    },
    { key: 'trackName', header: 'Track', render: (p: OpsProject) => <span className="text-xs text-gray-300">{p.trackName}</span> },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      loading={list.loading}
      hideExport
      searchPlaceholder="Search project title or ID..."
      onSearchChange={list.onSearchChange}
      serverPagination={{
        page: list.page,
        limit: list.limit,
        total: list.pagination.total,
        totalPages: list.pagination.totalPages,
        onPageChange: list.setPage,
        onLimitChange: (value) => {
          list.setPage(1);
          list.setLimit(value);
        },
      }}
      leftHeaderContent={
        <>
          <TrackFilter
            options={options}
            value={trackId}
            onChange={(value) => {
              list.setPage(1);
              setTrackId(value);
            }}
          />
          <RowCount total={list.pagination.total} noun="project" />
          <ExportButton onClick={handleExport} disabled={list.pagination.total === 0} exporting={exporting} />
        </>
      }
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const EMPTY_OPTIONS: OpsFilterOptions = { tracks: [], batches: [] };

export default function CohortOpsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showError } = useToast();

  const [view, setView] = useState<OpsView>('teams');
  const [cohortLabel, setCohortLabel] = useState('');
  const [options, setOptions] = useState<OpsFilterOptions>(EMPTY_OPTIONS);

  useEffect(() => {
    if (!cohortId) return;
    let cancelled = false;
    (async () => {
      try {
        const [cohort, filterOptions] = await Promise.all([apiGetCohort(cohortId), apiGetOpsFilterOptions(cohortId)]);
        if (cancelled) return;
        setCohortLabel(getCohortLabel(cohort));
        setOptions(filterOptions);
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
    <PageLayout>
      <CohortPageHeader
        title="Allocation Breakdown"
        subtitle={cohortLabel || undefined}
        icon={ClipboardList}
        trailing={
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-750 rounded-lg p-0.5">
            {VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                  view === key ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        }
      />

      {/* Keyed so switching view remounts: each carries its own filters, page
          and search, and none of them mean anything on the other two. */}
      {view === 'teams' && <TeamsView key="teams" cohortId={cohortId} options={options} cohortLabel={cohortLabel} />}
      {view === 'mentors' && <MentorsView key="mentors" cohortId={cohortId} options={options} cohortLabel={cohortLabel} />}
      {view === 'projects' && <ProjectsView key="projects" cohortId={cohortId} options={options} cohortLabel={cohortLabel} />}
    </PageLayout>
  );
}
